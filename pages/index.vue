<template>
  <div>
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="10">
          <v-card border>
            <v-list-item class="pa-4">
              <v-list-item-title class="text-h5 mb-1 text-wrap">
                Your Personal QT and Journaling App
              </v-list-item-title>
              <v-list-item-subtitle class="text-high-emphasis text-wrap" style="opacity: 1">
                Practice PRESS in building your Quiet Time habits! This app
                aims to help you build a habit of journaling your QT thoughts.
                Bible passages change every day.
                <br />
                <br />P - Pray
                <br />R - Read the Passage
                <br />E - Examine
                your own life
                <br />S - Say it back to God
                <br />S - Share it
                with another
              </v-list-item-subtitle>
            </v-list-item>
          </v-card>
        </v-col>
      </v-row>
      <v-row v-if="isAuthenticated" justify="center">
        <v-col cols="12" md="10" class="pb-0">
          <StreakCard class="mx-auto" />
        </v-col>
      </v-row>
      <v-row justify="center">
        <v-col cols="12" md="10" align-self="center" class="pt-2">
          <Passage
            :passage-date="date"
            :passage-contents="getPassageContents"
            :reference="getReference"
          />
        </v-col>
      </v-row>
      <!-- Inside the container (not a sibling of it) so this inherits the
           gutter instead of running edge-to-edge; stacks full-width below
           600px since `.v-btn` can neither shrink nor wrap its label. Labels
           shortened too - "Log in to journal your thoughts!" uppercases to
           ~344px of un-shrinkable content, wider than a 320px viewport even
           full-width, so stacking alone couldn't have saved the original copy. -->
      <v-row justify="center">
        <v-col cols="12" md="10">
          <div class="d-flex flex-column flex-sm-row justify-center ga-2 mt-4 mb-4">
            <v-btn v-if="isAuthenticated" to="/journalList/createEntry" exact color="primary" variant="elevated">Write your thoughts</v-btn>
            <v-btn v-if="!isAuthenticated" to="/auth" exact color="primary" variant="elevated">Log in to journal</v-btn>
          </div>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script setup lang="ts">
import { toDayIndex } from '~/stores/journal'

definePageMeta({ middleware: ['check-auth', 'require-verified'] })

const userStore = useUserStore()
const journalStore = useJournalStore()
const planStore = usePlanStore()
const passageStore = usePassageStore()

const date = ref(new Date())

// SSR: preload today's passage (first paint) and the user's entry dates (for
// the streak card) concurrently - these are independent fetches, no reason to
// waterfall one after the other.
// The dates fetch is a tiny, undecrypted payload, not the full entry list
// (see stores/journal.ts's fetchEntryDates). Non-fatal on failure - the home
// page must still render for the passage.
// `watch` re-runs it on the client once Firebase's async onIdTokenChanged
// flips isAuthenticated to true - otherwise, when the SSR pass renders
// unauthenticated (e.g. an expired jwt cookie), the streak would stay empty
// until a manual refresh since useAsyncData doesn't re-run after hydration.
// A still-pending-verification account is handled separately, by the
// require-verified middleware (definePageMeta above), not from here - a
// page-level check was tried first (a reactive watch on this useAsyncData's
// error) and worked when tested via router.push, but not against every real
// navigation path in production. Middleware, which runs before this page
// ever mounts, is Nuxt's own better-supported mechanism for this and
// doesn't share that failure mode.
const [, { refresh: refreshEntries }] = await Promise.all([
  useAsyncData('home-todays-passage', async () => {
    await passageStore.refreshPassage()
    return true
  }),
  useAsyncData('home-qt-entries', async () => {
    if (!userStore.isAuthenticated) return null
    await journalStore.fetchEntryDates()
    return true
  }, { watch: [() => userStore.isAuthenticated] })
])

// Re-fetches the passage/entries when the local calendar day has actually
// rolled over, so a tab left open past midnight doesn't keep showing
// yesterday's passage/date/streak until a manual refresh. Guarded by
// toDayIndex so focus/visibility events and the interval tick are no-ops
// except right after a real day change.
let loadedDay = toDayIndex(date.value)
let rolloverInFlight = false

async function checkDayRollover() {
  const now = new Date()
  if (toDayIndex(now) === loadedDay) return
  // The 60s tick and focus/visibility events keep firing while the first
  // attempt is still in flight, now that loadedDay isn't advanced up front to
  // absorb that.
  if (rolloverInFlight) return
  rolloverInFlight = true
  try {
    // A failed plan lookup mustn't abort the refresh: getPlanChosen rethrows
    // for a still-pending-verification account (stores/plan.ts), which isn't
    // actionable from a background timer tick - the page already routes that
    // case on load.
    await planStore.getPlanChosen().catch(() => {})
    const ok = await passageStore.refreshPassage()
    await refreshEntries()
    // Commit only once today's passage has actually landed. Advancing first
    // meant a single failed post-midnight fetch - overwhelmingly likely on a
    // sleeping phone with a backgrounded tab - pinned the page to yesterday
    // for the rest of the day, since every later tick and every refocus saw
    // loadedDay already current and bailed out early. Leaving it behind turns
    // the existing interval and focus/visibility handlers into the retry
    // loop for free. `date` moves with it, so the card's subtitle never
    // claims a day the text below it isn't from.
    if (ok) {
      loadedDay = toDayIndex(now)
      date.value = now
    }
  } finally {
    rolloverInFlight = false
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') checkDayRollover()
}

let rolloverInterval: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  // Ensures that once auth resolves, the correct passage from the user's
  // chosen plan is shown (the SSR preload above only knows the org-wide
  // default plan until then) - but only refetch if the resolved plan actually
  // differs from what SSR already used, instead of unconditionally every load.
  const planBeforeMount = planStore.chosenPlan
  planStore.getPlanChosen().then(() => {
    // Two things can make the SSR-preloaded passage wrong once we're on the
    // client: the resolved plan differed from what SSR used, and/or the
    // passage was resolved against the *server's* calendar day - SSR has no
    // way to know the visitor's timezone, so a visitor outside the server's
    // timezone needs this one-time correction after hydration.
    const planChanged = planStore.chosenPlan !== planBeforeMount
    const dayChanged = passageStore.passageDay !== toDayIndex(new Date())
    if (planChanged || dayChanged) {
      passageStore.refreshPassage()
    }
  })

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  rolloverInterval = setInterval(checkDayRollover, 60_000)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('focus', onVisible)
  clearInterval(rolloverInterval)
})

const getPassageContents = computed(() => passageStore.todaysPassage)
const getReference = computed(() => passageStore.todaysReference)
const isAuthenticated = computed(() => userStore.isAuthenticated)
</script>

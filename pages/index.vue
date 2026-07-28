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

definePageMeta({ middleware: ['check-auth'] })

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
const [, { error: entriesError, refresh: refreshEntries }] = await Promise.all([
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

// The dates fetch above is deliberately non-fatal on failure in general (see
// the comment above it - the home page renders regardless), but a still-
// pending-verification account is the one failure mode that needs to
// interrupt that: otherwise this is the page an unverified person lands on
// first, and it would otherwise just quietly render as if everything's fine.
//
// Reactive watch rather than a one-time check here, and this isn't cosmetic:
// confirmed in production that the 403 can arrive from the *watch-triggered*
// re-run of 'home-qt-entries' above, not the initial one - isAuthenticated
// can still read false at the exact instant this Promise.all first resolves
// on a client-side navigation immediately after registering/logging in, so
// the first pass short-circuits to null (no error) via the `if
// (!userStore.isAuthenticated) return null` guard, and only the later,
// async, watch-driven re-fetch (once isAuthenticated catches up to true)
// actually calls fetchEntryDates() and 403s. A plain `if` checked once right
// after this Promise.all never sees that second result; a real Nuxt error
// log confirmed the throw's stack trace runs through the watch callback, not
// the initial resolution. `immediate: true` still covers the original
// synchronous case (SSR, or already-authenticated on arrival) in one place.
watch(
  entriesError,
  (err) => {
    if (isEmailNotVerifiedError(err)) {
      navigateTo('/auth/verify-email')
    }
  },
  { immediate: true }
)

// Re-fetches the passage/entries when the local calendar day has actually
// rolled over, so a tab left open past midnight doesn't keep showing
// yesterday's passage/date/streak until a manual refresh. Guarded by
// toDayIndex so focus/visibility events and the interval tick are no-ops
// except right after a real day change.
let loadedDay = toDayIndex(date.value)

async function checkDayRollover() {
  const now = new Date()
  if (toDayIndex(now) === loadedDay) return
  loadedDay = toDayIndex(now)
  date.value = now
  await planStore.getPlanChosen()
  await passageStore.refreshPassage()
  await refreshEntries()
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
    if (planStore.chosenPlan !== planBeforeMount) {
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

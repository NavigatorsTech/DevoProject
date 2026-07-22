<template>
  <div>
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="10">
          <v-card border>
            <v-list-item>
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
    </v-container>
    <div class="d-flex justify-center">
      <v-btn v-if="isAuthenticated" to="/journalList/createEntry" exact color="primary" variant="elevated">Write down your thoughts</v-btn>
      <v-btn v-if="!isAuthenticated" to="/auth" exact color="primary" variant="elevated">Log in to journal your thoughts!</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['check-auth'] })

const userStore = useUserStore()
const journalStore = useJournalStore()
const planStore = usePlanStore()
const passageStore = usePassageStore()

const date = new Date()

// SSR: preload today's passage so the rendered HTML already contains it on
// first paint (folds in what used to be the root nuxtServerInit's job).
await useAsyncData('home-todays-passage', async () => {
  await passageStore.refreshPassage()
  return true
})

// SSR: preload the user's journal entries (for the streak card) if logged in.
// Non-fatal on failure - the home page must still render for the passage.
await useAsyncData('home-qt-entries', async () => {
  if (!userStore.isAuthenticated) return null
  try {
    const entries = await authFetch('/api/qtJournalEntries', {
      params: { creatorEmail: userStore.userID }
    })
    journalStore.storeAllQTEntries(entries)
  } catch (e) {
    // ignore
  }
  return true
})

onMounted(() => {
  // Ensures that after a refresh, the correct passage from the user's chosen
  // plan is shown (the SSR preload above only knows the org-wide default plan
  // until auth resolves).
  planStore.getPlanChosen().then(() => {
    passageStore.refreshPassage()
  })
})

const getPassageContents = computed(() => passageStore.todaysPassage)
const getReference = computed(() => passageStore.todaysReference)
const isAuthenticated = computed(() => userStore.isAuthenticated)
</script>

<template>
  <div>
    <h1 class="mb-4">Your Journal Entries</h1>
    <StreakCard class="mx-auto mb-4" />
    <div class="d-flex justify-center mb-4">
      <v-btn to="/journalList/createEntry" exact color="primary" variant="elevated">Write QT Thoughts</v-btn>
    </div>
    <JournalCard
      v-for="i in entriesInReverse"
      :key="i._id"
      :entryID="i._id"
      :entryTitle="i.title"
      :entryDate="i.date"
      :entryPassageReference="i.passageReference"
      :entryThoughts="i.thoughts"
      @view-entry="viewSelectedEntry"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['check-auth', 'login-check'] })

const userStore = useUserStore()
const journalStore = useJournalStore()
const router = useRouter()

const { error: fetchError } = await useAsyncData('journal-list-entries', async () => {
  const entries = await authFetch('/api/qtJournalEntries', {
    params: { creatorEmail: userStore.userID }
  })
  journalStore.storeAllQTEntries(entries)
  return true
})

if (fetchError.value) {
  throw createError({ statusCode: 500, statusMessage: 'Failed to load journal entries' })
}

const entriesInReverse = computed(() => journalStore.qtEntries.slice().reverse())

function viewSelectedEntry(id: string) {
  router.push('/journalList/' + id)
}
</script>

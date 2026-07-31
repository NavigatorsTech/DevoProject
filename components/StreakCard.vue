<template>
  <v-card v-if="currentStreak > 0 || longestStreak > 0" class="mx-auto" border>
    <!-- Badge stays inline in the same row as the streak count (aligned with
         it via `align-center`), pushed to the row's right edge with
         `ms-auto` rather than a `v-spacer` - a `v-spacer` inside a
         `flex-wrap` row absorbs space unevenly per line and orphans the
         next item onto its own line (the bug reported on the plans list);
         `ms-auto` on the item itself doesn't have that failure mode, even if
         this row ever has to wrap. The message is a `v-card-text` (not
         `v-card-subtitle` - that component ships a forced medium-emphasis
         opacity and zero bottom padding, both wrong for an encouraging
         message meant to be read clearly, with normal breathing room below
         it) on its own line below the title, so it always gets a full line
         to itself instead of word-wrapping into whatever narrow space
         happens to be left after the streak count and badge. -->
    <v-card-title class="d-flex align-center flex-wrap">
      <v-icon color="secondary" class="mr-2">mdi-fire</v-icon>
      <span>{{ currentStreak }} day{{ currentStreak === 1 ? '' : 's' }}</span>
      <v-chip
        v-if="longestStreak > currentStreak"
        size="small"
        color="secondary"
        variant="outlined"
        class="ms-auto"
      >
        Best: {{ longestStreak }} day{{ longestStreak === 1 ? '' : 's' }}
      </v-chip>
    </v-card-title>
    <v-card-text class="pt-0">{{ streakMessage }}</v-card-text>
    <v-card-actions v-if="!journaledToday" class="pt-0">
      <v-btn to="/journalList/createEntry" exact color="primary" variant="text">Write today's thoughts</v-btn>
    </v-card-actions>
  </v-card>
  <v-card v-else class="mx-auto" border>
    <v-card-title class="d-flex align-center">
      <v-icon color="secondary" class="mr-2">mdi-fire</v-icon>
      <span>Start your streak</span>
    </v-card-title>
    <v-card-text class="pt-0">Write your first QT thoughts today to begin!</v-card-text>
    <v-card-actions class="pt-0">
      <v-btn to="/journalList/createEntry" exact color="primary" variant="text">Write QT Thoughts</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
const journalStore = useJournalStore()

// One-time post-hydration reconcile: journalStore.todayIndex is initialized
// during store creation, which during SSR runs against the *server's* clock
// (see the field's own comment in stores/journal.ts). This corrects it to
// the visitor's actual day on mount, client-side only - every page that
// renders this card gets that correction for free, rather than each page
// having to remember to call it.
onMounted(() => journalStore.touchToday())

const currentStreak = computed(() => journalStore.getCurrentStreak)
const longestStreak = computed(() => journalStore.getLongestStreak)
const journaledToday = computed(() => journalStore.hasJournaledToday)
const streakMessage = computed(() => {
  if (journaledToday.value) {
    return "You've done your QT today. Keep it up!"
  }
  if (currentStreak.value === 0) {
    return 'Start a new streak today!'
  }
  return 'Keep your streak alive — journal today!'
})
</script>

<template>
  <v-card v-if="currentStreak > 0 || longestStreak > 0" class="mx-auto" outlined>
    <v-card-title class="d-flex align-center flex-wrap">
      <v-icon color="secondary" left>mdi-fire</v-icon>
      <div class="d-flex align-baseline flex-wrap">
        <span>{{ currentStreak }} day{{ currentStreak === 1 ? "" : "s" }}</span>
        <span class="text-body-2 text--secondary ml-3">{{ streakMessage }}</span>
      </div>
      <v-spacer></v-spacer>
      <v-chip v-if="longestStreak > currentStreak" small color="secondary" outlined>Best: {{ longestStreak }} day{{ longestStreak === 1 ? "" : "s" }}</v-chip>
    </v-card-title>
    <v-card-actions v-if="!journaledToday" class="pt-0">
      <v-btn to="/journalList/createEntry" nuxt exact color="primary" text>Write today's thoughts</v-btn>
    </v-card-actions>
  </v-card>
  <v-card v-else class="mx-auto" outlined>
    <v-card-title class="d-flex align-center flex-wrap">
      <v-icon color="secondary" left>mdi-fire</v-icon>
      <div class="d-flex align-baseline flex-wrap">
        <span>Start your streak</span>
        <span class="text-body-2 text--secondary ml-3">Write your first QT thoughts today to begin!</span>
      </div>
    </v-card-title>
    <v-card-actions class="pt-0">
      <v-btn to="/journalList/createEntry" nuxt exact color="primary" text>Write QT Thoughts</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script>
export default {
  computed: {
    currentStreak() {
      return this.$store.getters["journalStore/getCurrentStreak"];
    },
    longestStreak() {
      return this.$store.getters["journalStore/getLongestStreak"];
    },
    journaledToday() {
      return this.$store.getters["journalStore/hasJournaledToday"];
    },
    streakMessage() {
      if (this.journaledToday) {
        return "You've done your QT today. Keep it up!";
      }
      if (this.currentStreak === 0) {
        return "Start a new streak today!";
      }
      return "Keep your streak alive — journal today!";
    },
  },
};
</script>

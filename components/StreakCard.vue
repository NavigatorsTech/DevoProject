<template>
  <v-card v-if="currentStreak > 0 || longestStreak > 0" class="mx-auto" outlined>
    <v-card-title class="d-flex align-center flex-wrap">
      <div class="d-flex align-center">
        <v-icon color="secondary" left>mdi-fire</v-icon>
        <span>{{ currentStreak }} day{{ currentStreak === 1 ? "" : "s" }}</span>
      </div>
      <span class="text-body-2 text--secondary streak-message">{{ streakMessage }}</span>
      <v-spacer></v-spacer>
      <v-chip v-if="longestStreak > currentStreak" small color="secondary" outlined class="streak-chip">Best: {{ longestStreak }} day{{ longestStreak === 1 ? "" : "s" }}</v-chip>
    </v-card-title>
    <v-card-actions v-if="!journaledToday" class="pt-0">
      <v-btn to="/journalList/createEntry" nuxt exact color="primary" text>Write today's thoughts</v-btn>
    </v-card-actions>
  </v-card>
  <v-card v-else class="mx-auto" outlined>
    <v-card-title class="d-flex align-center flex-wrap">
      <div class="d-flex align-center">
        <v-icon color="secondary" left>mdi-fire</v-icon>
        <span>Start your streak</span>
      </div>
      <span class="text-body-2 text--secondary streak-message">Write your first QT thoughts today to begin!</span>
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

<style scoped>
.streak-message {
  margin-left: 12px;
}
@media (max-width: 599px) {
  .streak-message {
    flex-basis: 100%;
    margin-left: 0;
    margin-top: 4px;
  }
  .streak-chip {
    margin-top: 8px;
  }
}
</style>

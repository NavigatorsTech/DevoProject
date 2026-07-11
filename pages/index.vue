<template>
  <div>
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="10">
          <v-card outlined>
            <v-list-item>
              <v-list-item-content>
                <v-list-item-title
                  class="headline mb-1 text-wrap"
                >Your Personal QT and Journaling App</v-list-item-title>
                <v-list-item-subtitle class="text--primary text-wrap">
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
              </v-list-item-content>
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
            :passageDate="date"
            :passageContents="getPassageContents"
            :reference="getReference"
          ></Passage>
        </v-col>
      </v-row>
    </v-container>
    <center>
      <v-btn v-if="isAuthenticated" to="/journalList/createEntry" nuxt exact color="primary">Write down your thoughts</v-btn>
      <v-btn v-if="!isAuthenticated" to="/auth" nuxt exact color="primary">Log in to journal your thoughts!</v-btn>
    </center>
  </div>
</template>

<script>
import Passage from "@/components/Passage";
import StreakCard from "@/components/StreakCard";

export default {
  asyncData(context) {
    if (!context.store.getters["userStore/isAuthenticated"]) return;
    var userID = context.store.getters["userStore/getUserID"];
    return context.app.$axios.$get("/qtJournalEntries", {
      params: {
        creatorEmail: userID,
      },
    }).then((data) => {
      context.store.dispatch("journalStore/storeAllQTEntries", data);
    }).catch(() => {}); // non-fatal: home page must still render for the passage
  },
  mounted() {
    // To ensure that if there were a refresh, correct passage from plan is shown
    this.$store.dispatch("planStore/getPlanChosen").then(() => {
      this.$store.dispatch("passageStore/refreshPassage");
    });
  },
  data() {
    return {
      date: new Date(),
    };
  },
  components: {
    Passage,
    StreakCard,
  },
  middleware: ["checkAuth"],
  computed: {
    getPassageContents: function () {
      return this.$store.getters["passageStore/getTodaysPassage"];
    },
    getReference: function () {
      return this.$store.getters["passageStore/getTodaysReference"];
    },
    isAuthenticated() {
      return this.$store.getters["userStore/isAuthenticated"];
    },
  },
};
</script>

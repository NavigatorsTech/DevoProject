<template>
  <div>
    <QTJournalEditor
      ref="QTJournalEditorComponent"
      :entryPassageContents="getPassageContents"
      :entryDate="date"
      :entryReference="getReference"
      draftKey="qtDraft:create"
      :draftSameDayOnly="true"
      @draft-restored="onDraftRestored"
    ></QTJournalEditor>
    <v-btn class="mr-1" @click="cancel" color="warning">Cancel</v-btn>
    <v-btn class="mr-1" @click="copyContents" color="primary">Share</v-btn>
    <v-btn @click="submit" color="success">Save</v-btn>

    <v-snackbar v-model="snack" :timeout="4000" :color="snackColor">
      {{ snackText }}
      <v-btn v-if="showDiscardDraftButton" text @click="discardDraftFromSnackbar">Discard</v-btn>
      <v-btn text @click="snack = false; showDiscardDraftButton = false;">Close</v-btn>
    </v-snackbar>
  </div>
</template>

<script>
import QTJournalEditor from "@/components/QTJournalEditor";

export default {
  mounted() {
    // To ensure that if there were a refresh, correct passage from plan is shown
    this.$store.dispatch("planStore/getPlanChosen").then(() => {
      this.$store.dispatch("passageStore/refreshPassage");
    });
  },
  middleware: ["checkAuth", "loginCheck"],
  components: {
    QTJournalEditor,
  },
  data() {
    return {
      date: new Date(),
      snack: false,
      snackColor: "",
      snackText: "",
      showDiscardDraftButton: false,
    };
  },
  methods: {
    onDraftRestored: function () {
      this.snack = true;
      this.snackColor = "info";
      this.snackText = "Restored your unsaved draft";
      this.showDiscardDraftButton = true;
    },
    discardDraftFromSnackbar: function () {
      this.$refs.QTJournalEditorComponent.discardDraft();
      this.snack = false;
      this.showDiscardDraftButton = false;
    },
    copyContents: function () {
      var entry = this.$refs.QTJournalEditorComponent.getEntry();
      var copyText = entry.passageReference + "\n\nTitle: " + entry.title + "\n\n" + entry.thoughts + "\n\nApplication: " + entry.applicationImplication;
      navigator.clipboard.writeText(copyText).then(() => {
        this.showDiscardDraftButton = false;
        this.snack = true;
        this.snackColor = "success";
        this.snackText = "Copied to Clipboard";
      });
    },
    submit: async function () {
      if (this.$refs.QTJournalEditorComponent.checkValidation()) {
        var userID = this.$store.getters["userStore/getUserID"];
        var entry = this.$refs.QTJournalEditorComponent.getEntry();

        var ok = await this.$store.dispatch("journalStore/createEntry", {
          creatorEmail: userID,
          date: this.date,
          passageReference: this.getReference,
          title: entry.title,
          thoughts: entry.thoughts,
          applicationImplication: entry.applicationImplication,
        });

        if (ok) {
          this.$refs.QTJournalEditorComponent.clearDraft();
          this.$router.push("/journalList");
        } else {
          this.showDiscardDraftButton = false;
          this.snack = true;
          this.snackColor = "error";
          this.snackText = "Couldn't save your entry — your draft is safe, please try again.";
        }
      }
    },
    cancel: function () {
      this.$refs.QTJournalEditorComponent.clearDraft();
      this.$router.push("/journalList");
    },
  },
  computed: {
    getPassageContents: function () {
      return this.$store.getters["passageStore/getTodaysPassage"];
    },
    getReference: function () {
      return this.$store.getters["passageStore/getTodaysReference"];
    },
  },
};
</script>
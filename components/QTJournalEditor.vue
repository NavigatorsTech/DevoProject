<template>
  <v-form ref="QTJournalEditorForm">
    <v-container class="pa-0">
      <v-row justify="center">
        <v-col cols="12" md="7">
          <Passage
            :passageDate="entryDate"
            :passageContents="entryPassageContents"
            :reference="entryReference"
          ></Passage>
        </v-col>
        <v-col>
          <v-row>
            <v-col>
              <v-text-field v-model="entryTitle" label="Title" :rules="titleRules" required></v-text-field>
            </v-col>
          </v-row>
          <v-row>
            <v-col>
              <v-textarea
                solo
                counter
                v-model="entryThoughts"
                label="This part of the passage tells me that..."
                :rules="thoughtsRules"
              ></v-textarea>
            </v-col>
          </v-row>
          <v-row>
            <v-col>
              <v-text-field
                v-model="entryAppImp"
                label="Application / Implication"
                :rules="appImpRules"
                required
              ></v-text-field>
            </v-col>
          </v-row>
        </v-col>
      </v-row>
    </v-container>
  </v-form>
</template>

<script>
import Passage from "@/components/Passage";
import { toDayIndex } from "@/store/journalStore";

// How long to wait after the user stops typing before persisting a draft.
const DRAFT_DEBOUNCE_MS = 500;
// Generic anti-clutter safety net for edit drafts (a specific entry's passage
// doesn't change with the date, so this is just hygiene, not correctness).
// Create drafts instead use a same-calendar-day check - see draftSameDayOnly.
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export default {
  props: [
    "entryDate",
    "entryPassageContents",
    "entryReference",
    "propEntryTitle",
    "propEntryThoughts",
    "propEntryAppImp",
    "draftKey",
    "draftSameDayOnly",
  ],
  components: {
    Passage,
  },
  data() {
    return {
      entryTitle: this.propEntryTitle || "",
      entryThoughts: this.propEntryThoughts || "",
      entryAppImp: this.propEntryAppImp || "",
      titleRules: [(v) => !!v || "Please enter a title for your entry."],
      thoughtsRules: [(v) => !!v || "Please journal down some thoughts"],
      appImpRules: [
        (v) => !!v || "Please fill in an application for your life",
      ],
      draftSaveTimer: null,
    };
  },
  watch: {
    entryTitle() {
      this.queueDraftSave();
    },
    entryThoughts() {
      this.queueDraftSave();
    },
    entryAppImp() {
      this.queueDraftSave();
    },
  },
  mounted() {
    // mounted() never runs during SSR, so localStorage/window/document are
    // always available here - no process.client guard needed.
    this.restoreDraftIfValid();
    this.handlePageHide = () => this.flushDraft();
    this.handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        this.flushDraft();
      }
    };
    window.addEventListener("pagehide", this.handlePageHide);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  },
  beforeDestroy() {
    clearTimeout(this.draftSaveTimer);
    window.removeEventListener("pagehide", this.handlePageHide);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  },
  methods: {
    getEntry: function () {
      return {
        title: this.entryTitle,
        thoughts: this.entryThoughts,
        applicationImplication: this.entryAppImp,
        passageReference: this.entryReference
      };
    },
    checkValidation: function() {
      return this.$refs.QTJournalEditorForm.validate();
    },
    // Restores a previously autosaved draft into the editable fields if one
    // exists, hasn't gone stale, and actually differs from the seeded values.
    restoreDraftIfValid: function () {
      if (!this.draftKey) return;
      const raw = localStorage.getItem(this.draftKey);
      if (!raw) return;

      let draft;
      try {
        draft = JSON.parse(raw);
      } catch (e) {
        localStorage.removeItem(this.draftKey);
        return;
      }
      if (!draft || typeof draft.savedAt !== "number") {
        localStorage.removeItem(this.draftKey);
        return;
      }

      const isValid = this.draftSameDayOnly
        ? toDayIndex(draft.savedAt) === toDayIndex(new Date())
        : Date.now() - draft.savedAt <= DRAFT_TTL_MS;
      if (!isValid) {
        localStorage.removeItem(this.draftKey);
        return;
      }

      const unchanged =
        (draft.title || "") === this.entryTitle &&
        (draft.thoughts || "") === this.entryThoughts &&
        (draft.applicationImplication || "") === this.entryAppImp;
      if (unchanged) return;

      this.entryTitle = draft.title || "";
      this.entryThoughts = draft.thoughts || "";
      this.entryAppImp = draft.applicationImplication || "";
      this.$emit("draft-restored");
    },
    // Debounces autosave writes so quick typing doesn't hit localStorage on
    // every keystroke.
    queueDraftSave: function () {
      if (!this.draftKey) return;
      clearTimeout(this.draftSaveTimer);
      this.draftSaveTimer = setTimeout(() => this.saveDraftNow(), DRAFT_DEBOUNCE_MS);
    },
    saveDraftNow: function () {
      if (!this.draftKey) return;
      if (!this.entryTitle && !this.entryThoughts && !this.entryAppImp) {
        localStorage.removeItem(this.draftKey);
        return;
      }
      localStorage.setItem(this.draftKey, JSON.stringify({
        v: 1,
        title: this.entryTitle,
        thoughts: this.entryThoughts,
        applicationImplication: this.entryAppImp,
        savedAt: Date.now(),
      }));
    },
    // Mobile-safe substitute for beforeunload: flushes the pending debounced
    // write immediately when the tab is hidden/closed/backgrounded.
    flushDraft: function () {
      clearTimeout(this.draftSaveTimer);
      this.saveDraftNow();
    },
    clearDraft: function () {
      clearTimeout(this.draftSaveTimer);
      if (this.draftKey) {
        localStorage.removeItem(this.draftKey);
      }
    },
    discardDraft: function () {
      this.entryTitle = this.propEntryTitle || "";
      this.entryThoughts = this.propEntryThoughts || "";
      this.entryAppImp = this.propEntryAppImp || "";
      this.clearDraft();
    },
  },
};
</script>


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
    />
    <div class="d-flex flex-wrap">
      <v-btn class="ma-1" color="warning" variant="elevated" @click="cancel">Cancel</v-btn>
      <v-btn class="ma-1" color="primary" variant="elevated" @click="copyContents">Share</v-btn>
      <v-btn class="ma-1" color="success" variant="elevated" @click="submit">Save</v-btn>
    </div>

    <v-snackbar v-model="snack" :timeout="4000" :color="snackColor">
      {{ snackText }}
      <template v-slot:actions>
        <v-btn v-if="showDiscardDraftButton" variant="text" @click="discardDraftFromSnackbar">Discard</v-btn>
        <v-btn variant="text" @click="snack = false; showDiscardDraftButton = false">Close</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['check-auth', 'login-check'] })

const userStore = useUserStore()
const planStore = usePlanStore()
const passageStore = usePassageStore()
const journalStore = useJournalStore()
const router = useRouter()

const QTJournalEditorComponent = ref()

const date = new Date()
const snack = ref(false)
const snackColor = ref('')
const snackText = ref('')
const showDiscardDraftButton = ref(false)

onMounted(() => {
  // Ensures that after a refresh, the correct passage from plan is shown
  planStore.getPlanChosen().then(() => {
    passageStore.refreshPassage()
  })
})

const getPassageContents = computed(() => passageStore.todaysPassage)
const getReference = computed(() => passageStore.todaysReference)

function onDraftRestored() {
  snack.value = true
  snackColor.value = 'info'
  snackText.value = 'Restored your unsaved draft'
  showDiscardDraftButton.value = true
}

function discardDraftFromSnackbar() {
  QTJournalEditorComponent.value.discardDraft()
  snack.value = false
  showDiscardDraftButton.value = false
}

function copyContents() {
  const entry = QTJournalEditorComponent.value.getEntry()
  const copyText = `${entry.passageReference}\n\nTitle: ${entry.title}\n\n${entry.thoughts}\n\nApplication: ${entry.applicationImplication}`
  navigator.clipboard.writeText(copyText).then(() => {
    showDiscardDraftButton.value = false
    snack.value = true
    snackColor.value = 'success'
    snackText.value = 'Copied to Clipboard'
  })
}

async function submit() {
  const valid = await QTJournalEditorComponent.value.checkValidation()
  if (!valid) return

  const entry = QTJournalEditorComponent.value.getEntry()
  const ok = await journalStore.createEntry({
    creatorEmail: userStore.userID,
    date,
    passageReference: getReference.value,
    title: entry.title,
    thoughts: entry.thoughts,
    applicationImplication: entry.applicationImplication
  })

  if (ok) {
    QTJournalEditorComponent.value.clearDraft()
    router.push('/journalList')
  } else {
    showDiscardDraftButton.value = false
    snack.value = true
    snackColor.value = 'error'
    snackText.value = "Couldn't save your entry — your draft is safe, please try again."
  }
}

function cancel() {
  QTJournalEditorComponent.value.clearDraft()
  router.push('/journalList')
}
</script>

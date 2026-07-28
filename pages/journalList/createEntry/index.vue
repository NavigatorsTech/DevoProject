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
    <div class="d-flex flex-column flex-sm-row ga-2 mt-4">
      <v-btn color="warning" variant="elevated" @click="cancel">Cancel</v-btn>
      <v-btn color="primary" variant="elevated" @click="copyContents">Share</v-btn>
      <v-btn color="success" variant="elevated" @click="submit">Save</v-btn>
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

// Gate + "show the right plan's passage after a refresh" in one useAsyncData,
// matching every other protected page's pattern instead of an onMounted probe
// - confirmed in production that navigateTo() called from onMounted (after
// the component has already mounted) is not reliable for this: the redirect
// call can go through without actually taking effect, letting the page stay
// fully rendered. Every other working redirect in this app fires from a
// page's top-level <script setup>, not a lifecycle hook; this now does too.
// `watch` + `immediate: true` rather than a one-time `if` for the same reason
// home page's gate needed it - not provably required here (this call has no
// `watch` option of its own to trigger a delayed second resolution), but it
// costs nothing and closes the same class of gap uniformly.
const { error: gateError } = await useAsyncData('create-entry-gate', async () => {
  await planStore.getPlanChosen()
  await passageStore.refreshPassage()
  return true
})
watch(
  gateError,
  (err) => {
    if (isEmailNotVerifiedError(err)) {
      navigateTo('/auth/verify-email')
    }
  },
  { immediate: true }
)

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

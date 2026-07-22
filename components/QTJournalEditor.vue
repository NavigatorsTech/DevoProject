<template>
  <v-form ref="QTJournalEditorForm">
    <v-container class="pa-0">
      <v-row justify="center">
        <v-col cols="12" md="7">
          <Passage
            :passage-date="entryDate"
            :passage-contents="entryPassageContents"
            :reference="entryReference"
          />
        </v-col>
        <v-col>
          <v-row>
            <v-col>
              <v-text-field v-model="entryTitle" label="Title" :rules="titleRules" required />
            </v-col>
          </v-row>
          <v-row>
            <v-col>
              <v-textarea
                v-model="entryThoughts"
                variant="solo"
                counter
                label="This part of the passage tells me that..."
                :rules="thoughtsRules"
              />
            </v-col>
          </v-row>
          <v-row>
            <v-col>
              <v-text-field
                v-model="entryAppImp"
                label="Application / Implication"
                :rules="appImpRules"
                required
              />
            </v-col>
          </v-row>
        </v-col>
      </v-row>
    </v-container>
  </v-form>
</template>

<script setup lang="ts">
import { toDayIndex } from '~/stores/journal'

// How long to wait after the user stops typing before persisting a draft.
const DRAFT_DEBOUNCE_MS = 500
// Generic anti-clutter safety net for edit drafts (a specific entry's passage
// doesn't change with the date, so this is just hygiene, not correctness).
// Create drafts instead use a same-calendar-day check - see draftSameDayOnly.
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

const props = defineProps<{
  entryDate: string | Date
  entryPassageContents: string
  entryReference: string | null
  propEntryTitle?: string
  propEntryThoughts?: string
  propEntryAppImp?: string
  draftKey?: string
  draftSameDayOnly?: boolean
}>()

const emit = defineEmits<{ 'draft-restored': [] }>()

const QTJournalEditorForm = ref()

const entryTitle = ref(props.propEntryTitle || '')
const entryThoughts = ref(props.propEntryThoughts || '')
const entryAppImp = ref(props.propEntryAppImp || '')

const titleRules = [(v: string) => !!v || 'Please enter a title for your entry.']
const thoughtsRules = [(v: string) => !!v || 'Please journal down some thoughts']
const appImpRules = [(v: string) => !!v || 'Please fill in an application for your life']

let draftSaveTimer: ReturnType<typeof setTimeout> | undefined

function getEntry() {
  return {
    title: entryTitle.value,
    thoughts: entryThoughts.value,
    applicationImplication: entryAppImp.value,
    passageReference: props.entryReference
  }
}

async function checkValidation(): Promise<boolean> {
  const { valid } = await QTJournalEditorForm.value.validate()
  return valid
}

// Restores a previously autosaved draft into the editable fields if one
// exists, hasn't gone stale, and actually differs from the seeded values.
function restoreDraftIfValid() {
  if (!props.draftKey) return
  const raw = localStorage.getItem(props.draftKey)
  if (!raw) return

  let draft: any
  try {
    draft = JSON.parse(raw)
  } catch (e) {
    localStorage.removeItem(props.draftKey)
    return
  }
  if (!draft || typeof draft.savedAt !== 'number') {
    localStorage.removeItem(props.draftKey)
    return
  }

  const isValid = props.draftSameDayOnly
    ? toDayIndex(draft.savedAt) === toDayIndex(new Date())
    : Date.now() - draft.savedAt <= DRAFT_TTL_MS
  if (!isValid) {
    localStorage.removeItem(props.draftKey)
    return
  }

  const unchanged =
    (draft.title || '') === entryTitle.value &&
    (draft.thoughts || '') === entryThoughts.value &&
    (draft.applicationImplication || '') === entryAppImp.value
  if (unchanged) return

  entryTitle.value = draft.title || ''
  entryThoughts.value = draft.thoughts || ''
  entryAppImp.value = draft.applicationImplication || ''
  emit('draft-restored')
}

// Debounces autosave writes so quick typing doesn't hit localStorage on every
// keystroke.
function queueDraftSave() {
  if (!props.draftKey) return
  clearTimeout(draftSaveTimer)
  draftSaveTimer = setTimeout(() => saveDraftNow(), DRAFT_DEBOUNCE_MS)
}

function saveDraftNow() {
  if (!props.draftKey) return
  if (!entryTitle.value && !entryThoughts.value && !entryAppImp.value) {
    localStorage.removeItem(props.draftKey)
    return
  }
  localStorage.setItem(props.draftKey, JSON.stringify({
    v: 1,
    title: entryTitle.value,
    thoughts: entryThoughts.value,
    applicationImplication: entryAppImp.value,
    savedAt: Date.now()
  }))
}

// Mobile-safe substitute for beforeunload: flushes the pending debounced write
// immediately when the tab is hidden/closed/backgrounded.
function flushDraft() {
  clearTimeout(draftSaveTimer)
  saveDraftNow()
}

function clearDraft() {
  clearTimeout(draftSaveTimer)
  if (props.draftKey) {
    localStorage.removeItem(props.draftKey)
  }
}

function discardDraft() {
  entryTitle.value = props.propEntryTitle || ''
  entryThoughts.value = props.propEntryThoughts || ''
  entryAppImp.value = props.propEntryAppImp || ''
  clearDraft()
}

watch([entryTitle, entryThoughts, entryAppImp], () => queueDraftSave())

let handlePageHide: (() => void) | undefined
let handleVisibilityChange: (() => void) | undefined

onMounted(() => {
  // onMounted() never runs during SSR, so localStorage/window/document are
  // always available here - no client-only guard needed.
  restoreDraftIfValid()
  handlePageHide = () => flushDraft()
  handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flushDraft()
    }
  }
  window.addEventListener('pagehide', handlePageHide)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  clearTimeout(draftSaveTimer)
  if (handlePageHide) window.removeEventListener('pagehide', handlePageHide)
  if (handleVisibilityChange) document.removeEventListener('visibilitychange', handleVisibilityChange)
})

defineExpose({
  getEntry,
  checkValidation,
  clearDraft,
  discardDraft
})
</script>

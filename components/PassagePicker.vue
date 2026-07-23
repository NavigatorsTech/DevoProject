<template>
  <div>
    <div v-if="currentStep === 1">
      <v-list class="sList">
        <v-list-item
          v-for="i in bible"
          :key="i.bookName"
          @click="bookChosen(2, i)"
        >
          <v-list-item-title>{{ i.bookName }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </div>
    <div v-else-if="currentStep === 2">
      <v-list class="sList">
        <v-list-item v-for="i in chosenBook?.bookChapters ?? 0" :key="i">
          <div class="d-flex align-center">
            <v-checkbox v-model="ccSelected[i]" color="primary" density="compact" hide-details class="flex-grow-0" />
            <span>Chapter {{ i }}</span>
          </div>
        </v-list-item>
      </v-list>
    </div>
    <div v-else-if="currentStep === 3">
      <v-label>Starting Verse from {{ chosenBook?.bookName }} Chapter {{ chosenChapter[0] }}</v-label>
      <v-select v-model="sV" :items="verseList(chosenChapter[0])" variant="outlined" density="compact" />
      <v-label v-if="chosenChapter.length > 1">
        Ending Verse from {{ chosenBook?.bookName }} Chapter {{ chosenChapter[chosenChapter.length - 1] }}
      </v-label>
      <v-label v-else>Ending Verse from {{ chosenBook?.bookName }} Chapter {{ chosenChapter[0] }}</v-label>
      <v-select
        v-if="chosenChapter.length > 1"
        v-model="eV"
        :items="verseList(chosenChapter[chosenChapter.length - 1])"
        variant="outlined"
        density="compact"
      />
      <v-select v-else v-model="eV" :items="verseList(chosenChapter[0])" variant="outlined" density="compact" />
    </div>
  </div>
</template>

<script setup lang="ts">
import bibleBooksData from '~/data/bible-books.json'

interface BibleBook {
  bookName: string
  bookChapters: number
  bookVerses: number[]
}

const bible = bibleBooksData as BibleBook[]

const props = defineProps<{
  ppID?: number
  modelValue?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  ready: [value: boolean]
  canAdvance: [value: boolean]
}>()

const currentStep = ref(1)
const chosenBook = ref<BibleBook | null>(null)
const chosenChapter = ref<number[]>([])
const ccSelected = ref<Record<number, boolean>>({})
const sV = ref('Verse 1')
const eV = ref('Verse 1')

function bookChosen(nextStep: number, book: BibleBook) {
  currentStep.value = nextStep
  chosenBook.value = book
}

function chapterChosen(nextStep: number) {
  currentStep.value = nextStep
  chosenChapter.value = Object.keys(ccSelected.value)
    .filter((i) => ccSelected.value[Number(i)] === true)
    .map(Number)

  // Default to the whole selected chapter range (most plans reference full
  // chapters) rather than leaving the stale 'Verse 1' default, which collapsed
  // any selection down to a degenerate single-verse reference.
  const lastChapter = chosenChapter.value[chosenChapter.value.length - 1]
  const lastChapterVerseCount = lastChapter != null ? chosenBook.value?.bookVerses[lastChapter - 1] ?? 1 : 1
  sV.value = 'Verse 1'
  eV.value = 'Verse ' + lastChapterVerseCount
}

function verseList(n: number | undefined): string[] {
  const list: string[] = []
  const count = n != null ? chosenBook.value?.bookVerses[n - 1] ?? 0 : 0
  for (let x = 1; x <= count; x++) {
    list.push('Verse ' + x)
  }
  return list
}

const anyChapterSelected = computed(() => Object.values(ccSelected.value).some((v) => v === true))
const canAdvance = computed(() => currentStep.value === 2 && anyChapterSelected.value)

// To structure returned passage properly, need to check if verses are not
// contiguous / validation of some sort
const chosenPassage = computed(() => {
  if (!chosenBook.value) return ''

  let startC: number
  let endC: number
  if (chosenChapter.value.length > 1) {
    startC = chosenChapter.value[0]!
    endC = chosenChapter.value[chosenChapter.value.length - 1]!
  } else if (chosenChapter.value.length === 1) {
    startC = chosenChapter.value[0]!
    endC = startC
  } else {
    startC = 1
    endC = 1
  }

  return `${chosenBook.value.bookName} ${startC}:${sV.value.substring(6)}-${endC}:${eV.value.substring(6)}`
})

watch(chosenPassage, (value) => {
  if (value) emit('update:modelValue', value)
})

// Lets the parent render its own "Next"/"Save" actions (alongside Cancel) in a
// single action bar instead of the picker owning a separate button of its own.
watch(currentStep, (step) => emit('ready', step === 3), { immediate: true })
watch(canAdvance, (value) => emit('canAdvance', value), { immediate: true })

function advance() {
  chapterChosen(3)
}

// Resets the wizard back to step 1 for the next time this picker is opened.
// Called by the parent (via template ref) when its edit dialog closes -
// replaces the old parent-mutates-a-shared-prop broadcast pattern.
function reset() {
  currentStep.value = 1
  chosenBook.value = null
  chosenChapter.value = []
  ccSelected.value = {}
  sV.value = 'Verse 1'
  eV.value = 'Verse 1'
}

defineExpose({ reset, advance })
</script>

<style scoped>
.sList {
  height: 60vh;
  overflow-y: auto;
}
</style>

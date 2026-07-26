<template>
  <v-card class="mx-auto w-100">
    <v-card-title>{{ reference }}</v-card-title>
    <v-card-subtitle>{{ dateFormatter(passageDate) }}</v-card-subtitle>
    <v-card-text
      id="verse-number-sup"
      class="text-high-emphasis"
      v-html="passage"
    />
  </v-card>
</template>

<script setup lang="ts">
const props = defineProps<{
  passageDate: string | Date
  passageContents: string | null
  reference: string | null
}>()

// Format passage verses to be superscript
const passage = computed(() => {
  if (!props.passageContents) return ''

  // The ESV API encodes its poetic hanging-indent (first line of a verse at
  // 4 spaces, continuation lines at 8) as literal leading-space characters,
  // meant for a monospace/print layout where every line fits on one row.
  // Rendered as plain pre-wrapped text, that breaks the moment a line is too
  // long for the viewport: only the first *visual* row keeps the leading
  // spaces, the soft-wrapped continuation starts flush left with no indent -
  // and which lines wrap (and lose their indent) changes with viewport
  // width, so the "misalignment" looks different, and effectively random,
  // every time the screen gets narrower. Converting each line's leading
  // spaces into a `padding-left` on its own block fixes this for good: every
  // wrapped row of that line then shares the same left edge, at any width.
  return props.passageContents
    .replace(/(\[)(\d)/g, (_match, _p1, p2) => `<b><sup>${p2}`)
    .replace(/(\d)(\])/g, (_match, p1, _p2) => `${p1}</sup></b>`)
    .split('\n')
    .map((line) => {
      const match = line.match(/^( *)(.*)$/s)
      const indent = match?.[1] ?? ''
      const content = match?.[2] ?? line
      if (!content) return '<div class="mb-2"></div>'
      return `<div style="padding-left: ${indent.length}ch">${content}</div>`
    })
    .join('')
})
</script>

<template>
  <v-card class="mx-auto w-100">
    <v-card-title>{{ reference }}</v-card-title>
    <v-card-subtitle>{{ dateFormatter(passageDate) }}</v-card-subtitle>
    <v-card-text
      id="verse-number-sup"
      class="text-high-emphasis"
      style="white-space: pre-wrap"
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
  return props.passageContents
    .replace(/(\[)(\d)/g, (_match, _p1, p2) => `<b><sup>${p2}`)
    .replace(/(\d)(\])/g, (_match, p1, _p2) => `${p1}</sup></b>`)
})
</script>

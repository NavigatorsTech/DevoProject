<template>
  <v-card class="mx-auto mb-4">
    <v-card-title>{{ entryTitle }}</v-card-title>
    <v-card-subtitle>{{ dateFormatter(entryDate) }} - {{ entryPassageReference }}</v-card-subtitle>
    <v-card-text>{{ entryShortThoughts }}</v-card-text>
    <v-card-actions>
      <v-btn color="blue" variant="text" @click="$emit('view-entry', entryID)">View Full Entry</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
const props = defineProps<{
  entryID: string
  entryTitle: string
  entryDate: string
  entryPassageReference: string
  entryThoughts: string
}>()

defineEmits<{ 'view-entry': [id: string] }>()

const entryShortThoughts = computed(() => props.entryThoughts.slice(0, 200) + '...')
</script>

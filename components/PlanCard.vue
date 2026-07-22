<template>
  <div>
    <v-card class="mx-auto" max-width="344">
      <v-card-title>{{ planName }}</v-card-title>
      <v-card-subtitle>{{ planDescription }}</v-card-subtitle>
      <v-card-actions class="flex-wrap">
        <v-btn :disabled="notOwner" variant="text" @click="$emit('update-plan', planID)">Update</v-btn>

        <v-dialog v-model="deleteDialog" persistent max-width="290">
          <template v-slot:activator="{ props: activatorProps }">
            <v-btn :disabled="notOwner" color="red" variant="text" v-bind="activatorProps">Delete</v-btn>
          </template>
          <v-card>
            <v-card-title class="text-h5">Just to be sure...</v-card-title>
            <v-card-text>Are you sure you would like to delete this plan?</v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn color="warning" variant="text" @click="deleteDialog = false">Cancel</v-btn>
              <v-btn
                color="success"
                variant="text"
                @click="$emit('delete-plan', planID); deleteDialog = false"
              >Yes</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-chip
          class="ma-2 flex-shrink-0"
          size="small"
          color="primary"
          :variant="outlined ? 'outlined' : 'flat'"
          @click="$emit('selected', planID)"
        >{{ chipText }}</v-chip>
        <v-spacer />
        <v-btn icon @click="show = !show">
          <v-icon>{{ show ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </v-btn>
      </v-card-actions>
      <v-expand-transition>
        <div v-show="show">
          <v-divider />
          <v-list density="compact" disabled>
            <v-list-item v-for="(passage, i) in passages" :key="i.toString()">
              <v-list-item-title v-for="(dayPassage, j) in passage" :key="j.toString()">
                {{ j }} {{ i }} : {{ dayPassage }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </div>
      </v-expand-transition>
    </v-card>
    <br />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  planID: string
  planName: string
  planDescription: string
  passages: Record<string, Record<string, string>>
  notOwner: boolean
  isSelected: boolean
}>()

defineEmits<{
  'update-plan': [id: string]
  'delete-plan': [id: string]
  selected: [id: string]
}>()

const show = ref(false)
const deleteDialog = ref(false)

const outlined = computed(() => props.isSelected !== true)
const chipText = computed(() => (props.isSelected === true ? 'plan selected' : 'select'))
</script>

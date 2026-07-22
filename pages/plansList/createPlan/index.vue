<template>
  <div>
    <PlanEditor ref="PlanEditorComponent" />
    <br />
    <v-btn class="mr-1" color="warning" variant="elevated" @click="cancelPlan">Cancel</v-btn>
    <v-btn color="success" variant="elevated" @click="submitPlan">Create Plan</v-btn>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['check-auth', 'login-check'] })

const planStore = usePlanStore()
const router = useRouter()

const PlanEditorComponent = ref()

async function submitPlan() {
  const valid = await PlanEditorComponent.value.checkValidation()
  if (!valid) return

  const p = PlanEditorComponent.value.getPlan()
  await planStore.createPlan({
    creatorEmail: p.creatorEmail,
    planName: p.planName,
    description: p.description,
    passages: p.passages
  })
  router.push('/plansList')
}

function cancelPlan() {
  router.push('/plansList')
}
</script>

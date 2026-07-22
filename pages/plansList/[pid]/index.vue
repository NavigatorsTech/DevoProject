<template>
  <div>
    <PlanEditor
      ref="PlanEditorComponent"
      :propPlanName="retrievedPlan?.planName"
      :propDescription="retrievedPlan?.description"
      :propTempStore="retrievedPlan?.passages"
    />
    <br />
    <v-btn class="mr-1" color="warning" @click="cancelPlan">Cancel</v-btn>

    <v-dialog v-model="updateDialog" persistent max-width="290">
      <template v-slot:activator="{ props: activatorProps }">
        <v-btn color="success" v-bind="activatorProps">Update Plan</v-btn>
      </template>
      <v-card>
        <v-card-title class="headline">Just to be sure...</v-card-title>
        <v-card-text>Are you sure you would like to update this plan?</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="warning" variant="text" @click="updateDialog = false">Cancel</v-btn>
          <v-btn color="success" variant="text" @click="updatePlan(); updateDialog = false">Yes</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['check-auth', 'login-check'] })

const route = useRoute()
const router = useRouter()
const planStore = usePlanStore()
const passageStore = usePassageStore()

const id = route.params.pid as string
const updateDialog = ref(false)
const PlanEditorComponent = ref()

if (planStore.getPlansSize === 0) {
  const { error: fetchError } = await useAsyncData(`plan-edit-${id}`, async () => {
    const data = await authFetch('/api/plans')
    planStore.storePlans(data)
    return true
  })
  if (fetchError.value) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to load plan' })
  }
}

const retrievedPlan = computed(() => planStore.getPlanUsingID(id))

async function updatePlan() {
  const valid = await PlanEditorComponent.value.checkValidation()
  if (!valid) return

  const p = PlanEditorComponent.value.getPlan()
  await planStore.updatePlan({
    _id: id,
    creatorEmail: p.creatorEmail,
    planName: p.planName,
    description: p.description,
    passages: p.passages
  })
  await passageStore.refreshPassage()
  router.push('/plansList')
}

function cancelPlan() {
  router.push('/plansList')
}
</script>

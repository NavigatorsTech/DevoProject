<template>
  <div>
    <PlanEditor ref="PlanEditorComponent" />
    <div class="d-flex flex-column flex-sm-row ga-2 mt-4">
      <v-btn color="warning" variant="elevated" @click="cancelPlan">Cancel</v-btn>
      <v-btn color="success" variant="elevated" @click="submitPlan">Create Plan</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['check-auth', 'login-check'] })

const planStore = usePlanStore()
const router = useRouter()

const PlanEditorComponent = ref()

// This page has no data of its own to fetch on load - getPlanChosen()'s
// result isn't used here, it's called purely as a cheap authenticated probe
// so a still-pending-verification account gets redirected before it ever
// sees the editor, matching every other protected page's gate. See
// stores/plan.ts's getPlanChosen for why this is the one that surfaces it.
//
// useAsyncData + a reactive watch, not an onMounted probe - confirmed in
// production that navigateTo() called from onMounted (after the component
// has already mounted) is not reliable for this: the call can go through
// without actually taking effect, letting the page stay fully rendered.
// Every other working redirect in this app fires from a page's top-level
// <script setup>, not a lifecycle hook; this now does too.
const { error: gateError } = await useAsyncData('create-plan-gate', () => planStore.getPlanChosen())
watch(
  gateError,
  (err) => {
    if (isEmailNotVerifiedError(err)) {
      navigateTo('/auth/verify-email')
    }
  },
  { immediate: true }
)

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

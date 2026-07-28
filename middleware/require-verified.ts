// Redirects a still-pending-verification account to /auth/verify-email before
// the destination page ever mounts. Route middleware, not a page-level
// useAsyncData/onMounted check - those were tried first and both turned out
// to be genuinely unreliable for this specific redirect in production (see
// git history for the investigation): navigateTo() called from a page's own
// setup/lifecycle hooks could run without actually taking effect, letting
// the page render fully anyway. navigateTo() returned from middleware is
// Nuxt's own primary, best-supported mechanism for exactly this case - the
// current navigation is properly aborted and replaced, not raced against.
//
// No-ops entirely if not authenticated (login-check, where present, already
// owns that case) or already verified - getPlanChosen() is used purely as a
// cheap authenticated probe, same as before; its data isn't consumed here.
export default defineNuxtRouteMiddleware(async () => {
  const userStore = useUserStore()
  if (!userStore.isAuthenticated) return

  const planStore = usePlanStore()
  try {
    await planStore.getPlanChosen()
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return navigateTo('/auth/verify-email')
    }
  }
})

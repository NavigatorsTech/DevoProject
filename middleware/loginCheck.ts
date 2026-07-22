// Merely checks if the user is logged in
export default defineNuxtRouteMiddleware(() => {
  const userStore = useUserStore()
  if (!userStore.isAuthenticated) {
    return navigateTo('/error') // Just throw any page for the time being
  }
})

// Reloads token/exTime/userID into the Pinia userStore from cookies on every
// route, so a returning visit with valid cookies (or a live Firebase session)
// restores auth before render. useCookie() is SSR-universal, so this needs no
// req/context plumbing the way the Nuxt 2 version did.
export default defineNuxtRouteMiddleware(() => {
  const userStore = useUserStore()
  userStore.checkCookie()
})

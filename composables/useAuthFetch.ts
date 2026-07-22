import type { Auth } from 'firebase/auth'

/**
 * $fetch wrapper that attaches the current user's Bearer token to protected
 * API calls. Centralizes what used to be $axios.setToken's automatic header
 * injection - stores just call authFetch(...) instead of each managing headers.
 *
 * Also carries the 401 retry-once backstop that used to live in plugins/axios.js:
 * on a 401 (stale token from clock skew, or a refresh that hasn't landed yet),
 * force a fresh ID token and retry the request exactly once before giving up and
 * logging out. Normal expiry is handled proactively by plugins/firebase.client.ts,
 * so this should rarely fire.
 */
export async function authFetch<T = any>(url: string, opts: Record<string, any> = {}): Promise<T> {
  const userStore = useUserStore()

  const withToken = (token: string | null) => {
    const headers: Record<string, string> = { ...(opts.headers || {}) }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    return { ...opts, headers }
  }

  try {
    return (await $fetch(url, withToken(userStore.token))) as T
  } catch (err: any) {
    if (import.meta.client && err?.response?.status === 401) {
      const auth = useNuxtApp().$firebaseAuth as Auth | undefined
      const currentUser = auth?.currentUser
      if (currentUser) {
        try {
          const freshToken = await currentUser.getIdToken(true)
          userStore.token = freshToken
          return (await $fetch(url, withToken(freshToken))) as T
        } catch (retryErr) {
          console.error(retryErr)
        }
      }
      await userStore.logout()
    }
    throw err
  }
}

/**
 * $fetch wrapper that attaches the current user's Bearer token to protected
 * API calls. Centralizes what used to be $axios.setToken's automatic header
 * injection - stores just call authFetch(...) instead of each managing headers.
 */
export function authFetch<T = any>(url: string, opts: Record<string, any> = {}): Promise<T> {
  const userStore = useUserStore()
  const headers: Record<string, string> = { ...(opts.headers || {}) }
  if (userStore.token) {
    headers.Authorization = `Bearer ${userStore.token}`
  }
  return $fetch(url, { ...opts, headers }) as Promise<T>
}

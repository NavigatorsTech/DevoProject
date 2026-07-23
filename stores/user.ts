import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  type Auth
} from 'firebase/auth'

interface UserState {
  token: string | null
  exTime: number | null
  userID: string | null
  error: any
}

function firebaseAuth(): Auth {
  return useNuxtApp().$firebaseAuth as Auth
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    token: null,
    exTime: null,
    userID: null,
    error: null
  }),

  getters: {
    getToken: (state) => state.token,
    isAuthenticated: (state) => state.token != null,
    getExpiryTime: (state) => state.exTime,
    getUserID: (state) => state.userID,
    errorOccured: (state) => state.error,
    getErrorMessage: (state) => {
      const code = state.error?.code
      switch (code) {
        case 'auth/email-already-in-use':
          return 'An account already exists for this email. Try logging in, or use Sign in with Google.'
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          return 'Incorrect email or password.'
        case 'auth/user-not-found':
          return 'No account found for that email.'
        case 'auth/weak-password':
          return 'Password is too weak - please use at least 6 characters.'
        case 'auth/invalid-email':
          return "That doesn't look like a valid email address."
        default:
          return 'Authentication failed'
      }
    }
  },

  actions: {
    /**
     * Single write path for token/cookie state. Called right after login/register,
     * and by the firebase-token-sync plugin's onIdTokenChanged listener whenever
     * Firebase silently refreshes the token (initial load, ~5min before expiry,
     * tab focus).
     */
    applyToken({ token, expiry, userID }: { token: string; expiry: number; userID: string }) {
      this.token = token
      this.exTime = expiry
      this.userID = userID

      const cookieOpts = { sameSite: 'lax' as const, expires: new Date(expiry), secure: true }
      useCookie('jwt', cookieOpts).value = token
      useCookie('expirationTime', cookieOpts).value = String(expiry)
      useCookie('qtAppID', cookieOpts).value = userID
    },

    async authenticateUser(authData: { isLogin: boolean; id: string; pwd: string }) {
      try {
        if (authData.isLogin) {
          await signInWithEmailAndPassword(firebaseAuth(), authData.id, authData.pwd)
        } else {
          await createUserWithEmailAndPassword(firebaseAuth(), authData.id, authData.pwd)
        }

        // Attach the just-obtained token directly to this one call - cookie/Pinia
        // sync happens via onIdTokenChanged (the firebase-token-sync plugin),
        // triggered by the sign-in/creation above, not yet by the time we get here.
        const idToken = await firebaseAuth().currentUser!.getIdToken()
        await $fetch('/api/users/verify', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` }
        })
      } catch (e) {
        this.error = e
        console.error(e)
      }
    },

    clearError() {
      this.error = null
    },

    async authenticateWithGoogle() {
      try {
        const provider = new GoogleAuthProvider()
        const result = await signInWithPopup(firebaseAuth(), provider)
        const idToken = await result.user.getIdToken()

        await $fetch('/api/users/verify', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` }
        })
      } catch (e) {
        this.token = null
        this.exTime = null
        this.userID = null
        this.error = e
        console.error(e)
      }
    },

    /**
     * Rehydrates token/exTime/userID from cookies. useCookie() is SSR-universal
     * (reads request headers server-side, document.cookie client-side) with the
     * same code path either way - this replaces the old Nuxt 2 split between
     * manual req.headers.cookie parsing and js-cookie.
     */
    syncFromCookies() {
      const token = useCookie('jwt').value
      const expirationTime = useCookie('expirationTime').value
      const userID = useCookie('qtAppID').value

      if (!token || Date.now() > Number(expirationTime)) {
        // Give Firebase's silent refresh a chance before logging out (client-only -
        // there's no live Firebase session to check during SSR).
        if (import.meta.client && firebaseAuth()?.currentUser) {
          return
        }
        this.logout()
        return
      }

      this.token = token
      this.exTime = Number(expirationTime)
      this.userID = userID ?? null
    },

    // checkCookie (SSR rehydration middleware) and syncCookie (client "make sure
    // axios/token agree" calls) collapse into the same implementation now that
    // useCookie() removes the server/client branching that used to separate them.
    checkCookie() {
      this.syncFromCookies()
    },
    syncCookie() {
      this.syncFromCookies()
    },

    async logout() {
      this.token = null
      this.exTime = null
      this.userID = null

      useCookie('jwt').value = null
      useCookie('expirationTime').value = null
      useCookie('qtAppID').value = null
      useCookie('lastActiveAt').value = null

      const planStore = usePlanStore()
      const journalStore = useJournalStore()
      planStore.clearPlans()
      journalStore.clearEntries()

      // Sweep autosaved journal drafts too, so a shared-device logout doesn't
      // leave one visible to the next person. logout() can run server-side (from
      // syncFromCookies during SSR), so guard localStorage to the client.
      if (import.meta.client && window.localStorage) {
        Object.keys(window.localStorage)
          .filter((key) => key.startsWith('qtDraft:'))
          .forEach((key) => window.localStorage.removeItem(key))
      }

      // Sign out of Firebase too, so the SDK stops silently re-issuing tokens.
      // This triggers onIdTokenChanged(null), which re-enters logout - harmless,
      // this action is idempotent.
      if (import.meta.client && firebaseAuth()?.currentUser) {
        await signOut(firebaseAuth())
      }
    }
  }
})

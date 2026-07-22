import Cookie from 'js-cookie';

export const state = () => ({
    token: null,
    exTime: null,
    userID: null,
    error: null
})

export const mutations = {
    setToken(state, token) {
        state.token = token
        this.$axios.setToken(token, 'Bearer');
    },
    clearToken(state) {
        state.token = null;
        this.$axios.setToken(false);
    },
    setExpiryTime(state, time) {
        state.exTime = time;
    },
    clearExpiryTime(state) {
        state.exTime = null;
    },
    setUserID(state, userID) {
        state.userID = userID;
    },
    clearUserID(state) {
        state.userID = null;
    },
    setError(state, error) {
        state.error = error;
    },
    clearError(state) {
        state.error = null;
    }
}

export const actions = {
    // Single write path for token/cookie state. Called right after login/register,
    // and by the firebase-token-sync plugin's onIdTokenChanged listener whenever
    // Firebase silently refreshes the token (initial load, ~5min before expiry,
    // tab focus).
    applyToken(vuexContext, { token, expiry, userID }) {
        vuexContext.commit('setToken', token);
        vuexContext.commit('setExpiryTime', expiry);
        vuexContext.commit('setUserID', userID);
        Cookie.set('jwt', token, {
            sameSite: 'lax',
            expires: new Date(expiry),
            secure: true
        }); // sameSite only allows cookies to be attached to get requests for cross origin requests
        Cookie.set('expirationTime', expiry, {
            sameSite: 'lax',
            expires: new Date(expiry),
            secure: true
        });
        Cookie.set('qtAppID', userID, {
            sameSite: 'lax',
            expires: new Date(expiry),
            secure: true
        });
    },
    async authenticateUser(vuexContext, authData) {
        try {
            if (authData.isLogin) {
                await this.$fire.auth.signInWithEmailAndPassword(authData.id, authData.pwd);
            } else {
                await this.$fire.auth.createUserWithEmailAndPassword(authData.id, authData.pwd);
            }

            // Attach the token to axios directly so the verification call below is
            // authenticated. Cookie/Vuex sync happens via onIdTokenChanged (the
            // firebase-token-sync plugin), triggered by the sign-in/creation above.
            const idToken = await this.$fire.auth.currentUser.getIdToken();
            this.$axios.setToken(idToken, 'Bearer');

            // Verify token server-side and provision a User doc (default plan) for
            // first-time users.
            await this.$axios.$post("/users/verify");
        } catch (e) {
            vuexContext.commit('setError', e);
            console.log(e);
        }
    },
    clearError(vuexContext) {
        vuexContext.commit('clearError');
    },
    async authenticateWithGoogle(vuexContext) {
        try {
            const provider = new this.$fireModule.auth.GoogleAuthProvider();
            const result = await this.$fire.auth.signInWithPopup(provider);
            const idToken = await result.user.getIdToken();

            // Attach the token to axios directly so the verification call below is
            // authenticated. Cookie/Vuex sync happens via onIdTokenChanged (the
            // firebase-token-sync plugin), triggered by signInWithPopup above.
            this.$axios.setToken(idToken, 'Bearer');

            // Verify token server-side and provision a User doc for first-time Google users
            await this.$axios.$post("/users/verify");
        } catch (e) {
            vuexContext.commit('clearToken');
            vuexContext.commit('clearExpiryTime');
            vuexContext.commit('clearUserID');
            vuexContext.commit('setError', e);
            console.log(e);
        }
    },
    checkCookie(vuexContext, req) {
        let token;
        let expirationTime;
        let userID;

        if (req) {
            if (!req.headers.cookie) { // Addresses when store is still on Server side. No cookie yet
                return;
            }
            const jwtCookie = req.headers.cookie.split(';').find(c => c.trim().startsWith("jwt="));
            if (!jwtCookie) { // Address when there is no cookie for some reason, logged out, etc.
                return;
            }
            token = jwtCookie.split("=")[1];
            expirationTime = req.headers.cookie.split(';').find(c => c.trim().startsWith("expirationTime="))
                .split("=")[1];
            userID = req.headers.cookie.split(';').find(c => c.trim().startsWith("qtAppID="))
                .split("=")[1];
        } else { // Local Cookie
            token = Cookie.get("jwt");
            expirationTime = Cookie.get("expirationTime");
            userID = Cookie.get("qtAppID");
        }
        if (new Date().getTime() > +expirationTime || !token) {
            // Cookie looks expired/missing. On the client, if Firebase still has a
            // signed-in user, don't evict yet - the firebase-token-sync plugin's
            // onIdTokenChanged will fire a silent refresh and repopulate the cookies
            // momentarily. Only force logout when there's truly no session to
            // recover from (this also covers the SSR path, where `this.$fire` isn't
            // reliably usable).
            if (!req && this.$fire && this.$fire.auth.currentUser) {
                return;
            }
            vuexContext.dispatch('logout');
            return;
        }
        vuexContext.commit("setToken", token);
        vuexContext.commit("setExpiryTime", expirationTime);
        vuexContext.commit("setUserID", userID);
        // Commenting this out because of excessive backend calls, may have been resolved with some updated code, KIV to delete
        // vuexContext.dispatch("planStore/getPlanChosen", '', { root: true });
    },
    // Makes sure that token and what is sent out for axios is the same
    syncCookie(vuexContext) {
        let token;
        let expirationTime;
        let userID;

        token = Cookie.get("jwt");
        expirationTime = Cookie.get("expirationTime");
        userID = Cookie.get("qtAppID");

        if (new Date().getTime() > +expirationTime || !token) {
            // See checkCookie: give Firebase's silent refresh a chance before logging out.
            if (this.$fire && this.$fire.auth.currentUser) {
                return;
            }
            vuexContext.dispatch('logout');
            return;
        }
        vuexContext.commit("setToken", token);
        vuexContext.commit("setExpiryTime", expirationTime);
        vuexContext.commit("setUserID", userID);
    },
    async logout(vuexContext) {
        // Clearing everthing for logout just in case
        vuexContext.commit('clearToken');
        vuexContext.commit('clearExpiryTime');
        vuexContext.commit('clearUserID');
        Cookie.remove('jwt');
        Cookie.remove('expirationTime');
        Cookie.remove('qtAppID');
        Cookie.remove('lastActiveAt');
        vuexContext.dispatch("planStore/clearPlans", '', { root: true });
        vuexContext.dispatch("journalStore/clearEntries", '', { root: true });
        // Sweep any autosaved journal drafts too, so a shared-device logout
        // doesn't leave one visible to the next person. logout() can run
        // server-side (dispatched from checkCookie during SSR), so guard
        // localStorage access to the client.
        if (typeof window !== 'undefined' && window.localStorage) {
            Object.keys(window.localStorage)
                .filter(key => key.startsWith('qtDraft:'))
                .forEach(key => window.localStorage.removeItem(key));
        }
        // Sign out of Firebase too, so the SDK stops silently re-issuing tokens.
        // This triggers onIdTokenChanged(null), which re-enters logout - harmless,
        // this action is idempotent.
        if (this.$fire && this.$fire.auth.currentUser) {
            await this.$fire.auth.signOut();
        }
    }
}

export const getters = {
    getToken(state) {
        return state.token;
    },
    isAuthenticated(state) {
        return state.token != null;
    },
    getExpiryTime(state) {
        return state.exTime;
    },
    getUserID(state) {
        return state.userID;
    },
    errorOccured(state) {
        return state.error;
    },
    getErrorMessage(state) {
        const code = state.error && state.error.code;
        switch (code) {
            case 'auth/email-already-in-use':
                return "An account already exists for this email. Try logging in, or use Sign in with Google.";
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                return "Incorrect email or password.";
            case 'auth/user-not-found':
                return "No account found for that email.";
            case 'auth/weak-password':
                return "Password is too weak - please use at least 6 characters.";
            case 'auth/invalid-email':
                return "That doesn't look like a valid email address.";
            default:
                return "Authentication failed";
        }
    }
}

import Cookie from 'js-cookie';

// Keeps the Vuex userStore's token/cookie state in sync with Firebase's
// client-side auth session. Firebase auto-refreshes the ID token ~5min
// before it expires (and manages the refresh token in IndexedDB) - this
// plugin listens for every refresh via onIdTokenChanged and re-applies the
// fresh token to cookies/Vuex/axios via userStore/applyToken. It also fires
// once on initial load with the persisted user (if any), so returning after
// the tab was closed restores the session instead of forcing a re-login.
//
// On top of that, it enforces a rolling 3-day idle cap: every real token
// refresh (login, proactive refresh, or a tab-focus-triggered refresh) resets
// a 3-day window via the `lastActiveAt` cookie. If a refresh ever happens
// more than 3 days after the previous one, the session is force-signed-out
// instead of silently extended - so leaving the app open indefinitely with
// no activity for 3+ days requires a real re-login rather than staying
// perpetually authenticated. `lastActiveAt` itself is given a much longer
// browser-side shelf life (90 days) than the 3-day cap it tracks, so it's
// this code - not the cookie's own expiry - that enforces the cap.
const IDLE_CAP_MS = 3 * 24 * 60 * 60 * 1000;

export default function ({ $fire, store }) {
    $fire.auth.onIdTokenChanged(async (user) => {
        if (!user) {
            store.dispatch('userStore/logout');
            return;
        }

        const lastActive = Cookie.get('lastActiveAt');
        if (lastActive && Date.now() - Number(lastActive) > IDLE_CAP_MS) {
            store.dispatch('userStore/logout');
            return;
        }
        Cookie.set('lastActiveAt', Date.now(), { sameSite: 'lax', secure: true, expires: 90 });

        try {
            const result = await user.getIdTokenResult();
            store.dispatch('userStore/applyToken', {
                token: result.token,
                expiry: new Date(result.expirationTime).getTime(),
                userID: user.email
            });
        } catch (e) {
            console.log(e);
        }
    });

    // Covers laptops waking from sleep, where an in-tab refresh timer would
    // have been suspended: on tab focus, ask Firebase for the current token.
    // Firebase only hits the network if it's actually near/past expiry;
    // either way, a resulting refresh is picked up by onIdTokenChanged above.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && $fire.auth.currentUser) {
            $fire.auth.currentUser.getIdToken().catch(e => console.log(e));
        }
    });
}

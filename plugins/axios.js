import https from 'https';

export default function ({ $axios, $fire, store }) {
    // to be removed when deployed to server - workaround for localhost certificate issues
    $axios.defaults.httpsAgent = new https.Agent({ rejectUnauthorized: false });

    // Backstop for the rare case a request goes out with a stale token (clock
    // skew, or a refresh that hasn't landed yet): on a 401, force a fresh ID
    // token and retry the request once. Normal expiry is handled proactively
    // by plugins/firebase-token-sync.client.js, so this should rarely fire.
    $axios.onError(async (error) => {
        const originalRequest = error.config;
        if (originalRequest && error.response && error.response.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            const currentUser = $fire.auth.currentUser;
            if (currentUser) {
                try {
                    const freshToken = await currentUser.getIdToken(true);
                    $axios.setToken(freshToken, 'Bearer');
                    originalRequest.headers['Authorization'] = `Bearer ${freshToken}`;
                    return $axios.request(originalRequest);
                } catch (e) {
                    console.log(e);
                }
            }
            store.dispatch('userStore/logout');
        }
        return Promise.reject(error);
    });
}

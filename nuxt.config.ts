// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  ssr: true,
  devtools: { enabled: true },
  telemetry: false,

  app: {
    head: {
      title: 'Your QT App',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { hid: 'description', name: 'description', content: 'Your Personal QT App and Journaling App' }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' }
      ]
    }
  },

  modules: [
    'vuetify-nuxt-module',
    '@pinia/nuxt',
    'nuxt-gtag'
  ],

  // Theme is dark-mode-only (matches current production behavior — see FEATURES.md §8).
  // The light palette that existed in the Nuxt 2 config was dead code and is intentionally
  // not carried forward.
  vuetify: {
    vuetifyOptions: {
      theme: {
        defaultTheme: 'qtDark',
        themes: {
          qtDark: {
            dark: true,
            colors: {
              primary: '#64B5F6', // blue.lighten2
              secondary: '#FFE082', // amber.lighten3
              accent: '#E0E0E0', // grey.lighten3
              info: '#4DB6AC', // teal.lighten1
              warning: '#FFC107', // amber.base
              error: '#FF3D00', // deepOrange.accent4
              success: '#00E676' // green.accent3
            }
          }
        }
      }
    }
  },

  gtag: {
    id: 'G-TDZSY166ND'
  },

  runtimeConfig: {
    // Server-only (available via useRuntimeConfig() on the server)
    mongodbAccess: process.env.MONGODB_ACCESS,
    mongooseSecret: process.env.MONGOOSE_SECRET,
    esvApiKey: process.env.ESVAPI_KEY,
    cacheTtl: process.env.CACHE_TTL || '3600',
    firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'fb-service-account.json',

    // Public (exposed to the client — safe, matches today's inline Firebase client config)
    public: {
      firebase: {
        apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyAOYahacsrT-2O_T__716n1Kw6fX9X3Zzk',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'qtapp-3b06e.firebaseapp.com',
        projectId: process.env.FIREBASE_PROJECT_ID || 'qtapp-3b06e',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'qtapp-3b06e.appspot.com',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '614414854141',
        appId: process.env.FIREBASE_APP_ID || '1:614414854141:web:fa63f8d748856cea151b94'
      }
    }
  },

  nitro: {
    // Same-origin API: pages call relative /api/... paths, no browserBaseURL/baseURL split
    // (see FEATURES.md §9 — the dual-base-URL config and dev TLS bypass both go away).
  },

  typescript: {
    strict: true,
    typeCheck: false // enable in CI once the initial port settles
  }
})

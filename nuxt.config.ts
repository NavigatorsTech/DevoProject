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
        { name: 'description', content: 'Your Personal QT App and Journaling App' }
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
      // Vuetify 3 introduced "density" as a new concept with its own default spacing,
      // which reads visibly more spacious than Vuetify 2's fixed baseline ever was
      // (confirmed by the user across the login card, PRESS description, and the
      // PassagePicker chapter list all looking more spread out than production).
      // "comfortable" tightens padding on every density-aware component at once.
      defaults: {
        global: {
          density: 'comfortable'
        },
        // Buttons specifically read "too thin" to tap accurately at the global
        // "comfortable" density (28px tall) - opt VBtn back out to Vuetify's
        // baseline "default" density (36px tall) so buttons are a bit chunkier
        // and easier to hit, without loosening every other density-aware
        // component (text fields, list items, cards, etc. all stay
        // "comfortable" via the global default above).
        VBtn: {
          density: 'default'
        }
      },
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
              success: '#00E676', // green.accent3
              // Vuetify 3 auto-computes on-<color> text/icon color via a contrast
              // calculation unless overridden - for some of these (bright success green,
              // light amber secondary) that computes to black text. Vuetify 2 always used
              // white text on colored buttons regardless of contrast math; force that back.
              'on-primary': '#FFFFFF',
              'on-secondary': '#FFFFFF',
              'on-accent': '#FFFFFF',
              'on-info': '#FFFFFF',
              'on-warning': '#FFFFFF',
              'on-error': '#FFFFFF',
              'on-success': '#FFFFFF'
            }
          }
        }
      }
    }
  },

  gtag: {
    id: 'G-TDZSY166ND'
  },

  // Short-lived cache in front of /api/passages/today: absorbs bursts of
  // concurrent home-page loads without repeating the Mongo plan lookup (the
  // ESV text itself is already cached separately for 1hr via
  // defineCachedFunction - see server/utils/bible-retrieval.ts). Kept
  // deliberately short: the endpoint's own "today" logic changes at midnight,
  // and the day-rollover fix (pages/index.vue) actively requests a fresh
  // passage right at that boundary - a long TTL here could serve yesterday's
  // cached response past that point. 60s bounds any staleness to well under
  // one cycle of that mechanism's own 60s polling interval.
  routeRules: {
    '/api/passages/today': { swr: 60 }
  },

  // Server-only secrets are intentionally NOT read from process.env here — this file is
  // evaluated once at build time, so a bare `process.env.X` default gets baked into the
  // compiled .output and silently ignored thereafter. These must be supplied purely via
  // Nitro's automatic NUXT_-prefixed runtime env var overrides (NUXT_MONGODB_ACCESS,
  // NUXT_MONGOOSE_SECRET, NUXT_ESV_API_KEY, NUXT_CACHE_TTL,
  // NUXT_FIREBASE_SERVICE_ACCOUNT_PATH), read fresh every time the compiled server boots -
  // in dev, in the test deployment, and in production alike.
  runtimeConfig: {
    mongodbAccess: '',
    mongooseSecret: '',
    esvApiKey: '',
    cacheTtl: '3600',
    firebaseServiceAccountPath: 'fb-service-account.json',

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

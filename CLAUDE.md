# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**qtapp** — a personal "Quiet Time" (QT) Bible devotional and journaling app, live in production at https://qt.navigators.tech (The Navigators ministry). Built around the **PRESS** method (Pray, Read, Examine, Say it back, Share). ~3 years since last major work but still in production use.

## Stack

- **Nuxt.js 2** (`^2.14.6`), **Vue 2**, `mode: 'universal'` (SSR) — NOT React.
- **Vuetify** (`@nuxtjs/vuetify`) for UI (Material Design). Styling is almost entirely Vuetify utility/component classes + theme colors in `nuxt.config.js`; there is almost no custom CSS (two `<style scoped>` blocks only). No SCSS source files despite `sass` being installed (Vuetify dep).
- **Vuex** for state (built into Nuxt 2, `store/` dir), **file-based routing** (`pages/` dir).
- Backend: **Express** (`server/index.js`) serving over **HTTPS**, **MongoDB Atlas** via **Mongoose**, **Firebase** auth (client SDK + `firebase-admin`), **ESV Bible API** for scripture with `node-cache` caching.
- Vue 2 **Options API** single-file components throughout. No Composition API, no class components, no TypeScript.

## Commands

- `npm run dev` — dev server (Express+Nuxt) via nodemon, hot-restarts on `server/` changes, loads `.env` through `dotenv`.
- `npm run build` — production Nuxt build (`nuxt build`).
- `npm run start` — production server (`NODE_ENV=production node server/index.js`).
- `npm run generate` — static site generation.

There are **no tests, no test framework, no linter/prettier config, and no CI**. Do not assume any of these exist.

## Layout (Nuxt conventions, no `src/`)

- `pages/` — routed views; each `.vue` is a route. Dynamic routes use underscore params: `journalList/_jid/`, `plansList/_pid/`.
- `components/` — reusable Vue SFCs (`Passage.vue`, `JournalCard.vue`, `PlanCard.vue`, `PlanEditor.vue`, `PassagePicker.vue` (~1500 lines of hardcoded Bible book/chapter/verse data), `QTJournalEditor.vue`).
- `layouts/` — `default.vue`, `error.vue`.
- `middleware/` — route guards: `checkAuth.js` (rehydrates token from cookie into store), `loginCheck.js` (redirects unauthenticated users). Attached per-page via `middleware: ["checkAuth", "loginCheck"]`.
- `store/` — Vuex modules, one per namespace: `journalStore.js`, `passageStore.js`, `planStore.js`, `userStore.js`, plus root `index.js` (`nuxtServerInit` preloads today's passage). Access via `this.$store.getters['module/getter']` / `dispatch('module/action')`.
- `plugins/` — `axios.js` (NOTE: disables TLS cert verification for localhost — dev-only workaround), `date-filter.js`, `gtag.js` (Google Analytics via `vue-gtag`).
- `server/` — Express backend:
  - `index.js` — boots Express, instantiates Nuxt, connects Mongo (`db.init()`), inits Firebase Admin (`authService.init()`), serves HTTPS with TLS cert/key from env.
  - `routes/router.js` — all REST endpoints (see below).
  - `services/` — `bible-retrieval.js` (ESV API + cache), `auth.js` (Firebase + Google Identity Toolkit REST), `db-connector.js` (Mongoose), and `models/` (`User.js`, `Plan.js`, `QTEntry.js`).
- `nuxt.config.js` — central config: head/meta, plugins, buildModules, `serverMiddleware` (bodyParser + router), axios base URLs, Vuetify theme, and an inline Firebase **client** config block (public, normal for Firebase).
- `static/` — static assets. `README.md`, `Notes.md` (dev journal).

## Domain model

- **Passage** — a Bible passage fetched from the ESV API. Default fallback: "Proverbs [day-of-month]" (`getDefaultPassage()` in `router.js`).
- **Plan** — a reading plan mapping dates → passages; `Plan.passages` is a nested Mongoose `Map` of `Map` (month → day → reference). New users get `"--- Default Nav Plan ---"`.
- **QTEntry** (journal entry) — title, thoughts, applicationImplication, date, passageReference. `thoughts` and `applicationImplication` are **encrypted at rest** via `mongoose-field-encryption` (`server/services/models/QTEntry.js`).
- **User** — email + `planChosen` (currently selected plan id).

## API endpoints (`server/routes/router.js`)

- `GET /passages/today` (optional `?planID=`), `GET /passages?passageReference=`
- `POST /users` (login or register, branches on `isLogin`), `GET|POST /users/planChosen`
- `GET|POST|PUT|DELETE /plans` — auth-guarded via `AuthService.checkUser`; PUT/DELETE also enforce `checkPlanOwnership` (only creator can edit/delete).
- `GET|POST|PUT|DELETE /qtJournalEntries` — auth-guarded via `AuthService.checkUser`.

## Auth flow

Client sign-in/register from `pages/auth/index.vue` → `store/userStore.js` `authenticateUser` → server `POST /users` → `auth.js` calls Google Identity Toolkit. JWT id token + expiry + user id stored in cookies (`js-cookie`) and Vuex; `$axios.setToken(token, 'Bearer')` attaches it. Server verifies Bearer tokens with `admin.auth().verifyIdToken()`. Password reset uses the client Firebase SDK directly.

## Environment & secrets (all via env / untracked files, none committed)

Required at runtime (not in repo): `MONGODB_ACCESS`, `ESVAPI_KEY`, `MONGOOSE_SECRET`, `NODE_ENV`, TLS cert/key paths (`LOCAL_SSLKEY`/`LOCAL_SSLCERT` in dev, `SSLKEY`/`SSLCERT` in prod), `BASE_URL`/`BROWSER_BASE_URL`, optional `CACHE_TTL`. Also needs `fb-service-account.json` (Firebase Admin creds) at repo root — git-ignored, must be supplied at deploy time or `authService.init()` fails. `.env` is loaded in dev only (`nodemon -r dotenv/config`). (`FB_KEY`, the Identity Toolkit REST API key, is no longer used — auth login/register happens client-side via the Firebase SDK; the server only verifies ID tokens via `firebase-admin`.)

## Conventions & gotchas

- Match existing style: Vue 2 Options API, Vuetify components, callback-style Mongoose queries in `router.js`.
- Deployment is a self-hosted Node/Express SSR server (no Docker/Netlify/Vercel/Firebase Hosting). HTTPS is mandatory — the server won't start without TLS cert/key.
- No automated tests — verify changes by running `npm run dev` and exercising the flow manually.

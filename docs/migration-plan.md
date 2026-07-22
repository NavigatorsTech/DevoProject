# Migrate qtapp from Nuxt 2 → Nuxt 4 (feature parity)

## Context

`qtapp` is a personal "Quiet Time" Bible devotional/journaling app (PRESS method) live in
production at https://qt.navigators.tech for The Navigators ministry. It runs on a ~3-year-old
stack — Nuxt 2 / Vue 2 / Vuetify 2 / Vuex, served by a hand-rolled Express + HTTPS server that
also holds every REST endpoint, talking to MongoDB Atlas (Mongoose), Firebase auth, and the ESV
Bible API. The goal is to move it to **Nuxt 4** (Vue 3 / Vuetify 3 / Pinia / Nitro) with **full
feature parity** — nothing silently dropped — while fixing the known security/correctness bugs
that a naive "port as-is" would carry forward. `FEATURES.md` in the repo root is the authoritative
feature inventory and migration bible; this plan operationalizes it.

Because Nuxt 2→4 spans two major Vue versions, a build system change (webpack→Vite), a server
model change (Express→Nitro), and a state-lib change (Vuex→Pinia), **this is effectively a
ground-up rebuild on the same MongoDB/Firebase data**, not an incremental upgrade. There is no
`nuxt-bridge` path straight to Nuxt 4.

**Confirmed decisions:** TypeScript · manual Firebase client SDK wiring (not nuxt-vuefire) ·
reverse-proxy HTTPS (TLS out of the app) · dark-mode-only (drop the dead light palette).

**Definition of done:** every item in `FEATURES.md` §11 (manual QA / parity checklist) passes
against the Nuxt 4 build, compared side-by-side with production at https://qt.navigators.tech.

---

## Working process (how this plan is executed)

- **This plan is saved to `docs/migration-plan.md` in the repo** as the first action of execution,
  and is a **living document**: the Progress checklist below is updated (boxes ticked, notes added)
  **after every completed stage**.
- **Before starting each stage, inspect the repo** to verify the previous stage actually landed
  (files exist, build passes, checklist reflects reality) — never assume a prior stage is done from
  memory; confirm against the working tree.
- **Commit after each stable milestone** (a phase, or a coherent sub-stage that builds cleanly), on
  the `nuxt4-migration` branch, with a descriptive message. Do not commit a broken build.
- Work proceeds strictly backend → state → UI (Phase 1 → 5), since the same-origin API change
  underpins everything downstream.

## Progress checklist

- [x] **Phase 0** — Scaffold Nuxt 4 + tooling (package.json swap, nuxt.config.ts, Vuetify 3 dark theme, public/, tsconfig)
  - Done: package.json rebuilt for Nuxt 4/Vue 3/Vuetify 3/Pinia 3/mongoose 8; nuxt.config.ts
    (dark-only Vuetify 3 theme, runtimeConfig, vuetify-nuxt-module/@pinia/nuxt/nuxt-gtag); static/
    → public/; .gitignore covers .output/. `npm install` + `npx nuxt prepare` verified clean
    (855 packages, `.nuxt` types generated, no fatal errors — fsevents optional-dep build failure
    is expected/harmless on this platform).
  - Note: local npm cache (~/.npm) had root-owned files from a prior run causing EACCES failures,
    and the system npm (11.3.0) hit a known arborist bug on this dependency graph — worked around
    by installing via `npx npm@11.18.0` with a scratch `--cache` dir rather than touching global
    npm state. Not a repo issue; flagging in case a clean install elsewhere hits the same npm bug.
- [ ] **Phase 1** — Backend Express → Nitro (plugins, models, services, all `server/api/` endpoints, §10 bug fixes)
- [ ] **Phase 2** — State Vuex → Pinia (4 stores + SSR passage preload; drop reactivity workarounds; fix addPlan)
- [ ] **Phase 3** — Plugins & auth wiring (firebase.client + token-sync unit, 401 retry, date helper, nuxt-gtag)
- [ ] **Phase 4** — Middleware & routing (auth/loginCheck, bracket params, useAsyncData/useHead, NuxtPage)
- [ ] **Phase 5** — Components & layouts (Vue 2→3 + Vuetify 2→3; PlanEditor & PassagePicker are the heavy lifts)
- [ ] **Phase 6** — Data validation scripts + reverse-proxy HTTPS + PM2/CI deploy
- [ ] **Parity QA** — walk `FEATURES.md` §11 checklist against production; §10 security regressions; §12 data / §13 deploy go/no-go gates

---

## Strategy

- **Rebuild in a fresh Nuxt 4 skeleton inside the same repo**, on a dedicated branch (e.g.
  `nuxt4-migration`), keeping the Nuxt 2 tree runnable until parity is reached. Do **not** point
  the new build at production MongoDB during development — use a **copy/dump of prod data** (§12).
- **Reuse the live Firebase project and MongoDB Atlas cluster unchanged** — existing users
  (Firebase Auth) and data (Mongo) carry over with zero re-registration, as long as the same
  `firebase.config` and `MONGODB_ACCESS` / `MONGOOSE_SECRET` are used (`FEATURES.md` §12).
- **Order of work: backend first, then state, then UI** — Nitro/same-origin API changes how every
  page/store makes network calls, so land that before touching components (`FEATURES.md` §9 note).
- **Fix `FEATURES.md` §10 bugs while rewriting the corresponding handler** — this is the one area
  where behavior *should* change; everything else aims for faithful parity.

---

## Phase 0 — Scaffold Nuxt 4 + tooling

- New `package.json` per `FEATURES.md` §9 table. **Remove outright:** `express`, `body-parser`,
  `@nuxtjs/axios`, `dotenv`, `nodemon`, `log4js`, `node-cache`, `sass`/`sass-loader`, `vue-gtag`,
  `@nuxtjs/firebase`, `@nuxtjs/vuetify`, `cross-env`. **Add:** `nuxt@^4`, `vuetify` (3) +
  `vuetify-nuxt-module`, `@pinia/nuxt` + `pinia`, `nuxt-gtag`, `firebase` (latest), `firebase-admin`
  (latest), `mongoose@^8`, `mongoose-field-encryption` (re-audit — see Phase 1). Keep `consola`
  (transitive via Nitro) for logging.
- New `nuxt.config.ts` replacing `nuxt.config.js`: `ssr: true`, `modules: [vuetify-nuxt-module,
  @pinia/nuxt, nuxt-gtag]`, `head`/meta + favicon (`static/favicon.png` → `public/favicon.png`),
  `runtimeConfig` holding all secrets (see Phase 1). Vuetify 3 **dark-only** theme recreating the
  §8 semantic palette (primary=blue-lighten2, secondary=amber-lighten3, accent=grey-lighten3,
  info=teal-lighten1, warning=amber, error=deepOrange-accent4, success=green-accent3). No
  `browserBaseURL`/`baseURL` split — API is same-origin now.
- Move `static/` → `public/` (Nuxt 4 convention). Note Nuxt 4's default `app/` srcDir — decide
  whether to opt into it or set `srcDir`/`dir` compat; keep pages/components/layouts at a
  consistent root either way.
- `tsconfig.json` via Nuxt's generated `.nuxt/tsconfig.json`. Enable `<script setup lang="ts">`.

## Phase 1 — Backend: Express → Nitro (`server/api/`, `server/plugins/`)

Retire `server/index.js` + `server/routes/router.js` + `serverMiddleware` entirely. Each Express
route becomes a file-based `defineEventHandler` under `server/api/`. Rewrite every callback-style
Mongoose query as `async/await` + `try/catch` (fixes the §10 hung-request bug class by construction)
and **eliminate the shared module-level `var p`** in the old router (concurrency hazard).

**Nitro plugins (one-time boot work):**
- `server/plugins/mongo.ts` — Mongoose connect (was `db-connector.js`), Mongoose 8, graceful close.
- `server/plugins/firebase-admin.ts` — `admin.initializeApp` from `fb-service-account.json`
  (still git-ignored at repo root; sourced via `runtimeConfig`). Was `auth.js` `init()`.

**Models** (port `server/services/models/` → `server/models/`, near-verbatim, add TS types):
- `User.ts`, `Plan.ts` (nested `Map` of `Map` — **keep shape exactly**, §12), `QTEntry.ts` with
  `mongoose-field-encryption` on `thoughts`/`applicationImplication` keyed by `MONGOOSE_SECRET`.
  **Before trusting the encryption lib**, run a one-off script (Phase 6) that decrypts real prod
  rows and round-trips them; if the pinned lib is unusable on Mongoose 8, fall back to a small
  AES-256-GCM pre-save/post-find hook (`FEATURES.md` §9/§12).

**Services:**
- `server/utils/bible-retrieval.ts` — ESV fetch via `$fetch`/`ofetch`, cache via Nitro
  `useStorage()` (replaces `node-cache`), TTL from `runtimeConfig`. Excludes refs/footnotes/headings.
- `server/utils/auth.ts` — `verifyIdToken` helpers (`checkUser`, `getEmailFromToken`,
  `checkPlanOwnership`). **Fix the "no Authorization header ⇒ silently passes" bug** — a missing
  header must reject, not resolve (§10 / backend inventory finding).

**Endpoints** (file-based routing; fix §10 bugs inline):
| New file | Was | Auth change (§10) |
|---|---|---|
| `passages/today.get.ts` | `GET /passages/today` | stays **public** (landing page); add lightweight IP rate-limit as defense-in-depth |
| `passages/index.get.ts` | `GET /passages?passageReference=` | gate behind `checkUser` (no landing-page use) — decision per §10 |
| `users/verify.post.ts` | `POST /users/verify` | verify token → `ensureUser` (default-plan provisioning) |
| `users/planChosen.get.ts` / `.post.ts` | `GET/POST /users/planChosen` | **add auth** (was fully unauthenticated) — match token email to `userID` |
| `plans/index.{get,post,put,delete}.ts` | `GET/POST/PUT/DELETE /plans` | keep `checkUser`; PUT/DELETE keep `checkPlanOwnership`; **add null-plan 404 guard** before reading `.creatorEmail` |
| `qtJournalEntries/index.{get,post,put,delete}.ts` | same | **add IDOR ownership checks on PUT/DELETE**; **set `creatorEmail` server-side from the verified token** (ignore client-supplied value) |

Keep the `"--- Default Nav Plan ---"` string constant and `getDefaultPassage()` = "Proverbs
{day-of-month}" fallback exactly. (Optional stretch, §12: add an `isDefault: true` flag instead of
name-matching — backfill the one doc — but not required for parity.)

## Phase 2 — State: Vuex → Pinia (`stores/`)

Convert the four namespaced Vuex modules + root into Pinia stores (`defineStore`). Client network
calls use Nuxt's built-in **`$fetch` / `useAsyncData`** (relative `/api/...` paths — no `$axios`).

- `stores/user.ts` — the auth core (port `userStore.js`). Replace all `this.$axios`/`this.$fire`
  injection with explicit `useNuxtApp().$firebaseAuth` (from the Phase 3 plugin) + `$fetch`.
  Replace `js-cookie` cookie read/write with Nuxt **`useCookie()`** (SSR-universal — collapses
  most of `checkCookie`/`syncCookie` and all of `middleware/checkAuth.js`). Preserve: `applyToken`
  as the single write path, the friendly Firebase-error-code map (`getErrorMessage`), `logout`
  clearing cookies + plan/journal state + sweeping `qtDraft:*` localStorage + Firebase `signOut`.
- `stores/passage.ts`, `stores/plan.ts`, `stores/journal.ts` — port state/getters/actions.
  - **Drop the Vue 2 reactivity workarounds** (§7): `journalStore.addEntry`'s `Vue.set(...)` →
    plain `push`; **fix `planStore.addPlan`'s broken `state.plans.$set(...)`** → `push` (this line
    throws today, masked by a re-fetch).
  - **Curried getters** `getEntryUsingID` / `getPlanUsingID` → plain store methods (Pinia has no
    Vuex curried-getter ceremony).
  - Keep streak logic verbatim: `toDayIndex` (DST-safe local-day index), `uniqueSortedDays`,
    `getCurrentStreak`, `getLongestStreak`, `hasJournaledToday`.
- Root `nuxtServerInit` behavior (preload today's passage during SSR) → a plugin or `useAsyncData`
  in `app.vue`/home page that calls `passages/today` server-side before first paint.

## Phase 3 — Plugins & auth wiring

- `plugins/firebase.client.ts` — initialize the **firebase client SDK** from `runtimeConfig.public`
  and `provide` `$firebaseAuth` / `$firebaseModule`. **Port `firebase-token-sync.client.js` as one
  unit** (`FEATURES.md` checklist note): `onIdTokenChanged` → idle-cap check via
  `lastActiveAt` cookie (3-day `IDLE_CAP_MS`, 90-day cookie shelf) → `applyToken`; plus the
  `visibilitychange` tab-focus refresh. Preserve ordering: token attached before `/users/verify`.
- **401 retry-once backstop** — replace the old `plugins/axios.js` `$axios.onError` interceptor
  with an `$fetch` wrapper / `onResponseError` interceptor that force-refreshes the Firebase token
  and retries once, then logs out. **Drop the dev-only `rejectUnauthorized:false` TLS bypass**
  entirely (no longer needed once API is same-origin).
- `plugins/date-format.ts` — replace the removed Vue 2 `dateFormatter` **filter** with an exported
  helper function imported into `Passage.vue` / `JournalCard.vue` (`{{ dateFormatter(d) }}`), or a
  Vue 3 global property. Same "D Month YYYY" output.
- Google Analytics — replace `vue-gtag` plugin with `nuxt-gtag` config (`G-TDZSY166ND`).

## Phase 4 — Middleware & routing

- `middleware/auth.global.ts` or per-page `definePageMeta({ middleware: [...] })`: port
  `checkAuth` (mostly absorbed by `useCookie` rehydration in `stores/user`) and `loginCheck`
  (redirect unauthenticated → `/error` → offers login). Nuxt 4 signature is `(to, from)`, not the
  Nuxt 2 `context`.
- File-based routes map 1:1: `pages/index.vue`, `pages/auth/index.vue`,
  `pages/journalList/index.vue`, `pages/journalList/[jid]/index.vue`,
  `pages/journalList/createEntry/index.vue`, `pages/plansList/index.vue`,
  `pages/plansList/[pid]/index.vue`, `pages/plansList/createPlan/index.vue`. **Underscore params
  `_jid`/`_pid` → bracket params `[jid]`/`[pid]`.**
- `asyncData` (5 pages) → `useAsyncData`/`useFetch` in `<script setup>`. `head()` in `error.vue` →
  `useHead`. `<nuxt />` outlet → `<NuxtPage />` / `<slot />` in layouts. `beforeRouteLeave`
  (`[jid]` page) → `onBeforeRouteLeave` (still supported).

## Phase 5 — Components & layouts (Vue 2 → Vue 3 + Vuetify 2 → Vuetify 3)

Convert all SFCs to `<script setup lang="ts">`. Apply the §7 breaking-change checklist as the diff:

- **`layouts/default.vue`** — `<v-app>`/`<v-app-bar>`/`<v-navigation-drawer>` (right, temporary).
  Replace the side-effecting `setTheme` computed with a one-time dark-theme set in setup. Resolve
  the hardcoded `color="indigo"` app bar vs `primary` inconsistency deliberately (§8).
- **`layouts/error.vue`** — Nuxt 4 error page conventions; `useHead` for title.
- **`Passage.vue`** — `dateFormatter` helper (not filter); keep `v-html` verse-superscript
  transform (trusted ESV content only, §8). `v-layout`/`v-flex` → `v-row`/`v-col`.
- **`JournalCard.vue`** — helper-based date; resolve hardcoded `color="blue"` → `primary` (§8).
- **`PlanCard.vue`** — keep `v-expand-transition` + `v-show` (NOT `v-if` — animation, §7);
  disabled-not-hidden owner gating; Vuetify 3 `v-chip`/`v-list` API updates.
- **`StreakCard.vue`** — port scoped `@media (max-width:599px)` block; secondary-colored flame + Best chip.
- **`QTJournalEditor.vue`** — the draft autosave/recovery unit (localStorage, 500ms debounce,
  `pagehide`+`visibilitychange` flush, restore-with-Discard snackbar, create=same-day / edit=7-day
  TTL, clear on save/cancel/nav but NOT hard-refresh). `beforeDestroy` → `onBeforeUnmount`. Keep
  the imperative parent→child API (`getEntry`/`checkValidation`/`clearDraft`/`discardDraft`) via
  `defineExpose`. Import `toDayIndex` from `stores/journal`.
- **`PlanEditor.vue`** — the migration-heaviest component (§7/§9):
  - `.sync` → `v-model:...`. `v-date-picker type="month"` → Vuetify 3 month picker (API changed).
  - `v-data-table` dynamic slot `` v-slot:[`item.passage`] `` → Vuetify 3 data-table slot naming.
  - **`v-edit-dialog` was removed in Vuetify 3** — confirm availability on the chosen Vuetify 3
    version; **budget a small custom edit-in-place cell component as the fallback** (inline
    text/click-to-edit opening the PassagePicker). Preserve the multi-month in-memory temp-store
    merge-and-sort-on-submit behavior.
- **`PassagePicker.vue`** (~1500 lines) — **extract the hardcoded 66-book Bible verse-count data to
  a JSON asset** (`FEATURES.md` checklist), leaving only the 3-step wizard UX. Migrate the Vue 2
  `value`/`input` v-model contract → `modelValue`/`update:modelValue` (declare the prop!). Replace
  the parent-mutates-`isCompleted`-prop reset anti-pattern with an emitted-event reset. Fix
  direct-index array reactivity (fine in Vue 3, but clean up). `v-stepper` API updates.
- **Shared UI** (optional cleanup, §7): the repeated `snack`/`snackColor`/`snackText` +
  `updateDialog`/`deleteDialog` trio → a shared composable (`useSnackbar`) / global confirm dialog
  instead of copy-pasting into every page. Keep the "confirm before Update/Delete only" UX rule.
- Normalize legacy `<center>` tags → `d-flex justify-center` (§8).

## Phase 6 — Data & deployment

- **Data validation scripts** (run against a **copy** of prod, §12): (a) decrypt a sample of
  `QTEntry` rows and confirm plaintext round-trips under the new Mongoose 8 + encryption setup;
  (b) confirm `Plan.passages` deserializes into the expected nested-Map shape; (c) confirm every
  `User.planChosen` string is a valid, non-dangling plan id. Gate go-live on all three.
- **Deployment** (`FEATURES.md` §13): `npm run build` now emits `.output/` (Nitro) instead of
  `.nuxt` consumed by the old `server/index.js`. Update `ecosystem.config.js` (PM2) to run
  `.output/server/index.mjs` — **and pull `ecosystem.config.js` into the repo** (it currently lives
  only on the prod host). Set up the **reverse proxy** (nginx/Caddy) to terminate TLS with the
  existing certs and proxy HTTP→Nitro on localhost:3000; move cert renewal (Certbot) out of the
  app. Update `.github/workflows/deploy.yml` build/restart/health-check steps for the new output.
- **`runtimeConfig` secrets** (consolidate scattered `process.env.*`): `MONGODB_ACCESS`,
  `ESVAPI_KEY`, `MONGOOSE_SECRET`, `CACHE_TTL`, firebase admin creds path; `public` side gets the
  firebase client config. Nitro auto-loads `.env` in dev (drop `dotenv`).

---

## Critical files

**New (representative):** `nuxt.config.ts`, `server/plugins/{mongo,firebase-admin}.ts`,
`server/utils/{auth,bible-retrieval}.ts`, `server/models/{User,Plan,QTEntry}.ts`,
`server/api/**/*.{get,post,put,delete}.ts`, `stores/{user,passage,plan,journal}.ts`,
`plugins/{firebase.client,date-format}.ts`, `middleware/{auth,loginCheck}.ts`, all
`pages/**`/`components/**`/`layouts/**` SFCs, `ecosystem.config.js`, updated `deploy.yml`.

**Retired:** `server/index.js`, `server/routes/router.js`, `plugins/axios.js`,
`plugins/gtag.js`, `plugins/date-filter.js`, `plugins/firebase-token-sync.client.js` (logic
absorbed into `plugins/firebase.client.ts`), `middleware/checkAuth.js` (absorbed into `useCookie`
rehydration), `store/*.js`, `nuxt.config.js`.

---

## Verification (compare against https://qt.navigators.tech throughout)

Primary gate is `FEATURES.md` §11's manual QA checklist — walk every item since there are no
automated tests. Key flows to exercise with `npm run dev` (and against the prod app side-by-side
using the Chrome MCP browser tools):

1. **Auth** — email login/register (correct + wrong creds → mapped error snackbar), Google popup,
   password-reset email (continue URL returns to app), refresh-survives-session, silent token
   refresh past expiry, 3-day idle-cap forced logout, logout clears cookies + Vuex/Pinia + drafts +
   Firebase session, protected-page-while-logged-out → `/error` → login.
2. **Passages** — landing shows today's passage logged-out; reflects chosen plan logged-in; old
   entry shows *its* original passage; verse numbers superscript; repeat requests served from cache
   (server logs); SSR HTML already contains today's passage (view-source / JS disabled).
3. **Journal** — create/view/update/delete with confirm dialogs; share/copy-to-clipboard format;
   create-draft same-day restore + Discard; edit-draft 7-day survival; cancel discards draft;
   streak increments/resets, "Best" only shows when > current.
4. **Plans** — multi-month create saves all months; edit round-trips stored months; non-owner
   cannot update/delete (button disabled AND server rejects a direct API call); selecting a plan
   updates today's passage without manual refresh; PassagePicker produces correct single- and
   multi-chapter reference strings.
5. **Security (§10 fixes) regression** — direct API calls confirm: journal PUT/DELETE reject
   non-owners (IDOR closed), `creatorEmail` can't be spoofed, `/users/planChosen` now requires auth,
   bad plan id returns 404 not a hang, missing Authorization header is rejected.

Data go/no-go (§12) and deploy go/no-go (§13) are separate gates, verified before flipping
production DNS/proxy to the Nitro build.

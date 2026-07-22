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
- [x] **Phase 1** — Backend Express → Nitro (plugins, models, services, all `server/api/` endpoints, §10 bug fixes)
  - Done: `server/index.js`, `server/routes/router.js`, `server/services/*` retired. New
    `server/plugins/{mongo,firebase-admin}.ts`, `server/models/{User,Plan,QTEntry}.ts`,
    `server/utils/{auth,bible-retrieval}.ts`, and all 12 `server/api/**/*.{get,post,put,delete}.ts`
    endpoints. `bible-retrieval.ts` uses Nitro's `defineCachedFunction` (unstorage-backed) in
    place of node-cache — same TTL semantics, one less dependency.
  - §10 fixes landed: missing-Authorization-header now rejects (401) instead of silently
    passing; journal PUT/DELETE now enforce ownership (IDOR closed) via a new generic
    `requireOwner()` helper (also reused for Plan ownership); `creatorEmail` on journal (and
    plan) creation is always taken from the verified token, never the client body; PUT/DELETE
    `/plans` 404 on a nonexistent plan instead of null-dereferencing `.creatorEmail`; every
    handler is async/await + throws `createError(...)` on failure (Nitro's error middleware
    always sends a response — the old silent-hang class of bug can't recur).
  - Journal update path uses `findOne` + mutate + `.save()` (not `findOneAndUpdate`) so
    mongoose-field-encryption's pre-save hook reliably re-encrypts `thoughts`/
    `applicationImplication` — worth a real check against prod data in Phase 6 regardless.
  - **Contract decision**: since both server and client are being rewritten in this migration,
    endpoints return plain JSON bodies + proper HTTP status codes (thrown via `createError`)
    rather than replicating Express's `res.sendStatus()` text-body quirks — Phase 2's Pinia
    stores are written against this new contract, not the old one. This doesn't affect user-
    facing parity, only the internal wire format between this app's own frontend and backend.
  - Verified live with `npm run dev` using a local (non-production) test Mongo + a deliberately
    invalid ESV key + the real local `fb-service-account.json`: Firebase Admin initialized
    successfully, Mongo connected, all 12 endpoints exercised — auth-gated ones correctly
    return 401 with no Bearer token; `/api/passages/today` correctly fell back to the
    Proverbs-of-the-day default when the plan lookup found nothing, and reached the real ESV
    API (got a real 403 for the intentionally-bad key, proving the whole request pipeline
    wired up end to end). Caught and fixed one real bug in the process: `mongoose`/
    `mongoose-field-encryption`'s named exports aren't resolvable in Nitro's ESM runtime
    (CommonJS interop) — fixed via default-import + destructure in all three model files.
  - Deferred (not required for parity, noted in FEATURES.md §10 as a nice-to-have): IP-based
    rate limiting on the public `/api/passages/today` endpoint as defense-in-depth.
- [x] **Phase 2** — State Vuex → Pinia (4 stores + SSR passage preload; drop reactivity workarounds; fix addPlan)
  - Done: `store/*.js` (Vuex) retired; `stores/{user,passage,plan,journal}.ts` (Pinia options
    stores) added, plus `composables/useAuthFetch.ts` — a small `$fetch` wrapper that attaches
    the current user's Bearer token, replacing `$axios.setToken`'s automatic header injection.
    All state/getters/actions ported faithfully (state mutations folded directly into actions,
    since Pinia has no separate mutations layer).
  - Fixes landed: `journalStore.addEntry`'s `Vue.set(...)` and `planStore.addPlan`'s broken
    `state.plans.$set(...)` (which threw at runtime, masked by an immediate re-fetch) both
    become plain `push()` — Pinia/Vue 3's proxy reactivity needs neither. `createPlan`/
    `updatePlan` now push/splice-in the server's *returned* document (Phase 1 now returns the
    created/updated Plan, not just an ack) instead of the client-submitted input — fixes a
    latent bug where a newly created plan had no real Mongo `_id` in local state until the next
    full re-fetch. Curried Vuex getters (`getPlanUsingID`, `getEntryUsingID`) are now plain
    Pinia getter-returning-functions — same call shape, no Vuex ceremony.
  - `userStore` (now `stores/user.ts`) is the delicate piece: `applyToken` stays the single
    token/cookie write path; `checkCookie`/`syncCookie` collapse into one `syncFromCookies()`
    implementation now that Nuxt's `useCookie()` is SSR-universal (no more manual
    `req.headers.cookie` string parsing vs. js-cookie branching); the Firebase-error → friendly-
    message map and the "give Firebase's silent refresh a chance before logging out" grace
    check are preserved exactly. Firebase client SDK calls (`signInWithEmailAndPassword`, etc.)
    are imported directly from `firebase/auth`, with the `Auth` instance expected at
    `useNuxtApp().$firebaseAuth` — provided by Phase 3's plugin (not yet wired, so `stores/
    user.ts` isn't runnable end-to-end until Phase 3 lands; this mirrors how Phase 1's routes
    weren't exercised against real prod data until they had real callers either).
  - `nuxtServerInit`'s SSR passage-preload is deliberately **not** built as a standalone
    mechanism now — it would be dead code with no consumer. It folds into Phase 4's `pages/
    index.vue` `useAsyncData` call instead, which runs during SSR and achieves the same
    "passage already in the HTML on first paint" outcome natively in Nuxt 4.
  - Also fixed two Phase 0/1 gaps this typecheck pass surfaced: `nuxt.config.ts` used the
    Nuxt-2-only `hid` meta key (Nuxt 4 doesn't have it — dropped, unnecessary for one tag); a
    root `tsconfig.json` extending `.nuxt/tsconfig.json` was missing entirely (added — needed
    for `nuxt typecheck` and editor support to work at all).
  - Verified via `npx nuxt typecheck` (added `vue-tsc` devDependency): every new/changed file
    (`server/models/*`, `server/api/*`, `stores/*`, `composables/useAuthFetch.ts`) is clean.
    Caught and fixed two real bugs: Mongoose's `models.X || model(...)` recompilation-guard
    pattern produces a call-signature union TypeScript can't resolve — fixed with an explicit
    `Model<T>` return type annotation on each model export; and a couple of provably-safe but
    strict-mode-flagged array index accesses in the streak logic, fixed with non-null
    assertions (bounds are already guarded by the surrounding loop conditions).
  - Note: vue-tsc's Vue-file language plugin currently fails to load in this project
    (`vue-router/volar/sfc-route-blocks` plugin error, likely a version mismatch to revisit),
    so `.vue` SFCs aren't being type-checked yet — not a regression from this phase, and expected
    to resolve naturally once Phase 5 replaces the Vue 2 SFCs Simple type-checking would have
    choked on anyway (Vue 2 filters, `.sync`, etc. aren't valid Vue 3 template syntax).
  - Real runtime exercise of the Pinia layer (not just type-checking) requires an actual Vue
    app render, since Pinia stores are context-bound to the app instance — deferred to Phase
    4/5 once real pages call these stores, same as Phase 1's routes weren't fully live-tested
    until they had real callers.
- [x] **Phase 3** — Plugins & auth wiring (firebase.client + token-sync unit, 401 retry, date helper, nuxt-gtag)
  - Done: `plugins/{axios,date-filter,gtag,firebase-token-sync.client}.js` retired.
    `plugins/firebase.client.ts` initializes the Firebase client SDK and ports
    `firebase-token-sync.client.js`'s `onIdTokenChanged` + 3-day idle-cap + tab-focus-refresh
    logic as one unit (per the FEATURES.md migration note), provides `$firebaseAuth` via
    `useNuxtApp()`. `composables/useAuthFetch.ts` gained the 401 retry-once-then-logout
    backstop that used to live in `plugins/axios.js`'s `$axios.onError` interceptor — force a
    fresh ID token, retry exactly once, else log out. The dev-only TLS bypass is dropped
    entirely (no longer needed - API is same-origin, see Phase 0/§9). `utils/dateFormatter.ts`
    replaces the removed Vue 2 `dateFormatter` filter as a plain exported function (`nuxt-gtag`
    module config for Google Analytics was already wired into `nuxt.config.ts` back in Phase 0).
  - **Deliberate placement change from the plan text**: the date-formatter landed at
    `utils/dateFormatter.ts` (pure function, Nuxt-auto-imported) rather than
    `plugins/date-format.ts` — it needs no `defineNuxtPlugin`/injection, so `utils/` is the more
    idiomatic Nuxt 4 home for it.
  - Verified via `npx nuxt typecheck` (clean) and a live `npm run dev` boot: no build/plugin
    load errors from any of the new files. Confirmed via Chrome browser navigation that a real
    page request reaches Vue 3 SSR - but every page (via the shared `layouts/default.vue`)
    still throws on the now-removed Vuex `$store` reference in the nav bar's auth-state check
    (`Cannot read properties of undefined (reading 'getters')`). This is an **expected,
    correctly-scoped-for-later** failure, not a Phase 3 regression: it's a Phase 2 consequence
    (Vuex is gone) that only `layouts/default.vue`'s own rewrite (Phase 5) can fix, since every
    page shares that layout. Full live auth-flow testing of `firebase.client.ts` is therefore
    genuinely blocked until Phase 5 migrates the layout - deferred to Parity QA. Also visible in
    dev server warnings, confirming they're pre-existing and unrelated to this phase: Vuetify 2
    component resolution failures (`v-list-item-content`) and the old `<nuxt/>` outlet.
- [x] **Phase 4** — Middleware & routing (auth/loginCheck, bracket params, useAsyncData/useHead, NuxtPage)
  - Done: `middleware/{checkAuth,loginCheck}.js` retired in favor of `middleware/{checkAuth,
    loginCheck}.ts` using `defineNuxtRouteMiddleware`. `checkAuth.ts` just calls the Pinia
    `userStore.checkCookie()` — no more manual `req`/context plumbing, since `useCookie()`
    (wired in Phase 2) is already SSR-universal. `loginCheck.ts` redirects to `/error` via
    `navigateTo()` when not authenticated, same as before. Both are named (non-global)
    middleware, matching the original's per-page opt-in (`middleware: ["checkAuth"]` or
    `["checkAuth", "loginCheck"]`) — deliberately **not** wired to any page yet, since actually
    attaching them via `definePageMeta({ middleware: [...] })` requires touching each page's
    script, which is Phase 5's job (keeps this phase scoped to infrastructure, not page edits).
  - Dynamic route folders renamed via `git mv`: `pages/journalList/_jid` →
    `pages/journalList/[jid]`, `pages/plansList/_pid` → `pages/plansList/[pid]`. No other
    routing changes yet — `asyncData`→`useAsyncData`, `<nuxt/>`→`<NuxtPage/>`, `head()`→
    `useHead`, and `beforeRouteLeave`→`onBeforeRouteLeave` all live inside page/layout files
    and are deferred to Phase 5 alongside the rest of each file's Vue 3 rewrite.
  - Verified via `npx nuxt typecheck` (clean) and a live dev server boot with Chrome
    navigation: requests to `/journalList/some-test-id` and `/plansList/some-test-id` both
    reached real per-route handling (not a 404), confirming Nuxt 4's router correctly resolves
    the renamed `[jid]`/`[pid]` bracket-param folders. The errors surfaced (a stale `@/store/
    journalStore` import in `QTJournalEditor.vue`, and the same Phase 3/5-flagged
    `layouts/default.vue` Vuex reference) are exactly the pre-identified, Phase-5-scoped
    leftovers from removing Vuex in Phase 2 — not new issues introduced by this phase.
- [x] **Phase 5** — Components & layouts (Vue 2→3 + Vuetify 2→3; PlanEditor & PassagePicker are the heavy lifts)
  - Done: every layout, component, and page converted to Vue 3 `<script setup lang="ts">` +
    Vuetify 3. Vue 2→3 breaking changes applied throughout (§7): filters →
    `dateFormatter()` helper calls, `.sync` → `v-model:`/writable computeds, `beforeDestroy` →
    `onBeforeUnmount`, `value`/`input` v-model contract → `modelValue`/`update:modelValue`,
    imperative parent→child calls kept via `defineExpose`. Vuetify 2→3 API updates applied
    throughout: `v-list-item-action`/`v-list-item-content` removed (props/slots on
    `v-list-item` directly), boolean props → `variant`/`size` (`text`→`variant="text"`,
    `outlined`→`variant="outlined"`, `small`→`size="small"`), `mini-variant`→`rail`,
    `right`→`location="right"`, dialog activator slot `{ on, attrs }`→`{ props }`,
    **`text--primary`/`text--secondary`→`text-high-emphasis`/`text-medium-emphasis`** (a real
    semantic trap: Vuetify 3's `text-primary` means the *primary theme color*, not the Vuetify 2
    emphasis-level class of the same near-name — naively renaming would have silently reskinned
    body text blue). `layouts/default.vue`'s side-effecting `setTheme` computed is gone
    entirely — dark theme is already the nuxt.config.ts default, so forcing it at runtime is no
    longer needed. Root `nuxtServerInit` folded into `pages/index.vue`'s own `useAsyncData` as
    planned in Phase 2.
  - **Nuxt 2→4 routing/error-page gap found and fixed**: `layouts/error.vue` is *not*
    auto-wired to thrown errors/404s in Nuxt 4 the way it was in Nuxt 2 (Nuxt 4 needs a
    project-root `error.vue`, a completely different mechanism). `middleware/login-check.ts`'s
    `navigateTo('/error')` was hitting Nuxt's generic built-in 404 instead of the app's own
    error page until this was caught via live browser testing and fixed by moving the content
    to root `error.vue` and using `clearError({ redirect: '/auth' })` instead of a plain link
    (the documented way to leave Nuxt's error-boundary state).
  - **Two components got a deliberately heavier rewrite than a mechanical port**, both
    flagged in advance as the plan's biggest risk areas and both resolved by *avoiding* the
    uncertain Vuetify 3 API entirely rather than gambling on it:
    - **`PassagePicker.vue`**: the 66-book hardcoded Bible verse-count array was extracted
      verbatim to `data/bible-books.json` via a Node script (not hand-retyped, to eliminate
      transcription risk) — validated to have all 66 books, 1189 total chapters (the correct
      count for the whole Bible), and every book's chapter count matching its verse-array
      length before being trusted. The parent-mutates-a-shared-`isCompleted`-prop broadcast
      reset (§7's flagged anti-pattern, coupled to a `ppID`-matching handshake) is replaced by
      an exposed `reset()` method the parent calls directly via template ref — matching the
      imperative-handle pattern already used everywhere else in this app, and only made
      practical because the parent redesign below gives every row its own real ref.
    - **`PlanEditor.vue`**: `v-edit-dialog` (removed in Vuetify 3, exactly as FEATURES.md
      flagged) and `v-data-table`'s dynamic-slot + `v-date-picker type="month"` (both
      genuinely uncertain APIs in the installed Vuetify 3.7 without live doc access) are all
      replaced by a manually-rendered `v-table` with a per-row custom `v-dialog` edit cell
      (the plan's own suggested fallback) and two plain `v-select` dropdowns (month name,
      year) driving the same `YYYY-MM` date string via writable computeds — built entirely
      from Vuetify 3 patterns already confirmed working elsewhere (dialog activator slots),
      rather than components whose exact current-version shape couldn't be verified live.
  - One-off literal colors flagged in FEATURES.md §8 (`indigo` app bar, `blue` "View Full
    Entry" button) are kept exactly as-is, not "fixed" to `primary` — parity-first, since
    resolving that inconsistency was optional and not requested.
  - Verified via `npx nuxt typecheck` (fully clean across every new/changed file) and a live
    `npm run dev` + Chrome browser session against a local test Mongo: homepage renders fully
    (dark theme, nav drawer, PRESS card, passage card with correct date formatting, login CTA),
    `/auth` renders correctly (form, Google button, forgot-password), `login-check` middleware
    correctly redirects an unauthenticated request to the new working error page, and the
    error page's "Proceed to log in" button correctly clears the error and navigates to
    `/auth`. Console is clean (no hydration mismatches, no Vue warnings) aside from the
    expected caught 403 from the intentionally-invalid dev ESV key. Found and fixed one real
    bug along the way: `Passage.vue` didn't guard against `passageContents` being `null`
    (the pre-load-completes / fetch-failed state), crashing SSR.
  - **Not yet exercised live** (needs a deliberate decision on test credentials, not something
    to trigger accidentally): the actual Firebase login/register/Google flow, journal
    entry CRUD, and plan CRUD (including `PlanEditor`/`PassagePicker` interaction) all require
    a real authenticated session against the real Firebase project. Deferred to Phase 6 /
    Parity QA, which should use dedicated test credentials rather than whatever a browser's
    password manager happens to autofill.
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

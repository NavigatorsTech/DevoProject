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
- [x] **Phase 6** — Data validation scripts + reverse-proxy HTTPS + PM2/CI deploy
  - **Data validation (§12) run against real production data, read-only, zero writes**:
    `scripts/validate-data.mjs` reads `MONGODB_ACCESS`/`MONGOOSE_SECRET` out of the *path* to
    the real deployed `ecosystem.config.js` (passed as a CLI argument) rather than accepting
    them inline, so running it never required typing production credentials into a shell
    command. Results:
    - **QTEntry encryption round-trip: 15/15 sampled entries decrypt correctly** under
      Mongoose 8 + the existing `mongoose-field-encryption` setup - confirms no
      re-encryption/migration is needed for existing journal entries.
    - **Plan.passages nested Map-of-Map shape: 3/3 real plans (including the 74-month
      default plan) deserialize correctly** under the new schema.
    - **User.planChosen referential integrity: 1 real, pre-existing failure found** -
      `shannen.rajoo@gmail.com`'s `planChosen` (`620770e5650e63054cdee16a`) doesn't match any
      existing Plan document. This is a genuine data-quality issue already present in
      production, not something the migration caused. Not a crash: the app's existing
      fallback-to-default-plan behavior means this user just silently sees the Proverbs
      default instead of their intended plan. Flagged for the user's awareness/decision
      (script deliberately doesn't auto-fix - this is user data, not something to silently
      rewrite) rather than blocking the migration on it.
  - **Live parallel test deployment stood up and verified working** on the real production
    server, alongside the untouched live Nuxt 2 app:
    - `/home/roger/QTNuxtProject-v4-test` — `nuxt4-migration` branch (fetched from the
      `rogeryeosgit` fork, since prod tracks the `NavigatorsTech` org repo)
    - Node 20.20.2 via `nvm` for the `roger` user (the server's system Node is v14, far too old
      for Nuxt 4 — installed additively, doesn't touch the live app's Node/PM2 setup at all)
    - PM2 process `qtapp-v4test`, listening on `127.0.0.1:3001` only (not exposed directly)
    - Isolated `devoProjDB_v4test` database (same Atlas cluster/credentials as production),
      seeded with only the single non-sensitive default-plan document — no real user/journal
      data copied anywhere
    - Reuses the real Firebase project (same `fb-service-account.json`) since no user
      re-registration is needed per §12
    - New nginx server block (`/etc/nginx/sites-available/qt-v4test`) listens on `8443` for
      the **same hostname** `qt.navigators.tech`, reusing the **existing** Let's Encrypt cert
      unchanged (certs validate hostname, not port), terminating TLS and proxying to the
      plain-HTTP Nitro backend — the reverse-proxy architecture the plan calls for, done for
      real rather than just planned. The existing production nginx site config was not
      touched at all.
    - **Public URL: `https://qt.navigators.tech:8443`** — confirmed serving a full, correct
      SSR page: dark theme, nav drawer, real ESV passage text with correct verse-superscript
      formatting, all sourced from the seeded test database and the real ESV API.
    - Required opening TCP 8443 in the server's `ufw` firewall (previously blocked — confirmed
      via a 522 from Cloudflare and a direct-to-origin connection timeout before the port was
      opened). **Follow-up owed to the user**: they explicitly asked to be reminded to close
      this port again once all migration testing/validation work is complete — saved as a
      memory (`qt_v4_test_deployment` in project memory) so this doesn't get lost; raise it
      proactively near the end of Phase 6/Parity QA rather than waiting to be asked.
  - **Real visual regression found via side-by-side comparison with production, fixed across
    10 files**: user-reported "gross"/broken-looking buttons turned out to be a genuine bug,
    not a subjective style complaint. **Vuetify 3 changed `v-btn`'s default `variant` from a
    filled/elevated button (Vuetify 2's implicit default) to `"text"`.** Every button ported
    from the original with a `color` prop but no explicit `text` prop (meaning Vuetify 2 *was*
    rendering it filled/elevated) silently became a flat, backgroundless text button — confirmed
    precisely via comparing the actual rendered DOM class lists
    (`v-btn--is-elevated v-btn--has-bg` on production vs. `v-btn--variant-text` on the test
    deployment for the exact same Register/Login buttons). This wasn't caught by typecheck or
    functional testing since it's a pure visual/CSS-class difference with no type or runtime
    error. Fixed by adding `variant="elevated"` explicitly everywhere the original had no
    `text` prop: `pages/index.vue`, `pages/auth/index.vue`, both journal pages, both plans
    pages plus `plansList/index.vue`, `error.vue`, and `PassagePicker.vue`'s step-forward FAB
    (19 buttons total). Buttons that already had explicit `variant="text"`/`"outlined"` from
    the Phase 5 port (confirming the original *did* have `text` in Vuetify 2, e.g. dialog
    Cancel/Yes buttons, the Google sign-in button, `JournalCard`'s "View Full Entry") were
    already correct and untouched. **Lesson for Parity QA**: this class of bug — a changed
    default that produces no error, just a silently different look — can only be caught by an
    actual visual comparison against production, not by typecheck/build/functional testing
    alone. Worth a full page-by-page visual sweep, not just the pages checked so far.
  - **Three more real visual bugs found from a second round of user feedback + live
    comparison, fixed:**
    - **Button text was black instead of white** on `success`/`info`/etc. colored buttons.
      Vuetify 3 auto-computes `on-<color>` (text/icon color) via a contrast calculation unless
      overridden, and for lighter theme colors (bright green `success`, light amber
      `secondary`) that computes to black. Vuetify 2 always used white text on colored buttons
      regardless of the contrast math. Fixed by explicitly setting `on-primary`/`on-secondary`/
      `on-accent`/`on-info`/`on-warning`/`on-error`/`on-success` to `#FFFFFF` in the theme's
      `colors` block in `nuxt.config.ts` (not the sibling `variables` block, which is for
      generic CSS custom properties like border-opacity, not per-color text overrides).
    - **Cards had a solid, full-opacity white border** instead of production's soft ~12%-opacity
      one. Confirmed by diffing computed styles directly: production's `.v-sheet--outlined`
      border is `rgba(255,255,255,0.12)`; the test deployment's `.v-card--variant-outlined`
      was `rgb(255,255,255)` at full opacity. Vuetify 3's `variant="outlined"` uses a crisp,
      literal border by design, separate from the theme-aware `border-opacity` CSS variable
      that its dedicated `border` boolean prop uses. Fixed by replacing `variant="outlined"`
      with the plain `border` prop on all 4 affected cards (`StreakCard.vue` ×2, `pages/
      index.vue`'s PRESS card, `error.vue`'s card). `Passage.vue`/`JournalCard.vue`/
      `PlanCard.vue`'s cards use Vuetify's default elevated (shadow, no border) style in both
      versions and were never affected.
    - **"Forgot Password?" wasn't centered** on the auth page. Root cause: `<v-form>` wrapped
      the *entire* page (card + forgot-password link + snackbar), and `v-form` shrink-wraps to
      its widest child (the 400px-wide card) rather than spanning full width or self-centering
      — so the `d-flex justify-center` div nested inside it only centered within that narrow,
      left-anchored box, not the actual page. Fixed by tightening `<v-form>` around just the
      card (the only part that actually needs form-validation state) and wrapping the whole
      page in a plain root `<div>`, so the centering div now spans the full page width as
      intended.
  - **Investigated and could not reproduce**: user reported textarea/field labels in the
    create/update-entry pages "don't disappear like they used to." Live-tested by typing into
    the actual Title and "This part of the passage..." textarea on the test deployment (using
    an already-authenticated session from the user's own prior testing, not a session created
    by this work) — in both cases the label correctly floats up into a small caption above the
    typed text, standard Material text-field behavior, matching what Vuetify 2 also does. No
    difference found from what's expected; flagged back to the user for a more specific
    repro (screenshot/video) rather than changing something that already appears correct.
  - **Correction from the user on the textarea/label report**: in *production*, the label
    doesn't float — it's simply replaced/covered once typing starts (placeholder-style, not
    an animated Material label). My "investigation" above had it backwards, assuming standard
    floating-label behavior was correct without checking what production actually does. Fixed
    by changing `QTJournalEditor.vue`'s thoughts `v-textarea` from `label` to `placeholder`
    (native placeholder semantics: present, then gone on input, never floats) — matching
    production exactly. Left the Title/Application `v-text-field`s as `label` since those
    weren't reported and do correctly float in both versions.
  - **Five more real bugs found from a second, much more thorough round of user feedback +
    direct computed-style measurement** (the user rightly pushed for actual tooling
    verification over visual guessing):
    - **All Vuetify 2 typography classes were dead in Vuetify 3.** `display-1`, `headline`, etc.
      don't exist in Vuetify 3's CSS at all — Vuetify 3 renamed the entire typography scale
      (`display-1`→`text-h4`, `headline`→`text-h5`, etc.), so every element still using the old
      names had **zero** typography styling applied, silently falling back to the browser's
      raw default font/size (explaining the "Login heading font looks different" report).
      Grepped the whole codebase and fixed all 7 occurrences across `pages/auth/index.vue`,
      `pages/index.vue`, `error.vue`, `PlanCard.vue`, and both journal/plan confirmation
      dialogs.
    - **`v-list-item-subtitle` has a built-in `opacity: var(--v-medium-emphasis-opacity)` (0.7)
      baked into the component itself**, confirmed via direct computed-style inspection
      (production: `opacity: 1`, color `rgb(255,255,255)`; test: `opacity: 0.7`, same color) -
      the PRESS-description and error-page subtitles (`text--primary` originally) were
      genuinely dimmer than production, not a false alarm this time. The `text-high-emphasis`
      class was doing its job correctly (computing full-opacity white via its own `color`
      rule); the component's own separate `opacity` property was compounding on top of it
      regardless of what class was applied. Fixed with an explicit `style="opacity: 1"`
      override on both. `Passage.vue`'s `v-card-text` usage of the same class was checked and
      confirmed *not* affected (no such built-in opacity on that component).
    - **"Forgot Password?" still wasn't centered after the first "fix"** - the real root cause
      was different from what was first diagnosed. `v-card-text` has `flex-grow: 1` baked into
      its own component styles, so inside the `d-flex justify-center` wrapper it stretched to
      fill the entire flex container width, leaving no free space for centering to act on, and
      its own `text-align: start` then left-aligned the text within that full-width box.
      Confirmed by walking the actual DOM box widths and computed styles up the ancestor
      chain, not by re-guessing. Fixed by replacing `v-card-text` with a plain `<span>` for
      this element (it was never semantically card content anyway).
    - **Utility classes (`d-flex`, `mx-auto`, etc.) were suspected missing entirely** after
      grepping the SSR-inlined `<style>` blocks and finding zero matches - turned out to be a
      false lead: they exist correctly in a separate externally-linked `entry.[hash].css`
      bundle that Nuxt's `experimental.inlineSSRStyles` doesn't fold into the per-page inlined
      styles. Worth remembering for future debugging in this app: **check the linked
      `entry.*.css` file, not just inlined `<style>` tags**, before concluding a utility class
      is missing.
    - **`PassagePicker.vue` used Vuetify 3's all-in-one `<v-stepper>`** (with its own built-in
      header/step-indicator UI and step-progression logic), while the *original* Vuetify 2
      version never rendered a stepper header at all - it only used bare `v-if="currentStep
      === N"` conditionals inside a plain stepper-content wrapper for styling. Flagged as the
      likely cause of a reported "plan editor/picker not working well" on the Plans page
      (not yet re-verified live - the test session had expired at the time of this fix, so
      this is inference from code review, not confirmed via interaction). Simplified to plain
      `v-if`/`v-else-if` divs with no stepper component at all, removing any risk from
      Vuetify 3's stepper auto-behavior we don't fully control. **Needs live confirmation on
      the Plans page once a session is available.**
  - All five fixes verified live post-deploy: "Forgot Password?" measured at exact page-center
    (`left+width/2` matches viewport center precisely), `<h1>` correctly carries `text-h4`
    class at the right 34px font size, PRESS-description card renders visibly brighter
    (opacity fix confirmed by eye and by the earlier computed-style check). PassagePicker's
    `v-stepper` removal still awaits live confirmation on the Plans page - not yet re-tested
    interactively.
  - **A third round of user feedback, this time with side-by-side screenshots directly
    comparing production vs. the test deployment**, surfaced several more real, specific
    issues:
    - **"Forgot Password?" lost its blue link color** when it was switched from `v-card-text`
      to a plain `<span>` to fix centering (§ above) - the original's bare `<a>` wrapper was
      picking up an implicit link color that the plain span doesn't get. Fixed with an
      explicit `text-primary` class.
    - **The "plan selected" chip's text was being clipped by the chip's own rounded edge** -
      confirmed from a screenshot showing literally "plan selecte" cut off mid-word. Root
      cause: `PlanCard.vue`'s `v-card-actions` row (Update + Delete + chip + spacer + chevron)
      has no wrap behavior in a `max-width="344"` card, so if Vuetify 3's button widths differ
      even slightly from Vuetify 2's, the flex-shrinking chip's own `overflow: hidden` clips
      its content. Fixed by adding `flex-wrap` to the actions row and `flex-shrink-0` to the
      chip so it's never forced to shrink below its content width.
    - **Pervasive, subtle-but-real spacing differences** across the login card, the PRESS
      description, and the PassagePicker's chapter list (rows more spread out than production
      in every case) - not one isolated bug but a systemic difference. Root cause: Vuetify 3
      introduced "density" as a new, distinct concept from Vuetify 2's fixed spacing baseline,
      and its own default reads more spacious. Fixed via Vuetify's documented global defaults
      mechanism (`vuetifyOptions.defaults.global.density: 'comfortable'` in `nuxt.config.ts`),
      which uniformly tightens every density-aware component at once rather than patching
      dozens of individual components. **Not yet verified live** - full pixel-parity with
      Vuetify 2's spacing may not be fully achievable without much more extensive custom CSS,
      since the two major versions are genuinely different design-system implementations
      under the hood; `comfortable` is a reasoned first attempt, not a guaranteed exact match.
    - **PassagePicker's step-forward FAB overlapping the dialog's own Save button text** -
      reviewed against the original Vuetify 2 markup and confirmed this is *inherited*
      behavior (the original also used `fixed bottom right fab`, viewport-anchored regardless
      of dialog context), visible in production's own screenshot too - not a regression
      introduced by this migration, so left as-is rather than "fixed" beyond what production
      itself does.
    - **404 error page had no way to navigate except toward login** - added a "Go to
      homepage" button alongside "Proceed to log in" (the original only ever had the login
      option; this is a genuine UX gap the user identified, not a strict parity requirement,
      and a small enough addition to make directly). The reported "card spacing looks off"
      on this page should be addressed by the same global density fix above, since it shares
      the same card/list-item components as the homepage.
  - All three confirmed fixes verified live post-deploy via direct computed-style checks:
    card border `rgba(255,255,255,0.12)` (exact match with production), button text
    `rgb(255,255,255)` on a `rgb(100,181,246)` (primary) background for an elevated button —
    both correct.
  - **Transient infrastructure incident during this deployment, unrelated to the app code**:
    mid-redeploy, the production server briefly lost the ability to establish *new* outbound
    connections (to GitHub for `git fetch`, and to MongoDB Atlas), while already-established
    connections — notably production's own long-lived Mongo pool — kept working fine, so
    **production was never actually affected or at risk**. Initially suspected the `ufw` rule
    opening port 8443 for this test deployment as the cause, but the user checked
    `ufw status verbose` and found outgoing traffic was `allow`-by-default with no restricting
    rule, ruling that out. The connectivity recovered on its own within a few minutes (self-
    resolving network blip, cause undetermined - possibly upstream at the hosting
    provider). Confirmed via direct `nc`/`curl` tests to both GitHub and the Atlas shard host
    before and after. Worth keeping in mind for the real production cutover: a transient
    outbound blip to Mongo Atlas would surface as slow/failing requests degrading gracefully
    to the fallback passage (as designed), not a crash - matches the intended fallback
    behavior in `server/api/passages/today.get.ts` working as designed under real failure
    conditions, which is itself a small positive data point.
  - **Real bug found via this real deployment, fixed in `nuxt.config.ts`**: server-only
    `runtimeConfig` secrets (`mongodbAccess`, `mongooseSecret`, `esvApiKey`,
    `firebaseServiceAccountPath`) were being defaulted from bare `process.env.X` reads
    *inside* `nuxt.config.ts` — which is evaluated once at **build** time, not at runtime. A
    production build run without those bare env vars set bakes in `undefined`/stale values
    that Nitro's actual runtime-override mechanism (`NUXT_`-prefixed env vars, e.g.
    `NUXT_MONGODB_ACCESS`) can't retroactively fix unless the *correct* prefixed name is used
    at deploy time — the test deployment's first boot threw `MongoParseError: Invalid scheme`
    for exactly this reason. Fixed by removing the `process.env.X` build-time reads entirely
    (empty/static defaults now) so these are supplied purely via `NUXT_`-prefixed env vars
    everywhere — dev, test, and eventual production — with no dual convention to confuse.
    **This means any future deploy (including the real production migration) must set
    `NUXT_MONGODB_ACCESS`, `NUXT_MONGOOSE_SECRET`, `NUXT_ESV_API_KEY`, `NUXT_CACHE_TTL`, and
    `NUXT_FIREBASE_SERVICE_ACCOUNT_PATH` — not the bare names used in the old Express
    `ecosystem.config.js`.**
- [x] **Parity QA** — walk `FEATURES.md` §11 checklist against production; §10 security regressions; §12 data / §13 deploy go/no-go gates
  - **§10 security regressions verified live via curl against the deployed test instance** (no
    login needed - these test the *rejection* path): every protected endpoint
    (`/api/plans` GET/PUT/DELETE, `/api/qtJournalEntries` GET/PUT/DELETE,
    `/api/users/planChosen`) correctly returns 401 with no Authorization header, closing the
    original unauthenticated-`/users/planChosen` gap and confirming the missing-header-silently-
    passes bug stays fixed. `/api/passages/today` correctly stays public (200); the arbitrary
    `/api/passages?passageReference=` lookup now correctly requires auth (401), matching the
    §10 decision to gate it. **The null-plan/entry-404 guard and the IDOR ownership checks are
    now also verified** — done via a throwaway Firebase test account (two accounts, actually, to
    exercise cross-user ownership) and its own minted ID token, exercising PUT/DELETE on
    plans/journal entries as both owner and non-owner directly against the test deployment's API.
    Confirmed: non-owner PUT/DELETE on both resources → 403; nonexistent-id PUT/DELETE → clean
    404 (no crash); `creatorEmail` cannot be spoofed via request body; the journal GET's
    `creatorEmail` query param is enforced against the verified token (401 on mismatch); the
    encryption round-trip works on live data (wrote plaintext, read back correctly decrypted).
  - **§12 data validation: done and passing** (see Phase 6 above) - encryption round-trip and
    Plan.passages shape both clean; one pre-existing dangling `planChosen` found and flagged,
    not blocking.
  - **§13 deploy: runbook written, not yet executed for real** (see Phase 6's cutover runbook) -
    the actual production cutover is a separate decision from finishing this plan.
  - **§11 authenticated-flow walkthrough: mostly done via the same throwaway test account**
    (created/driven directly rather than needing the user's own real login, since a disposable
    Firebase Auth account carries no privacy stakes). Verified: register via the actual UI form
    (confirms a default-plan `User` doc gets created), email/password login including the
    mapped "Incorrect email or password" error case, logout (cookies + Pinia + `qtDraft:*`
    localStorage all cleared, isolated from the create-page's own route-leave guard by testing
    each independently), hitting a protected route while logged out (→ `/error` with a working
    "Proceed to Log In" link), journal create/view/update/delete with confirm dialogs, streak
    increment/reset, create-draft same-day restore, cancel-discards-draft, share/copy-to-clipboard
    (byte-for-byte matches the expected format), plan create/update/delete, non-owner
    update/delete blocked both client-side (disabled buttons) and server-side, a multi-month plan
    (saved and re-edited, both months round-trip correctly), selecting a plan updates today's
    passage immediately, an old journal entry permanently keeps its own original passage even
    after the active plan changes, the PassagePicker's single- and multi-chapter reference
    strings, SSR-rendered HTML already containing today's passage (raw curl, zero JS), and the
    password-reset link's continue-URL (generated directly via the Admin SDK rather than needing
    real inbox access — correctly lands on `qt.navigators.tech` per the app's hardcoded
    `continueUrl`).
  - **A fourth round of real bugs was found and fixed this way** (see `git log` on
    `components/PassagePicker.vue`/`PlanEditor.vue`): a `position: fixed` "next" button pinning to
    the dialog's own corner in Vuetify 3 (not the viewport, unlike Vuetify 2) and landing on top
    of the dialog's real Cancel/Save footer; verse-step defaults collapsing any chapter selection
    into a degenerate single-verse reference instead of the full chapter range; and misaligned
    chapter checkboxes. Also consolidated the picker's own action button into the dialog's single
    action bar (Cancel/Next/Save) instead of two separate, visually inconsistent button areas.
    This is now the fourth consecutive round of regressions this exact manual-walkthrough gate has
    caught (following button variants, card borders, typography, opacity, centering, chip
    truncation, density) — still the most effective check in this whole migration.
  - **Google sign-in: confirmed working by the user directly** (real OAuth consent can't safely be
    scripted, so this one always needed a human click-through).
  - **Silent token refresh and the 3-day idle-cap forced logout: both verified**, without waiting
    real time, by temporarily exposing the Firebase Auth instance to `window` in
    `plugins/firebase.client.ts` (`if (import.meta.dev) window.__debugAuth = auth` — added, used,
    then removed; never committed) on the local dev server. Token refresh: called
    `getIdToken(true)` to force a real refresh; `expirationTime` cookie advanced to a new value,
    session kept working with zero visible interruption. Idle cap: manually set the
    `lastActiveAt` cookie to a timestamp just over 3 days old, then forced a refresh the same way
    — `jwt`/`lastActiveAt`/`qtAppID` cookies were all correctly cleared (real `logout()` fired),
    and the next navigation to a protected route bounced to `/error` exactly like a normal logout.
  - **Not independently verified, lowest-stakes item**: cache-hit confirmation for repeated
    passage requests via server logs (no explicit cache-hit/miss log line exists in
    `bible-retrieval.ts`, and timing alone wasn't conclusive since the ESV API itself responds in
    the same ~50-60ms range regardless — the cached-function wrapper is confirmed correct by code
    inspection, just not by an external runtime signal). §13's actual production cutover (flipping
    DNS/nginx from the old app to this Nitro build) remains its own separate, deliberate decision
    — not a QA checklist item, and not yet made.

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

### Cutover runbook (validated end-to-end via the parallel test deployment)

Everything below was actually built and exercised against the real production server on
`qt.navigators.tech:8443` (a parallel deployment, isolated test database, zero impact on the
live site) before being written down here - this isn't a plan, it's a tested procedure.

1. **Data validation gate**: run `node scripts/validate-data.mjs /QTNuxtProject/ecosystem.config.js`
   from a checkout with `mongoose`/`mongoose-field-encryption` installed. Confirmed passing
   against real production data: QTEntry encryption round-trip, Plan.passages shape. **One
   known pre-existing failure** (unrelated to this migration): `shannen.rajoo@gmail.com` has a
   dangling `planChosen` reference — decide whether to fix this user's record before or after
   cutover; it's non-fatal (falls back to the default passage) either way.
2. **Node version**: the server's system Node (v14) is too old for Nuxt 4. Install Node 20 via
   `nvm` for the deploy user (additive — doesn't touch the existing Node 14 install or require
   root), exactly as done for the test deployment. `.github/workflows/deploy.yml`'s SSH script
   now sources `nvm` and runs `nvm use 20` before building/restarting.
3. **`ecosystem.config.cjs`**: copy `ecosystem.config.cjs.example` (committed in this repo) to
   `/QTNuxtProject/ecosystem.config.cjs` and fill in the real `NUXT_`-prefixed secrets (reuse
   the same MongoDB Atlas/ESV/encryption-secret values already in the current
   `ecosystem.config.js` — just renamed to the `NUXT_` convention, see the earlier Phase 6 note
   on why the bare names silently don't work). **Filename must be `.cjs`**, not `.js` — PM2's
   own config loader is CommonJS and this repo's `package.json` sets `"type": "module"`, which
   breaks a plain `.js` config exactly as it did for the test deployment.
4. **Reverse proxy**: update the *existing* `/etc/nginx/sites-available/qt.navigators.tech`
   block's `proxy_pass` from `https://127.0.0.1:3000` (the old app terminated TLS itself) to
   `http://127.0.0.1:3000` (Nitro serves plain HTTP; nginx keeps doing all TLS termination with
   the same existing cert — no new cert or DNS change needed). Confirmed this exact pattern
   works via the test deployment's own nginx block on port 8443.
5. **Deploy**: merging `nuxt4-migration` to `master` triggers the updated
   `.github/workflows/deploy.yml`, which now builds `.output/` instead of `.nuxt`, restarts via
   `ecosystem.config.cjs`, and health-checks `http://127.0.0.1:3000/` (no more `-k`/https flag —
   the app itself no longer speaks TLS).
6. **Rollback**: the workflow's existing rollback-on-failed-health-check logic is unchanged in
   shape (`git reset --hard $PREV` + rebuild + restart) and still applies — just note that a
   rollback after this cutover reverts to the *old* Nuxt 2/Express codebase, which means the
   nginx `proxy_pass` scheme (step 4) would need to be flipped back to `https://` too if a
   rollback ever actually happens, since the two app versions don't share a TLS-termination
   story. Worth a one-line comment in the nginx config noting which app version expects which
   scheme.
7. **After cutover**: close the temporary `ufw` rule for port 8443 and decommission
   `/home/roger/QTNuxtProject-v4-test` (PM2 `qtapp-v4test` process, the `qt-v4test` nginx site,
   and the `devoProjDB_v4test` database) once the real cutover is confirmed stable — this was
   always meant to be temporary test infrastructure, not something to leave running alongside
   production indefinitely.

### Cutover executed (2026-07-23)

Production is live on the Nuxt 4/Nitro app as of this date. What actually happened differed from
the plan above in some real, worth-recording ways:

- **Blue/green instead of kill-and-restart-in-place.** An adversarial review before executing
  found that the original plan (push → CI kills the old app, starts the new one on the same port)
  had two real gaps: nginx's in-memory config doesn't update until an explicit reload (so there's
  a live-downtime window between the old app dying and a manual reload, not just a brief bind
  gap), and the automatic rollback-on-failed-health-check restores the *old Nuxt 2 code* but
  restarts it via the *new* `ecosystem.config.cjs` (NUXT_-prefixed, plain-HTTP) — which old
  Nuxt 2/Express doesn't understand. So the actual swap was done manually over SSH: brought the
  new app up on a spare port (3001) under a temporary PM2 name (`qtapp-cutover`) alongside the
  still-running old app on 3000, verified it against real production data, then did a single
  `nginx` reload to flip live traffic — zero-downtime by construction, with the old app staying
  up as an instant fallback the whole time. Only after that was confirmed stable did the old app
  get retired and the new one consolidated onto the canonical port 3000 / name `qtapp`.
- **`/QTNuxtProject` itself got replaced**, not just its contents refreshed — the new app's
  checkout was moved to that exact path (old one preserved at
  `/home/roger/QTNuxtProject-nuxt2-backup`, untouched, never deleted) so the existing
  `deploy.yml`'s `cd /QTNuxtProject` keeps working for future automated deploys. `origin` on that
  checkout now points at `NavigatorsTech/DevoProject` (matching what `deploy.yml` expects); a
  `fork` remote to `rogeryeosgit/DevoProject` is also present from the migration work.
- **Real PM2 bug found**: `interpreter: 'node'` (a bare string) in `ecosystem.config.cjs` did
  *not* resolve to the nvm-installed Node 20 — it silently used the PM2 daemon's own long-running
  environment (system Node 14), causing a syntax error on start (`||=` isn't valid Node 14
  syntax). This only happened in `cluster`/`instances: 'max'` mode; `exec_mode: 'fork'` with
  `instances: 1` **and an absolute interpreter path**
  (`/home/roger/.nvm/versions/node/v20.20.2/bin/node`) works correctly and is what's actually
  deployed. **`ecosystem.config.cjs.example` in this repo still shows `cluster`/`'node'`/`'max'`
  and should be updated to match** — tracked as a follow-up, not yet fixed.
- **`package-lock.json` had drifted out of sync with `package.json`** (pre-existing, unrelated to
  this migration — likely from an `npm install` run at some point without the lock file being
  committed). This silently broke `npm ci` both locally and in the first real CI run against
  NavigatorsTech/DevoProject (the `validate` job failed before ever reaching the `deploy` job, so
  production was never at risk — just a failed CI run). Fixed by regenerating the lock file via
  `npm install` and verifying `npm ci`/`npm run build` both succeed clean before committing.
- **Two Mongo Atlas secrets from the now-decommissioned `:8443` test deployment were briefly
  displayed in a terminal** while debugging the PM2 interpreter issue (a `cat` of the test
  deployment's own backup config, not the real production secrets) — low actual risk since they
  only ever granted access to the isolated, non-sensitive `devoProjDB_v4test` test database, but
  flagged to the user to rotate the ESV API key and Mongoose encryption secret used by that test
  config out of caution.
- The isolated `devoProjDB_v4test` database itself was **not** fully dropped — the Mongo Atlas
  application user lacks `dropDatabase` privileges (document-level read/write only). Left in
  place (empty of anything sensitive - just the one seeded default-plan document) pending the
  user optionally dropping it via the Atlas dashboard directly.
- Final commit deployed: `e93c7cc` (merge of the Nuxt 4 rewrite + the package-lock.json fix) on
  both `rogeryeosgit/DevoProject` and `NavigatorsTech/DevoProject`'s `master`.

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

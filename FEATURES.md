# qtapp — Current Feature Inventory (Nuxt 2)

Purpose: a complete checklist of what the app does today, captured ahead of a Nuxt 4 migration so nothing gets silently dropped. Organized by user-facing feature area, then by cross-cutting technical concerns. File/line references point at the Nuxt 2 implementation.

---

## 1. Authentication & session management

- **Email/password login and registration** on one form (`pages/auth/index.vue`), via Firebase client SDK (`signInWithEmailAndPassword` / `createUserWithEmailAndPassword`).
- **Google sign-in** (popup, `signInWithPopup` + `GoogleAuthProvider`), same form.
- **Password reset** via email, using Firebase's `sendPasswordResetEmail` with a hardcoded continue URL (`https://qt.navigators.tech`) — triggered by a "Forgot Password?" link that validates the email field first.
- **Client-side form validation**: required email + regex format check before login/reset; password field has a show/hide toggle (eye icon).
- **Friendly error messages** mapped from Firebase auth error codes (`store/userStore.js` `getErrorMessage`): email-already-in-use, wrong-password/invalid-credential, user-not-found, weak-password, invalid-email, plus a generic fallback — surfaced via a snackbar.
- **First-time user provisioning**: after any successful login/register (email or Google), the client calls `POST /users/verify` with the Firebase ID token; the server verifies it via `firebase-admin` and, if no Mongo `User` doc exists yet, creates one with the ministry's default plan (`"--- Default Nav Plan ---"`).
- **Server-side auth guard**: every plan/journal REST endpoint verifies the Bearer JWT via `admin.auth().verifyIdToken()` (`server/services/auth.js` `checkUser`); some endpoints additionally check the token's email matches an expected owner.
- **Plan ownership enforcement**: plan update/delete additionally verify the requester's email matches the plan's `creatorEmail` (`checkPlanOwnership`) — non-owners get a disabled Update/Delete button client-side too (`PlanCard.vue`).
- **Session persistence via cookies**: on token issuance/refresh, `jwt`, `expirationTime`, and `qtAppID` (user email) are written to cookies (`sameSite: lax`, `secure`, expiry matching token expiry) and mirrored into Vuex.
- **Automatic token refresh sync** (`plugins/firebase-token-sync.client.js`): listens to Firebase's `onIdTokenChanged` (fires on initial load, ~5 min before expiry, and manually) and re-syncs cookies/Vuex every time, so a returning visit with a live Firebase session restores auth without re-login.
- **Rolling 3-day idle cap**: a `lastActiveAt` cookie (90-day shelf life) tracks the last real token refresh; if more than 3 days pass between refreshes, the session is force-logged-out even though the underlying Firebase session might still be valid — enforced in the token-sync plugin, not by cookie expiry alone.
- **Tab-focus refresh check**: on `visibilitychange` to visible, asks Firebase for the current ID token (Firebase only hits the network if actually near/past expiry) — covers laptops waking from sleep where in-tab refresh timers were suspended.
- **401 retry-once backstop** (`plugins/axios.js`): if any API call gets a 401, force-refreshes the Firebase ID token and retries the request exactly once before giving up and logging out — a fallback for rare clock-skew/race cases, since normal expiry is handled proactively by the sync plugin.
- **SSR-safe cookie rehydration**: `middleware/checkAuth.js` runs `userStore/checkCookie` on every route (reads cookies from the request on the server, from `js-cookie` on the client) to repopulate Vuex token/expiry/userID before render.
- **Route guard**: `middleware/loginCheck.js` redirects unauthenticated users to `/error` (which itself offers a "Proceed to log in" button to `/auth`).
- **Logout**: clears token/expiry/userID from Vuex + all auth cookies (including `lastActiveAt`), clears in-memory plan and journal-entry state, sweeps any `qtDraft:*` localStorage keys (so a shared-device logout doesn't leave a draft visible to the next user), and signs out of the Firebase SDK (idempotent — signing out re-fires `onIdTokenChanged(null)` which re-enters logout harmlessly).
- **Nav bar reflects auth state**: Login link shown when logged out, Logout shown when logged in (`layouts/default.vue`).

## 2. Bible passage delivery

- **"Today's passage" endpoint** (`GET /passages/today`, optional `?planID=`): looks up the day-of-month entry in the given plan's nested passages map (`Map<month, Map<day, reference>>`); if no plan ID is given, falls back to the org-wide `"--- Default Nav Plan ---"`; if the plan/month/day lookup fails for any reason, falls back further to `"Proverbs {day-of-month}"`.
- **Arbitrary passage lookup** (`GET /passages?passageReference=`) — used when viewing a saved past journal entry with its own historical reference.
- **ESV Bible API integration** (`server/services/bible-retrieval.js`): fetches passage text, explicitly excludes cross-references, footnotes, and headings.
- **Server-side response caching** via `node-cache`, keyed by exact passage-reference string, TTL from `CACHE_TTL` env var — avoids re-hitting the ESV API for repeat requests of the same reference.
- **Verse-number superscripting**: `components/Passage.vue` post-processes the ESV text's `[n]` verse markers into `<b><sup>n</sup></b>` HTML for display.
- **Home page ("today") passage card**: shows today's date, reference, and formatted text; re-fetched on mount to reflect the user's currently chosen plan.
- **`nuxtServerInit`** (`store/index.js`): preloads today's passage into Vuex during SSR so the home page renders with content on first paint without a client round-trip.

## 3. Journal entries (QT entries) — the PRESS method

- **PRESS framing** on the home page: Pray, Read the Passage, Examine your own life, Say it back to God, Share it with another — shown as static onboarding copy.
- **Create entry** (`pages/journalList/createEntry`): shows today's passage alongside a form for Title, "This part of the passage tells me that..." (thoughts), and Application/Implication — all required fields with validation messages.
- **List entries** (`pages/journalList/index.vue`): all of the current user's entries, reverse-chronological, rendered as cards (title, date, passage reference, and a ~200-character preview/snippet of thoughts) with a "View Full Entry" action.
- **View/edit entry** (`pages/journalList/_jid/`): loads the entry plus its original passage text (via the arbitrary-passage endpoint, since the plan may have moved on) into the same editor form, pre-filled.
- **Update entry** with a confirmation dialog ("Just to be sure...").
- **Delete entry** with a confirmation dialog, redirects to the list on success.
- **Cancel**, discarding any in-progress edits, back to the list.
- **"Share" / copy to clipboard**: formats the current form contents (reference, title, thoughts, application) as plain text and copies via `navigator.clipboard.writeText`, with a success snackbar.
- **Server-side field encryption at rest**: `thoughts` and `applicationImplication` are encrypted in MongoDB via `mongoose-field-encryption`, keyed by `MONGOOSE_SECRET` — transparent to the app layer.
- **Ownership-scoped fetch**: journal list is always fetched filtered by the logged-in user's email; server also double-checks the Bearer token's email matches the requested `creatorEmail`.
- **Draft autosave & recovery** (`components/QTJournalEditor.vue`, recently added):
  - Debounced (500 ms) autosave of title/thoughts/application to `localStorage` as the user types, under a per-context key (`qtDraft:create` or `qtDraft:edit:<id>`).
  - Immediate flush on `pagehide` and on tab backgrounding (`visibilitychange` → hidden) — a mobile-safe substitute for `beforeunload`.
  - On mount, restores a saved draft if one exists, hasn't expired, and actually differs from the seeded values — surfaces an info snackbar ("Restored your unsaved draft") with a "Discard" action to revert to the original values and clear the draft.
  - **Create-entry drafts** are same-calendar-day only (a new day means a new passage, so yesterday's create draft is irrelevant).
  - **Edit-entry drafts** use a 7-day TTL instead (hygiene, not correctness — the entry's passage doesn't change with the date).
  - Draft is cleared on successful save, on explicit Cancel, and on any in-app navigation away (`beforeRouteLeave`) — but deliberately **not** on a hard refresh or tab close, so an accidental close/reload still recovers the draft next visit.
  - Failed save (network error) keeps the draft intact and shows an error snackbar rather than losing the user's writing.
  - All drafts for a user are swept on logout (see §1) so a shared device doesn't leak one journaler's unsaved thoughts to the next.
- **QT streaks** (`components/StreakCard.vue`, `store/journalStore.js`):
  - Current streak: consecutive calendar days (DST-safe, local-day-indexed) with at least one entry, broken if the most recent entry is older than yesterday.
  - Longest streak ever, shown only when it exceeds the current streak ("Best: N days").
  - "Journaled today" flag drives a contextual message and hides the "write today's thoughts" CTA once already done.
  - Shown on both the home page and the journal list page; only rendered once the user has at least one streak day (or shows a "Start your streak" empty state).

## 4. Reading plans

- **List plans** (`pages/plansList/index.vue`): every plan in the system (not just the user's own) shown as expandable cards.
- **Plan card** (`components/PlanCard.vue`): name, description, expand/collapse to show every day's passage for every month stored in the plan; "select" chip to make it the user's active plan; Update/Delete buttons disabled for non-owners.
- **Create plan** (`components/PlanEditor.vue` + `pages/plansList/createPlan`): name + description (required, validated) and a month-by-month, day-by-day passage table.
  - Month picker (native Vuetify date picker restricted to month/year).
  - Data table listing every day of the selected month with an inline editable cell per day.
  - **In-cell passage builder** (`components/PassagePicker.vue`, ~1500 lines): a 3-step wizard — pick book → pick one or more chapters (checkboxes) → pick start/end verse (dropdowns, verse counts driven by a hardcoded table of every book/chapter/verse-count in the Bible) — composes a reference string like `"John 3:16-3:18"`.
  - Switching months preserves in-progress edits for previously-visited months in an in-memory temp store, merged back together on submit and sorted chronologically before saving.
  - Save/cancel snackbar feedback per-cell edit.
- **Edit plan** (`pages/plansList/_pid/`): same editor pre-filled from the stored plan, with an "Update Plan" confirmation dialog. Reconstructs the in-memory per-month passage grid (including day count per month) from the plan's stored `Map<month,Map<day,ref>>` shape.
- **Delete plan**, confirmation dialog, ownership-gated both client- and server-side.
- **Choose active plan**: selecting a plan's "select" chip persists the choice server-side (`User.planChosen`) and immediately refreshes "today's passage" to reflect it.
- **New users default** to the org-wide `"--- Default Nav Plan ---"` plan.
- **Plan storage model**: `Plan.passages` is a nested Mongoose `Map` of `Map` (`"Mon YYYY"` → `"day-of-month"` → passage reference string).

## 5. Navigation, layout & app shell

- **Responsive nav drawer** (`layouts/default.vue`): right-side temporary drawer with Home / Journal / Plans links plus Login or Logout depending on auth state; hamburger toggle in the app bar.
- **Dark theme forced on** (`$vuetify.theme.dark = true` set unconditionally in the layout) despite a `light` theme palette also being defined in `nuxt.config.js` — effectively dark-mode-only in practice today.
- **Custom Vuetify light-theme palette** defined (blue/grey/amber/teal/orange/green) even though currently unused due to the above.
- **Error page** (`layouts/error.vue`): distinguishes 404 vs. other errors, always prompts "You will have to log in to view this page" with a button to `/auth` (used both for real errors and as the target of the `loginCheck` middleware redirect).
- **Home page** (`pages/index.vue`): PRESS explainer card, streak card (if authenticated), today's passage, and a CTA button that's context-sensitive (write thoughts vs. log in).
- **Google Analytics** via `vue-gtag`, hardcoded measurement ID (`plugins/gtag.js`).
- **Date formatting filter** (`plugins/date-filter.js`): global `dateFormatter` Vue filter, e.g. "21 July 2026".
- **Mobile-responsive layout** for the draft-restore snackbar and entry-page button rows (recent fix — wraps rather than overflowing on narrow viewports).

## 6. Cross-cutting technical features (worth preserving, not just visible UI)

- **SSR** (`mode: 'universal'`) with `asyncData`/`nuxtServerInit` hooks preloading passage/plan/journal data server-side before first paint.
- **Namespaced Vuex modules**: `userStore`, `passageStore`, `planStore`, `journalStore`, each with state/mutations/actions/getters, cross-module dispatches via `{ root: true }`.
- **Axios module** with separate `browserBaseURL` vs `baseURL` (SSR calls hit a different origin than the browser does), Bearer token auto-attached via `$axios.setToken`.
- **Dev-only TLS bypass** for the Axios HTTPS agent (`rejectUnauthorized: false`) — must not leak into production config in the migration.
- **HTTPS-only Express server**, refuses to start without cert/key (dev vs. prod env var pairs: `LOCAL_SSLKEY`/`LOCAL_SSLCERT` vs `SSLKEY`/`SSLCERT`).
- **File-based logging** via `log4js` (`QTApp.log`), used throughout `router.js`/`auth.js`/`bible-retrieval.js`/`db-connector.js` for both info and error-level events.
- **Mongoose connection lifecycle**: connect on boot, log on error/open, graceful close on `SIGINT`.
- **Route-level middleware composition**: pages declare `middleware: ["checkAuth"]` or `["checkAuth", "loginCheck"]` as needed — home page only rehydrates auth (guests can view it), journal/plan pages require login.
- **REST API surface** (`server/routes/router.js`):
  - `GET /passages/today` (optional `?planID=`)
  - `GET /passages?passageReference=`
  - `POST /users/verify`
  - `GET /users/planChosen`, `POST /users/planChosen`
  - `GET/POST/PUT/DELETE /plans`
  - `GET/POST/PUT/DELETE /qtJournalEntries`

## 7. Vue-specific reactivity & component patterns

Everything here is Vue plumbing rather than a user-facing feature, but it's exactly the kind of thing that gets silently dropped in a rewrite because it "just works" today. Flagged with an eye toward Vue 2 → Vue 3 (Nuxt 4's underlying Vue version) breaking changes specifically.

- **`Vue.set` for reactive array insertion** (`store/journalStore.js` `addEntry`): `Vue.set(state.qtEntries, state.qtEntries.length, entry)` — needed in Vue 2 because direct index assignment (`arr[i] = x`) isn't reactive. **Vue 3's proxy-based reactivity removes this requirement entirely** — plain `state.qtEntries.push(entry)` (or index assignment) becomes reactive on its own, so this call should simplify, not just port 1:1.
  - **Latent bug worth fixing, not porting**: the plan-store equivalent (`store/planStore.js` `addPlan`) instead calls `state.plans.$set(state.plans.length, plan)`. Plain arrays don't have a `$set` **method** in Vue 2 (`Vue.set`/`vm.$set` are the only valid forms) — this line likely throws at runtime whenever a plan is created, which is silently swallowed by the `createPlan` action's trailing `.catch(e => console.log(e))`. The visible symptom is masked because `pages/plansList/createPlan` navigates back to `/plansList` immediately after, whose `asyncData` re-fetches the full plan list from the server anyway. Don't copy this call as-is.
- **`.sync` modifier** (`components/PlanEditor.vue`): `:return-value.sync="date"` (month picker) and `:return-value.sync="props.item.passage"` (Vuetify `v-edit-dialog` inline cell edit) — shorthand for `v-bind:return-value` + listening for `update:return-value`. **Removed in Vue 3** in favor of `v-model:propName`; both call sites need updating syntax (and Vuetify 3's `v-date-picker`/`v-edit-dialog` APIs have changed independently of this, so expect a genuine rewrite here, not a mechanical rename).
- **`v-model` on custom components relying on the Vue 2 default `value`/`input` contract**: `components/PassagePicker.vue` emits `$emit('input', chosenPassage)` at each wizard step so its parent's `v-model="props.item.passage"` stays in sync; the checkboxes/selects inside it also use plain `v-model` on native Vuetify inputs. **Vue 3 changed the default component `v-model` contract to `modelValue`/`update:modelValue`** — this component's manual `$emit('input', ...)` calls need renaming, not just a Vue-version bump.
- **Vue 2 filters** (`plugins/date-filter.js` registers `Vue.filter('dateFormatter', ...)`; consumed via `{{ entryDate | dateFormatter }}` in `components/JournalCard.vue` and `components/Passage.vue`): **filters are removed entirely in Vue 3** — must become a global method/computed property, or a small helper function imported and called directly in each template (e.g. `{{ dateFormatter(entryDate) }}`).
- **`Vue.use(VueGtag, {...})`** (`plugins/gtag.js`) — Vue 2 global-plugin registration API. Still valid conceptually in Vue 3 (`app.use(...)`), but the Nuxt 2 plugin-file shape (`export default function (context) {...}` vs. calling `Vue.use` at module scope) differs from how Nuxt 3/4 plugins register app-level plugins (`defineNuxtPlugin`), so this needs restructuring, not just relocating the file.
- **Dynamic slot name** (`components/PlanEditor.vue`): `` <template v-slot:[`item.passage`]="props"> `` — Vuetify 2 `v-data-table`'s per-column item slot, computed via template-literal syntax. Vuetify 3's data table slot-naming convention differs, so this is a Vuetify-version concern layered on top of a Vue dynamic-slot-name concern.
- **`v-html`** (`components/Passage.vue`): renders ESV passage text (with verse numbers regex-transformed into `<b><sup>n</sup></b>`) via `v-html="passage"`, where `passage` is a computed property derived from the raw API text. Not reactivity-special, but worth flagging as the one raw-HTML injection point in the app — content originates from the trusted ESV API, not user input, so this is safe as-is, but should stay behind the same trust boundary after migration.
- **Watchers**:
  - `pages/auth/index.vue` watches two Vuex-getter-backed computed properties, `isAuthenticated` (redirects to `/`) and `errorOccured` (pops the error snackbar then dispatches `clearError`) — a "React to store state changing out from under this page" pattern, not a direct user interaction.
  - `components/QTJournalEditor.vue` watches `entryTitle`/`entryThoughts`/`entryAppImp` individually (not a single deep watcher) purely to call `queueDraftSave()` — three near-identical watcher functions could become one deep/combined watcher in a rewrite, or a Composition API `watchEffect`.
  - `components/PassagePicker.vue` watches an `isCompleted` **prop** (object, mutated by the parent to signal "reset yourself") to imperatively reset the wizard's internal step/selection state — a parent-drives-child-reset-via-prop-mutation pattern that's a bit of an anti-pattern in Options API (props are meant to flow down, not double as imperative signals); worth considering an emitted-event-based reset instead during the rewrite.
- **Computed property used for a side effect** (`layouts/default.vue` `setTheme`): `computed: { setTheme() { return (this.$vuetify.theme.dark = true) } }` — abuses a computed getter to force dark mode as a side effect of being read in the template (`:dark="setTheme"`), rather than setting it once in `created()`/`mounted()`. Vue 3's reactivity-tracking devtools are stricter about flagging state mutation inside computed getters, so this pattern should be converted to a lifecycle-hook assignment rather than ported verbatim.
- **Parameterized Vuex getters** (curried function-returning getters): `journalStore.getEntryUsingID` and `planStore.getPlanUsingID`, both shaped `(state) => (id) => state.X.find(x => x._id === id)`, called as `this.$store.getters['journalStore/getEntryUsingID'](this.id)`. If the migration moves off Vuex (e.g. to Pinia, which is the common Nuxt 3/4 pairing), these become plain getter functions or store methods — the curried-function-as-getter shape is Vuex-specific ceremony that goes away.
- **Template refs (`ref="..."` + `this.$refs.X`) for imperative parent→child calls**, used pervasively instead of props/events for "pull a value out of a child on demand": `QTJournalEditorComponent.getEntry()`/`checkValidation()`/`clearDraft()`/`discardDraft()` (both journal pages), `PlanEditorComponent.getPlan()`/`checkValidation()` (both plan pages). This imperative-handle style still works identically under Vue 3 Options API; only relevant if the rewrite moves specific components to `<script setup>`, where it becomes `defineExpose(...)`.
- **In-component route guard** (`pages/journalList/_jid/index.vue`): `beforeRouteLeave(to, from, next)` clears the draft on any in-app navigation away, but deliberately not on hard refresh/tab close (see §3) — a vue-router (not core Vue) lifecycle hook, still supported unchanged in Vue 3 + vue-router 4.
- **`mounted()` / `beforeDestroy()` pairing for manual DOM event listeners** (`components/QTJournalEditor.vue`): adds `pagehide` and `visibilitychange` listeners in `mounted()`, removes them in `beforeDestroy()`, alongside clearing a pending debounce timer — a hand-rolled cleanup pattern that must be preserved exactly (leaking these listeners across navigations would double-fire draft flushes). **`beforeDestroy` is renamed `beforeUnmount` in Vue 3** (the old name is deprecated but aliased); worth renaming explicitly rather than relying on the compat alias.
- **Event modifiers**: `v-on:keyup.enter="login"` (`pages/auth/index.vue`, submit-on-Enter for the password field) and `@click.stop="drawer = !drawer"` (`layouts/default.vue`, nav-bar hamburger — stops the click from also bubbling to whatever closes the drawer). Both modifiers are unchanged in Vue 3.
- **`v-show` reserved specifically for elements inside a `<v-expand-transition>`** (`components/PlanCard.vue`'s day-by-day passage list, `components/PassagePicker.vue`'s "next step" FAB): unlike the `v-if`-based conditionals used almost everywhere else in the app (auth links in the nav drawer, PassagePicker's 3 wizard steps), these specific cases need the element to stay in the DOM for Vuetify's expand transition to animate open/closed — swapping either to `v-if` during the rewrite would silently kill the animation.
- **Repeated local (non-Vuex) UI state shape**: the trio `snack` / `snackColor` / `snackText` (backing a `v-snackbar`) is independently declared in `pages/auth/index.vue`, `pages/journalList/createEntry/index.vue`, `pages/journalList/_jid/index.vue`, and `components/PlanEditor.vue`; likewise `updateDialog`/`deleteDialog` booleans are re-declared per page for confirmation dialogs. None of this is Vuex-backed. Not a bug, but a strong candidate for a shared composable or a global toast/confirm-dialog plugin in the Nuxt 4 rewrite instead of copy-pasting the same three `data()` fields into every component again.
- **Nuxt-injected context available as `this` inside Vuex actions**: `this.$axios` and `this.$fire`/`this.$fireModule` are usable directly inside `store/*.js` action functions (e.g. `journalStore.js`'s actions calling `this.$axios.$post(...)`, `userStore.js`'s calling `this.$fire.auth...`) because `@nuxtjs/axios` and `@nuxtjs/firebase` inject them into the Vuex store instance. This is Nuxt-module wiring, not core Vue reactivity, but it's a dependency-injection pattern that has no direct Vuex equivalent if the migration switches to Pinia (where the idiom becomes calling `useNuxtApp().$axios` inside a store action) — every one of these call sites needs conscious porting, not a find-and-replace.
- **Props declared as bare string arrays with no type/required validation** (`props: ["entryID", "entryTitle", ...]` in `JournalCard.vue`, `Passage.vue`, `PlanCard.vue`, `PlanEditor.vue`, `QTJournalEditor.vue`): works fine in Vue 2/3 Options API as-is, but offers no runtime validation or IDE type inference. Not a migration blocker, but worth upgrading to object-with-`type`/`required` syntax while every one of these components is being touched anyway.

## 8. CSS, UX/UI, and color scheme

The app has almost no hand-written CSS — visual design is carried almost entirely by Vuetify's Material Design component defaults, theme colors, and utility classes. That means the "design system" to preserve in the rewrite lives mostly in `nuxt.config.js` and in which Vuetify components/props/classes were chosen, not in stylesheet files.

### Color scheme

- **Theme is forced to dark mode at runtime**, regardless of what's configured: `layouts/default.vue`'s `setTheme` computed property unconditionally sets `this.$vuetify.theme.dark = true` (see §7 for why this is a side-effecting computed, not just a style note). In practice the app is dark-mode-only today.
- **A full `light` theme palette is nevertheless defined** in `nuxt.config.js` and currently dead code because of the above — worth a deliberate decision in the rewrite (revive it as a real light/dark toggle, or drop it and just hardcode dark):
  | Role | Vuetify color |
  |---|---|
  | `primary` | `colors.blue.lighten2` |
  | `secondary` | `colors.amber.lighten3` |
  | `accent` | `colors.grey.lighten3` |
  | `info` | `colors.teal.lighten1` |
  | `warning` | `colors.amber.base` |
  | `error` | `colors.deepOrange.accent4` |
  | `success` | `colors.green.accent3` |
- **Semantic color usage is consistent across the app** (i.e. these theme roles are used *as* roles, not overridden with raw hex anywhere):
  - `success` (green) — all affirmative/save/confirm actions: Save, Update, Update Plan, Create Plan, Register, and every "Yes" in a confirmation dialog.
  - `warning` (amber) — all Cancel buttons, everywhere a Cancel appears (forms, confirmation dialogs).
  - `error` (deep orange) — Delete buttons (journal entry, exact color) and error-state snackbars (failed save, wrong password, etc.).
  - `primary` (blue) — the main navigational/positive CTAs: "Write down your thoughts", "Log in to journal your thoughts", "Create Plan", "Write QT Thoughts", the passage-picker checkboxes, "View Full Entry".
  - `info` (teal) — the Login button specifically (distinct from Register's `success`), and info-toned snackbars (draft-restored notice).
  - `secondary` (amber-light) — the streak flame icon and the "Best: N days" chip in `StreakCard.vue`.
  - One-off literal colors outside the theme palette: the app bar is hardcoded `color="indigo"` (not `primary`) in `layouts/default.vue`, and `JournalCard.vue`'s "View Full Entry" button is hardcoded `color="blue"` rather than `primary` — both are inconsistencies worth resolving (intentional accent vs. leftover from before the theme palette existed) rather than silently preserving.
  - Confirmation dialogs (`v-dialog ... dark`) force `dark` on the dialog card explicitly, layered on top of the already-dark global theme — redundant today given the forced dark theme, but would matter again if the light theme is ever revived.
- **Snackbar color is dynamic, not fixed**: every snackbar's `color` is bound to a `snackColor` data field set imperatively per outcome (`"success"`, `"error"`, `"info"`), reused as the single feedback channel for save/update/delete results, draft-restore notices, and password-reset outcomes across `pages/auth`, both journal pages, and `PlanEditor.vue`.

### Layout & responsiveness

- **Vuetify grid breakpoints used sparingly and only at two tiers** — `cols="12"` (full width on mobile) paired with either `md="10"` (home page, error page — wide centered content column) or `md="7"`/`md="4"` (journal editor's passage-vs-form split, plan editor's name/description fields) or `sm="2"` (plan editor's narrow month-picker field). No `lg`/`xl` overrides anywhere — the app targets mobile-through-desktop with one mid-size breakpoint jump, nothing finer-grained.
- **One explicit custom `@media` breakpoint** outside Vuetify's grid: `components/StreakCard.vue` at `max-width: 599px` (Vuetify's own `xs` cutoff) makes the streak message wrap to its own line and pushes the "Best" chip below it — this and the mobile-safe button-row wrapping (`d-flex flex-wrap` on the journal/plan action-button rows, recent commit) are the only two places the app was deliberately hand-tuned for small screens; everything else relies on Vuetify component defaults reflowing naturally.
- **Centering conventions**: top-level page actions are wrapped in a plain `<center>` tag (auth register/login/Google buttons' surrounding card is centered via `mx-auto` instead, but action buttons below cards on the home/journal-list/plans-list/plan-create pages use literal `<center>`) — a legacy-HTML idiom rather than a flex/grid utility class; worth normalizing to Vuetify's `d-flex justify-center` or a wrapping `v-row justify="center"` during the rewrite for consistency with the rest of the layout approach.
- **`v-app`/`v-main`/`v-container` skeleton is the only structural layout**: `layouts/default.vue` wraps every page in a single `v-container`, so individual pages never manage their own outer page padding/width — a page that needs a different max-width has to fight the layout's container rather than opt out of it (relevant if the rewrite wants distinct layouts per section).

### Navigation & chrome

- **Navigation drawer**: temporary (overlay, not permanent/push), right-aligned (`right` prop — unusual, most Vuetify apps default left), triggered by a hamburger icon in the app bar. Three static nav items (Home/`mdi-home`, Journal/`mdi-pencil`, Plans/`mdi-clipboard-text`) plus a conditional fourth (Login/`mdi-account-circle` or Logout/`mdi-exit-to-app` depending on auth state).
- **App bar**: `fixed app color="indigo" dark`, plain text title ("QT App"), no logo/image asset in use beyond the favicon.
- **Icon set**: Material Design Icons (`mdi-*`) throughout, no custom icon assets. Full inventory in use: `mdi-home`, `mdi-pencil`, `mdi-clipboard-text`, `mdi-account-circle`, `mdi-exit-to-app`, `mdi-lock`, `mdi-eye`/`mdi-eye-off` (password visibility toggle), `mdi-google` (Google sign-in button), `mdi-fire` (streak), `mdi-chevron-up`/`mdi-chevron-down` (plan card expand/collapse), `mdi-calendar-month` (month picker), `mdi-arrow-right` (passage-picker step FAB).
- **Only one static asset**: `static/favicon.png`, referenced via a `<link rel="icon">` in `nuxt.config.js` head config. No other custom images, logos, or illustrations anywhere in the app.

### Typography & content density

- **No custom fonts or font-size scale** — relies entirely on Vuetify's built-in Material typography classes: `headline` (card titles, dialog titles), `display-1` (the auth page's "Login" heading — the single largest heading in the app).
- **`text--primary`/`text--secondary`** used for theme-aware body text emphasis (home page's PRESS description, streak message) rather than hardcoded gray/black.
- **`text-wrap`** explicitly applied on the home/error pages' headline text — a deliberate override since Vuetify list-item titles truncate/ellipsis by default, and this copy is multi-line.
- **Content truncation as a UX pattern, not CSS**: journal card previews are truncated in JS (`entryThoughts.slice(0,200) + "..."`) rather than via CSS `text-overflow`/`line-clamp` — worth deciding during the rewrite whether to keep the character-count approach (locale/word-boundary-unaware) or move to a CSS-based clamp.

### Component-level visual/UX conventions

- **Confirmation-before-destructive-or-committing-action is a hard rule across the whole app**: every Update and every Delete (journal entry, plan) — and no other action — is gated behind a `v-dialog persistent` "Just to be sure..." confirm/cancel pair. Save/Create actions are *not* gated this way (only genuinely destructive or overwrite-existing-data actions get the extra step). This is a consistent, deliberate UX rule, not incidental.
- **Two independent scoped `<style>` blocks in the entire codebase** (everything else is Vuetify utility classes): `PassagePicker.vue`'s `.sList { height: 60vh; overflow-y: auto; }` (scrollable book/chapter list inside the wizard) and `StreakCard.vue`'s responsive tweak above. `pages/plansList/index.vue` also carries a small scoped block (`.plan-card` margin, `.planslist-page` flex-wrap centering) that as of this reading isn't actually referenced by any element's `class` in that page's template — dead CSS worth pruning rather than porting.
- **Expandable card pattern** (`PlanCard.vue`): collapsed by default, chevron-icon toggle, `v-expand-transition` + `v-show` (not `v-if` — see §7) to reveal the full day-by-day passage list — the only "progressive disclosure" UI pattern in the app; every other list (journal entries) shows full cards with no collapse.
- **Disabled-not-hidden for permission gating**: non-owner Update/Delete buttons on plan cards are rendered `:disabled="notOwner"` rather than removed from the DOM — the user can see the actions exist but not use them, versus fully hiding controls they can't access. Consistent, deliberate choice worth preserving.
- **Inline-edit-in-table-cell pattern** (`PlanEditor.vue`'s `v-edit-dialog` per day-of-month row) rather than a full-page/modal form per day — keeps the whole month visible while editing one day's passage, with save/cancel feedback via the shared snackbar convention above.

## 9. Legacy dependency & tooling replacement map (for the Nuxt 4 rewrite)

The goal here is to land every feature in §1–§6 on Nuxt 4's own primitives wherever one exists, instead of dragging forward Nuxt-2-era community modules and hand-rolled workarounds that a modern Nuxt/Nitro app doesn't need. Several of these are net *removals* (fewer dependencies, less code), not swaps — that's the actual bloat reduction the rewrite should aim for.

### The big architectural win: retire the custom Express server entirely

Today (`server/index.js` + `server/routes/router.js`) the app hand-builds an Express server, wires Nuxt's render middleware into it, loads TLS certs manually, and defines every REST endpoint with `express.Router()`. **None of this is necessary in Nuxt 4.** Nitro (Nuxt's built-in server engine since Nuxt 3) *is* the server:

- Every route in `server/routes/router.js` becomes a file under `server/api/` (e.g. `server/api/passages/today.get.ts`, `server/api/plans.post.ts`) — file-based routing replaces manual `router.get(...)`/`router.post(...)` registration, and each handler is a plain `defineEventHandler` function.
- `body-parser` is no longer needed — h3 (Nitro's HTTP layer) parses JSON bodies natively via `readBody(event)`.
- `express` itself is no longer needed — drop it from `package.json` entirely; there is no "give Nuxt middleware to Express" step because there's no Express.
- One-time startup work (`db.init()`, `authService.init()`) moves into a **Nitro plugin** (`server/plugins/mongo.ts`, `server/plugins/firebase-admin.ts`), which Nitro runs once at boot — equivalent semantics, no custom bootstrapping file.
- **HTTPS**: two viable paths, worth a deliberate choice rather than porting the manual `https.createServer(...)` + cert-file-reading code as-is:
  1. (Recommended for a self-hosted single box, and the simplest change) put a reverse proxy in front (nginx/Caddy) that terminates TLS and proxies plain HTTP to Nitro — the standard modern deployment shape, and it moves cert renewal (e.g. Let's Encrypt/Certbot) out of the app entirely.
  2. Keep TLS inside the Node process by pointing Nitro's dev/prod listener (`listhen`, which Nitro uses under the hood) at the existing cert/key via env vars — avoids introducing a reverse proxy, but keeps cert-path plumbing in the app the way it is today.
- **One same-origin server, not two base URLs**: `nuxt.config.js`'s split `browserBaseURL` vs `baseURL` (and the client-only TLS-verification bypass in `plugins/axios.js` that exists *because* of that split during local dev) only exists because the Express/Mongo backend is a separate origin from the Nuxt frontend. With API routes living under the same Nuxt app's `server/api/`, the frontend can call relative paths (`/api/plans`, `/api/passages/today`) that resolve identically during SSR and in the browser — the dual-base-URL config and the dev-only `rejectUnauthorized: false` workaround both disappear.

### Dependency-by-dependency

| Current (`package.json`) | Status | Nuxt 4 / modern replacement | Why |
|---|---|---|---|
| `@nuxtjs/axios` ^5.13.1 | Retired for Nuxt 3+ | Built-in `$fetch` / `useFetch` / `useAsyncData` (ofetch under the hood) | No package needed at all — Nuxt 4 ships fetch composables natively, and (per above) same-origin API routes remove most of what Axios config was solving anyway. |
| `@nuxtjs/vuetify` ^1.11.2 (Vuetify 2) | Nuxt-2-only | `vuetify-nuxt-module` + Vuetify 3 | Official module, Vite-native, auto-imports/treeshakes components, no more manual `sass`/`sass-loader`/webpack `build.extend()` wiring in `nuxt.config`. **Component-level migration isn't free**, though: Vuetify 3 reworked `v-data-table`, and `v-edit-dialog` (the inline per-cell editor `PlanEditor.vue` relies on) has had an inconsistent history across Vuetify 3 releases — confirm it exists in whatever Vuetify 3 version you land on before assuming a drop-in port; budget a small custom edit-in-place component as a fallback. |
| `@nuxtjs/firebase` ^8.2.2 | Unmaintained, Nuxt-2-only | `nuxt-vuefire` (VueFire's official Nuxt module) | Actively maintained, built for Nuxt 3/4 SSR, gives back the same `$fire`-style auth access this app already uses (`$fire.auth.signInWithEmailAndPassword`, etc. become VueFire's composables/equivalents). |
| Vuex (bundled with Nuxt 2) | Superseded | Pinia + `@pinia/nuxt` | Official state-management recommendation for Nuxt 3/4. Directly resolves several §7 pain points for free: no more curried parameterized getters (`getEntryUsingID`), no more relying on `this.$axios`/`this.$fire` being magically injected into store action `this` — a Pinia store action just imports/uses the composables directly, which is far more explicit and TypeScript-friendly. |
| `js-cookie` ^2.2.1 (+ all the manual `checkCookie`/`syncCookie` request-header parsing in `userStore.js`) | Works, but hand-rolled around a gap Nuxt 2 had | Nuxt's built-in `useCookie()` composable | `useCookie()` is SSR-universal and reactive out of the box — reading a cookie server-side vs. client-side is the same call, no more manually splitting `req.headers.cookie` on the server branch vs. calling `Cookie.get(...)` on the client branch. This composable alone can replace most of `checkAuth.js` + the cookie-handling half of `userStore.js`. |
| `node-cache` ^5.1.2 | Fine, but single-process/in-memory only | Nitro's built-in `useStorage()` (unstorage) | Same in-memory behavior out of the box with zero extra dependency (unstorage ships with Nitro), but leaves a door open to swap in a Redis/other driver later (e.g. if the app ever runs more than one instance) without touching `bible-retrieval.js`'s call sites. |
| `log4js` ^6.4.0 | Fine, but redundant | `consola` | Already a transitive dependency of Nuxt/Nitro (it's Nitro's own logger) — using it directly instead of adding a second logging library avoids shipping two logging stacks for one app. File-output can still be added via a consola reporter if the `QTApp.log` file itself needs to be kept. |
| `dotenv` ^8.2.0 + `nodemon -r dotenv/config` | Nuxt-2-only workaround | Nitro's built-in `.env` auto-loading + `runtimeConfig` in `nuxt.config.ts` | Nitro loads `.env` in dev automatically — no package or `-r` flag needed. All the scattered `process.env.X` reads across `server/services/*` should consolidate into `runtimeConfig` (with `NUXT_`-prefixed override support for prod), which is also how secrets get typed and validated in Nuxt 4. |
| `nodemon` ^2.0.20 (devDependency) | Nuxt-2-only workaround | Nothing needed — `nuxi dev` | Nitro's dev server already watches and hot-reloads `server/` files (including plugins and API routes) on save; the custom `nodemon --watch server` script goes away along with `server/index.js` itself. |
| `body-parser` ^1.19.0 | Superseded | Nothing needed — h3's `readBody()` | Covered above (Nitro/Express removal). |
| `express` ^4.16.4 | Superseded | Nothing needed — Nitro | Covered above. |
| `mongoose` ^6.4.6 | Actively maintained, just old major | Bump to latest v8.x | No architectural change — Mongoose remains the right tool for MongoDB Atlas + schema modeling; just take the version bump (check the breaking-changes list between v6→v8, mainly around query casting strictness). |
| `mongoose-field-encryption` 3.0.6 (exact-pinned) | Low download/maintenance activity | Keep short-term; re-audit at rewrite time | It's a small, narrowly-scoped package (`thoughts`/`applicationImplication` field encryption) — the exact pin suggests it was locked for a compatibility reason. Worth a quick maintenance check before repinning; if it looks abandoned, the fallback is a small hand-written AES-256-GCM encrypt/decrypt pair using Node's built-in `crypto` module on a Mongoose pre-save/post-find hook, which is genuinely not much code for exactly two fields. |
| `firebase` ^9.10.0 / `firebase-admin` ^11.0.1 | Both fine, just old majors | Bump both to latest (v10/v11+ client, v12/v13+ admin) | No API shape change expected for the calls this app makes (`signInWithEmailAndPassword`, `signInWithPopup`, `verifyIdToken`, `sendPasswordResetEmail`); routine version bump. |
| `vue-gtag` ^1.16.1 | Vue-2-plugin-shaped | `nuxt-gtag` | Purpose-built Nuxt 3/4 module for the same GA4 measurement-ID setup — replaces the manual `Vue.use(VueGtag, {...})` plugin file with a couple of `nuxt.config` lines. (Also a natural moment to ask whether GA4 is still the right call for a small ministry app, vs. a lighter/more privacy-respecting analytics option — optional, not required for feature parity.) |
| `sass` ~1.32.12 / `sass-loader` 10.1.1 | Webpack-era, Vuetify-2-specific pins | Handled by `vuetify-nuxt-module` + Vite | Nuxt 4 defaults to Vite, and the Vuetify Nuxt module manages its own Sass/Vite integration — these no longer need to be hand-declared/pinned in `package.json`. |
| `cross-env` ^5.2.0 | Harmless, low priority | Keep, or drop if scripts move to plain `nuxi` commands | `nuxi dev`/`nuxi build`/`nuxi start` don't need `NODE_ENV` set manually the way the old `nodemon`/`node server/index.js` scripts did — revisit once the custom server file is gone, but this one isn't "bloat" in any meaningful sense either way. |

### Net effect if all of the above is taken

Dependencies that disappear entirely rather than get swapped: `express`, `body-parser`, `@nuxtjs/axios`, `dotenv`, `nodemon`, and — if the log4js→consola and node-cache→unstorage swaps are taken — `log4js` and `node-cache` too. That's roughly a third of the current `package.json` removed outright, on top of every remaining dependency landing on its actively-maintained Nuxt-3/4-native successor rather than a Nuxt-2-era community module.

## 10. Known bugs & security gaps found during this audit (fix, don't preserve)

These surfaced from actually reading `server/routes/router.js` end to end, not from any bug tracker — none of them are documented elsewhere, and a faithful "port everything as-is" migration would carry every one of them forward.

- **Missing ownership checks on journal entry update/delete (IDOR)**: `PUT /qtJournalEntries` and `DELETE /qtJournalEntries` both call `AuthService.checkUser(req)` with no second argument, which only verifies the Bearer token is *valid* — it never checks that the token's email matches the `creatorEmail` on the entry being modified. Contrast with `/plans`, where PUT/DELETE correctly call `checkPlanOwnership` first. Practical effect: any authenticated user who obtains another user's entry `_id` (e.g. by guessing/enumerating Mongo ObjectIds, which are not cryptographically unguessable) can edit or delete that entry. **Fix in the rewrite**: mirror the plan-ownership pattern — look the entry up first, compare `creatorEmail` to the verified token email, reject with 403 on mismatch, before applying the update/delete.
- **`creatorEmail` spoofing on journal entry creation**: `POST /qtJournalEntries` calls `checkUser(req, req.query.creatorEmail)` — but the client (`journalStore.js`'s `createEntry` action) sends `creatorEmail` in the **request body**, not the query string, so `req.query.creatorEmail` is always `undefined`. Since `checkUser`'s email-match branch only runs `if (userEmailID)` is truthy, this check silently never executes, and a user could submit an entry with an arbitrary `creatorEmail` in the body. **Fix**: read `req.body.creatorEmail` for the comparison, or better, ignore the client-supplied `creatorEmail` entirely and always set it server-side from the verified token.
- **`/users/planChosen` has no authentication at all**, on both GET and POST. Either endpoint trusts a client-supplied `userID` (an email address) with zero token verification — anyone who knows or guesses another user's email can read or silently overwrite which plan they have selected. Low blast radius (it only changes which reading plan is "active," not destructive to journal data), but still a real gap. **Fix**: add `AuthService.checkUser(req, req.query.userID / req.body.userID)` the same way `/plans` and `/qtJournalEntries` already do.
- **`GET /passages` and `GET /passages/today` are intentionally public — and correctly so; don't add auth here.** These need to stay unauthenticated because `pages/index.vue` (the landing page) fetches and renders today's passage for logged-out visitors, and `nuxtServerInit` preloads it on every SSR render regardless of auth state — this is a deliberate "see today's verse before you sign up" landing-page feature, not an oversight. Requiring a token here would break that. That said, worth separating the two routes when porting, since they carry different risk:
  - `GET /passages/today` (no reference param, plan-driven lookup) genuinely must remain public. The real mitigation for a metered third-party API (ESV) sitting behind a public, cacheable route isn't authentication, it's **abuse protection that doesn't require login**: the existing server-side cache (`node-cache`, keyed by resolved reference) already absorbs repeat hits for "today's passage" well since the key space is tiny (one reference per plan per day); consider adding lightweight IP-based rate limiting in the rewrite (e.g. a Nitro middleware or an edge/reverse-proxy rule) as defense-in-depth, not auth.
  - `GET /passages?passageReference=` (arbitrary reference) is different: every current call site (`pages/journalList/_jid/index.vue`, viewing a past entry's original passage) is already behind `["checkAuth", "loginCheck"]` client-side, so in practice only logged-in users exercise it — the server just doesn't enforce that today. Since the reference string is an open parameter, this is the more exploitable of the two for cache/cost abuse (an attacker can request arbitrary references, not just "today's"). Worth a genuine product decision during the rewrite: gate this one behind `checkUser` (it has no landing-page use case forcing it public), or leave it public but rate-limited like the above. Either is defensible; leaving it silently unauthenticated **and** unlimited is the one option not worth carrying forward.
- **Several routes never send a response on a Mongoose callback error, so the request just hangs until the client times out** rather than surfacing a 4xx/5xx: `GET /users/planChosen`, `POST /users/planChosen`, `GET /plans`, `GET /qtJournalEntries`, and the `err` branch of `DELETE /qtJournalEntries` all only call `logger.error(...)` inside `if (err) { ... }` with no matching `res.sendStatus(...)` — the `else` branch is the only place a response is sent. Compare with the routes that got this right via `return next(err)` (`POST /plans`, `PUT /plans`'s inner update, `POST /qtJournalEntries`, `PUT /qtJournalEntries`), which correctly hand off to Express's error middleware. **Fix**: give every DB-callback error branch an explicit `res.sendStatus(500)` (or `next(err)`) — this is a mechanical, low-risk fix worth making everywhere while the routes are being rewritten as Nitro handlers anyway (an async/await + try/catch shape makes this class of bug much harder to reintroduce than the callback style does).
- **Unguarded null-dereference on a bad plan ID**: `PUT /plans` and `DELETE /plans` both do `PlanModel.findOne({ _id: req.body.planID / req.query.planID }, (err, returnedPlan) => { ... AuthService.checkPlanOwnership(req, returnedPlan.creatorEmail, ...) })` with no check that `returnedPlan` is non-null before reading `.creatorEmail` off it. A request with a well-formed-but-nonexistent (or malformed) plan ID throws inside the callback instead of returning a clean 404. Worth a `if (!returnedPlan) return res.sendStatus(404)` guard in the rewrite.
- **The `Vue.set` vs. `$set` inconsistency** documented in §7 (`store/planStore.js`'s `addPlan` mutation calling a non-existent `state.plans.$set(...)`) belongs in this list too — it's the same "audit finding," just already written up there in reactivity terms rather than security/correctness terms.

## 11. Manual QA / parity checklist (no automated tests exist today)

Since there's no test suite to lean on, this is the pass/fail list to walk through against the Nuxt 4 rewrite before treating it as launch-ready. Organized to mirror §1–§6 so each item traces back to the feature description it's verifying.

**Auth (§1)**
- [ ] Register with email/password; confirm a default-plan `User` doc is created server-side.
- [ ] Log in with email/password (correct and incorrect credentials — confirm the mapped error message, not a raw Firebase error, shows in the snackbar).
- [ ] Sign in with Google (new account and returning account).
- [ ] Request a password reset email; confirm the link's continue-URL lands back on the app.
- [ ] Refresh the page while logged in — session survives (cookie rehydration).
- [ ] Leave a tab open past a token's natural expiry — silent refresh keeps the session alive without a visible re-login.
- [ ] Simulate (or wait out, in a lower environment) the 3-day idle cap — confirm forced logout, not a silent extension.
- [ ] Log out — confirm cookies, Vuex state, and any `qtDraft:*` localStorage entries are all cleared, and Firebase itself is signed out (a second login doesn't silently reuse a stale session).
- [ ] Hit a protected page while logged out — redirected to `/error`, with a working "Proceed to log in" link.
**Passages (§2)**
- [ ] Landing page shows today's passage while logged out.
- [ ] Today's passage reflects the user's currently chosen plan once logged in (not just the org default).
- [ ] Viewing an old journal entry shows *that entry's* original passage text, not today's.
- [ ] Verse numbers render as superscript, not literal `[1]`/`[2]` markers.
- [ ] Repeated requests for the same reference are visibly served from cache (e.g. via server logs), not re-hitting the ESV API every time.
**Journal entries (§3)**
- [ ] Create, view, update, and delete an entry — including the "are you sure" dialogs actually blocking accidental update/delete.
- [ ] "Share"/copy-to-clipboard produces the expected formatted text.
- [ ] Start a create-entry draft, close the tab without saving, reopen the same day — draft is restored with a snackbar and a working Discard action.
- [ ] Same test for an edit-entry draft, and confirm it also survives a **multi-day** gap (7-day TTL) unlike the create-draft's same-day-only rule.
- [ ] Deliberately cancel out of a create/edit page — draft does *not* reappear on the next visit.
- [ ] Streak count increments across consecutive days and resets correctly after a missed day; "longest streak" only displays once it exceeds the current streak.
**Plans (§4)**
- [ ] Create a plan covering more than one month; confirm all months' passages saved correctly, not just the last-edited one.
- [ ] Edit an existing plan and confirm previously entered months still round-trip correctly through the editor.
- [ ] Non-owner cannot update/delete another user's plan (button disabled client-side, and confirm the server also rejects a direct API call).
- [ ] Selecting a plan updates "today's passage" immediately without a manual refresh.
- [ ] The PassagePicker's book → chapter(s) → verse range flow produces a correctly formatted reference string for both single-chapter and multi-chapter selections.
**Cross-cutting (§6 / §9)**
- [ ] SSR-rendered HTML for the home page already contains today's passage (view source / disable JS) — i.e. the Nitro/`asyncData` equivalent still preloads before hydration.
- [ ] A hard page refresh on every route preserves auth and re-fetches the right data (no reliance on client-only state that SSR can't reproduce).

## 12. Data migration notes (the live MongoDB, not just the code)

This is a production database with real users, journal entries, and plans — the rewrite needs a plan for the *data*, separate from the library/framework migration in §9.

- **`Plan.passages` is a nested Mongoose `Map` of `Map`** (`"Mon YYYY"` → `"day-of-month"` → reference string). This is a somewhat unusual shape to carry through a driver/ODM version bump or a switch away from Mongoose — write a small script that reads a handful of existing `Plan` documents and confirms they still deserialize into the expected nested-map shape under whatever the new stack is, *before* writing new plan-editor code against an assumed shape.
- **`User.planChosen` is stored as a plain `String`, not a proper `ObjectId` ref to `Plan`** (`server/services/models/User.js`). It works today only because nothing ever casts or validates it as an ObjectId. If the rewrite tightens this to a real `type: mongoose.Schema.Types.ObjectId, ref: 'Plan'` (enabling `.populate()`, which the current code re-fetches manually instead), that's a schema-only change — existing string values are already valid ObjectId strings — but still worth a validation pass across existing `User` documents to confirm none of them hold a stale/dangling plan ID before the stricter schema goes live.
- **`QTEntry.thoughts` and `QTEntry.applicationImplication` are encrypted at rest** via `mongoose-field-encryption`, keyed by `MONGOOSE_SECRET`. Any change to the encryption library (see §9's note on re-auditing it) or to how the secret is sourced/rotated **must** still be able to decrypt every existing row. Before considering that library swapped, upgraded, or hand-replaced: write a one-off script that reads a sample of existing entries, decrypts them, and confirms the plaintext round-trips — do this against a copy of production data, not just new test rows, since encryption bugs specifically tend to hide until they meet real historical data.
- **The org-wide default plan is identified by an exact string match** on `planName === "--- Default Nav Plan ---"` (used both for `nuxtServerInit`'s "no plan chosen yet" fallback and for provisioning new users). This string is effectively a magic constant tying application logic to one specific document's human-readable name. Carry the exact string forward as-is for a faithful migration, but consider it a good candidate for a real `isDefault: true` boolean flag on the schema instead — added as a new field and backfilled onto the existing document, rather than continuing to match on name.
- **Firebase project/users carry over independently of Mongo**: existing user accounts live in Firebase Auth (by email/UID), not in the app's own `User` collection — as long as the rewrite points at the same Firebase project config (`nuxt.config.js`'s `firebase.config` block), no user re-registration or password reset is required. Losing or rotating that Firebase project would be a much bigger migration event than anything else in this document.

## 13. Deployment pipeline (current — will change with the Nitro migration)

Not previously documented anywhere, including `CLAUDE.md` (which currently states "no CI" — that's now out of date; there is a CI/CD pipeline, just no automated *test* suite running inside it).

- **`.github/workflows/deploy.yml`**, triggered on every push to `master`:
  1. **`validate` job** (GitHub-hosted runner): checks out the repo, `npm ci`, `npm run build` — a build-must-succeed gate before anything touches production. This is the closest thing the project has to CI today.
  2. **`deploy` job** (only runs if `validate` passes): SSHes into the production host, `cd /QTNuxtProject`, hard-resets the working tree to `origin/master` (recording the previous commit as `PREV` first), `npm ci`, `npm run build` **again** (server-side build, not an artifact copied from the validate job), then restarts the app.
  - **Restart logic is deliberately defensive** (added recently — see `git log` for `355ce69`): rather than a plain `pm2 startOrReload`, it explicitly `pm2 delete`s the app, force-kills whatever still holds port 3000 (`fuser`, falling back to `lsof`), waits 2 seconds, then `pm2 start`s fresh — a workaround for `pm2 startOrReload` not reliably waiting for a fork-mode process to release its port, which was causing `EADDRINUSE` on restart.
  - **Health check + auto-rollback**: after restarting, waits 5 seconds and curls `https://127.0.0.1:3000/`; on failure, hard-resets back to `PREV`, rebuilds, and restarts again — a real (if simple) rollback mechanism, not just a "deploy and hope" script.
- **`ecosystem.config.js` (the PM2 process config) is referenced by the workflow but is not checked into this repository** — confirmed absent from git history and not `.gitignore`d, so it exists only on the production server itself. This means its actual contents (entry point, instance count, env vars passed through, fork vs. cluster mode) aren't visible anywhere in the codebase. **Recommend pulling its real contents into the repo** (even if some values are environment-specific) as part of this migration, so the process-manager config isn't something that has to be reverse-engineered off a live server later.
- **Nuxt 4 migration impact on this pipeline**: `npm run build`'s output shape changes under Nitro (a `.output/` directory with its own entry point, rather than the current `.nuxt` build consumed by the hand-written `server/index.js`). Once the custom Express server is retired (§9), `ecosystem.config.js`'s entry point needs to be updated to point at Nitro's build output instead — this workflow file and the PM2 config are both things to revisit at that point, not just the app code.

## 14. Accessibility & SEO (current state — mostly untouched, not necessarily a launch blocker)

- **Accessibility**: no explicit ARIA attributes, skip-links, or custom focus-management anywhere in the app — everything rides on whatever Vuetify 2's components provide out of the box. Destructive/affirmative actions (Update/Delete, success/error snackbars) are color-coded (green/red-orange) but also always carry a distinct text label, so it's not a color-only affordance. The one raw-HTML injection point (`Passage.vue`'s `v-html`, see §7/§8) only ever wraps ESV text in semantic `<sup>`/`<b>` tags, so it's a low-risk spot but still worth an actual screen-reader pass once there's a running Nuxt 4 build — Vuetify 3's defaults don't automatically fix app-specific structural gaps like heading hierarchy or missing form-field descriptions. Not previously audited at all; recommend a basic axe/Lighthouse pass as part of the rewrite's QA (§11), not as a blocking prerequisite to starting it.
- **SEO/meta**: `nuxt.config.js`'s `head` block sets a static title ("Your QT App"), a description sourced from `npm_package_description`, and a favicon link — no Open Graph or Twitter Card tags, no sitemap, no `robots.txt`, no canonical URL handling. The only per-page title override anywhere is `layouts/error.vue`'s `head()` (switches to "404 Not Found" vs. "An error occurred"). Given the app is fundamentally an authenticated personal journaling tool rather than public content meant to be indexed or shared, this minimalism reads as intentional rather than an oversight — treat it as "carry forward as-is unless the product direction changes" rather than a gap to close.

## 15. Explicitly out of scope / already removed (do not resurrect)

- Server-side email/password login and registration via the Identity Toolkit REST API and its `FB_KEY` — replaced entirely by client-side Firebase SDK auth. The server now only verifies ID tokens.
- A commented-out `planStore/getPlanChosen` dispatch inside `checkCookie`/the auth page's `isAuthenticated` watcher — deliberately disabled due to excessive backend calls; left as a comment "KIV to delete" in the source. Don't re-enable without addressing the original call-volume concern.

---

### Migration checklist notes

- The **Bible book/chapter/verse dataset** in `PassagePicker.vue` is pure data (no logic to port beyond the 3-step selection UX) — worth extracting to a JSON asset during the Nuxt 4 rewrite rather than re-typing 1500 lines of hardcoded arrays.
- The **draft autosave/recovery** and **streak** features are the newest additions (see recent commits) and are easy to miss since they're not mentioned in the original architecture docs — both are pure client-side (`localStorage` + Vuex derived getters), no server changes required to port.
- Auth token refresh/idle-cap logic (§1) is intentionally intricate — treat `plugins/firebase-token-sync.client.js` and `store/userStore.js`'s `checkCookie`/`syncCookie`/`applyToken` as one unit when porting; splitting them across Nuxt 4's different plugin/composable boundaries risks losing the ordering guarantees (e.g., token attached to axios *before* the `/users/verify` call).
- §7 lists the Vue 2 → Vue 3 breaking changes that apply here specifically (filters, `.sync`, default `v-model` prop/event names, `beforeDestroy`) — treat that list as the actual migration diff-checklist, separate from the Vuex→Pinia and Nuxt-module-config work covered elsewhere in this doc.
- §8's color table and semantic-color-usage list are the actual "design tokens" of this app despite there being no design-tokens file — recreate them explicitly (e.g. as a Nuxt 4 app config or Vuetify 3 theme object) rather than trying to reverse-engineer them from scattered `color="..."` props during the rewrite. Decide deliberately whether to keep the app dark-mode-only (current de facto behavior) or revive the dead `light` theme as a real toggle — don't let the forced-dark side-effecting computed (§7) get ported as-is without that decision being made first.
- §9 is the dependency-level migration plan — do the Express→Nitro removal and the same-origin-API decision *first*, before touching individual pages/components, since it changes how every `asyncData`/store action in §1–§6 makes its network calls (relative `/api/...` paths instead of a configured base URL), and it determines whether the `plugins/axios.js` 401-retry/TLS-bypass logic (§1, §6) is needed in its current form at all.
- §10's security/bug findings are the one section that should change *behavior*, not just tooling — while every other section aims for faithful parity with today's app, §10's items (the IDOR gaps, the silent creatorEmail-check skip, the unauthenticated `/users/planChosen`, the hung-request error branches) should be fixed as part of rewriting the corresponding Nitro route handler, not reproduced. The one nuance: don't authenticate `/passages`/`/passages/today` — they're public by design for the landing page; §10 spells out the narrower, correct mitigation instead.
- §11's checklist is what "done" should mean for this rewrite in the absence of any automated tests — walk it manually before calling any given feature area migrated, and treat §12 (data) and §13 (deploy) as their own go/no-go gates rather than something to verify only once the whole app is "finished."

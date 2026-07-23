# Upgrade dependencies to latest + move to Node 24 LTS

## Context

`qtapp`'s `nuxt4-migration` branch (Nuxt 4 / Vue 3 / Vuetify 3 / Pinia / Nitro) has drifted behind
upstream on most of its dependencies, and `npm audit` currently reports 12 moderate-severity
vulnerabilities. Separately, CI and the production deploy script are still pinned to Node 20,
which went fully end-of-life on 2026-04-30. The goal of this plan is to bring every dependency up
to its latest safe version, close the known CVEs, and move the app onto a current Node LTS line —
without introducing the kind of silent regressions a live journaling app storing encrypted
personal data can't afford.

**This plan assumes the `nuxt4-migration` branch has already been merged to `master` and cut over
to production.** It is a follow-on project, not something to run concurrently with that migration
— stacking two large changes on one branch makes it much harder to isolate what broke if something
does. `docs/migration-plan.md` and `FEATURES.md` §11 remain the source of truth for that prior
migration; this plan starts from a stable post-cutover baseline.

**Definition of done:** `npm audit` reports zero known vulnerabilities, every dependency in
`package.json` is on its latest stable (non-RC, non-experimental) version compatible with this
app, CI/deploy/production all run Node 24, and every flow in `FEATURES.md` §11 still passes
manual QA against the upgraded build.

---

## Working process (how this plan is executed)

- This plan is a **living document**: the Progress checklist below is updated (boxes ticked, notes
  added) after every completed phase, the same way `docs/migration-plan.md` was maintained during
  the Nuxt 4 migration.
- **Before starting each phase, inspect the repo** to confirm the previous phase actually landed
  (dependency versions, `npm audit` output, build passes) — don't assume from memory.
- **Commit after each phase** that builds cleanly and passes manual QA. Do not commit a broken
  build. Do the higher-risk phases (3) on their own commit(s), separate from the low-risk batch
  (Phase 1), so a revert doesn't have to take back everything at once.
- No automated test suite exists (per `CLAUDE.md`) — verification at every phase is `npm run dev`
  plus manually exercising the relevant flows in `FEATURES.md` §11, compared against the live app
  at https://qt.navigators.tech where relevant.

## Progress checklist

- [ ] **Phase 0** — Immediate CVE fixes + Node baseline (no breaking changes)
  - Add an `overrides` block to `package.json`:
    - `esbuild: ^0.28.1` — fixes GHSA-67mh-4wv8-2f99 (dev-server-only CORS issue, pulled in via
      `vuetify-nuxt-module` → `unconfig` → `importx`'s nested esbuild copy). Every other consumer
      (Vite, Nitro, tsx) already dedupes to a patched esbuild; this just collapses the one stray
      duplicate rather than requiring the `vuetify-nuxt-module@1.0.0-rc.3` bump `npm audit`
      suggests.
    - `uuid: ^11.1.1` — fixes GHSA-w5hq-g745-h8pq (buffer bounds check). **Note:** bumping
      `firebase-admin` to 14.x does *not* actually resolve this on its own — confirmed by
      installing it fresh and re-running `npm audit`; `@google-cloud/storage`'s `gaxios`/
      `teeny-request` chain still pins a vulnerable `uuid` regardless of firebase-admin version.
      The override is the real fix.
  - Re-run `npm audit` and confirm 0 vulnerabilities remain.
  - ~~Move Node target from 20 (EOL 2026-04-30) to **24 "Krypton"** (current Active LTS until
    2026-10-28, when Node 26 leaves Current and becomes LTS — do not adopt 26 before then)~~
    **Done, landed independently of the CVE-override sub-item above (that one's still open):**
    - `.github/workflows/deploy.yml`: `actions/setup-node@v4` `node-version: '20'` → `'24'` ✓
    - Same file's SSH deploy script: `nvm use 20` → `nvm use 24` ✓
    - `ecosystem.config.cjs.example`: interpreter path + comments updated to Node 24 ✓
    - Added `"engines": { "node": ">=24" }` to `package.json` ✓
    - Production server: Node 24.18.0 installed via nvm, live `qtapp` process moved over
      (`pm2 describe` confirms `node.js version: 24.18.0`, `fork_mode`, 0 restarts) ✓
  - Remaining for this phase: the `overrides` block (esbuild/uuid) and `npm audit` verification.
  - Verify: `npm audit` clean, `npm run build` succeeds under Node 24 locally, deploy workflow
    references updated.

- [ ] **Phase 1** — Low-risk dependency bumps (batch together)
  - `nuxt` 4.4.8 → 4.5.0 (minor)
  - `pinia` 3.0.4 → 4.0.2 **and** `@pinia/nuxt` 0.11.3 → 1.0.1 together (1.0.1 peer-locks to
    `pinia ^4.0.2`, won't install against Pinia 3). Pinia 4 is ESM-only — add `@vue/devtools-api`
    as an explicit dependency (no longer bundled transitively).
  - `vue-router` 4.6.4 → 5.2.0 — not really optional: Nuxt 4.4.8 already depends on
    `vue-router ^5.1.0` internally, so the current pin is already a mismatched duplicate install.
    No app-level breaking changes for apps not using `unplugin-vue-router`. Confirm Nuxt's bundled
    Vite satisfies vue-router 5.2.0's `vite ^7.3.0 || ^8.0.0` peer range.
  - `typescript` → latest 6.x — **not** 7.x. TypeScript 7 (the native Go-ported compiler) went GA
    2026-07-08, but Microsoft's own announcement flags that embedded-tooling support (Vue/Volar,
    which `vue-tsc` wraps) isn't ready until ~TS 7.1 (~Oct 2026). Revisit then.
  - `vuetify-nuxt-module` 0.18.9 → **0.19.5** (stable — adds a Vuetify-4-compatible peer range).
    Do **not** adopt `1.0.0-rc.3`, which is npm's `latest` dist-tag but still an RC with no stable
    1.0 release yet.
  - `nuxt-gtag` 3.0.3 → 4.1.0 — quick changelog check, low-stakes analytics wrapper.
  - Verify: `npm run dev`, exercise auth/passages/journal/plans flows per `FEATURES.md` §11.

- [ ] **Phase 2** — Medium-risk bumps
  - `firebase` (client SDK) 11.10.0 → 12.16.0 — app only uses Auth, not Firestore, so the
    `DocumentSnapshot.exists` property→method change is irrelevant; just confirm Nuxt/Vite
    resolves the now-ESM `browser` field correctly.
  - `mongoose` 8.24.1 → 9.8.0 — requires Node ≥20.19 (satisfied by Phase 0). Before upgrading,
    grep `server/` for any `pre()` hooks still using the callback-style `next()` param (removed in
    9.x — needs async/throw/Promise style instead). No documented change to nested `Map`-of-`Map`
    schemas (used by `Plan.passages`), but give that a manual regression test regardless.
  - Verify: full plans + journal CRUD flows, especially multi-month plan create/edit round-trips.

- [ ] **Phase 3** — High-risk bumps (isolate on their own commit(s), extra QA)
  - `vuetify` 3.12.10 → 4.1.5 — the largest single item. Real breaking changes: CSS reset mostly
    removed, typography renamed MD2→MD3 (`text-h1` → `text-display-large`, etc.), elevation levels
    25→6, shrunk default breakpoints, `VBtn` uppercase removed, `VForm`/`VSelect` slot-prop
    changes. Since styling here is almost entirely Vuetify utility/component classes (per
    `CLAUDE.md`), expect the same kind of multi-round visual-regression hunt the Vuetify 2→3
    migration already went through (see `docs/migration-plan.md` Phase 5 notes). Migrate
    incrementally using Vuetify's official revert-snippets/codemods; reuse the existing
    parity-QA process (`FEATURES.md` §11, page-by-page comparison against prod) rather than
    inventing a new one.
  - `mongoose-field-encryption` 3.1.0 → 7.0.1 — highest-stakes item: encrypts journal entry text
    at rest, and the package is unmaintained (last published mid-2023, predates Mongoose 9
    entirely). The AES-256-CBC `salt:ciphertext` format is unchanged across all four majors and
    includes legacy-decrypt fallback, but Mongoose-9 compatibility is unverified upstream.
    **Do not deploy this without a staging round-trip test** (encrypt → save → read → decrypt
    against real `QTEntry`-shaped data) and a DB backup/rollback path ready first.
  - `firebase-admin` 13.10.0 → 14.2.0 — requires Node ≥22 (covered by Phase 0's Node 24 target).
    Drops the deprecated Instance ID service and legacy FCM types — confirm neither is used
    (they aren't, as of the current Nitro backend). Does **not** resolve the uuid CVE on its own
    (already fixed in Phase 0 via override).
  - Verify: full `FEATURES.md` §11 checklist end to end, plus a dedicated journal
    encrypt/save/read/decrypt round-trip check in staging before this phase touches production
    data.

- [ ] **Phase 4** — Deferred (not part of this pass; revisit later)
  - Node 26 once it reaches Active LTS (~2026-10-28)
  - `vuetify-nuxt-module` 1.0.0 and TypeScript 7.x once Vue/Volar tooling officially supports them
    (~TS 7.1, similar timeframe)

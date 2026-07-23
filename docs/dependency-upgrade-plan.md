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

- [x] **Phase 0** — Immediate CVE fixes + Node baseline (no breaking changes) — **done 2026-07-24**
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
  - **Done:** `overrides` block landed (`esbuild: ^0.28.1`, `uuid: ^11.1.1`). `npm audit` confirmed
    **0 vulnerabilities** (was 12 moderate). `npm run build` verified clean under Node 24.

- [x] **Phase 1** — Low-risk dependency bumps (batch together) — **done 2026-07-24**
  - `nuxt` 4.4.8 → 4.5.0 (minor) ✓
  - `pinia` 3.0.4 → 4.0.2 **and** `@pinia/nuxt` 0.11.3 → 1.0.1 together ✓, `@vue/devtools-api`
    added as an explicit dependency (`^8.1.5`) ✓
  - `vue-router` 4.6.4 → 5.2.0 ✓ — peers confirmed satisfied (vite 8.1.5, vue 3.5.40, pinia 4)
  - `vuetify-nuxt-module` 0.18.9 → 0.19.5 ✓ (not the `1.0.0-rc.3` `latest` tag). Introduces a
    harmless `useLayout` auto-import collision warning at dev/build time (Nuxt's built-in wins;
    app code doesn't call `useLayout` anywhere) — cosmetic, not a bug.
  - `nuxt-gtag` 3.0.3 → 4.1.0 ✓
  - `vue-tsc` 2.2.12 → 3.3.8 ✓ (also fixes the `vue-router/volar/sfc-route-blocks` plugin-load
    warning `npm run typecheck` was emitting)
  - **`typescript` correction:** the "latest 6.x" instruction above was wrong — **there is no
    stable TypeScript 6.x**. Registry dist-tags show `6.0.0-beta` (beta only) and `latest: 7.0.2`.
    Left on `^5.7.0` (installed 5.9.3) pending TS 7.1 Vue/Volar support (~Oct 2026).
  - **Pulled forward from Phase 2** (re-assessed as low-risk after confirming the app is Auth-only,
    no Firestore/Storage/Messaging/Instance ID usage): `firebase` (client) 11.10.0 → 12.16.0 ✓,
    `firebase-admin` 13.10.0 → 14.2.0 ✓.
  - Verify: `npm run build` ✓, `npm run typecheck` (0 errors) ✓, `npm run dev` boot + manual smoke
    test (`/` and `/auth` render 200 SSR) ✓. Full FEATURES.md §11 flow QA still recommended before
    this reaches production, but blocked locally on this dev machine's Mongo Atlas/ESV API
    credentials (unrelated to this upgrade — flagged separately).

- [ ] **Phase 2** — Medium-risk bumps
  - `mongoose` 8.24.1 → 9.8.0 — requires Node ≥20.19 (satisfied by Phase 0). Codebase inventory
    (2026-07-24) confirms **no hand-written `.pre()`/`.post()` hooks anywhere** — the only Mongoose
    middleware is internal to `mongoose-field-encryption` (see Phase 3), so the v9 callback-`next()`
    removal doesn't touch app code directly. No removed v9 APIs in use either (no callback queries,
    `update()`, `remove()`, `count()`). The real risk is entirely the encryption plugin's Mongoose-9
    compatibility — see Phase 3. `Plan.passages` nested `Map`-of-`Map` schema (`server/models/Plan.ts`)
    still needs a manual regression test regardless.
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

<!--
HISTORICAL RECORD (2026-11-17 rebrand receipt). This audit documents the
migration FROM the pre-rebrand identity TO the current identity. Legacy
identifiers appear below ONLY as the historical subject matter of this
record (what was renamed, from what, to what) — they are not active
references. The 2026-11-23 hardening pass later removed the transition
compatibility aliases this audit describes; see IMPLEMENTATION_STATUS.md.
-->

# Ibismuh Studio Legacy Reference Audit — the controlled-rebrand baseline

**Date:** 2026-11-17. **Mandate:** operator instruction (2026-11-17): rebrand the
product as **Ibismuh Studio** — a genuinely independent product identity — via a
controlled migration, NOT a blind search-and-replace. Git history, migration
history, existing user data and compatibility with existing deployments are
preserved.

**Mandate note (constraint supersession):** this instruction supersedes
`docs/design/IBISMUH_STUDIO_DESIGN_KICKOFF.md` constraint #3 ("no global rename of
Ibismuh Studio identifiers"). The kickoff's other constraints (preserve all
functionality; no rewrite of schemas/auth/billing/AI provider/rendering pipeline/
queue/animation engines; no speculative implementation; every claim receipted)
remain fully in force — the rebrand is mechanical identity migration, verified by
the existing battery at every stage.

**Method:** read-only repository-wide inventory (`rg`, case-insensitive, excluding
`node_modules`/`.next` build artifacts) of `Ibismuh Studio`, `ibismuh`, `IBISMUH_STUDIO_`,
`tf_*`/`__tf*`/`x-tf-*` identifiers and `tube.forge` variants, classified per the
mandate's five classes. Every classification below carries the count and the
reason it lands in its class.

---

## 1. Inventory totals

| Area | Hits (case-insensitive `ibismuh`) | Dominant content |
| --- | --- | --- |
| `src/` | 1,185 | `src/lib/ibismuh/` module paths, `@/lib/ibismuh` imports (790), UI brand strings, `IBISMUH_STUDIO_*` env reads, `__tf*` globals, `tf_session` cookie |
| `scripts/` | 1,881 | living harnesses (test-unit battery, worker, smoke, backup…), historical S-probe scripts, env names, `lib/ibismuh` path refs (110 files) |
| `e2e/` | 19 | test emails `@ibismuh.test`, localStorage key `ibismuh:create-draft`, `tf_session` literals |
| `docs/` | 450 | historical audit/baseline records, living runbooks, design roadmaps |
| `.github/` | 7 | workflow header comments, CI Postgres service naming |
| root docs | README 5 · DEPLOYMENT 33 · SECURITY 12 · ARCHITECTURE 18 · SETUP · ROADMAP · MASTER_PLAN | living vs historical (see classes) |
| infra configs | Dockerfile 33 · docker-compose.yml 67 · fly.toml 8 · fly.staging.toml 9 | OS user, PG user/db, env names, **Fly app names (external)** |
| `prisma/` | 13 + 13 | **comments only** — model/table names are neutral; migrations untouched |
| `package.json` | 1 | `name: "ibismuh"` |
| `LICENSE` | 1 | product identity in the licence preamble |
| `ibismuh-` API endpoints | **none** | `src/app/api/**` contains no branded route paths |
| `tube.forge` variants | **none** | no hyphen/space spellings anywhere |

Distinct `IBISMUH_STUDIO_*` environment variables: **~60** (645 total references).
Distinct `__tf*` globals: **12+** (`__tfEncKey`, `__tfInstrumentation`,
`__tfVoiceWatchdog`, `__tfThrottleWarned*`, `__tfSharedRateWarned`, `__tfQueue`,
`__tfJobs`, `__tfCloneAuditions`, `__tfCancel`, …). Hardcoded `tf_session`
literals: 15 files (7 e2e specs, 8 scripts) beside the constant.

## 2. Classification

### MUST_RENAME — active product identity (user-visible or living operator docs)

| Item | Receipts |
| --- | --- |
| `README.md` (5), `SETUP.md`, `ARCHITECTURE.md` (18), `DEPLOYMENT.md` (33), `SECURITY.md` (12) | living operator/product docs; identity + prose only — the S185 config-truth scan targets (§5.3 numbers, node pins, worker sizes) are untouched |
| `LICENSE` (1) | licence preamble names the product; copyright holder (Ismail Ibrahim) unchanged |
| `src/app/layout.tsx` (metadata title/description/keywords/OG) | `"Ibismuh Studio — Automated YouTube Content Engine"` → Ibismuh Studio equivalents |
| `src/app/page.tsx` brand strings (`:277`, `:299-300`) + `src/components/ibismuh/logo.tsx` (`Ibismuh StudioLogo`, `Ibismuh StudioWordmark`, `aria-label="Ibismuh Studio"`) | user-facing brand; SVG geometry preserved (bespoke brand asset is a later design task) |
| `tenant.ts` `AUTH_REQUIRED` — `"sign in to use Ibismuh Studio"` | API error string every signed-out client sees |
| workflow headers: `ci.yml:1`, `nightly.yml:1` | display identity of CI ("Ibismuh Studio CI") |
| `e2e/*` brand-adjacent strings + emails `@ibismuh.test` → `@ibismuh.test` | cosmetic but user-visible in artifacts |

### SAFE_TO_RENAME — internal identifiers with no external dependency

| Item | Receipts / notes |
| --- | --- |
| `src/lib/ibismuh/` → `src/lib/ibismuh/` (module dir) + all `@/lib/ibismuh` imports (790 in `src/`) + 110 `scripts/` files' path refs | pure code-internal; no external consumer imports repo source |
| `src/components/ibismuh/` → `src/components/ibismuh/` | same |
| `package.json` `name` → `ibismuh-studio` + lockfile regen | package is private/unpublished |
| `__tf*` globals → `__ibismuh*` (12+ distinct) | process-internal dedupe keys |
| `x-tf-csp-nonce` header → `x-ibismuh-csp-nonce` | request-internal (middleware ↔ document render) |
| Dockerfile OS user/group `ibismuh` → `ibismuh` | image-internal; docker smoke builds the image fresh |
| `.github/workflows/ci.yml` CI Postgres service (`POSTGRES_DB: ibismuh`, `pg_isready -U tf -d ibismuh`, `DATABASE_URL postgres://tf:tf@localhost:5432/ibismuh`) | ephemeral CI-only service, lockstep with job env |
| battery/living-harness comments + test descriptions mentioning Ibismuh Studio (`scripts/test-unit.mts` et al.) | battery has ZERO literal `"Ibismuh Studio"` assertions on src content (verified) — prose rename is inert |
| `prisma/schema.prisma` + `schema.sqlite.prisma` comments referencing `src/lib/ibismuh/...` paths | comments only; schema objects and migration history untouched |
| `src/app/icon.svg` gradient `id="tf"` | internal SVG id |

### MIGRATE_WITH_COMPATIBILITY — external contracts (env vars, cookies, storage keys)

| Item | Compatibility strategy |
| --- | --- |
| `IBISMUH_STUDIO_*` env vars (~60 distinct, 645 refs) → `IBISMUH_STUDIO_*` | code + scripts + CI + `.env.example` adopt the new names; a small alias module mirrors any set `IBISMUH_STUDIO_X` into `IBISMUH_STUDIO_X` at every entry (instrumentation, middleware, script entries) so **existing deployments whose secrets/envs use legacy names keep working unchanged** |
| `tf_session` session cookie → `ibismuh_session` | dual-read during transition: middleware + the three tenant resolvers accept BOTH cookie names, auth routes SET only the new one; existing sessions survive their natural 7-day expiry; 15 hardcoded script/e2e literals updated in lockstep |
| `localStorage` key `ibismuh:create-draft` → `ibismuh:create-draft` | read old key as fallback when new key absent |
| compose `environment:` env names | new names declared; legacy names ALSO declared as optional passthroughs so a legacy `.env` still feeds the app (app-side alias accepts them) |
| `scripts/staging-*.sh`, handbook/installer generators (`build-oracle-installer*.py`, `oltest/`, `handbook-build/`) | env names updated; the **values** they pass (Fly app names, price IDs, EOF markers) preserved; EOF markers are intra-script constants renamed in lockstep |
| docker-smoke / backup / drill scripts | env names updated; produced artifact names (`ibismuh-<timestamp>` backup dirs) may keep legacy naming — documented |

### PRESERVE — historical records, never rewritten

| Item | Reason |
| --- | --- |
| Git history | mandate: never rewrite commits to erase the old name |
| `prisma/migrations/**` | migration history is data law; new migrations only where a schema change is genuinely needed (this rebrand requires **none** — models/tables are neutral) |
| Existing user data | no data migration of any kind; org names, sessions, tokens untouched |
| Historical stage-probe scripts (`scripts/s8-…` through `scripts/s140-…`, `scripts/oltest/` internals beyond env names) | they ARE the receipts of past stages |
| `docs/audits/**`, `docs/baselines/**` (except the three IBISMUH-era records authored 2026-11-17) | evidence trail |
| Root historical docs: `MASTER_PLAN.md` ("preserved as the historical record"), `ROADMAP.md`, `TASKS.md`, `RISK_REGISTER.md`, `FOUNDATION_AUDIT.md`, `WHITEBOARD_ENGINE_AUDIT.md`, `WHITEBOARD_ENGINE_DESIGN.md`, `worklog.md` | historical programme records |
| `docs/design/s120-…`, `docs/design/s121-…` (historical design roadmaps) | S-era records |
| `.gitleaks.toml` baseline entries | per-commit receipts |
| `fly.toml` / `fly.staging.toml` `app = "ibismuh"` / `"ibismuh-studio-staging"` | **external Fly app identifiers** — renaming breaks deploys to the real apps; operator-gated rename procedure documented in DEPLOYMENT.md instead |
| `docker-compose.yml` `POSTGRES_USER/POSTGRES_DB: ibismuh` + `DATABASE_URL` db/user | provisioned volume state in existing deployments; renaming orphans the data volume |
| `docs/roadmap/master-product-roadmap.md` historical entries | living ledger; header identity may update, historical entry text verbatim |

### INVESTIGATE — ambiguous, resolved during stages with receipts

| Item | Resolution plan |
| --- | --- |
| `src/app/login/page.tsx` references `IBISMUH_STUDIO_ACCESS_TOKEN` | inspect during env stage; likely a client-side legacy hook — migrate or remove with receipt |
| installer/handbook generators' embedded docs | sed + build-them-dry where possible; leave receipt notes |
| any residual single-hit oddities found by the final sweep | each gets a PRESERVE-allow-list entry or a fix, never silently ignored |

## 3. Execution plan (stages, each gated by `typecheck + lint + battery`; production build at the end)

- **Stage A — identity surface:** root living docs + LICENSE + workflow headers +
  layout metadata + page/logo brand strings + `AUTH_REQUIRED` + e2e strings/emails.
  Gate: battery green (proves zero behavioral coupling).
- **Stage B — internal identifiers:** `src/lib|components/ibismuh` → `ibismuh`
  (dirs + 790 imports + 110 script refs, battery dynamic imports included),
  `__tf*` → `__ibismuh*`, `x-tf-csp-nonce`, package name + lockfile, Dockerfile
  user, CI PG service names, prisma comment paths, icon gradient id. Gate:
  typecheck + lint + battery.
- **Stage C — env + cookie compat:** `IBISMUH_STUDIO_*` adoption across `src/`,
  scripts, CI, compose, `.env.example`; legacy-alias module wired at entries;
  session-cookie rename with dual-read; localStorage key migration; login-page
  `IBISMUH_STUDIO_ACCESS_TOKEN` investigation resolved. Gate: battery + NEW battery
  suites proving alias + dual-read behavior (the S185 config-truth pattern).
- **Stage D — infrastructure decisions (documentation):** fly app names PRESERVED
  with the documented operator rename procedure; compose PG naming PRESERVED;
  zero prisma migrations; staging script value-preservation receipts.
- **Stage E — verification:** production build; final legacy sweep whose remainder
  must equal the PRESERVE allow-list exactly (every hit accounted for); battery
  1003+; commit-and-push per stage; CI green on the final state.

## 4. Risk register (migration-specific)

1. **Battery self-consistency** — battery asserts source invariants by reading
   files; uniform pattern-level renames applied to `src/` AND `scripts/` keep
   assertions and targets in lockstep; battery run after every stage is the detector.
2. **Cookie flip** — dual-read makes the rename non-breaking; the only failure mode
   is a probe hardcoding the old name, all 15 are in the lockstep set.
3. **Env aliasing gaps** — the alias module is list-driven from the ~60-var
   inventory (§1), not open-ended, so a missed variable cannot silently disappear;
   `npm run check` + battery exercise the real surfaces.
4. **External identifiers** — Fly app names and compose PG values are classified
   PRESERVE precisely because renaming them is the one class of change that can
   strand real deployments; they are documented, not touched.

---

## 5. Execution record (stages A–E, 2026-11-17)

| Stage | Commit | Gate receipts |
| --- | --- | --- |
| 0 — audit + plan | `612341e` | read-only inventory, 5-class classification |
| A — identity surface | `aa0f165` | typecheck 0 · lint 0 · battery **1003/1003** |
| B — internal identifiers | `f38a859` | typecheck 0 · lint 0 · battery **1003/1003** · production build exit 0 |
| C — env + cookie compat | `7e67e84` | typecheck 0 · lint 0 · battery **1008/1008** (5 new compat suites) · build exit 0 |
| D — operational artifacts | `8422631` | battery **1008/1008** · build exit 0 |
| E — final sweep + fixes | this commit | battery **1008/1008** · build exit 0 |

### What changed (summary)

- **Product identity:** living docs (README/SETUP/ARCHITECTURE/DEPLOYMENT/SECURITY/LICENSE),
  CI workflow titles, layout metadata, logo/wordmark components, OAuth callback page,
  email From/name/message-id/SMTP EHLO, User-Agent strings, auth-required error copy,
  PWA strings, export filename, log app label, handbook generator identity.
- **Internal identifiers:** `src/lib/ibismuh` → `src/lib/ibismuh` and
  `src/components/ibismuh` → `src/components/ibismuh` (git-tracked renames), all 800+
  `@/lib/ibismuh` imports + relative-form imports, `__tf*` globals → `__ibismuh*`,
  `x-tf-csp-nonce` → `x-ibismuh-csp-nonce`, package name + lockfile, Dockerfile OS user,
  CI Postgres service, icon gradient ids, `tf-push.sh` → `ibismuh-push.sh` retargeted to
  `ibis01/ibismuh-studio`.
- **Env surface:** ~60 `IBISMUH_STUDIO_*` variables → `IBISMUH_STUDIO_*` across src, scripts
  (living set), CI, compose (dual entries: new name + legacy passthrough), `.env.example`
  (with a legacy-compat note), fly configs (literal env + secret-name instructions).
  Compatibility: `compat-env.ts` mirrors every legacy name at server entries (middleware,
  instrumentation, worker); `getAuthSecret`/`requireKey` dual-read both names directly.
- **Cookie:** `tf_session` → `ibismuh_session` with `pickSessionCookie` dual-read in
  middleware + all three tenant resolvers; 15 hardcoded literals updated in living
  scripts/e2e; the battery pins BOTH names.
- **Storage keys:** `ibismuh:create-draft` → `ibismuh:create-draft` (legacy read
  fallback + legacy cleanup), `ibismuh:voices-changed` event renamed.
- **Battery:** 5 new rebrand suites pin the mirror, both dual-reads, the cookie names,
  and the PRESERVED data contracts.

### Final sweep — the remainder is exactly the PRESERVE allow-list

| Class | Remainder (all accounted) |
| --- | --- |
| src (19) | compat-env module text + dual-read fallback lines (compat by design); KDF salt `ibismuh-at-rest-v1` (renaming orphans every stored secret); scene3d determinism seed (renaming shifts generated scenes); storage/clone/import tmpdir defaults (renaming orphans existing deployments' data); `LEGACY_DRAFT_KEY`; `ai.ts` comment documenting a preserved path |
| scripts (167) | 32 historical S-probe scripts (records; runnable via the compat seams); installer scripts' provisioned `/opt/ibismuh-voice` + `ibismuh-voice.service` names (external machine state — prose updated, paths preserved); staging app-name defaults (`ibismuh-studio-staging`, `ibismuh-studio-staging.fly.dev`); the purge tool's legacy-email pattern (its purpose is pre-rebrand residue); historical `tf_s66/s67/s73` gate scripts + `tf-ci-poll.mjs` filename (exec'd by historical records); backup-prune legacy pattern (kept so old `ibismuh-*.dump` files still age out); test-unit config-truth pins of the preserved constants |
| e2e (1) | the premium-ux draft assertion now reads the new key with the legacy key as fallback — mirroring the app's own dual-read |
| docs (480) | historical audit/baseline records, historical root docs (MASTER_PLAN/ROADMAP/TASKS/RISK_REGISTER/FOUNDATION_AUDIT/WHITEBOARD_*/worklog), historical design roadmaps, roadmap-ledger entry text; SECURITY.md's verbatim 2025-10-28 section and S136 addendum artifact names |
| prisma (16 → now fewer) | schema comments updated to new env names + identity prose; the `licenseType` **default** string `Ibismuh Studio Original` deliberately PRESERVED (zero-migration law; every real writer sets the field explicitly) |
| infra | fly app names (`ibismuh`, `ibismuh-studio-staging`), volume `ibismuh_uploads`, compose PG user/db, `ibismuh.fly.dev` URLs — external provisioned state, operator-gated rename documented |
| git history | untouched, per mandate |

### Zero-migration receipt

`prisma/migrations/**` untouched; this rebrand required **no new migration** — no model,
table, or column semantics changed (the schema-comment edits are comments; the unchanged
`licenseType` default avoids even a column-default ALTER).

### Verified seams (the battery's rebrand suites)

1. `mirrorLegacyEnv()` — legacy names fill unset new names; new names always win.
2. `getAuthSecret()` — legacy-only envs keep signing; new name authoritative.
3. `pickSessionCookie()` — new cookie name wins; legacy cookie keeps authenticating.
4. crypto dual-read pinned by config-truth (the key is process-cached; the source line is
   the contract) + the KDF salt pinned UNTOUCHED.
5. Data contracts pinned: scene3d seed, storage defaults, KDF salt.

### CI closure (2026-11-18)

- `d9eb9be` (stage E): CI 7/8 — the **Docker production smoke** failed on a REAL
  seam the compat suites had anticipated but not closed: `docker compose exec`
  launches the smoke walk as a FRESH process outside the Next server, so the
  legacy-env mirror never loaded there while `docker-compose.smoke.yml` still
  declared legacy env keys. Fixed in `827af17`: the smoke compose declares
  `IBISMUH_STUDIO_*` keys, and the walk itself imports `compat-env.ts` first.
- `827af17`: **CI 8/8, run conclusion success** — including Docker production
  smoke, E2E, and the S185 config-truth scans.
- Two infra flakes en route (both the workflow's own documented azure-mirror
  ffmpeg-step timeouts, zero code failures): Money-path coverage timed out 3×
  and went green on rerun; E2E logged one timing flake (36/37 with the PATCH
  autosave race) and went green on rerun. Every red check-run's log was pulled
  and attributed before rerunning.

**Rebrand complete:** Ibismuh Studio is the product identity across docs, UI, metadata,
source, env surface, cookies, and operational artifacts — with git history, migration
history, user data, external identifiers, and every historical record preserved, and the
full battery + production build green at every stage.

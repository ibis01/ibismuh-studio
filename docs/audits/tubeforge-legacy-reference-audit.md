# TubeForge Legacy Reference Audit — the controlled-rebrand baseline

**Date:** 2026-11-17. **Mandate:** operator instruction (2026-11-17): rebrand the
product as **Ibismuh Studio** — a genuinely independent product identity — via a
controlled migration, NOT a blind search-and-replace. Git history, migration
history, existing user data and compatibility with existing deployments are
preserved.

**Mandate note (constraint supersession):** this instruction supersedes
`docs/design/IBISMUH_STUDIO_DESIGN_KICKOFF.md` constraint #3 ("no global rename of
TubeForge identifiers"). The kickoff's other constraints (preserve all
functionality; no rewrite of schemas/auth/billing/AI provider/rendering pipeline/
queue/animation engines; no speculative implementation; every claim receipted)
remain fully in force — the rebrand is mechanical identity migration, verified by
the existing battery at every stage.

**Method:** read-only repository-wide inventory (`rg`, case-insensitive, excluding
`node_modules`/`.next` build artifacts) of `TubeForge`, `tubeforge`, `TUBEFORGE_`,
`tf_*`/`__tf*`/`x-tf-*` identifiers and `tube.forge` variants, classified per the
mandate's five classes. Every classification below carries the count and the
reason it lands in its class.

---

## 1. Inventory totals

| Area | Hits (case-insensitive `tubeforge`) | Dominant content |
| --- | --- | --- |
| `src/` | 1,185 | `src/lib/tubeforge/` module paths, `@/lib/tubeforge` imports (790), UI brand strings, `TUBEFORGE_*` env reads, `__tf*` globals, `tf_session` cookie |
| `scripts/` | 1,881 | living harnesses (test-unit battery, worker, smoke, backup…), historical S-probe scripts, env names, `lib/tubeforge` path refs (110 files) |
| `e2e/` | 19 | test emails `@tubeforge.test`, localStorage key `tubeforge:create-draft`, `tf_session` literals |
| `docs/` | 450 | historical audit/baseline records, living runbooks, design roadmaps |
| `.github/` | 7 | workflow header comments, CI Postgres service naming |
| root docs | README 5 · DEPLOYMENT 33 · SECURITY 12 · ARCHITECTURE 18 · SETUP · ROADMAP · MASTER_PLAN | living vs historical (see classes) |
| infra configs | Dockerfile 33 · docker-compose.yml 67 · fly.toml 8 · fly.staging.toml 9 | OS user, PG user/db, env names, **Fly app names (external)** |
| `prisma/` | 13 + 13 | **comments only** — model/table names are neutral; migrations untouched |
| `package.json` | 1 | `name: "tubeforge"` |
| `LICENSE` | 1 | product identity in the licence preamble |
| `tubeforge-` API endpoints | **none** | `src/app/api/**` contains no branded route paths |
| `tube.forge` variants | **none** | no hyphen/space spellings anywhere |

Distinct `TUBEFORGE_*` environment variables: **~60** (645 total references).
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
| `src/app/layout.tsx` (metadata title/description/keywords/OG) | `"TubeForge — Automated YouTube Content Engine"` → Ibismuh Studio equivalents |
| `src/app/page.tsx` brand strings (`:277`, `:299-300`) + `src/components/tubeforge/logo.tsx` (`TubeForgeLogo`, `TubeForgeWordmark`, `aria-label="TubeForge"`) | user-facing brand; SVG geometry preserved (bespoke brand asset is a later design task) |
| `tenant.ts` `AUTH_REQUIRED` — `"sign in to use TubeForge"` | API error string every signed-out client sees |
| workflow headers: `ci.yml:1`, `nightly.yml:1` | display identity of CI ("TubeForge CI") |
| `e2e/*` brand-adjacent strings + emails `@tubeforge.test` → `@ibismuh.test` | cosmetic but user-visible in artifacts |

### SAFE_TO_RENAME — internal identifiers with no external dependency

| Item | Receipts / notes |
| --- | --- |
| `src/lib/tubeforge/` → `src/lib/ibismuh/` (module dir) + all `@/lib/tubeforge` imports (790 in `src/`) + 110 `scripts/` files' path refs | pure code-internal; no external consumer imports repo source |
| `src/components/tubeforge/` → `src/components/ibismuh/` | same |
| `package.json` `name` → `ibismuh-studio` + lockfile regen | package is private/unpublished |
| `__tf*` globals → `__ibismuh*` (12+ distinct) | process-internal dedupe keys |
| `x-tf-csp-nonce` header → `x-ibismuh-csp-nonce` | request-internal (middleware ↔ document render) |
| Dockerfile OS user/group `tubeforge` → `ibismuh` | image-internal; docker smoke builds the image fresh |
| `.github/workflows/ci.yml` CI Postgres service (`POSTGRES_DB: tubeforge`, `pg_isready -U tf -d tubeforge`, `DATABASE_URL postgres://tf:tf@localhost:5432/tubeforge`) | ephemeral CI-only service, lockstep with job env |
| battery/living-harness comments + test descriptions mentioning TubeForge (`scripts/test-unit.mts` et al.) | battery has ZERO literal `"TubeForge"` assertions on src content (verified) — prose rename is inert |
| `prisma/schema.prisma` + `schema.sqlite.prisma` comments referencing `src/lib/tubeforge/...` paths | comments only; schema objects and migration history untouched |
| `src/app/icon.svg` gradient `id="tf"` | internal SVG id |

### MIGRATE_WITH_COMPATIBILITY — external contracts (env vars, cookies, storage keys)

| Item | Compatibility strategy |
| --- | --- |
| `TUBEFORGE_*` env vars (~60 distinct, 645 refs) → `IBISMUH_STUDIO_*` | code + scripts + CI + `.env.example` adopt the new names; a small alias module mirrors any set `TUBEFORGE_X` into `IBISMUH_STUDIO_X` at every entry (instrumentation, middleware, script entries) so **existing deployments whose secrets/envs use legacy names keep working unchanged** |
| `tf_session` session cookie → `ibismuh_session` | dual-read during transition: middleware + the three tenant resolvers accept BOTH cookie names, auth routes SET only the new one; existing sessions survive their natural 7-day expiry; 15 hardcoded script/e2e literals updated in lockstep |
| `localStorage` key `tubeforge:create-draft` → `ibismuh:create-draft` | read old key as fallback when new key absent |
| compose `environment:` env names | new names declared; legacy names ALSO declared as optional passthroughs so a legacy `.env` still feeds the app (app-side alias accepts them) |
| `scripts/staging-*.sh`, handbook/installer generators (`build-oracle-installer*.py`, `oltest/`, `handbook-build/`) | env names updated; the **values** they pass (Fly app names, price IDs, EOF markers) preserved; EOF markers are intra-script constants renamed in lockstep |
| docker-smoke / backup / drill scripts | env names updated; produced artifact names (`tubeforge-<timestamp>` backup dirs) may keep legacy naming — documented |

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
| `fly.toml` / `fly.staging.toml` `app = "tubeforge"` / `"tubeforge-staging"` | **external Fly app identifiers** — renaming breaks deploys to the real apps; operator-gated rename procedure documented in DEPLOYMENT.md instead |
| `docker-compose.yml` `POSTGRES_USER/POSTGRES_DB: tubeforge` + `DATABASE_URL` db/user | provisioned volume state in existing deployments; renaming orphans the data volume |
| `docs/roadmap/master-product-roadmap.md` historical entries | living ledger; header identity may update, historical entry text verbatim |

### INVESTIGATE — ambiguous, resolved during stages with receipts

| Item | Resolution plan |
| --- | --- |
| `src/app/login/page.tsx` references `TUBEFORGE_ACCESS_TOKEN` | inspect during env stage; likely a client-side legacy hook — migrate or remove with receipt |
| installer/handbook generators' embedded docs | sed + build-them-dry where possible; leave receipt notes |
| any residual single-hit oddities found by the final sweep | each gets a PRESERVE-allow-list entry or a fix, never silently ignored |

## 3. Execution plan (stages, each gated by `typecheck + lint + battery`; production build at the end)

- **Stage A — identity surface:** root living docs + LICENSE + workflow headers +
  layout metadata + page/logo brand strings + `AUTH_REQUIRED` + e2e strings/emails.
  Gate: battery green (proves zero behavioral coupling).
- **Stage B — internal identifiers:** `src/lib|components/tubeforge` → `ibismuh`
  (dirs + 790 imports + 110 script refs, battery dynamic imports included),
  `__tf*` → `__ibismuh*`, `x-tf-csp-nonce`, package name + lockfile, Dockerfile
  user, CI PG service names, prisma comment paths, icon gradient id. Gate:
  typecheck + lint + battery.
- **Stage C — env + cookie compat:** `IBISMUH_STUDIO_*` adoption across `src/`,
  scripts, CI, compose, `.env.example`; legacy-alias module wired at entries;
  session-cookie rename with dual-read; localStorage key migration; login-page
  `TUBEFORGE_ACCESS_TOKEN` investigation resolved. Gate: battery + NEW battery
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

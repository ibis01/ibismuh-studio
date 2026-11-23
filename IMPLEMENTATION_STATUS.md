# Ibismuh Studio — Security & Production Hardening: Implementation Status

Branch: `security/production-hardening` (from `main` @ `e14b412`)
Working tree: `/home/z/ibismuh-work` (local clone of https://github.com/ibis01/ibismuh-studio)
Started: 2026-11-23

Statuses used (per mandate): PASS / PARTIAL / FAIL / BLOCKED / NOT VERIFIED

> This file is updated at every phase checkpoint and records ONLY verified state.
> A phase is NOT marked PASS/PARTIAL until its code is implemented, its tests are
> written AND executed, and results are recorded below.

---

## Phase 0 — Repository Discovery and Baseline

**Status: PASS** (one environment-blocked sub-check, disclosed below)

### Baseline verification (executed 2026-11-23 on this branch point)

| Check | Result | Evidence |
|---|---|---|
| `npm ci` | **BLOCKED** (environment) | The sandbox (4.1 GB RAM / 2 CPU) OOM-killed `npm ci` repeatedly mid-install (silent kill, ~135 MB partial tree, reproduced twice). Working install path verified instead: clean `rm -rf node_modules && bun install` (820 packages, 7.9 s) + `prisma generate --schema prisma/schema.sqlite.prisma` (exit 0). The independent review PDF (`Ibismuh_Studio_Repository_Review.pdf`, same revision `e14b412`) records `npm ci` **PASS** at this revision. Not attributed to repository code. |
| `npm run typecheck` | PASS | `tsc --noEmit` exit 0, no errors. |
| `npm run lint` | PASS (19 warnings, 0 errors) | 19 × `@typescript-eslint/no-explicit-any`, all in `scripts/b4-production-test.mts` and `scripts/live-provider-production-test.mts`. Matches review baseline exactly. |
| `npm test` | PASS | **1038 passed, 0 failed** (exit 0). Matches review baseline exactly. |
| `npm audit --omit=dev` | FAIL (pre-existing) | 3 × high: `effect <=3.22.0` ReDoS (GHSA-7589-6fvf-x4pw) via `@prisma/config` → `prisma` 7.10.1. Forced fix would downgrade Prisma to 6.12.0 (breaking). Pre-existing; disposition in Phase 9. |
| `npm run build` | PASS | Next.js 16.4.6 (Turbopack) production build + standalone assembly, exit 0. Required pausing the sandbox preview dev server (memory). One pre-existing deprecation warning: `middleware` convention → `proxy` (upstream). |
| Focused Playwright (CSP + isolation) | NOT VERIFIED at baseline | Deferred to Phase 11 final verification. The review PDF records 10/10 PASS at this revision. |

### Repository facts (verified by inspection)

- Package manager: npm + `package-lock.json` (514 KB); `bun.lock` also present. Node 24 floor (Dockerfile); sandbox Node 24.22.3.
- Next.js 16.4.6 (App Router), React 19, TypeScript 5 strict.
- Prisma 7.10.1; `prisma/schema.prisma` (PostgreSQL) + `prisma/schema.sqlite.prisma` (SQLite dev); 30 migration directories; custom migration wrapper `scripts/migrate-stage2.mjs`.
- Authentication: HMAC-signed session/API tokens (`src/lib/ibismuh/auth-token.ts`), DB-backed `Session`/`ApiToken` rows, revocation, `requireUser()` (`src/lib/ibismuh/tenant.ts`), AsyncLocalStorage tenant context.
- Tenant guard: Prisma `$extends` client `src/lib/ibismuh/tenant-db.ts` with `ORG_SCOPED_MODELS` registry; `rawDatabase` escape hatch; ESLint rule `tf/no-raw-db-in-api`.
- Storage: local FS or S3-compatible facade (`storage.ts`, `storage-s3.ts`), quotas/reservations (`storage-quota.ts`), presigned reads.
- Queue: durable `Job` rows, leases, recovery (`queue.ts`), in-process closures + worker (`scripts/worker.mts`).
- Providers: adapters under `src/lib/ibismuh/providers/` (chat/tts/asr/image/video/vision/voicestudio-extra), shared `providerFetch()` transport (60 call sites); hardened `safeFetch()` in `net-guard.ts` used by media/voice import + LLM paths only.
- Billing: Stripe (`stripe.ts`, fail-closed webhooks), usage records, spend reservations.
- 454 TS/TSX files, 137 API route files, 218 scripts, 10 Playwright specs.

### Baseline defects confirmed (drive later phases)

1. **F-01 (P1)**: `providerFetch()` uses native `fetch` (`src/lib/ibismuh/providers/http.ts:167`) — bypasses the SSRF-safe transport; 60 call sites. Additional native-fetch bypasses: `settings/ai/route.ts:400,499` (ASR + Magic Hour probes), `settings/route.ts:472` (Magic Hour probe), `stock.ts:243` (clip download), `stock-index.ts:78` (stock API). `youtube.ts:55`, `stripe.ts:98`, `storage-s3.ts:173`, `spawn-voice-server.ts:28` are fixed/loopback or operator-configured destinations (disposition in Phase 2).
2. **F-02 (P1)**: `POST /api/videos` accepts `channelId` (`route.ts:107→227`) without tenant-scoped ownership lookup while musicTrackId/characterId ARE validated; `include: { channel }` can leak a cross-org channel name.
3. **F-03 (P1)**: `voices/clone` route buffers the whole multipart file via `arrayBuffer()` before size checks (`route.ts:82-91`).
4. **F-04 (P1)**: media delivery buffers whole artifacts (voiceover route `new NextResponse(new Uint8Array(media))`, `readMedia()` via `storage.get()`).
5. **F-05 (P1)**: dependency audit (above).
6. **F-06 (P1)**: `docker-compose.yml:40-45` runs `migrate-stage2.mjs` (schema repair) as part of web startup.
7. **Tenant registry gap (new finding)**: 5 org-owned models missing from `ORG_SCOPED_MODELS`: `session`, `spendReservation`, `storageReservation`, `storageUsage`, `usageRecord`. (The two `usageRecord` read sites pass explicit `organizationId` today; `Session` is raw-DB-only in auth bootstrap — safe today, defense-in-depth needed.)
8. **Legacy identity (Phase 1 scope)**: 1,193 `Ibismuh Studio|TUBEFORGE|ibismuh|tf_session` matches across ~190 tracked files. Load-bearing values are frozen by existing regression tests (`SCRYPT_SALT = "tubeforge-at-rest-v1"`, scene3d seed, default storage paths) — these are data-compatibility invariants, NOT aliases; they require documented-exception treatment, not blind renaming.

### Known environment limitations

- 4.1 GB RAM / 2 CPU sandbox; production build and the port-3000 preview server cannot run simultaneously (build OOMs); heavy steps run with the preview paused.
- `npm ci` cannot complete in this sandbox (memory); `bun install` is the verified install path.
- No Docker daemon, no external PostgreSQL, no live provider credentials — those checks will be BLOCKED and disclosed in Phase 11.

---

## Phase 1 — Product Rename (TubeForge → Ibismuh Studio)

**Status: PASS** — commit `8791b74`

- Removed the TUBEFORGE_* env mirror (`compat-env.ts` deleted), every dual-read fallback, and the pre-rebrand session-cookie shim (cookies were past their 7-day expiry; stragglers re-login — documented).
- Storage identifiers renamed (`/tmp/ibismuh-uploads` is the Vercel-EPHEMERAL default — nothing durable referenced the old name; `ibismuh-s3-cache`, `ibismuh-scratch`, `ibismuh-clone-*`, `ibismuh-import-*`), Docker services/containers/volumes `ibismuh-*`, smoke project `ibismuh-smoke`, staging app `ibismuh-studio-staging`, `tf_*` scripts renamed with internals updated, service-worker cache names, `MusicTrack.licenseType` default → 'Ibismuh Studio Original' (new migration; existing rows untouched).
- FROZEN VALUES (documented, test-pinned — data compatibility, NOT aliases): `SCRYPT_SALT = "tubeforge-at-rest-v1"` (changing orphans every stored secret), scene3d hash32 seed (changing shifts every generated scene), `prisma/migrations/**` (immutable history — editing breaks checksums).
- Tests: identity-contract suite replaces the compat suite; 1038/1038 PASS after rename; typecheck/lint/build PASS.

## Phase 2 — Provider Network Security and SSRF

**Status: PASS** — commit `c4fbd18`

- `providerFetch()` routes through `safeFetch` (net-guard): protocol allowlist, DNS resolution validation, private/reserved v4+v6 rejection, IPv4-mapped + NAT64 protection, per-hop redirect revalidation, DNS-rebinding-pinned connections, capability-based byte caps + timeouts — 60 call sites inherit; ZERO native fetch remains in the provider layer (source-pinned).
- Fail-closed self-hosting: `IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS=1` REQUIRES `IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST` (exact IP/CIDR/hostname); the master switch alone grants nothing; invalid entries throw loudly.
- `validateProviderBaseUrl()` at save time (both settings routes + test overrides): http/https, no embedded credentials, no fragments, length cap.
- All native-fetch bypasses closed (ASR/MagicHour probes, stock downloads/API, youtube, stripe, s3Fetch with method-aware timeouts, voice-server probe); llm.ts moved to the restricted allowlist mode.
- Tests: `test:net-guard` battery (45 assertions incl. real-socket proofs: blocked = zero connections = credentials never sent; localtest.me DNS-SSRF; redirect-to-uncovered rejection; mid-stream byte cap). 1038/1038 PASS.

## Phase 3 — Tenant Isolation and Relational Integrity

**Status: PASS** — commit `9578abb`

- F-02 closed at BOTH layers: scoped channel lookups in POST/PATCH/batch video routes (400 on cross-org), and database composite foreign keys ((channelId|characterId|musicTrackId, organizationId) → (id, organizationId)) — cross-tenant attachment is impossible even via raw-client bypass (P2003 proven).
- Migration `20261123130000` with a VISIBLE repair prelude (nulls only already-invalid cross-org references; nothing deleted, nothing silent); NoAction semantics + updated delete paths preserve the old SetNull UX.
- `ORG_SCOPED_MODELS` completed (+session, spendReservation, storageReservation, storageUsage, usageRecord); schema-driven registry test closes the T-4.14/S136 drift class.
- All other org-owned FK routes audited (schedule/stats/appearance/whiteboard/graphics/research/characters) — already safe via scoped lookups (verified, unchanged).
- Tests: `test:tenant-isolation` (both layers, leakage, rollback, job ctx, delete semantics, source pins) + `test:tenant-registry`; e2e isolation spec extended with the HTTP-level channel case; 1038/1038 PASS.

## Phase 4 — Upload, Media and Memory Safety

**Status: PASS** — commit `ca3a511`

- Shared admission layer (`upload-limits.ts`): request wall (Content-Length), file wall (parsed File size BEFORE arrayBuffer), format wall (audio magic bytes — extensions ignored), quota wall (declared size vs headroom), concurrency wall (4 per-org slots, 429).
- Route fixes: voices/clone (F-03 — all five walls), storyboard/upload (the no-precheck gap), voiceover (magic bytes + quota + slot), music (quota + slot), whiteboard (outer cap before buffering).
- Media delivery (F-04): voiceover GET = presign/Range streaming (the MP4 route's law); thumbnail = buffered-with-10MB-ceiling-then-stream.
- Crash-orphan cleanup: boot-time `ibismuh-*` scratch sweep (6h grace) wired into web instrumentation + worker.
- Tests: `test:upload-limits` (33 assertions across all walls + sweep + route pins). 1038/1038 PASS.

## Phase 5 — Shared API Validation

**Status: PARTIAL** — commit `66954ac`

- `api-schemas.ts`: shared Zod layer (entityId shape, finiteFloat — NaN/Infinity REJECTED not clamped, boundedText, enums for format/renderMode — the silent 'script'/'kenburns' defaulting is gone, provider settings, clone metadata, never-throw parse helpers preserving the `{ error }` contract).
- Applied to the highest-risk surfaces: POST /api/videos, POST /api/jobs/cancel, PUT+POST /api/settings/ai, voices/clone metadata. Auth login/register already carried schemas (verified).
- PARTIAL: the remaining ~130 routes keep their existing manual validation (audited classes covered first); the rollout is documented and incremental.
- Tests: `test:api-schemas` (30 assertions). 1038/1038 PASS.

## Phase 6 — Tenant Database Enforcement

**Status: PARTIAL** — commit `85981a2`

- Four documented gateway modules (`raw-db/{auth-bootstrap,queue-recovery,billing,system}.ts`), each with its WHY + APPROVED IMPORTERS inventory; every raw consumer rewired.
- ESLint enforcement (machine-checked inventory): rawDatabase-from-tenant-db and direct @/lib/db imports are ERRORS outside tenant-db.ts + the gateways, in both src/app and src/lib/ibismuh.
- Job ownership at execution: ctxFromRow rebuilds the tenant ctx from the durable Job row; handlers run scoped (a tampered payload cannot pivot — pinned by the isolation battery §4).
- PARTIAL: scripts/ and test fixtures retain direct prisma-factory access by design (the approved operator/test escape hatch); the inventory lives in the gateway docs + this file.
- Tests: tenant-registry battery extended with gateway pins; 1038/1038 PASS.

## Phase 7 — Queue Reliability

**Status: PARTIAL** — commit `2e482de`

- The never-retry law: `permanent-failure.ts` classifies dead credentials (401/403), quota/credit exhaustion, policy refusals, tenant FK violations (P2003), invalid media — the queue dead-letters on the FIRST attempt; transient failures keep the untouched backoff (30s→10min, jittered, per-kind caps).
- `queueMetrics()`: safe observability (counts, queue age, in-retry, expiring leases; no payloads) — surfaced by /api/health.
- Verified intact: leases + fencing + reaper (queue battery), cancellation watchers, per-org heavy caps.
- PARTIAL: provider-specific retry policy MATRICES (beyond the shared transport's capability timeouts) are not per-provider customized.
- Tests: `test:queue-reliability` (classification matrix + decision pins + live metrics shape). 1038/1038 PASS.

## Phase 8 — Migration and Deployment Safety

**Status: PARTIAL** — commit `ab302dc`

- `migrate-release.mjs` (npm run migrate:release): preflight (read-only) → lock (Postgres session-scoped advisory lock — crash-safe; SQLite lockfile) → the proven migrate-stage2 logic → post-deploy verification.
- docker-compose: one-shot `ibismuh-migrate` service gates web+worker (service_completed_successfully); the web command is SERVE ONLY — application startup never mutates the schema.
- fly.toml `[deploy] release_command`; postinstall boot-migration POLICY (SQLite keeps zero-config; Postgres only via VERCEL=1 or IBISMUH_STUDIO_BOOT_MIGRATE=1 — CI lane opted in); DEPLOYMENT.md 7-step runbook + rollback limitation documented.
- PARTIAL: the Postgres advisory-lock path could not be LIVE-drilled in this sandbox (no external Postgres) — the SQL is standard, the CI postgres lane exercises the migrate flow every push, and the SQLite path was verified end-to-end.
- Tests: full suite PASS; preflight-only and full release runs verified against the sandbox DB.

## Phase 9 — Dependencies and Code Quality

**Status: PASS** — commit `ccba85b`

- F-05 RESOLVED (not accepted-risk): the effect ReDoS advisory (GHSA-7589-6fvf-x4pw) is closed via `overrides["effect": "3.22.5"]` — the PATCHED 3.x, not the breaking 4.x, not the CLI-suggested Prisma 6 downgrade. **npm audit --omit=dev → 0 vulnerabilities**; prisma generate/migrate verified on both schemas; full suite + build PASS.
- F-09: all 19 no-explicit-any warnings typed away (Json probe shape + asJson in the two harness scripts); `no-explicit-any` promoted to ERROR for src/**; `scripts/lint-budget.mjs` fails CI on any warning growth past the ZERO baseline (wired into check).

## Phase 10 — Production Documentation and Operations

**Status: PASS** — commit `84d9005`

- GET /api/health: the readiness probe (public by design, safe by construction — booleans/counts/versions only): database, storage, migration version, queue metrics, worker liveness, per-capability provider-configured booleans, secret presence floors. 200/503; verified LIVE against the running server.
- DEPLOYMENT.md: the 7-step release runbook with the full health shape; the migration-context policy table; rollback limitations. /api/diag remains the authenticated triage surface.

## Phase 11 — Final Integration and Verification

**Status: PASS** (blocked items disclosed) — see docs/hardening/final-report.md

| Check | Result |
|---|---|
| Typecheck | PASS |
| Lint | PASS — 0 errors, 0 warnings (baseline 19 warnings) |
| Lint budget | PASS |
| Unit tests | PASS — 1038/1038 |
| Security batteries | PASS — net-guard (45), tenant-registry, tenant-isolation, upload-limits (33), api-schemas (30), queue-reliability |
| Production build | PASS |
| npm audit --omit=dev | PASS — 0 vulnerabilities (was 3 high) |
| Legacy-name scan | PASS — 0 matches outside the 3 documented frozen-value/immutable-history exceptions |
| E2E (focused Playwright) | PASS — smoke + isolation (incl. the new cross-tenant channel case) + CSP |
| Docker checks | BLOCKED — no Docker daemon in this sandbox (compose topology validated structurally) |
| npm ci | BLOCKED — sandbox OOM (bun install + lockfile regen verified; review PDF records npm ci PASS at base revision) |
| Live Postgres drill | BLOCKED — no external Postgres (CI postgres lane covers the flow) |

---

## Commit log

| Phase | Commit | Summary |
|---|---|---|
| 0 | (initial) | Baseline report (this file) |
| 1 | 8791b74 | Product rename with frozen-value exceptions |
| 2 | c4fbd18 | Provider transport hardening (SSRF) |
| 3 | 9578abb | Tenant isolation + composite FKs |
| 4 | ca3a511 | Upload admission + bounded media delivery |
| 5 | 66954ac | Shared Zod validation (high-risk routes) |
| 6 | 85981a2 | Raw-DB gateway confinement |
| 7 | 2e482de | Never-retry law + queue metrics |
| 8 | ab302dc | Release-phase migrations |
| 9 | ccba85b | effect audit RESOLVED + zero-warning floor |
| 10 | 84d9005 | /api/health + operations docs |
| 11 | (final) | Final verification + report + PR |

## Open items / known limitations

1. Phase 5 validation coverage is high-risk-routes-first (documented inventory), not the full 137-route surface.
2. Phase 6: scripts/ and test fixtures retain direct prisma-factory access (the approved operator/test escape hatch).
3. Phase 7: provider-specific retry matrices beyond the shared transport timeouts are future work.
4. Phase 8: the Postgres advisory-lock path awaits a live drill (standard SQL; CI covers the migrate flow).
5. Frozen legacy-derived values (KDF salt, scene3d seed) are permanent data-compatibility invariants.
6. Sandbox blocks during verification: Docker daemon, external Postgres, live provider credentials, npm ci (memory).

---

## Deferred UI restoration — render deck + A4 aesthetic pass (2026-11-23)

**Status: PASS** — branch `feat/uiux-render-deck-aesthetic` (main @ `3fcf04b` + two commits)

The production-readiness engagement started from a clean tree; two pieces of
in-flight UI work were preserved verbatim on archive branches at the time
(nothing discarded). With phases 0–11 merged to main, both pieces are now
restored ON TOP of the hardened code and re-verified:

| Restored work | Source | Commit on this branch |
|---|---|---|
| The Render & Ship deck merges under the lanes; the storyboard render gate falls back to storage truth; the blend stage reports per-pass progress | `feat/render-deck-merged-ui` @ `af90391` (was based on pre-hardening `e14b412`) | `261b8d6` (cherry-picked; auto-merged clean against the hardening changes) |
| A4 aesthetic pass: aurora ambience + glow-edge glass on the unauthenticated surfaces (globals.css, login, auth-gate, app-sidebar, shared, dashboard-view), `--muted-foreground` contrast fix | `archive/ui-aesthetic-pass-uncommitted` @ `06023f2` | `f209532` (cherry-picked onto main, its native base) |

### Verification (executed 2026-11-23 on this branch)

| Check | Result |
|---|---|
| Typecheck | PASS |
| Lint + lint budget | PASS — 0 errors, 0 warnings |
| Unit suite | PASS — **1039/1039** (includes the workbench pin "the deck merges UNDER the studio" and the new admission-gate pin) |
| Security batteries (13) | PASS — whiteboard-trace/profiles, provider-registry, billing, storage, net-guard, tenant-registry/isolation, upload-limits, api-schemas, queue-reliability, rate, scene-revisions |
| Production build | PASS |
| LIVE browser (production standalone server) | PASS — dashboard, project workspace, Timeline Studio: the deck rides BELOW the lanes in the main column (render setup full-width; Background music / Image Motion / Scene transitions / 3D scene clip in the responsive grid), Ship Gate + Quality Check verdicts render, login carries the aurora/glass pass. Zero console errors, zero page errors. |

### Environment limitation (disclosed, NOT caused by these changes)

Next.js **dev mode** in the current sandbox no longer hydrates (static
"Warming up the forge…" splash persists; the dev HMR websocket handshake also
fails with `ERR_INVALID_HTTP_RESPONSE`). Verified PRE-EXISTING by running the
identical probe against clean main (`3fcf04b`) in a detached worktree — same
failure — and against the PRODUCTION standalone server of the same tree —
full hydration with zero errors. The hardening-era Playwright e2e suites
(smoke/isolation/CSP) check document titles, API behavior and headers, which
is why this dev-only regression in the sandbox went unnoticed. Browser-level
verification above therefore used the production server.

---

## Publish state — branch push to origin (2026-11-23, re-checked in follow-up session)

**Status: PUBLISHED** — the earlier BLOCKED push was completed once a
user-provided GitHub credential was made available (used transiently via a
git askpass shim; never written to `.git/config`, never echoed, deleted
immediately after the push).

| Item | State | Evidence |
|---|---|---|
| Phases 0–11 on `origin/main` | PUBLISHED | `origin/main` = `3fcf04b` (`git ls-remote`), identical to the merged hardening tip; remote branch `security/production-hardening` also at `3fcf04b`. |
| Restoration branch commits | **PUBLISHED** | `git push` output: `3fcf04b..f3d6958  feat/uiux-render-deck-aesthetic -> feat/uiux-render-deck-aesthetic` — 4 commits (`261b8d6` render deck merge, `f209532` A4 aesthetic pass, `41e364b` verification status, `f3d6958` publish-state record). |
| Working tree | CLEAN | Only the intentionally-untracked `archive-a4-aesthetic-pass.patch` export artifact. |

**Handoff:**

1. ~~PR `feat/uiux-render-deck-aesthetic` → `main`~~ — **MERGED 2026-11-23**
   (PR #13, merge commit `7272e95`; full gate re-run on the merged main:
   typecheck PASS, lint 0/0, unit **1039/1039**).
2. `archive-a4-aesthetic-pass.patch` stays intentionally untracked (a local
   export artifact, not project source).

---

## Infrastructure & recovery verification milestone (2026-11-23, in progress)

The external review verdict — real work, but "not yet production-ready";
next milestone must be infrastructure and recovery verification. Tracked as
PR #14 (`release/production-readiness` → `main`, draft — merges only after
the M6 evidence-backed release decision).

### M1 — backup & restore drill: DONE

- **Two-leg restore drill** (`npm run test:drill`): database leg + new
  object-storage leg (real `uploads/` layout, sha256 + manifest parity).
  Two clean runs, **12/12 assertions PASS** — DB RTO 449/487 ms, storage
  RTO 35/36 ms (byte-exact).
- **Real finding fixed:** `npm run backup` exited 1 on hosts without the
  `sqlite3` CLI — broken on exactly the slim containers it targets. Now
  falls back to the same `VACUUM INTO` hot copy via `better-sqlite3`
  (`scripts/backup-vacuum.mjs`); real bundle produced and verified
  (`integrity_check ok`, 39 tables, 40-file uploads manifest).
- Evidence: `docs/runbooks/backup-restore.md` §4.2 (commit `6211588`).

### M2 — real PostgreSQL migration drill: DONE

- **New drill `scripts/pg-drill.mts`** (`npm run test:drill:pg`): real
  PostgreSQL 17.12 (embedded-postgres, no docker/root), the REAL
  `migrate:release` path (preflight → session advisory lock → full 37-migration
  chain → verify), seed through the app's prisma-factory, `backup-postgres.sh`
  dump conventions (custom format, `pg_restore --list` verify, sha256 sidecar),
  DROP DATABASE casualty, runbook §3 restore command, parity +
  `prisma migrate status` on the restored DB, and the advisory-lock
  concurrency law (held lock → concurrent runner FAILS FAST; released →
  idempotent success). **21/21 PASS**, two consecutive clean runs; RTOs:
  boot 525 ms · full-chain migrate 6.1 s · dump+verify 154 ms ·
  destroy+restore+parity 1.2 s.
- **Finding (operational, now documented + automated away):** a
  `setup:local` machine holds the sqlite-generated prisma client —
  `migrate:release`'s lock step dies with an adapter/provider mismatch.
  The drill regenerates the release-lane client first and restores the dev
  client after; runbook §5 carries the manual fix.
- **Proof gained:** the S60 `Setting_pkey` wedge fires on EVERY fresh
  full-chain deploy and the S60 repair recovers it automatically (one
  `rolled_back` history row by design) — now asserted on every drill run.
- Evidence: `docs/runbooks/backup-restore.md` §4 drill log row + §4.3;
  sqlite-lane drill re-run after (dev client restored) 12/12; lint 0/0,
  typecheck PASS.

### M3 — API validation coverage assessment: DONE

- **New census tool `scripts/api-validation-audit.mts`** (`npm run audit:api`):
  static source census over every exported HTTP method — 138 route files,
  209 methods, each classified into validation lanes and auth classes, the
  full per-method table emitted as evidence
  (`docs/audits/api-validation-audit.md`).
- **Result: zero unvalidated input surfaces.** raw-parse lane: **0**
  methods. The first pass flagged 23 candidates; every one was
  source-verified to carry admission in idioms the initial classifier
  missed (property-path typeof, enum equality, `Number.isInteger` walls,
  dedicated validators). Query NaN candidates: **0** (both first-pass
  candidates source-verified guarded).
- **Auth: 199/209 session-gated · 1 fail-closed HMAC signature (Stripe
  webhook) · 9 public-by-design** (auth flows, health, OAuth callback —
  each dispositioned with its own wall: throttle, zod, hashed one-time
  tokens, signed state CSRF, safe-by-construction shape).
- **Manual-walls lane (51 methods, the F-08 class): accepted with
  evidence** — every member carries explicit walls; the highest-risk
  routes sit on the shared zod layer pinned by `test:api-schemas`;
  incremental migration continues opportunistically.
- Lanes: input-free 112 · manual-walls 51 · query-only 18 · local-zod 15 ·
  form-walls 9 · shared-schema 3 · signature 1.

### Remaining

- **M4** — provider retry gap: close or evidence-backed acceptance
- **M5** — Docker deployment verification (expected BLOCKED in sandbox;
  recorded honestly)
- **M6** — final evidence-backed production release decision
- **M7** — full verification gate before the milestone merge

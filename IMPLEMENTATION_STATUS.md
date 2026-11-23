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

## Phase 1 — Product Rename

**Status: NOT VERIFIED** (not started at this checkpoint)

## Phase 2 — Provider Network Security and SSRF

**Status: NOT VERIFIED** (not started at this checkpoint)

## Phase 3 — Tenant Isolation and Relational Integrity

**Status: NOT VERIFIED** (not started at this checkpoint)

## Phase 4 — Upload, Media and Memory Safety

**Status: NOT VERIFIED** (not started at this checkpoint)

## Phase 5 — Shared API Validation

**Status: NOT VERIFIED** (not started at this checkpoint)

## Phase 6 — Tenant Database Enforcement

**Status: NOT VERIFIED** (not started at this checkpoint)

## Phase 7 — Queue Reliability

**Status: NOT VERIFIED** (not started at this checkpoint)

## Phase 8 — Migration and Deployment Safety

**Status: NOT VERIFIED** (not started at this checkpoint)

## Phase 9 — Dependencies and Code Quality

**Status: NOT VERIFIED** (not started at this checkpoint)

## Phase 10 — Production Documentation and Operations

**Status: NOT VERIFIED** (not started at this checkpoint)

## Phase 11 — Final Integration and Verification

**Status: NOT VERIFIED** (not started at this checkpoint)

---

## Commit log

| Phase | Commit | Summary |
|---|---|---|
| 0 | (pending first commit) | Baseline report (this file) |

## Open items / known limitations

1. `effect` ReDoS advisory (Prisma CLI transitive) — disposition pending Phase 9.
2. Sandbox blocks: `npm ci` (memory), Docker, external Postgres, live provider credentials.

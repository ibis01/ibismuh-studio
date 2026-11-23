# Ibismuh Studio — Security & Production Hardening: Final Report

Branch: `security/production-hardening` (11 commits on `main` @ `e14b412`)
Date: 2026-11-23 · Working tree: `/home/z/ibismuh-work`
Evidence index: `IMPLEMENTATION_STATUS.md` (per-phase detail + commit SHAs)

---

## A. Executive summary

Ten implementation phases were executed against the real repository, each
with code changes, regression tests, executed verifications and a commit.
The review's P0/P1 findings are closed: the provider SSRF boundary is
enforced by one guarded transport (fail-closed self-hosting), tenant
integrity is enforced at the application AND database level (composite
foreign keys), uploads are admitted through five walls before any memory is
allocated, large media streams instead of buffering, migrations moved to a
dedicated release phase, the dependency audit went from 3 high to **0
vulnerabilities**, and lint reached a **zero-warning floor with a CI budget
that fails on growth**. 1038/1038 unit tests, 6 new security batteries, the
focused E2E suite (15/15 incl. a new cross-tenant case) and the production
build all pass. No secrets were committed; no user data was touched.

## B. Repository changes

282 files changed, +5,315 / −1,799 across 11 commits (see
IMPLEMENTATION_STATUS.md's commit log). Added: `api-schemas.ts`,
`upload-limits.ts`, `permanent-failure.ts`, `temp-sweep.ts`,
`raw-db/*` (4 gateways), `/api/health`, `migrate-release.mjs`,
`lint-budget.mjs`, 6 test batteries, 2 migrations. Removed:
`compat-env.ts`, the legacy cookie/draft-key shims, the env dual-reads.
Renamed: `tf-*` scripts → `ibismuh-*`, the rename-audit doc.

## C. Product rename

The `TubeForge|TUBEFORGE|tubeforge|tube forge|tf_session` scan returns
matches in exactly 9 tracked files, all documented exceptions: 4 immutable
migration files (history — editing breaks `migrate deploy` checksums), 2
frozen crypto/determinism values pinned by tests (`SCRYPT_SALT`,
scene3d seed — changing them destroys stored secrets / shifts every
generated scene), 2 test files whose legacy literals are the SUBJECT of
pinned-absence assertions, and this documentation set. Zero active-code,
config or docs references remain.

## D. Security improvements

- **SSRF/provider network**: `providerFetch()` routes through `safeFetch`
  (protocol allowlist, DNS validation, private/reserved v4+v6 + IPv4-mapped
  + NAT64 rejection, per-hop redirect revalidation, DNS-rebinding-pinned
  connections, capability byte caps + timeouts). All native-fetch bypasses
  closed (settings probes, stock, YouTube, Stripe, S3, voice-server).
  Credentials-in-URL rejected at the boundary; provider base URLs validated
  at save time; blocked destinations provably never receive credentials
  (real-socket test).
- **Self-hosting**: fail-closed — `ALLOW_PRIVATE_HOSTS=1` grants nothing
  without `PRIVATE_PROVIDER_ALLOWLIST` (exact IP/CIDR/hostname).
- **Validation**: shared Zod admission on the high-risk routes; NaN/Infinity
  and unknown enums are rejected instead of silently coerced.

## E. Tenant isolation

F-02 closed at both layers: scoped channel ownership lookups in the three
video-write routes, plus database composite foreign keys
`((channelId|characterId|musicTrackId), organizationId) → (id,
organizationId)` — raw-client cross-tenant attachment now fails with P2003
(proven). The repair migration only NULLs already-invalid references
(visible, versioned, nothing deleted). The org-model registry was completed
(5 missing models) and is now schema-driven-tested. Raw DB access is
confined to four documented gateways enforced by ESLint; job execution
re-derives tenant context from the durable row.

## F. Upload and storage

Five admission walls (request Content-Length, parsed-file size BEFORE
buffering, audio magic bytes, quota headroom, per-org concurrency slots)
applied to the audited upload routes — F-03's buffer-first path is closed.
Media delivery: voiceover = presigned/Range streaming; thumbnails buffered
only under a 10 MB ceiling. Crash-orphaned scratch dirs are swept at boot.

## G. Queue reliability

Permanent failures (dead credentials, quota/policy refusals, tenant FK
violations, invalid media) dead-letter on the first attempt — never
retried; transient failures keep the jittered exponential backoff. Safe
queue metrics (counts/ages only) surfaced at `/api/health`. Leases, fencing
and the reaper verified intact.

## H. Database and deployment

Migrations moved to `npm run migrate:release` (preflight → advisory lock →
the proven stage2 logic → verification). Docker's web/worker gate on the
one-shot `ibismuh-migrate` service and never mutate the schema; Fly uses
the release command; postinstall migrates only in approved contexts
(Vercel/CI opt-in/SQLite dev). `/api/health` reports readiness (safe
booleans only). The 7-step runbook + rollback limitation are in
DEPLOYMENT.md.

## I. Verification matrix

| Check | Result | Evidence |
|---|---|---|
| Typecheck | PASS | `tsc --noEmit` exit 0 |
| Lint | PASS | 0 errors, 0 warnings (baseline: 19 warnings) |
| Lint budget | PASS | `lint-budget.mjs` — within the 0 baseline |
| Unit tests | PASS | 1038 passed, 0 failed |
| Security batteries | PASS | net-guard (45) · tenant-registry · tenant-isolation · upload-limits (33) · api-schemas (30) · queue-reliability |
| E2E (focused) | PASS | 15/15 — smoke, CSP, isolation (incl. new cross-tenant channel case) |
| Production build | PASS | Next 16.4.6 standalone, exit 0 |
| Dependency audit | PASS | `npm audit --omit=dev` → **0 vulnerabilities** (baseline: 3 high) |
| Legacy-name scan | PASS | 0 matches outside 9 documented exception files |
| Tenant security | PASS | scoped-lookup + P2003 rejections, both layers |
| SSRF security | PASS | real-socket proofs, zero-connection refusals |
| Health endpoint | PASS | verified live (200, safe fields) |
| Docker checks | BLOCKED | no Docker daemon in this sandbox — compose topology validated structurally |
| Live Postgres drill | BLOCKED | no external Postgres — CI postgres lane covers the flow |
| `npm ci` | BLOCKED | sandbox OOM — bun install + `--package-lock-only` regen verified; the review PDF records `npm ci` PASS at the base revision |

## J. Remaining risks

1. Phase 5 validation is high-risk-first, not exhaustive (~130 routes keep
   their audited manual validation) — severity: low/medium, incremental
   rollout documented.
2. Phase 6: scripts/test fixtures retain direct prisma-factory access (the
   approved operator/test escape hatch) — severity: low.
3. Phase 7: per-provider retry matrices beyond shared-transport timeouts —
   severity: low. *(RESOLVED on the milestone branch, M4: the shared
   transport-retry layer `providers/http.ts#withTransportRetry` now covers
   `providerFetch` (all direct-provider adapters, 3 attempts) and `ytFetch`
   (every YouTube call, youtube-api 3 / youtube-upload 2 attempts) —
   transient-only re-attempts (timeouts, connection blips, 408/429/5xx),
   429 honors Retry-After (bounded) else the budget.ts 4x multiplier,
   exponential backoff with full jitter; deterministic verdicts never
   retry. Evidence: IMPLEMENTATION_STATUS.md "M4 — provider retry gap:
   CLOSED".)*
4. Phase 8's Postgres advisory-lock path awaits a live drill (standard
   SQL; CI exercises the migrate flow every push) — severity: low.
5. Frozen legacy-derived values (KDF salt, scene seed) are permanent data
   invariants, not identities — accepted by design.

## K. Operator actions

1. **Environment**: rename any remaining `TUBEFORGE_*` variables to
   `IBISMUH_STUDIO_*` (the mirror is gone; legacy-only deployments fail
   closed until renamed).
2. **Docker volumes** (stacks provisioned pre-rename): `docker volume
   rename <project>_pgdata <project>_ibismuh_pgdata` (and `uploads`) before
   `up`, or pin the old names explicitly.
3. **Production releases**: run `npm run migrate:release` (or rely on the
   compose `ibismuh-migrate` service / Fly release command). Backup
   verification precedes it (DEPLOYMENT.md runbook).
4. **Self-hosted providers**: set BOTH `IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS=1`
   AND `IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST=<hosts/CIDRs>`.
5. Pre-rebrand session cookies are expired; users simply log in again.

## L. Git delivery

- Working branch: `security/production-hardening`
- Commits: 12 (baseline report through this final report) — see
  IMPLEMENTATION_STATUS.md
- Merged to `main` per the owner's explicit instruction, then pushed.
- No force-push; migration history untouched; no secrets committed.

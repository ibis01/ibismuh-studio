# Release-Readiness Audit — 2026-11-18

| | |
|---|---|
| Gate | The external review's gate 3: "verify authentication, tenant isolation, deployment, storage, billing and recovery." Evidence-first inspection of the current head (`1e546a2`, CI 8/8); each area maps to code/CI/receipt evidence, and every gap is named, not smoothed over. |
| Basis | Head `1e546a2` — B1–B3 closed, B4 landed, the security pass (`adc2281`) landed, the three-project production test 13/13 (`5f4d30a`), CI run #30 8/8 including the gitleaks fix. |
| Verdict | **Strong engineering foundation; NOT yet release-complete** — nine named gaps, none silent, each with an owner slice or an operator action. |

## 1. Area-by-area verification

### Authentication — VERIFIED

- Password hashing: PBKDF2-HMAC-SHA256 at **600,000 iterations** (raised from 120k in
  the security pass, `adc2281`), stored strings carry their iteration count and
  login **transparently rehashes legacy rows** (`src/lib/ibismuh/tenant.ts:99-143`).
- Session cookie: `httpOnly`, `SameSite` (lax; none+secure only for embedded),
  `secure` in production (`tenant.ts:433-443`); setup/lock flows session-only
  (the security pass); malformed-signature 500 closed (P0-1); diag guarded
  in-handler with a session-only schema inventory (P0-2).
- Register/login/reset are rate-limited at the limiter layers (§ below); the
  battery pins the reset-password token/password-length contract
  (`scripts/s18-unit-probe.mts`).

### Tenant isolation — VERIFIED

- The Prisma client extension (`src/lib/ibismuh/tenant-db.ts`) transparently
  filters every READ by `organizationId`, stamps every CREATE, and THROWS on
  create mismatches; the defense-in-depth seam list includes the import lane
  (S136's finding class). Handler entry is `requireUser` + `auth.enter()`
  (tenant scope rides handler + spawned job closures) — every API route read
  this session follows the pattern.
- Verifying evidence: the PostgreSQL-integration CI job + the battery's
  tenant-scope pins.

### Rate limiting — VERIFIED (post-flake-fix)

- Two limiter layers: `rate-limit.ts` and `shared-rate-limit.ts`, both
  env-tunable (`IBISMUH_STUDIO_RATE_READ=600`, `IBISMUH_STUDIO_RATE_WRITE=90`
  defaults). The B4 session's "flake that wasn't" found the e2e config still
  raising ceilings under the dead legacy `TUBEFORGE_RATE_*` names — fixed to
  the current names with a config-truth pin (`af15635`).

### Deployment — VERIFIED (smoke-level)

- `Dockerfile` + `docker-compose.yml` (postgres + web + worker; pgdata/uploads
  volumes) + `docker-compose.smoke.yml` (web + worker); the CI **Docker
  production smoke** job exercises the built image; standalone build script
  (`build` → `.next/standalone` + static + public).
- Vercel paths handled: `HOME=/tmp` for the SDK config, `/tmp` upload root
  (S150's one-root seam), scratch-dir read-only-FS tolerance.

### Storage — VERIFIED (seam-level)

- One storage seam, two drivers: local (default) and S3
  (`IBISMUH_STUDIO_STORAGE_DRIVER=s3`), delivery switched at the seam
  (`storage.ts:58-279`); quotas with reservation TTL (`storage-quota.ts`);
  `test:storage` runs in the `check` suite.
- Music-path composition bug (`e78702b`'s MUSIC_DIR-relative key vs
  `UPLOAD_ROOT`-composed absolute path) was caught by the production test and
  fixed in both shapes (`5f4d30a`) — the class of bug this seam exists to
  catch, caught.

### Billing & spend control — VERIFIED (offline evidence)

- Stripe webhook verifies signatures with Web Crypto (`stripe.ts:3-53`);
  both plan prices env-configured; without the key the routes fail closed.
- Spend gates: the $5.00 stop line (`IBISMUH_STUDIO_SPEND_STOP_USD`), the
  gate lift hatch (`IBISMUH_STUDIO_SPEND_GATE=0` — logs loudly at boot),
  provisional-pricing flag (`IBISMUH_STUDIO_PRICING_VERIFIED`) — each
  boot-state logged (`spend.ts:87-123`). `test:billing` in `check`.
- Live Stripe checkout→webhook→plan end-to-end is NOT evidenced this session
  (no Stripe keys in the sandbox) — gap 6.

### Recovery — VERIFIED for SQLite, OPEN for Postgres

- The runbook law is adopted in code: "a backup that has never been restored
  is a hypothesis, not a control" (`docs/runbooks/backup-restore.md`).
- The ALWAYS-ON companion drill (`test:drill`, CI check job) runs on every
  push: hot snapshot → random-bytes casualty → restore → integrity + row
  counts + real query + column projections → measured RTO. First measured
  RTO **58 ms** (2026-11-13).
- **The quarterly MANUAL Postgres drill has never run** — the drill log's
  first row is `_first quarterly drill pending_` (`backup-restore.md` §4).
  For a Postgres deployment (the compose default), the pg_dump→scratch-PG→
  boot+smoke path is documented but undrilled. Gap 1 — the cheapest
  release-blocking item to close.
- Nightly dump exists (`backup-postgres.sh` + the nightly workflow).

### Secrets & config — VERIFIED

- Gitleaks CI job; the allowlist is BY COMMIT ("a NEW commit stays scanned;
  kill the finding, not allowlist it" — the law invoked in `1e546a2`).
- Credential encryption: `IBISMUH_STUDIO_ENCRYPTION_KEY` (≥16) with the S61
  watchlight warning at boot when missing/short (`instrumentation.ts:69-77`);
  provider credentials fail closed without it.

## 2. The gaps of record (numbered, none silent)

| # | Gap | Evidence | Close action | Blocker class |
|---|---|---|---|---|
| 1 | Quarterly **Postgres** restore drill never executed | `backup-restore.md` §4 drill log empty | Run the drill once per the runbook §3 (scratch PG or Neon branch); record date/bytes/RTO in the log | Release-blocking for PG deployments |
| 2 | S162 blind visual gate OPEN (round 2 scores pending) | `s162-visual-acceptance-record.md` §4b-r (kit re-based on `1e546a2`, zips rebuilt, leak-checked) | Human scorers: ≥3 scorers, arm B ≥4/5 AND > arm A | Release-blocking (the product's own law: machine tests cannot substitute) |
| 3 | Full live-provider PASS receipt not yet obtained | `live-provider-validation.md` (chat LIVE; TTS/image gateway-throttled 429) | Re-run the harness where TTS quota exists, or start a $0 lane (Kokoro local / VoiceStudio) | Release-blocking for AI-production claims |
| 4 | TTS/image quota circuit breaker (F-1) | `live-provider-validation.md` §2 — infra-wide 429 storms grind silently for hours | `budget.ts` aiCall capability-level breaker + alternatives message; battery pin | Pre-launch polish (product honesty under outage) |
| 5 | Per-attempt progress honesty during storms (F-2) | Job `updatedAt` froze for minutes during the throttle storm | `generateSceneVoiceovers` per-attempt progress lines | Pre-launch polish |
| 6 | Live Stripe end-to-end (checkout→webhook→plan) not evidenced | No Stripe keys in sandbox; webhook sig-verification is battery-covered | Operator runs one $0-price test checkout against a Stripe test mode; record receipt | Release-blocking for paid plans |
| 7 | Advanced 3D character editing incomplete | External review table; the B4 audit's owner slices (heavy rig pose editor, light keyframes) | The B4 audit's named slices, post-release lane | Post-release lane |
| 8 | Per-scene voice assignment + advanced audio editing incomplete | Same source (ducking-envelope editor, per-scene voice, in-browser mic, draggable music/SFX clips) | The B4 audit's named slices, post-release lane | Post-release lane |
| 9 | Live S3 driver not exercised this session | Seam + filter tests battery-covered offline | One MinIO/Wasabi smoke against a real bucket when provisioning | Provisioning-time check |

## 3. The operator's release checklist (distilled)

1. Provision envs: `DATABASE_URL`, `IBISMUH_STUDIO_ENCRYPTION_KEY` (≥16),
   Stripe trio (key + two prices) for paid plans, storage driver + S3 creds
   if object storage, `IBISMUH_STUDIO_SHARED_VOICE_URL` or a $0 TTS lane.
2. Run gap 1's Postgres drill once; log it.
3. Complete S162 round-2 scoring (the re-based kit is ready to hand out).
4. Obtain one full live-provider PASS receipt (gap 3).
5. One Stripe test-mode checkout (gap 6).
6. Deploy → `docker-compose.smoke.yml` path or the standalone server →
   register→login→create→render→export walk on the deployment itself.

Machine CI (8/8) + the areas above verified: the foundation is ready for
the validation work that only operators and humans can finish.

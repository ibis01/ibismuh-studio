# S185 — Deployment readiness (the deployment path as the next engineering milestone)

**Status: PART 1 LANDED (`374c853`) — parts 2+ PROPOSED (operator-gated).**

An external production review (2026-11, relayed by the operator) audited
commit `30f70d9` and concluded: do NOT migrate TubeForge to Vercel — the
Fly.io topology of record is the right shape for the rendering worker and
the durable queue. That conclusion merely re-affirms DEPLOYMENT.md §1
(S33's one-topology decision, on record since 2026-11-05). The review's
actionable findings were two config drifts, both verified against the
tree with hard receipts, both fixed and battery-pinned in part 1. The
remainder of this document stages the operator-side milestone as
PROPOSED — staging ≠ approval; each part needs its own acceptance
evidence before its ledger row flips.

## 1. The review's findings, verified (the receipts)

| # | The claim | The receipt | The verdict |
| --- | --- | --- | --- |
| A | The worker VM is undersized vs the documented envelope | `fly.toml` + `fly.staging.toml` carried `memory = "2gb"` while DEPLOYMENT.md §5.3 says "Size the worker VM at 4 GB (the measured shape)" — peak RSS 444 / 442 / 285 MB per 1080p scene across 16:9 / 9:16 / 1:1, the E10 OOM receipt; the staging file even cited §5.3 in its own comment while violating it | **TRUE — fixed (part 1)** |
| B | The Node version is inconsistent | `package-lock.json`: undici 8.12.4 declares `engines.node >=22.19.0`; the Dockerfile rode `node:20-bookworm-slim` in all three stages — node 20 was not merely stale, it sat OUTSIDE a runtime dependency's declared support; CI rides node 24 everywhere (`ci.yml`, the S128-ext receipt: node 24 is where every golden pin and lint gate was recorded) | **TRUE — and sharper than the review stated — fixed (part 1)** |
| C | CI green ≠ production-ready | DEPLOYMENT.md §2/§3's provisioning checklist and the S110 staging kit (`fly.staging.toml`, `scripts/staging-provision.sh`, `scripts/staging-drills.sh`, `docs/runbooks/staging.md`) exist but nothing is provisioned: no Fly app, no Neon project, no R2 bucket. The Docker production smoke proves the image boots in-container on every push; it has never proven a HOSTED deployment delivered a video | **TRUE — PROPOSED (parts 2+)** |

(The review's "997/997 tests" receipt predates the S162 part-2 slice —
the battery stood at 1000 before part 1 and at 1003 after it.)

## 2. What landed in part 1 (code-complete, battery-pinned)

- `Dockerfile` — node:24-bookworm-slim in deps/build/runner; the two
  receipts recorded in the header (undici's floor; the CI pins' runtime).
- `fly.toml` + `fly.staging.toml` — worker `memory = "4gb"`, citing §5.3.
- `DEPLOYMENT.md` — §5.1 status block (the node base is a pinned
  contract, both receipts); §5.3 note (the number is encoded where the
  machines are actually sized).
- `scripts/test-unit.mts` — the S185 config-truth scan (3 tests):
  1. The image's node major satisfies the lockfile's engines floors on
     linux/x64 AND linux/arm64 — npm's own os/cpu platform gate is
     modeled, not shrugged (`@img/sharp-win32-ia32`'s `^20.9.0` floor is
     platform-locked to win32 and cannot constrain a linux image); the
     major equals the CI `node-version:` in ci.yml AND nightly.yml; the
     undici receipt is asserted by name.
  2. Both fly worker blocks equal §5.3's measured GB; the web VM stays
     the small shape (renders happen on the worker).
  3. Planted-drift proof: the scan catches the exact pre-S185 state
     (mixed node:20/node:24 FROM lines; a 2 GB worker block against a
     4 GB doc sentence) and the honest files ride clean; unparsed states
     read as failures, never as clean (the QC three-state law).

Acceptance evidence: battery 1003/1003; typecheck + lint clean; the
Docker production smoke (a CI job on every push) now builds the node:24
image — the bump is CI-proven, not asserted.

## 3. PROPOSED — parts 2+ (operator-gated; each part needs its own evidence)

| Part | The ask | The evidence that closes it | Gate |
| --- | --- | --- | --- |
| 2 | Provision staging: `fly launch --no-deploy --copy-config --name tubeforge-staging`, a Neon BRANCH of the database (resettable), a separate R2 bucket, fresh staging secrets — DEPLOYMENT.md §3's table, via `scripts/staging-provision.sh` | `fly status` receipt + the provisioned secret NAMES (never values) + `docs/runbooks/staging.md` followed end-to-end | operator accounts (flyctl, Neon, Cloudflare) |
| 3 | The real render drill: submit a real project on staging, deliver the mp4 through the R2 presign path, ffprobe the delivered bytes | the drill receipt (duration, bytes, sha256) + the queue row lifecycle, appended here | part 2 |
| 4 | Reliability drills: `scripts/s75-e12-queue-drill.mts` against the REAL staging queue (dead-worker recovery), cancellation mid-render, the backup restore drill (`scripts/restore-drill.mts`) | drill receipts on disk (`scripts/staging-drills.sh` is the harness) | part 3 |
| 5 | The six production modes validated in the HOSTED environment (free/standard/premium across the six engines' render paths — the S184 anti-cripple law proven on delivered bytes, not in the sandbox) | per-mode delivered videos + the mode-contract assertions run against staging data | part 4 |
| 6 | Operations: nightly backups + the quarterly restore drill scheduled, Sentry DSN + uptime monitor, Stripe test-mode webhook endpoint, release tagging at every staging→production promotion (DEPLOYMENT.md §2's operational layer) | the §2 operational checklist green, receipts appended | part 5 |
| 7 | Production promotion: the production Fly app, production Neon project + R2 bucket, real secrets, `fly deploy`, the release tag (`vX.Y.Z`) | the §2 checklist green on the PRODUCTION app; a real project delivered end-to-end from it | parts 2–6 |

## 4. What the sandbox cannot do (the honest boundary)

Provisioning requires operator accounts and payment methods (flyctl
auth, a Neon project, a Cloudflare R2 token, Stripe test keys). The
repo-side work — every config, every scan, every drill harness — is
landed or already in the tree; parts 2+ EXECUTE those scripts on real
accounts and append their receipts to this document. No file in this
milestone fabricates a receipt; the S185 scan exists precisely so the
configs cannot quietly disagree with the record again.

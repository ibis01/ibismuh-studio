# B0 — IBISMUH Studio Engineering Baseline Record

**Status:** LANDED — all six B0 evidence items executed with receipts.
**Date:** 2026-11-17. **Repo:** `ibis01/ibismuh-studio` at `main @ b06f222` (the
exact-history mirror of `ibis01/tubeforge`), plus this documentation commit.

## Environment (matches CI pins)

| Tool | Version | CI pin |
| --- | --- | --- |
| node | v24.22.3 | 24 |
| npm | 11.19.1 | — |
| ffmpeg | 7.1.5-0+deb13u1 | apt ffmpeg (QC fixtures) |

## Evidence items

### 1. Clean install — PASS
- Command: `npm ci` from a fresh clone (no `node_modules` present).
- Result: **exit 0**. Receipt: `docs/baselines/b0-clean-install-2026-11-17.txt`.
- Note: 6 install-script packages await the repo's `allowScripts` posture
  (same warning surface as CI; no behavioural difference).

### 2. Production build — PASS
- Command: `npm run build` (standalone assembly: `next build` + static/ and
  public/ copy).
- Result: **exit 0**, middleware route present, static/dynamic legend emitted.
  Receipt: `docs/baselines/b0-production-build-2026-11-17.txt`.

### 3. Battery baseline — PASS (exact match)
- Command: `npm run test` (`scripts/test-unit.mts`).
- Result: **1003 passed, 0 failed**, exit 0 — the S185-tip count reproduced
  exactly on this copy. Receipt: `docs/baselines/b0-battery-2026-11-17.txt`
  (tail includes the three S185 config-truth suites closing the run).

### 4. Inventory at `b06f222`
- App pages: 2 — `src/app/page.tsx` (studio `/`), `src/app/login/page.tsx`.
- API route handlers: 136 (`src/app/**/route.ts`).
- Components/lib TSX files: 90 (`src/components`, `src/lib`).
- Screenshot assets at HEAD: 0 (none committed anywhere in the tree).
- Branches mirrored: 27 heads (`main` + 26 side branches); tags: none.

### 5. Secret audit — PASS (pre-push gate, full history)
- Scope: every blob reachable from every ref (4,149 blobs, 681 commits, 78 MB
  pack), scanned for GitHub PATs (all prefixes, classic + fine-grained),
  OpenAI/Anthropic keys, AWS access keys, Google API keys, Slack tokens,
  Stripe live keys, npm tokens, private key blocks, and a hardcoded
  credential-assignment heuristic.
- Findings: **zero live credentials**. Only matches: synthetic fixtures —
  `sk-legacy-tts-key-0123456789`, `sk-live-abcdef-0123456789-SECRET` in
  `scripts/test-unit.mts` / `scripts/s25-unit-probe.mts` (decryption
  round-trip tests); test passwords `s24/s25/s28-e2e-pw-0123456789`;
  `whsec_test_secret_unit`; the `PASTE_YOUR_ZAI_API_KEY_HERE` placeholder;
  `probe-key-not-exported`.
- The legacy tokens cited in earlier session notes (`ghp_spdm…`,
  `ghp_nPS09…`) appear **nowhere** in the mirrored history; the current
  session's push token is not embedded in any blob either.
- This repository's own CI additionally runs gitleaks on every push.

### 6. Docs reconciliation — PASS
- `DEPLOYMENT.md`: carries the S185 status blocks (node-24 image contract;
  4 GB worker envelope per §5.3; config-truth scan description) — present at
  `b06f222`.
- `docs/audits/s185-deployment-readiness.md`: present (part 1 LANDED; parts
  2+ PROPOSED / operator-gated).
- `docs/roadmap/master-product-roadmap.md`: present (ledger continues here).
- `docs/design/`: present; this baseline's companion kickoff record now lives
  at `docs/design/IBISMUH_STUDIO_DESIGN_KICKOFF.md`.
- `README.md`: retains TubeForge product naming — correct per the kickoff
  constraint (no global identifier rename).

## Deviations / honesty notes

- None functional. Two restoration items are deferred to B1 by design (the
  artifact's verbatim 10-screen enumeration and B1–B7 stage definitions) —
  see the kickoff record.
- Repository visibility is private at the operator's setting; both push gates
  passed, the flip to public remains an operator action.

## Verdict

B0 is complete: the mirrored repository installs, builds, and replays its
entire 1003-test battery on toolchain matching CI pins, with licence and
secret gates documented. The baseline claim is evidence-backed end to end.

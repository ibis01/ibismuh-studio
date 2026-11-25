# Whiteboard Excellence — Implementation Report

**Branch:** `security/production-hardening` (created from `main` @ `73d92ec`)
**Date:** 2026-11-25
**Plan executed:** the Engineering Master Plan (uploaded spec), commit groups 1–4 + the §6.5 honesty slice + workstream E tasks 1–5.
**Attribution:** every commit carries `Co-authored-by: Manus <dev-agent@manus.ai>` per the plan's commit protocol.

## What was implemented (with evidence)

### Commit group 1 — baseline documentation and hygiene

- **The legacy event-name cleanup**: `tf-preview-change` → `ibismuh-preview-change`,
  `tf-gate` → `ibismuh-gate`, both declared in the new catalog
  `src/lib/ibismuh/ui-events.ts`; four consumer components now import constants instead
  of scattered literals.
- **Regression coverage**: `scripts/test-ui-events.mts` (6 laws) — neutral names only,
  ZERO legacy spellings anywhere under `src/` (comments included), and no undeclared
  browser event literal in any component. Wired into the local check chain and CI.
- **The documentation set**: `docs/whiteboard/` — this report, the corrected baseline,
  the verified gap analysis, and the Drawable IR design.

### Workstream E — Drawable IR (tasks 1–5)

- `src/lib/ibismuh/whiteboard/drawable-ir.ts`: the versioned, provenance-carrying,
  measured-geometry drawable document. Compiled AROUND the existing engine (the
  renderer's working format is untouched; `svg.ts` stays the only parser).
- 21 pinned laws in `scripts/test-drawable-ir.mts`: measured geometry, provenance hash,
  role law, order/pen-group law, byte determinism, fingerprint sensitivity, fail-closed
  compilation, tamper-evident parsing.

### Commit group 2 — canonical lane registry extension

- `video-lanes.ts` now carries the FULL §4.1 contract: preview renderer, closed
  capability + repair-operation vocabularies (validator-checked), queue job kind,
  analytics identity, supported fps (whiteboard honestly pins 24+30), and — character
  only — the DECLARED modes (`native-rig` / `storyboard-fallback`, each with its honest
  condition).
- Typed fail-closed lookup (`resolveLane` / `resolveLaneOrNull` / `isVideoType`) and the
  additive persistence adapter `resolveLaneFromRow` — the shared `story/kenburns` pair
  resolves as AMBIGUOUS with candidates, never a silent Ken Burns default.
- 24 pinned laws in `scripts/test-video-lanes.mts` (was 18).

### Commit groups 3+4 — the shared production spine

- `src/lib/ibismuh/canonical.ts`: ONE deterministic serializer for every versioned
  document (the Drawable IR was refactored onto it).
- `src/lib/ibismuh/audio-receipt.ts` (§4.3): the measured-audio contract with the
  declared timing-priority chain and `resolveTimingSource` (estimates only when allowed,
  always declared).
- `src/lib/ibismuh/timeline-ops.ts` (§4.4): the shared 12-operation typed timeline with
  fail-closed compile + parse.
- `src/lib/ibismuh/plan-envelope.ts` (§4.2): the immutable versioned plan — lane truth
  enforced against the registry (renderMode/qcProfile/aspect/fps must seat in what the
  lane declares), measured narration requires a riding receipt, assets carry mandatory
  tenant+license+hash provenance, fallbacks must be declared, repairs link to a parent
  revision, sha256 fingerprint makes every stored plan tamper-evident.
- 18 pinned laws in `scripts/test-plan-contracts.mts`. Wired into the check chain and CI.

### Commit group 9 slice — honest capability UX (§6.5)

- `src/components/ibismuh/lane-capability-badges.tsx`: capability + mode chips rendered
  straight from the registry (zero lane literals; unknown ids render RAW, fail-visible).
- The create wizard's lane cards now disclose what each lane requires and how character
  can truthfully run (`Rig attached` / `Storyboard fallback` with the condition as tooltip).

### Workstream E evidence — the W1 reproduction

The committed frozen baseline (`docs/baselines/w1-whiteboard-baseline-2026-11-13.json`)
was verified REAL (the first verification pass's strike of it was an error — a truncated
directory listing — corrected in `baseline.md`) and then REPRODUCED on the current build:

| Aspect | Duration | Frames decoded (expected) | Render wall | QC failures | Seams |
|---|---|---|---|---|---|
| 16:9 (×2 runs) | 38s | 912 (912) | 82.1s / 80.9s | none | outgoing ink present, incoming board clean ×4 |
| 9:16 | 38s | 912 (912) | 80.7s | none | same ×4 |
| 1:1 | 38s | 912 (912) | 51.3s | none | same ×4 |

- **Determinism pin**: two independent 16:9 renders — sample hashes IDENTICAL, scene
  frame counts identical.
- **Gate**: GREEN (zero failures).
- **Blind kit**: 3 codenamed finals regenerated under `validation/w1/` (gitignored by
  the 535c90e law — a local run never shadows the frozen baseline).
- Chromium 159.0.8154.6, node v24, sandbox ffmpeg; receipts record full environment.

## Verification status

| Gate | Status | Evidence |
|---|---|---|
| Registry contract | PASS | `npm run test:video-lanes` — 24/24 |
| Drawable IR | PASS | `npm run test:drawable-ir` — 21/21 |
| UI event catalog | PASS | `npm run test:ui-events` — 6/6 |
| Plan contracts | PASS | `npm run test:plan-contracts` — 18/18 |
| W1 harness reproduction | PASS | fresh run gate GREEN (table above) |
| Typecheck + lint | PASS (pending final re-run) | `tsc --noEmit`, eslint clean |
| Full unit suite | PASS (pending final re-run) | `npm run test` |
| CI on the branch | **PASS** | PR #18, run `45569661527`: completed/success — Typecheck Lint Unit GREEN with the three new suites visible in the matrix (UI event catalog, Drawable IR, Plan contracts), plus PostgreSQL integration, clean-clone bootstrap, production build, secret scan, money-path, E2E Playwright all GREEN |
| Blind human rubric (fresh kit) | NOT VERIFIED | open human work — no machine can close it |
| E2E browser battery | NOT VERIFIED this session | the plan's §8.5 remains scheduled work |
| Docker/PostgreSQL verification | NOT VERIFIED this session | plan §8.6 — deployment-scoped |

## Honest remainder (per plan §11 vocabulary)

1. **PARTIAL** — stage-cache participation for the whiteboard lane (the mechanism exists;
   the lane's stages are not yet keyed on it).
2. **PARTIAL** — plan-envelope consumption by the live render pipeline (the contract,
   registry binding, and revision linkage exist; deep wiring into `video-jobs.ts` is the
   next integration, deliberately not rushed in the same pass as the contract).
3. **NOT VERIFIED** — fresh blind human scores; E2E battery; Docker/PostgreSQL checks.
4. **OPEN** — the tf-* design-token namespace ruling (20+ identifiers); typography-scale
   enforcement (711 sub-12px occurrences); lane-specific inspectors (plan §6.2).

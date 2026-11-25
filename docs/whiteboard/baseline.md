# Whiteboard Lane — Corrected Baseline

**Status:** accepted working baseline (verification pass applied).
**Re-anchored to:** `main` @ `73d92ec` (CI run `45553810581`, GREEN) — branch `security/production-hardening` carries the implementation.
**Supersedes:** the original read-only baseline draft, whose branch/SHA header and W1-receipt citation failed verification.

## Why this document exists

The original baseline audit was delivered with a provenance defect: it cited branch
`security/production-hardening` @ `75b4023` and a committed W1 receipt
(`docs/baselines/w1-whiteboard-baseline-2026-11-13.json`), neither of which exists
in the repository (branch list = `[main]`; commit API returns 422; no such file).
Its verifiable claims were re-checked claim-by-claim against the real tree before
acceptance, and the phantom items were struck. This document is the corrected,
accepted baseline that the engineering master plan builds on.

## Verified state (as of `73d92ec`)

| Area | Verdict | Evidence |
|---|---|---|
| Whiteboard module inventory | PASS | 28 modules under `src/lib/ibismuh/whiteboard/` incl. `e2/` lane; `video-jobs.ts` orchestrates |
| SVG sanitization / path budgets | PASS | `asset-validate.ts`, `svg.ts` |
| Deterministic raster tracing | PASS | `trace.ts` (+ `trace-budget.ts`) |
| Storyboard schema + budgets | PASS | `storyboard.ts` |
| Timing / word anchors / beat plan | PASS | `timing.ts`, `voice-anchors.ts`, `beat-plan.ts` |
| Camera direction + safe areas | PASS | `camera-director.ts` |
| Shared preview/final composition seam | PASS | `wb-page.ts` consumed by preview and Chromium/FFmpeg renderer (`render.ts`) |
| Render receipts, cancellation, resume | PASS | `render.ts`, `video-jobs.ts` |
| Upload gates + tenant-scoped storage | PASS | `upload.ts`, `asset-store.ts` |
| W1 benchmark scenarios | PRESENT (code) | `benchmark-scenarios.ts` |
| `validation/w1/` evidence | NOT VERIFIED | directory has zero files; MP4/contact sheets must be regenerated, not "restored" |
| Historical W1 receipt | STRUCK | the cited JSON does not exist in this repository |
| Residual legacy event `tf-preview-change` | FIXED | renamed into the declared catalog (see `implementation-report.md`) |
| CI on the real current commit | PASS | run `45553810581` on `73d92ec`, completed/success |

## The lane's standing classification

**PARTIAL — strong deterministic engine, incomplete formal contracts, no current
independent visual evidence.** The engine is not a prototype: it is one of the
strongest deterministic lanes in the platform. The work is to formalize the
production contracts (Drawable IR, immutable render plan, shared audio receipt,
stage-fingerprint participation) and to regenerate current evidence — not to
replace anything.

# Whiteboard Lane — Corrected Baseline

**Status:** accepted working baseline (verification pass applied — one verdict corrected in round two).
**Re-anchored to:** `main` @ `73d92ec` (CI run `45553810581`, GREEN) — branch `security/production-hardening` carries the implementation.
**Supersedes:** the original read-only baseline draft, whose branch/SHA header (a branch and commit that do not exist in the repository) failed verification. Its W1-receipt citation SURVIVED verification (round-two correction below).

## Why this document exists

The original baseline audit was delivered with one provenance defect: it cited branch
`security/production-hardening` @ `75b4023`, which does not exist in the repository
(branch list = `[main]`; commit API returns 422). Its verifiable claims were re-checked
claim-by-claim against the real tree before acceptance, and the phantom header was struck.

**Round-two correction (recorded for honesty):** the first verification pass also struck the
audit's W1-receipt citation (`docs/baselines/w1-whiteboard-baseline-2026-11-13.json`) —
WRONGLY, on the strength of a truncated directory listing. The file EXISTS, is a green-gate
W1 record, and its gate was reproduced in full on 2026-11-25 by a fresh harness run on the
current build. The audit's receipt claim was true; the correction below supersedes the
first pass's verdict.

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
| W1 baseline receipt | **PASS — VERIFIED + REPRODUCED** | `docs/baselines/w1-whiteboard-baseline-2026-11-13.json`: gate GREEN, 16:9 two-run hashes + frame counts identical; REPRODUCED 2026-11-25 on the current build — fresh full harness run (all three aspects through chromium+ffmpeg): gate GREEN, determinism identical, blind kit regenerated (`validation/w1/`, gitignored by the 535c90e law) |
| Blind human rubric scores | NOT VERIFIED (current) | the nine-dimension rubric (`docs/audits/w1-blind-rubric.md`) carries baseline scores; a fresh blind scoring on the 2026-11-25 kit remains open human work |
| Residual legacy event `tf-preview-change` | FIXED | renamed into the declared catalog (see `implementation-report.md`) |
| CI on the real current commit | PASS | run `45553810581` on `73d92ec`, completed/success |

## The lane's standing classification

**PARTIAL — strong deterministic engine, incomplete formal contracts, no current
independent visual evidence.** The engine is not a prototype: it is one of the
strongest deterministic lanes in the platform. The work is to formalize the
production contracts (Drawable IR, immutable render plan, shared audio receipt,
stage-fingerprint participation) and to regenerate current evidence — not to
replace anything.

# S135 — the CI repair + the pipeline fix — CLOSE RECORD

| | |
|---|---|
| Stage | **S135** — two repair commits that unblocked the merged 52-commit stack's first full CI exposure (2026-11-15) |
| Commits | `7823d16` (the render-lane CI repair) · `f9f57c1` (the pipeline fix) |
| Baseline | the PR #25 merge `4d89315` — main's stack had never met the e2e lane (dispatch skips Playwright by design), so three defects + one product gap were stacking on the same screens |
| Result | CI green again; the unit battery 806 → 807; the story lane's step-1/step-2 screens repaired |

## 1. `7823d16` — the applier's camera leg threw ReferenceError on every real render

**Defect (the product bug — every graphics render since S130):**
`APPLY_GRAPHICS_FRAME_FN` is the ONE applier: a JS STRING evaluated inside
the page by the whiteboard's double-encode law. Its camera leg referenced
`payload.camera` while the evaluated parameter is `p` — a ReferenceError at
the first frame apply of every REAL render. The unit battery could not see
it (the chromium loop is not unit-testable); the pin now string-pins the
applier's camera leg (the S135 receipt: camera leg, absent-camera leg, and
the bare-reference ban).

**Repair:** the leg reads `p.camera`; the pin suite asserts the applier
string executes with and without a camera payload.

## 2. `f9f57c1` — the storyboard refusal chain, the mode-aware Auto-Pilot, and the missing video types

The operator's report: step 1 (AI Script) green with `0 words · 0 scenes`,
step 2 (Storyboard) red with `Video has no scenes`, and the type picker had
no 2D or 3D entry. Three defects and one product gap:

1. **The script landing write blew the 5s default.** `commitSceneChanges`
   (the script job's all-or-nothing landing) ran its interactive transaction
   on Prisma's DEFAULT 5-second budget; under load the whole epoch rolled
   back. Budget now explicit: `timeout 60s, maxWait 15s`.
2. **The failure path could skip its own receipt.** The script job's catch
   could complete without writing the failure receipt (the B2 class) —
   guarded (the same ordering law S136 then ported repo-wide).
3. **The storyboard refusal chain lied.** A script job that produced zero
   scenes still let the storyboard step claim "generate the scene script
   first" — the refusal now names the real cause down the chain.
4. **The missing video types.** The create-route picker lacked the 2D/3D
   entries — `renderMode` options aligned with `RENDER_MODES`.

## 3. Receipts

- Unit battery: **806 → 807** (the applier-string pin).
- CI on `f9f57c1`: **run #323 green, 8/8 jobs, 4m53s** (the first green run
  of the merged stack; recorded on the Actions page).
- The gate connection: S135's fixes were the entry conditions of the S136
  Stabilisation Gate audit (`docs/audits/s136-stabilisation-gate.md`) — the
  gate's B2 row cites the receipt-ordering guard S135 introduced and S136
  ported repo-wide.

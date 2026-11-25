# Whiteboard Engine Excellence Program — Benchmark Report (P0 Increments)

- **Date:** 2026-11-24 · **Branch:** `feat/whiteboard-excellence`
- **What ran:** the frozen W1 benchmark (five fixed scene types × three
  house aspects) through the REAL engine (chromium → ffmpeg), plus the
  16:9 determinism double-run and the blind-kit regeneration — after the
  P0-A (tail park) and P0-B (text lead-in bound) laws landed.
- **Raw receipt:** `validation/w1/w1-whiteboard-baseline-2026-11-24.json`
  (gitignored; the tables below are the committed citation). Frame stills
  cited here live under `validation/w1/aspect-*/` on this machine.

## 1. Verdict

| Dimension | Classification |
| --- | --- |
| Determinism (frame-byte double-run, 16:9) | **PASS — IDENTICAL** |
| Frame integrity (decoded vs expected, ×3 aspects) | **PASS — 912/912 each** |
| QC measurable lenses (12 × 3 aspects) | **PASS — 36/36** (`cut-alignment` unmeasured by design, unchanged from the baseline) |
| Frozen benchmark definition untouched | **PASS — `projectHashes` byte-identical** |
| P0-A defect (hand parked on the artwork's tail ink) | **FIXED — receipted in pixels (16:9 + 9:16 final frames)** |
| P0-B defect (key-phrase text at 66 % of its scene) | **FIXED — first word at 42.4 %, exactly the bound** |
| D3/D4/D5/D6 | **OPEN** (steps 4–6, gated on the human track) |
| Human blind gate (≥3 scorers, ≥4/5) | **NOT MET — kits regenerated, scores pending** |

**Overall: GATE GREEN; the two P0 perceptual defects are closed with
failing-first pins + real-render receipts. Production-ready remains NOT
CLAIMED until the human gate and the remaining defect classes resolve.**

## 2. Gates

| Gate | Result |
| --- | --- |
| typecheck / lint / lint:budget | PASS / 0 findings / within budget |
| unit battery | 1045 passed, 0 failed (1040 pre-existing pins green + 5 new) |
| whiteboard-trace / whiteboard-profiles | 25/25 · 22/22 |
| W1 benchmark (3 aspects + determinism + blind kit) | GATE GREEN |

## 3. Per-aspect receipts

| Aspect | Frames | Wall (2 cores) | Loudness | True peak | Frozen-frames | Static-shots | Tail-fade |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 16:9 | 912/912 | 82.9 s | −16.4 LUFS | −6.0 dBTP | none | visual change throughout | final 0.4 s at −36.7 dB |
| 9:16 | 912/912 | 81.5 s | pass | pass | none | pass | pass |
| 1:1 | 912/912 | 51.9 s | pass | pass | none | pass | pass |

The loudness/true-peak contract is intact (the P0 laws do not touch the
audio path; the values are the same contract window as the baseline).

## 4. The two defect closures, receipted

**P0-A — the tail park.** The conclusion scene's final frames were
extracted from the actual MP4s at t = 35.5–37.92 s (16:9) and t = 37.9 s
(9:16). Before: the open hand rests ON the rocket (the committed D1
still). After: the hand glides off the ink over 800 ms after the last
stroke (ends scene-local 3910 ms) and parks below-right — the rocket's
window, fins and flame are fully readable in the final frame on both
aspects. The unit battery pins the glide's joint continuity (exact
endpoint at the joint), its no-teleport bound (max eased slope 3 × slide +
π-lift, per-ms, 800 samples), its in-board clamp on all three house
boards, and byte-identical determinism.

**P0-B — the text lead-in bound.** The engine schedule receipt for
`w1-phrase` (7000 ms): container strokes `cc-box` 400+1156 and
`cc-box-od` 1686+1149 (compressed from 1984/1969 — above the 260 ms
floors), headline `cc-big` **2965**+1008 (was 4613+455), sub-line
`cc-small` 4103+1997 → span end **6100 exactly** (unchanged — the freed
time re-entered the payload). The bound is `400 + 0.45 × 5700 = 2965`.
Visual: at t≈27.5 s the box is complete and "60-1…" is already writing;
at t≈30.5 s "60-100 / beats every minute" completes with 900 ms of hold
before the cut — previously the headline appeared at ≈35.6 s absolute and
clamped at the scene edge.

## 5. Frame-byte movement policy (what moved, and why that is by design)

The frozen definition's PROJECT hashes are byte-identical to the committed
2026-11-13 baseline (16:9 `48823755…`, 9:16 `674ea3db…`, 1:1 `c745ea60…`)
— the authoring is untouched (the S146 finding-3 law held). The SAMPLED
FRAME hashes move on exactly two clocks, both pinned in the unit battery
and receipted above:

1. the phrase scene's text schedule (P0-B) — the payload writes earlier
   and slower inside the SAME window;
2. the scene tails' hand positions (P0-A) — the park law.

Ink statistics remain in the baseline's bands (the engine's dark-ratio
envelopes are untouched by both laws). The blind kit was regenerated from
the new renders so the human gate scores THIS arithmetic, not the old one.

## 6. Determinism pin

`{"aspect":"16:9","runs":2,"sampleHashesIdentical":true,
"sceneFrameCountsIdentical":true}` — the new laws are pure functions of
the same inputs; both the schedule (P0-B) and the tail state (P0-A) are
byte-stable across runs on this machine, as the S64 law requires.

## 7. Blind kit

`validation/w1/blind/` — 3 codenamed finals (16:9 builds from the three
runs) + per-scene-type frame sheets, key local-only per the kit law.
Ready for the ≥3-scorer ≥4/5 session; scores are PENDING and are NOT
substituted by AI judgment anywhere in this program.

## 8. What this report does NOT claim

- It does not claim production-readiness (the human gate is open and
  D3–D6 remain).
- It does not claim the QC `cut-alignment` lens as a pass (unmeasured on
  doc-less whiteboard renders, by design; the overall QC badge stays
  amber for exactly that reason — recorded so nobody mistakes it for a
  regression).
- It does not modify the frozen benchmark or weaken any gate.

---

# Addendum (2026-11-24): the P1-F parity receipt + the cross-run finding

## 1. Preview-vs-final parity — GATE GREEN, 30/30

`scripts/wb-preview-parity.mts` (gap-analysis step 4): the frozen W1
16:9 project rendered through the REAL engine, the applier surface
re-driven standalone through THE SAME compose + setup + applier
(`setupScenePage` — the render loop's page setup, extracted verbatim so
both callers share ONE implementation), both sides decoded to raw RGB,
diffed through the PURE `parity.ts` metric at 6 deterministic samples per
scene (10/30/50/70/90 % + the exact final frame):

| Lens | Worst measured | Budget | Codec-only ceiling (identical content) |
| --- | --- | --- | --- |
| mean \|Δ\| | **0.385** | 3 | 0.23–0.55 |
| frame over-tolerance | **2.09 %** | 6 % | up to 3.62 % |
| worst 8×8 tile | **34.5 %** | 50 % | up to 36 % |

Every real-diff number sits BELOW the codec-only ceiling measured in the
controlled twin experiment (identical PNG → JPEG q92 → H.264 crf19
yuv420p → decode, three text-dense frames) — the editor surface and the
final MP4 carry identical content; the residual is quantization.
Receipt: `validation/wb-parity/wb-preview-parity-2026-11-24.json`
(gitignored). The budgets were set from the codec experiment BEFORE the
harness's passing run — the passing numbers landing under the ceiling is
the validation, not the calibration target.

## 2. The cross-run byte-stability finding (recorded honestly)

Re-running the full W1 benchmark on the same machine around the P1-F
render.ts refactor (setup extraction — behavior-identical by
construction):

- **16:9:** sampled frame hashes byte-identical pre/post; the in-run
  determinism double-run pin IDENTICAL. (The committed 16:9 claim
  unchanged.)
- **9:16:** sampled hashes byte-identical across the two later runs; the
  FIRST chromium launch of the day (cold fontconfig/browser caches) was
  an outlier at 2 samples + 2 seams until caches warmed.
- **1:1 (NEW finding):** sub-perceptual cross-LAUNCH antialiasing
  flicker — a handful of edge pixels flip per sampled frame
  (darkRatio stable to 5 dp, meanLuma to 3 dp, ≤ ~12 px of 1,036,800).
  NOT a content movement; QC lenses, ink statistics and scene frame
  counts unaffected (GATE GREEN, 912/912 frames). The cross-run sampled
  pin has only ever claimed 16:9 — that claim is unchanged, and the 1:1
  behavior is now RECORDED rather than discovered by a future session.
  Candidate follow-up (not silently shipped here): extend the determinism
  pin to a per-run double-render on all three aspects plus a
  sub-perceptual band for cross-run comparisons.

## 3. What this addendum does NOT claim

- It does not extend the determinism pin beyond 16:9 (the committed law).
- It does not claim production-readiness (the human gate is open; D3–D6
  remain per the gap analysis).
- It does not modify the frozen benchmark authoring (project hashes
  byte-identical throughout — the S146 finding-3 law held).

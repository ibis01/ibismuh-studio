# Whiteboard Engine Excellence Program — Implementation Report (P0 Increments)

- **Branch:** `feat/whiteboard-excellence` (from verified main HEAD `facdd81`)
- **Base record:** `docs/whiteboard/excellence-baseline.md` + `excellence-gap-analysis.md`
  (Phase Zero, commit `2723ac3`)
- **Scope of this increment:** the gap analysis's committed steps 1–3 —
  **P0-A tail park** (`timing.ts`), **P0-B text lead-in bound**
  (`timing.ts` + `beat-plan.ts`), full gates re-run + full W1 benchmark.
- **Method:** failing-first unit tests (written and RUN against the pre-law
  code, recorded failing), then the smallest correction at the named seam,
  then the full gates, then REAL renders and frame-level visual inspection
  of the actual MP4s.

---

## 1. What changed (and what deliberately did not)

| File | Change |
| --- | --- |
| `src/lib/ibismuh/whiteboard/timing.ts` | **P0-A:** the `handAt` tail branch no longer holds the final stroke's endpoint; it GLIDES (eased lerp + sine pen-lift bump, zero at both joints — the W7 travel family) to a neutral park point below-right of the last stroke endpoint, clamped inside the board, and holds the REST pose there. New exports: `HAND_TAIL_GLIDE_MS` (800), `HAND_PARK_OFFSET` (190, 120), `HAND_PARK_MARGIN` (130), `handParkPoint()`. `handAt` gained an optional trailing `dims` param; `frameAt` passes the project's real dimensions (aspect-correct parking). **P0-B:** new `TEXT_LEAD_IN_MAX_FRAC` (0.45) + `boundTextLeadIn()` — the first text of a window starts no later than 45 % of the window; pre-text paths compress proportionally to their headroom above `MIN_PATH_MS`; the freed time re-enters the payload (integer-exact running-round distribution — the draw span's end is preserved to the millisecond). Wired into `scheduleScene`'s fill law. |
| `src/lib/ibismuh/whiteboard/beat-plan.ts` | `compileBeats` rides the SAME `boundTextLeadIn` (one law, two windows: the fill law's whole window and the beat's slice). Import added; the per-item scene-clock clamp order unchanged. |
| `scripts/test-unit.mts` | 5 new failing-first tests (P0-A ×2, P0-B ×3) + the S64 "resting at the end point" pin updated DELIBERATELY (pose/visibility preserved, position moved to the park law — per the gap analysis's stated test plan). |

**Not changed (the not-to-do list, held):** the frozen benchmark authoring
(`benchmark-scenarios.ts` — the S146 finding-3 law; its `projectHashes` are
byte-identical pre/post, see §4); no new animation grammar, no second clock,
no parallel compositor; no QC threshold, budget wall, or security gate
touched; no new dependencies (both fixes ride the existing `timing.ts` /
`beat-plan.ts` seams that the renderer and the editor preview share — the
one-source law holds, both surfaces heal together).

## 2. Failing-first evidence (the tests were written first and FAILED)

`node --import tsx scripts/test-unit.mts` against the pre-law code
(recorded run, `/tmp/unit-before.log`): **1040 passed, 5 failed** — exactly
the five new tests, nothing else:

- `excellence P0-A: the tail hand glides to a park point OFF the ink…` —
  `handParkPoint is not a function` (the law did not exist) — and the
  portrait frameAt test failed on `the parked hand cleared the portrait
  stroke's end` (the tail held the endpoint: the defect, reproduced).
- `excellence P0-B: text starts within the lead-in bound…` — the fixture's
  text entered at **4588 ms** (past the 2965 ms bound); the beat-compiler
  fixture at **4036 ms** — the D2 shape, reproduced in both entry paths.

After the implementation: **1045 passed, 0 failed.**

## 3. Gates on this machine (2026-11-24, post-implementation)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS (exit 0) |
| `npm run lint` | PASS (0 findings) |
| `npm run lint:budget` | PASS (0 errors / 0 warnings vs baseline 0) |
| `npm run test` | **1045 passed, 0 failed** (1040 pre-existing + 5 new) |
| `npm run test:whiteboard-trace` | 25 passed, 0 failed |
| `npm run test:whiteboard-profiles` | 22 passed, 0 failed |

Key pins that prove the blast-radius claims:

- **Paths-only byte-identity (P0-B's W4-pin guarantee):** the S64
  `scheduleScene` fill-law numbers (4240 / +220 / end at HOLD boundary)
  are re-pinned UNCHANGED at the new arithmetic, and `boundTextLeadIn`'s
  own contract test pins identity for no-text / leading-text /
  within-bound / no-headroom inputs.
- **The W7 tail pose pins keep their intent:** `pose: "rest"` +
  `visible` preserved (the park law moved only the POSITION).
- **Determinism:** the W1 benchmark's double-run pin (§4) is IDENTICAL
  through both new laws.

## 4. Render receipts (the actual MP4s, not previews)

Full run: `node --import tsx scripts/w1-whiteboard-benchmark.mts`
(3 aspects + the 16:9 determinism re-render + the blind kit). Receipt:
`validation/w1/w1-whiteboard-baseline-2026-11-24.json` (gitignored per the
535c90e law); the tables below are the committed citation.

| Aspect | Frames | Wall (2 cores) | QC (12 measurable lenses) | Gate |
| --- | --- | --- | --- | --- |
| 16:9 (1920×1080) | 912/912 | 82.9 s | 12 pass + cut-alignment unmeasured (by design, unchanged) | GREEN |
| 9:16 (1080×1920) | 912/912 | 81.5 s | 12 pass + unmeasured | GREEN |
| 1:1 (1080×1080) | 912/912 | 51.9 s | 12 pass + unmeasured | GREEN |

- **Determinism pin: IDENTICAL** — the re-render's sampled raw-frame
  SHA-256s and per-scene frame counts match run 1 exactly.
- **Frozen-definition integrity:** the benchmark authoring is untouched;
  the run's `projectHashes` equal the committed W1 baseline byte-for-byte
  (16:9 `48823755…`, 9:16 `674ea3db…`, 1:1 `c745ea60…`). The SAMPLED FRAME
  hashes move — **by design** — on exactly two clocks: (a) the phrase
  scene's text now writes earlier and slower (P0-B), (b) the tails' hands
  now glide to their parks (P0-A). The frame-byte movement policy of the
  baseline §3 applies: ink statistics stay in-band, the blind kit covers
  the moves, and no "silent flip" occurred (the moves are pinned in the
  unit battery and receipted here).

### P0-A receipts — the tail park, seen in pixels

| Evidence | Before (D1) | After |
| --- | --- | --- |
| 16:9 final frame (t = 37.92 s) | the open hand parked ON the rocket's body/fin — the video's longest-lived composition clobbered | hand PARKED below-right of the rocket; the badge, rocket, window and flame fully readable |
| 9:16 final frame | same defect on the portrait board | parked off the ink, in-board (the clamp law at 1080×1920) |
| Conclusion last pen event ends (scene-local) | — | 3910 ms → the 800 ms glide finishes at 4710 ms, deep inside the 3000 ms hold; the hand settles parked well before the cut |

### P0-B receipts — the phrase text enters on time

Engine schedule receipt for `w1-phrase` (7000 ms, `beatSceneEvents`,
scene-local ms):

| Item | Before (D2) | After |
| --- | --- | --- |
| `cc-box` | 400 + 1984 | 400 + 1156 |
| `cc-box-od` | 2514 + 1969 | 1686 + 1149 |
| `cc-big` (headline) | **4613** + 455 | **2965** + 1008 |
| `cc-small` | 5198 + 902 → 6100 | 4103 + 1997 → 6100 |

- The headline now starts at **2965 ms = 42.4 % of the scene** (was 66 %) —
  exactly the bound (`400 + 0.45 × 5700`); the narration's "sixty to one
  hundred" lands while the number is still being written.
- The headline writes 455 → 1008 ms (the freed container time re-entered
  the payload — the words write slower instead of leaving dead air).
- The span end is preserved EXACTLY (6100) — the fill law's QC contract
  (frozen-frames/static-shots) is untouched.
- The container strokes compressed 1984/1969 → 1156/1149 ms — both above
  the `MIN_PATH_MS` floor (the per-item floors held, pinned).
- Visual: at t≈27.5 s the box is drawn and "60-1…" is already writing with
  the hand riding the baseline; at t≈30.5 s "60-100 / beats every minute"
  completes with the hand mid-line — 900 ms of hold before the cut.

## 5. Known limitations carried forward (honest, unchanged)

1. A stroke ending very near a board corner clamps its park to the board
   margin — the hand sits as far below-right as the board allows, which
   can be close to the endpoint. Correct-by-law (in-board beats
   off-board); visible on neither benchmark aspect.
2. `boundTextLeadIn` binds the FIRST text of a window; later texts follow
   sequentially. Scenes whose payload text is not the first post-path item
   keep the old rhythm (none in the benchmark).
3. If a scene's real hold (VO-measured) is shorter than 800 ms, the glide
   is cut mid-flight by the scene cut — continuous by construction, and
   more natural than a frozen park.
4. D3 (typeset text), D4 (portrait dead margins), D5 (uniform urgency),
   D6 (no mid-scene occlusion rules) remain OPEN — they are steps 4–6 of
   the gap analysis's sequence, gated on this receipt and the human track.

## 6. Human gate status

NOT EXECUTED — unchanged from the baseline: the ≥3-scorer ≥4/5 blind gate
is pending; the blind kit was regenerated from these renders
(`validation/w1/blind/`, 3 codenamed finals + per-scene-type sheets). See
`excellence-human-evaluation.md`. No AI proxy scores were produced.

## 7. Rollback

The increment is two commits on `feat/whiteboard-excellence` (implementation,
then reports) — revert the implementation commit (`git revert <impl-sha>`)
to restore the pre-law schedule and tail exactly; the failing-first pins
revert with it. `main` is untouched throughout.

---

# Increment 2 (2026-11-24): the P1-F preview-vs-final parity harness

- **Scope:** gap-analysis step 4 — PROVE the one-source law at the pixel
  level. Additive: a PURE metric module, an additive harness script, the
  render loop's page setup EXTRACTED (not rewritten), two failing-first
  pins. No schedule, applier, or QC behavior changed.
- **Method:** failing-first (the two pins ran against the pre-law code:
  `parity` unresolvable, no `setupScenePage`, no harness — recorded
  failing), then the smallest implementation, then the full gates, then
  REAL renders: the harness (30 samples across the frozen W1 16:9
  project) and the full W1 benchmark (byte-identity proof of the
  refactor).

## 1. What changed

| File | Change |
| --- | --- |
| `src/lib/ibismuh/whiteboard/parity.ts` | NEW — the PURE parity metric: `compareFrameRgb` (mean |Δ|, over-tolerance fraction, worst channel, the 8×8 tile concentration lens, byte-identical shortcut, length-mismatch honesty) + `parityVerdict` (named-budget FAIL reasons). No fs/child_process/browser/clock — the purity is source-pinned. |
| `src/lib/ibismuh/whiteboard/render.ts` | The render loop's page-setup pass (defs root, hand poses, index maps, dasharrays, fade markers) EXTRACTED VERBATIM into `export async function setupScenePage(page, args)`; the loop calls it inside the unchanged S165 compose gate. One setup, two callers — the wb-page one-source law extended one seam outward. |
| `scripts/wb-preview-parity.mts` | NEW — the harness: builds the frozen W1 project, renders the final through `renderWhiteboard`, re-drives THE SAME compose + setup + applier standalone at sampled timestamps (deterministic sample plan: 10/30/50/70/90 % + the exact final frame), decodes both sides to raw RGB (ffmpeg — no new dependencies), diffs through the pure metric, writes the receipt to `validation/wb-parity/` (gitignored), exits non-zero on FAIL. |
| `scripts/test-unit.mts` | 2 failing-first tests: the metric's contract (identical → 0; codec-band noise → PASS; a concentrated ink block → FAIL naming the tile; length mismatch → never a fake pass) and the ONE-setup law (both callers ride `setupScenePage`; the harness carries no dasharray/defs copy; the purity pins). |

**Not changed:** the scheduler, the applier (`wb-page.ts`), the QC
battery, the benchmark authoring, any budget wall. No new dependencies
(ffmpeg and playwright were already the engine's hard dependencies).

## 2. Failing-first evidence

The two new tests ran against the pre-law code: **1045 passed, 2 failed**
— exactly the two, nothing else (`Cannot find module …/parity` and
`ENOENT scripts/wb-preview-parity.mts`). After the implementation:
**1047 passed, 0 failed.**

## 3. The codec calibration (a controlled experiment, NOT tuning to green)

The harness's first run RED on 12/30 samples (2.0–3.4 % over-tolerance,
means ≤ 0.385) — the failures clustered on the text-heaviest scenes.
Before touching any budget, the codec-only twin was measured: the SAME
preview PNG pushed through the engine's exact finishing chain (JPEG q92 →
H.264 crf19/yuv420p → decode) against itself, three text-dense frames:

| Lens | Codec-only ceiling (identical content) | Budget set | Headroom |
| --- | --- | --- | --- |
| mean \|Δ\| | 0.23–0.55 | 3 | ~5–13× |
| frame over-tolerance | up to 3.62 % | 6 % | ~1.7× |
| worst 8×8 tile | up to 36 % | 50 % | ~1.4× |

The first-run "failures" (≤ 3.4 %) sit BELOW the codec ceiling — codec
edge quantization on ink boundaries, not divergence. The recalibration is
receipted here and in `parity.ts`'s own doc block; the tile lens was
ADDED in the same slice because the frame fraction alone cannot separate
scattered codec edges from a small missing element (concentration can).

## 4. Render receipts (the real MP4s)

- **Parity harness:** `node --import tsx scripts/wb-preview-parity.mts`
  → **GATE GREEN, 30/30 samples inside the codec band** (16:9, 5 scenes ×
  6 samples). Worst mean |Δ| **0.385** (budget 3), worst over-tolerance
  **2.09 %** (budget 6 %; codec ceiling 3.62 %), worst tile **34.5 %**
  (budget 50 %; codec ceiling 36 %). Every real-diff number lands BELOW
  the codec-only ceiling — the two surfaces carry identical content.
  Receipt: `validation/wb-parity/wb-preview-parity-2026-11-24.json`
  (gitignored; preview PNGs retained on disk).
- **The refactor's byte-identity:** the full W1 benchmark re-run
  post-extraction — 16:9 sampled frame hashes **byte-identical** to the
  pre-refactor run on this machine, and the in-run determinism double-run
  pin **IDENTICAL**. 9:16 sampled hashes also byte-identical across the
  two later runs. **Finding recorded honestly:** the 1:1 aspect shows
  sub-perceptual cross-LAUNCH antialiasing flicker (≤ ~12 edge pixels per
  sampled frame; darkRatio stable to 5 dp, meanLuma to 3 dp; the FIRST
  chromium launch of the day was also an outlier at 9:16 until caches
  warmed). The W1 cross-run pin only ever claimed 16:9 — unchanged. The
  QC lens outcomes and ink statistics are unaffected on all aspects
  (GATE GREEN, 912/912 frames each).

## 5. Gates on this machine (2026-11-24)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` / `lint:budget` | PASS / within budget (0/0) |
| `npm run test` | **1047 passed, 0 failed** |
| whiteboard-trace / whiteboard-profiles | 25/25 · 22/22 |
| **`npm run check` (full chain, single run)** | every battery PASS; the one exit-1 was `alert:probe`'s fresh-clone precondition (missing `IBISMUH_STUDIO_AUTH_SECRET`/`ENCRYPTION_KEY`) — provisioned per `.env.example` for the probe invocation only, then **HEALTH 0 failed**. No code failure anywhere in the chain. |

## 6. Adopted guidance (the operator's reference review, filed as
`docs/whiteboard/reference-review-2026-11-24.md`)

The review's Sprint 2 "preview/final parity" is THIS increment. Its
"text as handwriting/glyph strokes" is step 5's P1-C; its "draw-speed
calibration" is step 6's P2-E; its drawable-IR / stage-fingerprint /
editor-control sprints are adopted as the post-step-6 backlog (they ride
the same protected seams — no framework adoption, no new dependencies).

## 7. Known limitations carried forward (honest)

1. Defects SMALLER than the codec band (a single short word, ~1–2 % of
   frame) ride near the frame-level lens — the tile lens catches their
   concentration, and the unit battery + W1 hashes pin the schedule
   itself; parity is one gate in a defense-in-depth chain, not the only
   one.
2. The tile lens runs only when the caller supplies frame dims (the
   harness does; pure unit fixtures ride the frame budgets alone).
3. The parity harness samples (not exhausts) frames — 6 deterministic
   samples per scene on the frozen W1 project; the sampled set pins the
   applier at the draw seams, the text-write seams, and the tail park.
4. D3 (glyph text), D4 (portrait utilization), D5 (natural-speed pacing),
   D6 (mid-scene occlusion rules) remain OPEN — steps 5–6 of the gap
   analysis's sequence; the human blind gate remains PENDING (kits ready).

## 8. Rollback

Two commits (implementation, then reports) on `feat/whiteboard-excellence`
— `git revert` restores the pre-harness tree exactly; `parity.ts` and the
harness leave with it, and the render loop's setup returns inline (the
extraction commit reverts cleanly — the loop block is verbatim-identical).

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

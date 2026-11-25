# Whiteboard Engine Excellence Program — Gap Analysis & Implementation Sequence

- **Date:** 2026-11-24 · **Branch:** `feat/whiteboard-excellence` · **Base:** main @ `facdd81`
- Companion: `docs/whiteboard/excellence-baseline.md` (the evidence this analysis cites).
- Law of this document: every defect below is either (a) already recorded upstream
  (cited), or (b) newly confirmed in THIS session's rendered pixels with a
  reproducible timestamp. Nothing is speculative. Priorities weigh perceptual
  impact × evidence strength × implementation risk.

---

## 1. Prioritized defect register

### P0-A — The tail rest parks the hand on the finished ink (D1)

- **Observed:** conclusion scene, t≈36.5–38 s (16:9) and the final frame: the open
  hand rests ON the rocket's ink. The video's last frame — the one every viewer
  sees longest — shows a hand clobbering the drawing.
- **Responsible module:** `src/lib/ibismuh/whiteboard/timing.ts` — `handAt`'s tail
  branch: `return tail ? { ...tail, pose: "rest" } : hidden` — holds at the final
  stroke's endpoint (on the ink, by definition).
- **Upstream record:** S146 finding 2 ("the hand rests INSIDE the conclusion
  rocket"); W7 shipped the pen-up TRAVEL half of the directive's §8, not the rest
  half.
- **Fix (smallest correction):** after the last stroke completes, the hand GLIDES
  (eased, bounded, deterministic — the same travel family W7 uses) to a neutral
  park point offset from the last stroke end — below-right by a fixed lift, clamped
  inside the board with the hand's own margin — and holds the rest pose there. The
  camera drift keeps the QC lenses fed; the hand stays visible (no static-tail
  regression).
- **Tests (failing-first):** the tail hand position clears the last stroke endpoint
  by the park distance after the glide window; the glide is joint-continuous
  (no teleport, bounded deltas); determinism (byte-identical double-run); the park
  stays in-board per aspect (frameAt passes the project's real dimensions); the
  existing "tail holds rest" pin is updated deliberately (pose/visibility preserved,
  position moved to the park law).
- **Blast radius:** `timing.ts` one branch; the editor rides the same `frameAt`
  (one source — both surfaces heal together). The W1 benchmark's tail frames move
  by design; the blind kit covers it.

### P0-B — Key-phrase text enters at 66 % of its scene (D2)

- **Observed:** engine schedule receipt for `w1-phrase` (7000 ms): container
  strokes 400→4483 (58 %), first word at **4613 ms (66 %)**, last text clamped at
  the scene edge. The narration speaks the number at ~50–65 %.
- **Responsible module:** `src/lib/ibismuh/whiteboard/beat-plan.ts` `compileBeats`
  + `timing.ts scheduleScene`'s fill law: text items ride the sequential queue
  after paths; the uniform fit factor stretches everything to the window's right
  edge; `MAX_PATH_MS = 2600` + the S139 retrace pass (0.45 weight) let container
  strokes dominate.
- **Upstream record:** S146 finding 1 — "the beat layer's hold/lead-in arithmetic
  is the fix."
- **Fix (smallest correction):** bound the text lead-in inside a beat window: text
  items must START no later than a fixed fraction of the window (key-phrase-class
  beats: the text is the payload, the container is the support). Pre-text paths
  compress proportionally to their headroom above `MIN_PATH_MS`; the freed time
  re-enters the payload (the words write slower instead of leaving dead air).
  Paths-only windows are byte-identical by construction (the law is a no-op
  without text items) — the W4 hard pin's intent is preserved and restated at the
  new arithmetic.
- **Tests (failing-first):** the phrase-shaped fixture's text start ≤ the bound;
  paths-only windows compile byte-identically; no overflow past the scene clock;
  determinism; per-item floors hold.

### P1-C — Production text is never handwriting (D3)

- **Observed:** every rendered text surface in the benchmark (title, phrase card)
  is a typeset face with a mask wipe; the glyph-outline mode exists, registered,
  proven — and unused by every production asset.
- **Responsible module:** asset metadata (`textMode`) + the starter library +
  the native/LLM planners' asset choices.
- **Fix (designed, needs a slice):** opt label-role text assets into
  `textMode: "glyph"`; the planners prefer glyph-capable label assets when the
  face covers the text's charset; the two-level fallback (per-text, per-asset)
  already exists. Readability wall re-verified per aspect.
- **Risk:** moves every text-bearing render by design; changes weight math (glyph
  paths are drawable strokes). MUST ride the blind kit, not a silent flip.
- **Decision:** schedule AFTER P0-A/P0-B receipts, on the human-gate track.

### P1-D — Portrait dead margins (D4)

- **Observed:** 9:16 title/process scenes sit high with the lower half empty; the
  phrase card lands low with the top empty.
- **Responsible module:** the per-aspect authored placements (benchmark) and the
  planner's slot tables (`whiteboard-planner.ts`); cameraless scenes never
  re-frame.
- **Fix (planner-side only):** portrait slots re-centred around the vertical
  golden band; a utilization-aware slot scale for single-subject scenes
  (content bbox vs board area, bounded). The frozen benchmark is deliberately
  NOT edited (the S146 finding-3 law); the improvement lands in the PLANNER so
  planner-authored videos benefit, with the five-subject suites as receipts.

### P2-E — Uniform stroke urgency (D5, coupled to P0-B)

- **Observed:** the fill law paces work to the window's right edge (a box drawn
  over ~4 s); natural drawing speed is not modeled.
- **Constraint:** the QC lenses (frozen-frames/static-shots) punish early
  finishes — the fill-to-window law is load-bearing. A natural-speed law must
  land WITH a hold-state motion floor (the W5 pattern: the directedBreath/
  closing-move lesson — static tails fail the lenses). This is a design-level
  slice, specified after P0-B's receipts measure how much lead-in compression
  alone buys.

### HUMAN / BLOCKED (not implementable autonomously)

| Item | Blocker |
| --- | --- |
| Blind ≥4/5 release gate (W1 rubric §1; S162 round 2) | ≥3 human scorers; kits are ready and re-based on current main |
| Real-VO end-to-end anchor receipt (E6) | TTS/ASR credentials + a staging run |
| Preview-vs-final pixel-diff harness (baseline §4) | implementable next; needs a render-lane harness slice |

## 2. Proposed implementation sequence (evidence-driven increments)

| Step | Increment | Failing-first test | Render receipt after |
| --- | --- | --- | --- |
| 1 | **P0-A tail park** (`timing.ts`) | park-distance + glide continuity + in-board + determinism | W1 16:9 + 9:16 spot — final-frame inspection: hand OFF the rocket |
| 2 | **P0-B text lead-in** (`beat-plan.ts`) | text-start bound + paths-only byte-identity | W1 16:9 — phrase text starts within the bound; phrase-receipt probe before/after |
| 3 | Full gates re-run (typecheck, lint, unit, trace, profiles) + full W1 benchmark | the updated pins | fresh receipt + contact sheets; frame-byte movement policy recorded |
| 4 | P1-F preview-vs-final pixel-diff harness (additive script) | harness self-check | per-scene diff receipt |
| 5 | P1-C/P1-D glyph text + portrait utilization (blind-kit-gated) | charset/fallback/slot pins | before/after kit for the human gate |
| 6 | P2-E natural-speed pacing (+ motion floor) | speed-law pins + QC lenses | five-subject re-render receipts |

Steps 1–3 are the committed implementation scope of this program; steps 4–6 are
specified and sequenced, gated on the step 1–3 receipts and the human track.

## 3. What will NOT be done

- No change to the frozen benchmark authoring (S146 finding-3 law).
- No new animation grammar, no second clock, no parallel compositor, no new
  dependencies — all fixes ride existing seams (`timing.ts`, `beat-plan.ts`,
  `whiteboard-planner.ts`).
- No QC threshold, security gate, or budget wall weakened to obtain a green.
- No AI-generated scores substituting for the human gates.

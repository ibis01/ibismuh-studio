# S149 — the B4 substrate wiring — RECORD

| | |
|---|---|
| Stage | **S149** — the motion-graphics audit's Phase B, item B4: the dormant anim substrate wakes — the gait walk compiles gait-driven leg rows, the IK reach solves the rig's own chain, and the graphics camera gains the validate-once discipline behind the S130 keys |
| Design record | `docs/design/s149-substrate-wiring.md` (Rev 1) |
| Audit basis | `2026-11-16-motion-graphics-engineering-audit.md` §7 Phase B, item B4 (the file-by-file plan, executed verbatim) |
| Result | **LANDED.** Battery **860 passed, 0 failed** (852 + the S149 suite's eight tests). typecheck + lint clean. billing 40/0, storage PASS, rate PASS, scene-revisions 29/0, drill RTO 65 ms. |
| Law | No second renderer, no second clock, no grammar growth: the walk and the reach compile into the EXISTING inline-joint row machinery (the mocap lane's rows); the renderer, the FK math and the doc grammar are untouched; the phase-rides-distance and refuse-not-clamp laws ride from the substrate verbatim; byte-identity pinned for walkless narrations and reachless plans. |

## 1. What landed

- **`characters/locomote.ts` (NEW, pure)** — the locomotion rung:
  - the walk tuning table (`WALK_TUNING`: cadence 1.5 strides/s, stride 180 stage px, sweep ±24°, lift 26 px, row step 110 ms) — ONE table, the pins read it;
  - the tight walk lexicon (`sentenceWalks` — walk/stroll/stride/march/step families, word-boundary matched; "moves the part", "runs the pipeline", "cross-fades" stay gestures);
  - `walkPhaseAt` — the phase-rides-distance law's call site: the body's distance model feeds `gaitPhaseAt`, the clock rides the signature only;
  - `walkLegJoints` — BOTH leg channels derive from `footArcAt(phase, 1)`: the sweep rides the arc's x (one full cos oscillation per stride, continuous across the wrap), the lift rides the arc's y (stance lift EXACTLY zero, swing on the sine arc);
  - `planWalkRows` — stride-keyed samples on the EXISTING inline-joint row shape + ONE home rest row;
  - `armChainOf` / `reachPose` — the chain read from the rig's OWN pivots (the art IS the rest), `solveTwoBone` with the elbow-hanging-down pole, the FK composition law converting absolute bone angles into the parts' local deltas (the child inherits the parent's rotation), refuse-not-clamp on every degeneracy.
- **`characters/rig-director.ts`** — the substrate rungs in the ladder's order: authored mocap (the render hook's branch) > reach beats (`RigDirectorInput.reaches`, compiled FIRST, each owning its MIN_GESTURE_MS window, gesture rows suppressed inside) > the gait walk (a sentence whose own words name a walk, on a legged rig, REPLACING that sentence's gesture pair; a walk that cannot fit the compile wall falls through to the gesture pair) > the gesture table > rest. Byte-identity: walkless narrations and reachless plans compile byte-identical timelines.
- **`graphics/camera.ts`** — `validateGraphicsCameraKeys`: the `anim/camera.ts` validateCameraMove discipline mapped onto the S130 vocabulary — non-empty, finite fields, closed-table ease, ≥ 0 and strictly ascending, zoom inside `CAMERA_BOUNDS`, every refusal NAMED. Parity, not identity: the vocabularies differ by design; the DISCIPLINE is what adopted.
- **`graphics/render.ts`** — the wire: `renderGraphics` validates every scene's camera ONCE after the preflight wall, before chromium launches — the engine-bug tripwire that turns a silent desync into a named refusal; cameraAt stays hot and trusts; a doc that passed parseCamera passes byte-identically.

## 2. The pins (the S149 suite, eight tests)

1. **The phase law at the call site**: `walkPhaseAt(0) = 0`, one second of genuine translation = cadence strides, two = twice the distance — the bare clock moves nothing.
2. **The walk arc IS footArcAt**: for every compiled row the lift reads `−liftPx · arc.y` (stance EXACTLY zero) and the sweep reads `sweepDeg · cos(2π·arc.x)`; the legs ride anti-phase (their angles sum to 0 at every sample); the first row plants at heel strike (+sweepDeg, lift 0); the beat ends on a home rest row; the compile is byte-identical on repeat.
3. **The lexicon is tight**: walk-words fire on word boundaries; the near-miss sentences ("moves the part", "runs the pipeline", "cross-fades") do not; a legless rig + a walk narration compiles the legacy gesture output (no inline joints) while the legged rig walks the same sentence.
4. **The wall holds**: alternating walk/gesture narrations stay inside `RIG_BUDGETS.timelineRows` with time-ascending rows; an oversized walk (20 s window = 183 rows) deterministically falls through to its gesture pair.
5. **The reach is real IK**: the solved deltas round-trip the hand EXACTLY onto the stage target on the rig's own geometry (within 1e-6); the director compiles the reach row (inline joints at the beat) + its home rest row (at + MIN_GESTURE_MS); no reaches → byte-identity.
6. **The reach refuses honestly**: unreachable (never clamped onto the boundary), on-shoulder degenerate, missing-hand chain (no invented bones) all return null; the plan still compiles; a reach owns its window (no gesture row lands inside).
7. **Walks and gestures coexist deterministically.**
8. **The camera parity**: `validateGraphicsCameraKeys` refuses empty / non-finite / closed-table-junk ease / un-ascending / out-of-domain zoom with named messages, accepts a valid S130 list; the anim validator refuses the SAME taxonomy (empty / non-finite / un-ascending) on the world-space vocabulary; the render seam carries the validator (source-pin).

## 3. The honest boundary (what S149 deliberately does NOT do)

- **No renderer change**: `rig-render.ts`, `rig-compose.ts`, `rig-frame.ts` are untouched — the walk and the reach ride the rows the renderer already consumes.
- **No grammar**: nothing rides the doc; `reaches` is a director input; the lexicon and tuning never leave the compile seam.
- **No authored-mocap demotion**: the BVH ladder's top rung outranks the compiled walk exactly as it outranks the gestures today.
- **No Studio UX yet**: the reach beats and the walk lexicon are compile inputs; the authoring seats that drive them are Phase C2/D3 (the audit's own sequencing).
- **No world-space camera adoption**: `projectPoint`'s parallax vocabulary stays the Phase-E future; what adopted is the validator DISCIPLINE, not the math.

## 4. Where this leaves the audit's phases

Phase A: A3 + A4 landed (6a1dfb5); A1/A2 remain the humans' gates. Phase B: **B1–B5 ALL LANDED** (S148 + S149) — the phase is closed at the code level. Next per the audit's sequencing: **C1 (typography stack) → C2 (tween/camera/event authoring UX)**, then D1/D2/D5, E1–E4, C3–C6, F, G, E5.

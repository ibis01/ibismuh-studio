# S149 — the B4 substrate wiring — design record

| | |
|---|---|
| Stage | **S149** — the motion-graphics audit's Phase B, item B4: the dormant anim substrate (`anim/gait.ts`, `anim/ik.ts`, `anim/camera.ts`) becomes the K1 rig director's compile-time vocabulary and the graphics camera gains the validate-once discipline |
| Audit basis | `2026-11-16-motion-graphics-engineering-audit.md` §7 Phase B, item B4 (file-by-file plan, verbatim): "K1 rig renderer consumes `anim/gait.ts` + `anim/ik.ts` for locomotion rungs (gait phase drives leg pose rows; IK for reach poses); `anim/camera.ts` adopted as the graphics camera's long-term vocabulary (non-breaking: introduce as the validator behind S130 keys)." |
| Predecessor | S148 (MG-1: easing table, stagger, 3D ease field, preset registry) — B1/B2/B3/B5 landed; B4 deferred by that record as "its own slice, sequenced after B1–B3" |
| Result | see `docs/audits/s149-substrate-wiring.md` (written after the battery runs) |

## 1. The laws this slice obeys (inherited, restated)

1. **No second renderer, no second clock, no grammar growth.** The walk and
   the reach compile into the EXISTING `RigPoseRow` machinery — the inline
   `joints` rows the authored-mocap lane already ships (S125 K1-ext, S136's
   binding law). Nothing rides the doc; the FK math stays in `rig-frame.ts`
   and nowhere else; the renderer (`rig-render.ts`) is untouched byte for
   byte.
2. **The phase-rides-distance law** (`anim/gait.ts` verbatim): the leg
   cycle advances ONLY by the body's own covered distance —
   `gaitPhaseAt(params, distance, t)` receives the distance model, never
   the bare clock. The walk beat's body model: it covers
   `cadence · elapsedSec · strideLength` stage px — a genuinely translating
   body, so `phase = distance / strideLength` exactly. The law's forbidden
   shape (`distance/stride + cadence·t`, the legs sprinting while the body
   stands) is structurally unreachable: there is no code path that adds
   time to the phase.
3. **Refuse-not-clamp** (`anim/ik.ts` verbatim): an unreachable, degenerate
   or missing-chain reach returns `null` — the director degrades to the
   gesture table's honest rest and the plan still compiles. The solver
   never clamps a lie onto the reach boundary, and the director never
   launders a refusal into a pose.
4. **Purity (S64)**: `characters/locomote.ts` is PURE — no fs, no clock, no
   randomness, no globals. Same inputs → byte-identical rows, always.
5. **The byte-identity law** (the audit's own B2 precedent): narrations
   without walk words and plans without reach beats compile byte-identical
   timelines. The existing S125 planner pins ARE the byte-identity proof —
   their fixtures carry no leg parts and pass no reaches, so the new paths
   never fire on them; the new suite pins the lemma directly.
6. **Compile-only** (the rig-director law, decision §10.1): beats are a
   planning artifact that dies at the renderer. The walk lexicon, the reach
   beats and the tuning table never reach the validator, the doc, or the
   schema.

## 2. File-by-file plan (the audit's B4, executed)

### 2.1 `characters/locomote.ts` (NEW — pure, the locomotion rung)

- **The walk tuning table** (`WALK_TUNING`): cadence 1.5 strides/s
  (explainer tempo), stride 180 stage px, sweep ±24°, lift 26 px,
  row step 110 ms. ONE table; the pins read it; nothing else carries magic
  numbers.
- **The walk lexicon** (`sentenceWalks`): word-boundary matches on the
  lowercased sentence — deliberately TIGHT (`walk/walks/walking/walked`,
  `stroll*`, `stride*`, `march*`, `step*`). A word that only sometimes
  means walking ("moves the part", "runs the pipeline", "cross-fades")
  must not steal the window — the byte-identity law's lexical half.
- **`walkPhaseAt(elapsedMs)`**: the phase-rides-distance law's call site —
  the body's distance model feeds `gaitPhaseAt`; the clock rides the
  signature only.
- **`walkLegJoints(phase)`**: BOTH leg channels derive from
  `footArcAt(phase, 1)` — the sweep rides the arc's x
  (`sweepDeg · cos(2π·x)`, one full oscillation per stride, continuous
  across the wrap), the lift rides the arc's y (`−liftPx · y`; stage y
  grows downward, so up is negative). Stance lift is EXACTLY zero
  (footArcAt's contract); swing lift rides the sine arc; the right leg
  rides `phase + 0.5` (anti-phase by construction).
- **`planWalkRows(beat, legIds)`**: stride-keyed samples across the walk
  window on the EXISTING inline-joint row shape, ONE trailing rest row at
  the beat's end (the legs tween home over the POSE_TWEEN window). Rows
  are time-ascending; the wall is the director's business (§2.2).

### 2.2 `characters/rig-director.ts` (the walk + reach compile)

- `RigDirectorInput` grows the additive optional
  `reaches?: RigReachBeat[]` (`{ atMs, target {x,y}, arm }`) — planning
  input, never doc grammar; absent → byte-identical.
- **Reach beats compile FIRST** (senior to the sentence loop): each beat's
  pose comes from `reachPose` (IK on the rig's OWN chain geometry — bone
  lengths and rest directions read from the pivots, the art IS the rest);
  a solved reach pairs with a rest row at `atMs + MIN_GESTURE_MS` so the
  pose holds honestly and tweens home; the gesture loop skips sentence
  rows inside a reach's window (a reach owns its 240 ms).
- **The walk rung** in the sentence loop: a sentence whose OWN words name
  a walk (`sentenceWalks`) AND a rig carrying `leg-l` + `leg-r` parts
  compiles `planWalkRows` for the sentence's window INSTEAD of the gesture
  pair. The full walk must fit the compile wall (`RIG_BUDGETS.timelineRows`)
  — a walk that doesn't fit falls through to the gesture table (the honest
  smaller beat, deterministic). A legless rig skips the walk entirely (the
  gesture table owns the sentence — the existing behavior, byte-identical).
- The compile wall, the MIN_GESTURE_MS floor, the classifier, the mouth
  schedule: all unchanged. The ladder stands: authored mocap > walk/reach
  beats > compiled gestures > rest — the render hook's authored-timeline
  branch (render.ts) still outranks everything compiled here.

### 2.3 `characters/locomote.ts` — `reachPose` (the IK rung)

- **`armChainOf(rig, armSlot)`**: the chain from the rig's own pivots —
  upper = ‖arm pivot → forearm pivot‖, fore = ‖forearm pivot → hand
  pivot‖; rest directions from the same vectors; requires arm + forearm +
  hand parts (a two-part arm degrades — no invented bones).
- **`reachPose(rig, beat)`**: `solveTwoBone` on the chain-local target
  (shoulder at the origin), the pole hanging the elbow DOWN (the resting
  arm carriage — the deterministic choice; a pole riding the line keeps
  the solver's CCW tie-break). The solved absolute bone angles convert to
  the parts' `rotateDeg` deltas with the FK composition law: the forearm's
  LOCAL delta = absolute fore angle − rest fore angle − upper delta (the
  child inherits the parent's rotation). The pin recomputes the hand's
  stage position from the rest pivots + the deltas and lands EXACTLY on
  the target (fkTwoBone round-trip on real rig geometry).

### 2.4 `graphics/camera.ts` — `validateGraphicsCameraKeys` (the parity rung)

- The `anim/camera.ts` `validateCameraMove` discipline mapped onto the S130
  vocabulary: non-empty; every `tMs/zoom/tx/ty` finite; keys ≥ 0 and
  strictly ascending; zoom inside `CAMERA_BOUNDS`; every refusal NAMED
  (the key index, the field, the value — never a bare "invalid").
- **Parity, not identity**: the vocabularies differ by design (the S130
  camera is scene-local {tMs, zoom, tx, ty}; the anim camera is world-space
  {t, x, y, z, fov, yaw, pitch}). What adopts is the DISCIPLINE — validate
  once at the engine seam, named refusals, then the hot sampler trusts
  (cameraAt's documented precondition). The world-space projection
  vocabulary (`projectPoint`) stays the Phase-E future for parallax/3D
  seats; this slice wires its validator SHAPE, not its math.
- **Wire** (`graphics/render.ts`): `renderGraphics` validates every
  scene's camera keys ONCE after the preflight wall, before chromium
  launches. A doc that passed `parseCamera` passes here byte-identically
  (the parser's warn-drops already shaped the keys) — this is the
  engine-bug tripwire, never a second admission gate.

## 3. What S149 deliberately does NOT do

- **No renderer change**: `rig-render.ts`, `rig-compose.ts`, `rig-frame.ts`
  are untouched. The walk and the reach ride the rows the renderer already
  consumes; the FK math is unchanged.
- **No grammar**: nothing rides the doc; `reaches` is a director input; the
  walk lexicon and tuning never leave the compile seam.
- **No authored-mocap demotion**: the BVH ladder's top rung outranks the
  compiled walk exactly as it outranks the gestures today (the render
  hook's authored-timeline branch is untouched).
- **No Studio UX yet**: the reach beats and the walk lexicon are compile
  inputs; the authoring seats that drive them are Phase C2/D3 (the audit's
  own sequencing).
- **No new easing, no curve change**: the easing table S148 sealed stays
  sealed; the walk's legs ride rows, not curves.

## 4. The pins (the battery's S149 suite)

1. **The walk arc is footArcAt's**: stance rows carry lift EXACTLY 0; the
   swing lift reads `−liftPx · footArcAt(phase, 1).y`; the sweep reads
   `sweepDeg · cos(2π·arc.x)`; the legs ride anti-phase (leg-r's angle at
   phase p equals leg-l's at p + 0.5); the beat ends on ONE rest row (the
   legs tween home).
2. **The walk lexicon is tight**: walk-words fire; "moves the part",
   "runs the pipeline", "cross-fades" do not.
3. **Byte-identity**: a legless rig + a walk narration compiles the legacy
   gesture output (the walk skips honestly); the existing S125 planner
   pins (walkless narrations, legless fixtures) pass untouched.
4. **The reach is real IK**: the solved deltas round-trip the hand EXACTLY
   onto the target on the rig's own geometry (fk round-trip within 1e-6);
   an unreachable target produces NO row and the plan still compiles; a
   two-part arm (no hand) degrades; a reach suppresses gesture rows in its
   window.
5. **The wall holds**: a long walk on a gesturing narration stays ≤
   `RIG_BUDGETS.timelineRows`, time-ascending, and the overflow sentence
   falls back to its gesture pair.
6. **Camera parity**: `validateGraphicsCameraKeys` refuses empty /
   non-finite / un-ascending / out-of-bounds zoom with NAMED messages; a
   valid S130 list passes; the render seam carries the validator
   (source-pin, the S125 P3 pattern).

# S125 — K1: the 2D character rig (real rigs, honest motion)

Design record for roadmap stage **K1** (§6 of `docs/audits/external-2d-animation-roadmap.md`),
executed as **S125** in the sN release order (K1 = S125, the external import lane = S126).
Implemented on `s124/element-editor` @ `43556c3`. This record is the implementation
contract; the roadmap §6 text stays the spec of record and is quoted, not re-spec'd.

## 0. What K1 is

> **Objective:** characters that actually move — poses, gestures, mouth shapes on
> narration, simple walk/turn cycles — deterministically and natively, consistent
> with the S93 honesty law ("the rig will not fake it" — K1 replaces stills with
> real art, so it CAN honestly animate them).

Two lanes:

- **K1-native (primary, $0 pixels):** a 2D puppet rig — identity-locked character
  art decomposed into layered parts (head, torso, arms, brows, mouth set), posed
  per frame by a pure function. Native-first law applied to characters.
- **K1-i2v (escalation, premium):** the existing i2v lane, unchanged in S125 —
  it already exists; K1 improves its position in the ladder (the rig outranks it
  for rigged characters) and nothing else. Prompt-contract improvements are a
  K1-ext tail, not this slice.

## 1. The scope decision (what ships in S125 vs. what waits)

§6 lists a per-video render hook and Phase-2 compositor citizenship together.
S125 ships the **scene-level** integration (the native-rig channel inside the
story lane) and explicitly defers:

- `PlanVisualKind` gains `"character"` — **Phase 2, with Stage X** (the §6 text
  itself says so: "for cast scenes in mixed videos (Phase 2, with Stage X)").
  The compositor wall (`render.ts`'s engine-kind refusal) therefore does NOT
  learn `"character"` in S125 — mixed-engine composition is X's gate, and
  touching it here would break the X sequencing law.
- No new `RENDER_MODES` entry, no new `JobKind` — the rig is a **channel** inside
  the story lane, not a whole-video mode (the mode picker's lockstep law stays
  untouched; the handler-registry count stays 26). The render hook fires from
  the liveliness selector, exactly like i2v does.
- No authored/persisted pose timelines in v1: gesture timelines are **compiled
  at render time** by the pure planner (`rig-director.ts`) and die there — the
  whiteboard beat-plan's COMPILE-ONLY law (decision §10.1), applied to K1. The
  seniority ladder's "explicit rig timeline" is the rig doc itself: rigDoc
  present + valid → the native rig owns the scene.

## 2. File plan (new files, with the deltas against §6's list named)

§6 names four principal files; the graphics engine's file discipline (one
concern per file — `types/frame/compose/tracks/preflight/qc/render` split) is
the approved pattern S123 shipped, so the same split is mirrored here. The
deltas are listed so the record is honest:

| File | §6 said | S125 ships |
| --- | --- | --- |
| `src/lib/tubeforge/characters/rig2d.ts` | the `CharacterRigDoc` contract + `validateRigDoc` | yes — plus the parts-library contract (`RigPartArt` + `validateRigParts`), the slot vocabulary, and the named walls |
| `src/lib/tubeforge/characters/rig-frame.ts` | `poseAt(rig, timeline, tMs): RigFrameState` | yes — plus the mouth-beat compiler (W4 word anchors → syllable-counted open/close beats) |
| `src/lib/tubeforge/characters/rig-compose.ts` | (absorbed in rig-render per §6) | split out — the ONE compose seam law ("one compose, two callers": the chromium loop AND the studio editor read the same skeleton + applier). This is the graphics `compose.ts` precedent, not a new architecture |
| `src/lib/tubeforge/characters/tracks.ts` | (the tracks projection is named only in the pins) | `characterTracks` — the `tracks.ts` pattern, the §6 pin "tracks projection" made concrete |
| `src/lib/tubeforge/characters/preflight.ts` | (the frame budget is named only in the pins) | the delivered-count wall (R-1), mirrored from `graphics/preflight.ts` |
| `src/lib/tubeforge/characters/rig-director.ts` | pure planner: narration + pose sheet → pose timeline | yes — reusing `beat-plan.ts#classifySentence` (exported, one classifier two consumers) |
| `src/lib/tubeforge/characters/rig-render.ts` | chromium frame loop composing rig layers into scene SVG | yes — scene-clip renderer (video-only clip; the story segment's audio graph owns narration), content-hash clip cache |
| `src/app/api/characters/[id]/rig/route.ts` | GET/PUT rig doc | yes — PUT validates, stores doc + parts together |
| `src/app/api/characters/[id]/rig/auto/route.ts` | planner pass | auto-scaffold: standard slot poses derived from the parts (rest = zero deltas; expressive states authored by the parts pass / human) |
| `prisma/schema.prisma` | `Character.rigDoc Json?`, `Character.parts Json?` (additive) | shipped as **TEXT** columns + hand migration — the graphicsDoc house pattern (§ `s123_graphics_doc`), not Json |
| Studio | extend the character surfaces with the rig editor + pose-timeline strip | the rig studio panel: parts list, pose sheet, live frame preview (the shared composer + applier in-page), pose-timeline strip (client-side compile of the same pure planner) |
| `scripts/k1-rig-smoke.mts` + `docs/audits/k1-blind-rubric.md` | the S93 smoke pattern extended | shipped in the close slice |

Modified: `characters.ts` (the part-decomposition pass), `character-rig.ts`
(ladder note), `liveliness.ts` (the native-rig channel), `render.ts` (the
channel branch), `whiteboard/beat-plan.ts` (export `classifySentence` — the
§6-mandated one-classifier-two-consumers law), `types.ts` (nothing — the
`"character"` track-kind seat already exists).

## 3. The grammar (rig2d.ts)

```text
CharacterRigDoc (versioned, RIG_VERSION = 1):
  version: 1
  width, height     — the rig STAGE (art space), 240..2160 each; parts are
                      drawn in stage coordinates; the renderer contain-fits
                      the stage onto the scene canvas (no art rescale)
  fps: 24 | 30      — the editor/preview clock and any direct lane render;
                      the per-video hook renders at the VIDEO's fps (the
                      shared render clock — the doc fps never forks it)
  background        — "#rrggbb", junk is an ERROR (the graphics law)
  parts: RigPart[]  — the rig scene graph (art references + kinematics)
  poses: RigPose[]  — the pose sheet (named joint states)

RigPart:
  id, slot, variant?, svgRef, z, pivot {x,y}, parent?, rest: Placement
  — svgRef resolves into the character's parts library (RigPartArt.id);
  — parent is the FK chain (acyclic, validator-enforced);
  — rest is the whiteboard svg.ts Placement shape (the graphics at: law);
  — the mouth slot carries variant ∈ closed|open|wide|oh|smile.

RigPose:
  id, name, joints: Record<partId, { rotateDeg, x?, y?, scale? }>
  — rotateDeg is the FK rotation delta from rest (degrees, clockwise);
  — x/y are translation deltas from rest (stage px);
  — scale is the scale multiplier (1 = rest);
  — every joint key must resolve to a rig part (referential integrity).

RigPartArt (the parts library, Character.parts):
  id, slot, variant?, svg  — svg is the part's markup in STAGE coordinates
  (rest state = identity), sanitized at admission (whiteboard sanitizeSvg).
```

### The standard slot vocabulary (§6 verbatim)

> standard slot names so pose sheets map: `mouth` set (`closed|open|wide|oh|smile`
> — 5 shapes is enough for honest narration-sync at explainer quality), `brow`,
> `arm-l/arm-r` 3-way (rest/raise/point)

- **Mouth** — five PART variants (an art swap, not a transform: no honest
  "oh" exists as a rotation of "closed"). A rig WITH any mouth part must carry
  the complete 5-shape set (partial set = validator ERROR — the speaking
  schedule would visibly break); a rig with NO mouth parts validates with a
  warning and renders closed-mouth (honest: the rig will not fake speech).
- **Brow** — one brow part animated by joints; the pose sheet maps
  `brow-rest` / `brow-raise` (missing → warning, gestures degrade).
- **Arms** — one part per arm, FK-rotated at the shoulder pivot; the pose
  sheet maps `arm-l-rest|raise|point` and `arm-r-rest|raise|point`
  (missing → warning, gestures degrade to rest).
- Everything beyond the standard sheet (head turns, torso leans, hand props,
  free poses like `welcoming`/`explaining`) is free-form and planner-optional.

## 4. The frame truth (rig-frame.ts)

`poseAt(rig, timeline, tMs, anchors?) → RigFrameState` — pure, deterministic,
no fs/clock/randomness (the S64 law generalizes):

- **FK composition:** absolute matrix per part = parent absolute ∘ local delta
  (translate(dx,dy) ∘ rotate(pivot, dRot) ∘ scale(pivot, dScale)); the applier
  receives `matrix6` — absolute-set writes, the graphics applier discipline.
  No IK, no skinning, no mesh deformation (the §6 non-goals verbatim).
- **Pose rows** hold semantics: from a row's tMs, tween from the previous pose
  to the row's pose over POSE_TWEEN_MS (320), then hold until the next row.
  Joints absent from the next pose tween back to rest. Segment easing comes
  from the row (`EaseName`, the shared `anim/easing` curves).
- **The mouth schedule:** W4 word anchors (the captions lane's per-word spans —
  anchors are INPUTS, never stored) → per-word syllable counts (deterministic
  vowel-group counter) → open/close beats strictly INSIDE each word span
  (open = span·OPEN_RATIO slices; closed fills the remainder and every gap).
  Speech cycles `open|wide|oh` deterministically (word+syllable parity);
  `smile` exists only as a gesture override (timeline rows may pin a mouth
  variant); `closed` at rest. **Scope claim: beat-sync, never phoneme
  lip-sync** — in every doc, pin label and UI string (the §6 honesty law).
  Anchor degradation: no anchors → the word-proportional house estimator
  (the W4 fallback shape); no narration → no beats (closed mouth).
- **Never-NaN:** the validator bounds every joint (|rotateDeg| ≤ 360,
  scale ∈ [0.2, 3], offsets within ±150% stage) and pivots to finite stage
  coordinates; frameAt/poseAt carry no defensive branches (validated input in).

## 5. The lane seats (compose / tracks / preflight / render)

- **rig-compose.ts** — `composeRigScene` builds the page-sized SVG skeleton
  (background rect + z-ordered part groups `#rp-{id}`, sanitizeSvg first,
  HTML-escape second); `APPLY_RIG_FRAME_FN` is the ONE applier (absolute-set
  matrix writes + mouth-part visibility); `rigFramePayload` is the serialize
  twin. Idempotent: applying the same payload twice is a no-op (pinned).
- **tracks.ts** — `characterTracks(plan, opts)` projects the rig scene plan
  onto the S87 contract: one `character`-kind visual clip per rendered scene
  over its frame-quantized window (`asset: null` — the frame is drawn by the
  engine), audio slots for VO-carrying scenes, the subtitle placeholder. The
  renderer composes through `planFromTracks` and asserts the two clocks
  (plan ≡ delivered) before assembly — the graphics render law, verbatim.
- **preflight.ts** — `assertRigBudget`: the DELIVERED frame count
  (Σ frameCountOf(sceneMs, fps)) against the shared `ANIM_FRAME_BUDGET`
  (one wall, two engines — the anim substrate's own wording). Refuses before
  chromium launches.
- **rig-render.ts** — per-scene chromium loop (fresh context per scene, all
  network routes aborted — the security posture, whiteboard parity), frames
  from `poseAt` through the one applier, ffmpeg scene encode (`-t` bounded,
  yuv420p), **video-only** clip (narration rides the story segment's audio
  graph — the segment is the mix owner). Clip cache: content hash of
  (doc + parts + timeline inputs + duration + fps + size) via the arthash
  sidecar pattern (`ensureSceneClip`'s shape); a cache hit revalidates the
  file size floor before reuse.

## 6. The channel (liveliness.ts + render.ts)

- `LivelinessChannel` gains **`"native-rig"`**, inserted **between the
  stills-contract Ken Burns rule and the director's i2v rule** (§6: "between
  `kenburns` and `i2v` — native-first"). The rules senior to it stay senior:
  slides, the video-level animated pick, matched stock, and every stills
  contract (motion off / plan motion off / human motion off / studio camera
  keys) — a still order stills the rig too (KB renders the honest hold).
- The selector's new input is `nativeRig: boolean[]` — one flag per scene:
  cast scene (`hostInScene`) AND the video's character carries a VALID parsed
  rigDoc. Invalid/absent rigDoc → flag false → byte-identical legacy path
  (the rollback law).
- `render.ts buildSegment`: the `native-rig` branch renders (or reuses) the
  rig scene clip, then composes it through the SAME footage path i2v uses
  (`visualSuffix(FOOTAGE)` + the audio graph). ANY failure in the rig branch
  degrades honestly to `runKenburns()` with a named fallback note (the i2v
  degradation shape) — the liveliness pick never breaks the render.
- The S93 breath loop is untouched and skips native-rig scenes naturally
  (it only replans `kenburns`-channel scenes): the ladder — **K1 rig > S93
  breath > auto KB** — falls out of the channel precedence, no new ladder
  code. `character-rig.ts` gains the ladder note in its header comment.

## 7. Walls (named, all in rig2d.ts unless noted)

| Wall | Value | Why |
| --- | --- | --- |
| `RIG_STAGE_MIN` / `RIG_STAGE_MAX` | 240 / 2160 | the stage is art space; sane bounds, junk refused |
| `RIG_BUDGETS.parts` | 24 | a puppet needs ~12–16; sprawl is K1's named risk |
| `RIG_BUDGETS.poses` | 24 | the pose sheet is a sheet, not an atlas |
| `RIG_BUDGETS.jointsPerPose` | 16 | every joint keyed to a real part (validator) |
| `RIG_BUDGETS.timelineRows` | 64 | gesture beats per scene (compile-only artifact) |
| `RIG_BUDGETS.svgCharsPerPart` | 24_000 | a part is a limb or a face plate, not a poster |
| joint bands | ±360°, scale 0.2..3, offset ±150% stage | the never-NaN floor's input side |
| frame wall | `ANIM_FRAME_BUDGET` (25,920) via `assertRigBudget` | one wall, two engines |

## 8. Non-goals (§6 verbatim — restated so the record is self-contained)

> no skeletal mesh deformation/skinning, no phoneme-exact lip-sync claim, no IK
> solvers in v1 (FK rotations cover explainer poses), no real-time playback
> engine (deterministic frame rendering only).

Plus the S125 scope deferrals of §1 (compositor citizenship waits for X; no
RENDER_MODES entry; no persisted timelines).

## 9. Rollback (§6 verbatim)

> `rigDoc` absent → S93 still-portrait path byte-identical (additive parse).

The validator/parse are additive (null on junk); the selector flag computes
false without a doc; `buildSegment`'s legacy branches are byte-identical when
the flag is false; the schema migration adds two nullable columns, no backfill.

## 10. Pins (the unit battery's S125 block)

1. rig doc round-trip byte-stability (write ∘ validate ∘ parse).
2. Slot coverage: partial mouth set = ERROR; mouthless rig = warning; the
   standard arm/brow poses missing = warning, planner degrades to rest.
3. Referential integrity: unresolved svgRef / unknown pose joint key / parent
   cycle → ERROR; pivot junk → ERROR.
4. pose interpolation determinism: same inputs → byte-identical frame states;
   FK chain composition (child rides the parent's rotation); tween windows
   clamp; pose rows hold; rest before the first row.
5. Mouth beats land INSIDE their word spans (the W4 tolerance pin), closed in
   gaps, deterministic cycle order, gesture override wins its window.
6. Rig part transforms never NaN at the band edges (the validator's bounds in,
   finite matrix out).
7. Delivered-count wall refusal before chromium (the R-1 mirror).
8. `characterTracks` contiguity from zero at either fps + `planFromTracks`
   read-back (the S87 projection pin, character flavor).
9. The applier's idempotence + the payload/applier source pin (the S123 P3
   source-pin pattern).
10. Liveliness precedence: native-rig sits between the stills contract and the
    director i2v pick; every stills rule still pins KB; no-doc → KB (rollback).
11. `classifySentence` export pin (one classifier, two consumers — the beat
    plan's own results unchanged).

Identity floor ≥ 80 via VCE on rendered rig frames + walk-cycle honesty are
the **smoke script's** acceptance (`scripts/k1-rig-smoke.mts`) and the blind
rubric's rows (`docs/audits/k1-blind-rubric.md`) — the S93 smoke pattern
extended; they are not unit-battery pins (they need real renders + VCE calls).

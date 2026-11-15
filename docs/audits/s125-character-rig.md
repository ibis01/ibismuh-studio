# S125 — the K1 character rig: the close record

Stage: **K1** (roadmap §6), executed as **S125**. Design record:
`docs/design/s125-character-rig.md`. Branch: `s124/element-editor` (S125
stacks on S124's tip per the release-order law — K1 = S125, the import lane
= S126).

## 1. What shipped (commit by commit)

| Commit | Slice | The §6 row it lands |
| --- | --- | --- |
| `feat(characters): S125 — the rig grammar…` | 1 | `characters/rig2d.ts` — CharacterRigDoc, the parts library, the standard slot vocabulary, validateRigDoc (referential integrity, pivot sanity, the complete-mouth-set law), byte-stable write. Plus the recreated six-repo reception record (the license matrix + clean-room boundaries; the import-lane evaluation corrected from three parallel projects to ONE lane) |
| `…the rig frame truth…` | 2 | `characters/rig-frame.ts` — poseAt (FK chains about pivots, pose rows hold with the 320ms tween, destination-owned easing), the W4 mouth schedule (anchors → syllable-counted beats strictly inside word spans, estimator fallback, closed-mouth honesty), `classifySentence` exported (one classifier, two consumers) |
| `…the contract seats…` | 3 | `characters/rig-compose.ts` (the ONE applier + skeleton), `characters/tracks.ts` (characterTracks — the S87 projection, kind "character" — the reserved seat used at last), `characters/preflight.ts` (the R-1 delivered-count wall on the shared ANIM_FRAME_BUDGET) |
| `…the rig director + the scene renderer…` | 4 | `characters/rig-director.ts` (gesture beats from the shared classifier; compile-only) + `characters/rig-render.ts` (the chromium loop, video-only encode, the shared-timebase seat, the two-clock assert, the sha256-sidecar clip cache) |
| `…the native-rig channel…` | 5 | `liveliness.ts` rule 4.5 (native-first between the stills contract and i2v) + `render.ts`'s native-rig branch (the footage path, honest KB degradation) + the additive `Character.rigDoc/parts` TEXT columns + migration + the SQLite mirror sync |
| `…the parts pass + the rig routes…` | 6 | `characters.ts` generateCharacterParts (LLM-authored SVG fragments at $0 raster, per-part degradation, the partial-mouth drop) + `GET/PUT /api/characters/[id]/rig` (validator-gated) + `POST .../rig/auto` + the `hasRig` DTO seat |
| `…the studio seat + the smoke + the close` | 7 | `characters/rig-preview.tsx` + `characters/rig-panel.tsx` (the Character Studio's K1 panel: auto-rig, the compiled preview through the ONE applier, the pose-timeline strip, the beat-sync claim in the UI) + `scripts/k1-rig-smoke.mts` + `docs/audits/k1-blind-rubric.md` + this record |

## 2. The acceptance evidence (machine-verified)

- **Unit battery: 699 → 734, 0 failed** — 35 new pins across the grammar
  (round-trip byte-stability, slot coverage, referential integrity, walls),
  the frame truth (FK chain carriage, tween clamps, hold semantics,
  never-NaN at the band edges), the mouth schedule (beats-inside-spans, the
  schedule ladder, the visibility swap, gesture overrides), the contract
  seats (projection contiguity + read-back, the applier source pins, the
  R-1 arithmetic pinned apart), the planner (the gesture table, the compile
  wall), and the lane wiring (rule 4.5 precedence, the byte-identical
  rollback, the end-to-end source pins).
- **The smoke: 23/23 green** (`node --import tsx scripts/k1-rig-smoke.mts`)
  — structural gates before chromium, beats inside word spans, the
  determinism sweeps at 24/30 fps, the REAL 8.00s render (probed ≡
  delivered), the contract read-back, the cache reuse/invalidation
  receipts. The identity VCE row records SKIP (no VLM provider in the
  sandbox) — the human gate owns it, never faked.
- **The §6 pins, item by item:** pose interpolation determinism ✓ (unit +
  smoke sweeps); mouth beats inside word spans ✓ (tolerance pin, unit +
  smoke); rig part transforms never NaN ✓ (validator bands + edge pins);
  identity floor ≥ 80 via VCE **= the blind rubric's open row** (PENDING —
  the honest boundary, §3 there); frame budget ✓ (the delivered-count
  wall, shared ANIM_FRAME_BUDGET); tracks projection ✓ (characterTracks,
  contiguous from zero at either fps, planFromTracks read-back).
- **Rollback proven by construction:** `rigDoc` absent → the selector's
  nativeRig flags are false everywhere → the channels, the S93 breath loop,
  and buildSegment's legacy branches are byte-identical (pinned).

## 3. The scope decisions of record (design §1, restated)

- `PlanVisualKind` does NOT gain `"character"` in S125 — compositor
  citizenship is Stage X's gate (the §6 text itself defers it). The engine's
  own projection uses the reserved track kind; the planFromTracks read-back
  maps it to "video" until X — the clock assert is what S125 consumes it for.
- No new RENDER_MODES entry, no new JobKind — the rig is a CHANNEL inside
  the story lane; the handler-registry count stays 26; the mode picker's
  lockstep law is untouched.
- Pose timelines are COMPILE-ONLY (the beat-plan law): no persisted
  timelines in v1; the studio strip shows the compiled artifact the renderer
  will consume.
- The K1-i2v prompt-contract improvements are K1-ext's tail, not S125's.

## 4. Non-goals honored (§6 verbatim)

No skeletal mesh deformation/skinning; no phoneme-exact lip-sync claim (the
scope claim is beat-sync — in the grammar comments, the design record, the
smoke labels, and the studio UI); no IK (FK rotations cover explainer poses);
no real-time playback engine (deterministic frame rendering only).

## 5. The open tails

1. **The blind re-score** — `docs/audits/k1-blind-rubric.md` PENDING (≥3
   human scorers; the standing human gate shared with S123's).
2. **Identity VCE on rig frames** — runs when a VLM provider is configured;
   recorded SKIP by the smoke today.
3. **K1-ext** — the FreeMoCap BVH sidecar adapter (data-protocol only, the
   AGPL clean-room boundary per the reception record); pose timelines
   authored/persisted if authors ask for them; the i2v prompt contract.
4. **Stage X** — compositor citizenship (`PlanVisualKind` "character", the
   mixed-kind segment builders).

## 6. The S126 hand-off

The next release-order slice is the **external import lane** (S126): one
syntax minor extension, one QC lens set, one quota surface — PNG alpha
sequences, WebM-VP9 alpha video, sprite sheets; E11-style upload hardening
(dimensions, fps, frame count, alpha presence, byte caps); fps normalized to
the shared 24/30 timebase; per-asset provenance (the reception record's
binding rule). The graphics-lane QC semantics are the pattern.

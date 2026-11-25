# S147 — the rhetorical beat layer (the layer-upgrade directive's §2) — RECORD

| | |
|---|---|
| Gate | The 2026-11-16 whiteboard layer-upgrade directive: "the first implementation should be semantic beat planning" — the beats gain the directive's typed schema (rhetorical purpose / action / emphasis), the matcher consumes the S142 effects' `alts` + `emphasis` role (the recorded follow-up), and an emphasis mark compiles AFTER its label. All additive; the existing `AnimationEvent` grammar untouched. |
| State | **LANDED.** Battery **849 passed, 0 failed** (846 + three S147 pins). typecheck + lint clean. |
| Head | On the S146 fresh baseline (`dd9edd1`) — the "before" receipt stands: the frozen W1 benchmark carries ZERO fx placements, so S147 is provably byte-identical on it (the byte-identity pin). |

## 1. What landed (all in `whiteboard/beat-plan.ts` + two caller threads)

- **`RhetoricalPurpose`** — the directive's six-value taxonomy
  (`setup | claim | mechanism | comparison | evidence | conclusion`) via
  `classifyRhetorical(sentence, index, total)`: the LAST sentence is the
  conclusion slot (the grammar's close card already owns it), then the
  conclusion/comparison/evidence cue tables, then claim-before-mechanism
  (the structural classifier's own subject>action precedence — "The heart
  IS a pump" is a claim despite carrying "pump"), then setup/first,
  defaulting to claim. The STRUCTURAL `classifySentence` is UNTOUCHED — the
  K1 rig director consumes it ("one classifier, two consumers") and its
  outputs stay byte-identical.
- **`BeatEmphasis`** — `low | normal | high`; high rides the structural
  emphasis purpose; low is reserved for the editor.
- **`BeatAction`** — `draw | write | underline | circle | crossout | reveal |
  hold`, derived from the beat's contents (paths vs text vs nothing) and the
  placed effects (`fx-underline → underline`, `fx-circle-mark → circle`;
  `crossout` stays in the vocabulary for the editor and the future effect).
- **The matcher's extended vocabulary** — `mentionScore` now scores an
  asset's `alts` (the S142 effects' phrase vocabulary, +2 per phrase hit)
  and the `emphasis` role (+2, but ONLY on an emphasis-class sentence — the
  sprinkle law: marks punctuate, they never wallpaper). This closes the
  S142 recorded follow-up verbatim: "wiring the matcher to score alts (and
  the emphasis role) into its candidate ranking".
- **The mark's compile law** — an `fx-*` asset on a HIGH-emphasis beat
  becomes the beat's `markAssetId`; `compileBeats` stable-sorts its items
  LAST (the mark lands after the labeled item — the W4 law: emphasis fires
  after the spoken claim). Absent mark ⇒ byte-identical compile.
- **`WhiteboardBeat`** gains the four ADDITIVE optional fields
  (`rhetorical?`, `action?`, `emphasis?`, `markAssetId?`) — beats are never
  persisted, so the tolerant-read law costs nothing; the editor and the LLM
  planner read the richer plan.
- **The callers** — `render.ts` and `wb-canvas.tsx` both build `assetMeta`
  from the SAME library load and thread it to `beatSceneEvents` (preview ≡
  final; the W2/W4 source pins updated to assert the stronger wiring).

## 2. The pins (three new, two strengthened)

1. `classifyRhetorical` fires the directive's own example family (setup /
   mechanism / evidence / comparison / conclusion / claim / last-sentence)
   + the emphasis mapping.
2. `planBeats` fills the fields on every beat; the fx asset on the HIGH
   beat is the mark; the compile proof: the mark's first draw starts at or
   after the labeled item's last draw.
3. **Byte-identity**: no fx placements ⇒ identical windows, assignments,
   and compiled events with or without meta (the frozen W1 benchmark rides
   this law — its receipt is unchanged by S147).

## 3. The honest boundary (what S147 deliberately does NOT do)

- **No scaffold auto-aiming**: the scaffold planner still never PLACES fx
  assets. The matcher now scores them correctly when they exist (the LLM
  planner's selection, authored uploads, explicit placements), but an
  auto-placed underline needs the label's BOUNDS to aim at — a mis-aimed
  mark reads worse than no mark (the directive's own §8 warning). The
  bounds-aware sprinkle is the recorded next slice.
- **No crossout effect**: `fx-crossout` does not exist in the effects pack;
  the action vocabulary carries it for the editor and the future slice.
- **No second timeline grammar**: everything compiles into the existing
  `AnimationEvent[]` through `compileBeats` — the grammar did not grow.

## 4. The layer-upgrade directive's ledger (what each phase maps to)

| directive phase | repo state |
| --- | --- |
| §3 the stroke validator (W3) | LANDED long since — the teleport/subpath/fill-order/width laws are hard gates |
| §4 word-aligned timing (W4) | LANDED — anchors as inputs, byte-identical fallback |
| §5 handwriting + marker labels (W4) | LANDED — glyph mode + marker mode, one face |
| §6 the camera director (W5) | LANDED — focus rects, drift demoted, QC-proofed as one slice |
| §7 continuous canvas (W6) | LANDED — board state in the frame plan; the keep-chain carry depth is the recorded future work |
| §8 hand behavior (S139 + W7) | LANDED (tremble, breathing, eased lockstep); the occlusion/travel/hand-variant laws are S146's finding 2 |
| §2 the semantic beat layer | **S147 (this stage)** |
| §9 editor controls | partially landed (the element editor, the beat normalization); the beat-order/duration controls are the next UI slice |

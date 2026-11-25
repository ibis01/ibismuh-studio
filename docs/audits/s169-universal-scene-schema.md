# S169 — The Universal Scene Schema (the Director-authored envelope)

| | |
|---|---|
| Milestone | S169 — "a structured representation of each scene… must accommodate all six modes, validation, asset provenance and timeline synchronization." |
| Module | `src/lib/ibismuh/universal-scene.ts` — pure, strict, deterministic. |
| Status | **CLOSED (schema)** — battery 970/970 (9 new pins), typecheck + lint clean. The compile step that walks scenes into engine calls is S170. |

## 1. The shape

`UniversalScene` = the envelope, not a replacement: the mode's own
document (GraphicsDoc / whiteboard doc / rig doc / Scene3D doc / …) rides
in `doc` and is validated by THAT mode's validator at compile time — the
schema never re-validates what an engine already owns (one writer each).

Fields: `version` (1) · `sceneId` (slug-safe, unique) · `kind` (the
closed six: graphics / whiteboard / slides / classic / character / 3d) ·
`durationMs` (integer, wall 250 ms → 1_080_000 ms — the 18-minute engine
ceiling) · `atSec?` (composition-clock placement hint) · `background?`
(color/image/none, #rrggbb junk refused) · `narration?` (text + voiceId
hint — the S176 router disposes) · `assets[]` (the provenance ledger:
id/kind/origin/sha256) · `directives[]` (the S168 vocabulary) · `doc?`
(the mode's own document).

## 2. The laws the validator enforces (strict — machine-authored data)

1. **Provenance closure:** a background `assetId` must resolve inside the
   scene's own `assets[]` — a scene cannot reference an undeclared asset.
   The provenance guarantee is structural, not conventional.
2. **Directive law:** the scene's directives pass the S168 batch gate
   (`assertNoInventedCommands`) — a scene carrying an invented command
   does not validate; the error names the action.
3. **Strict typing:** junk kinds/colors/durations/sha256s are ERRORS with
   typed codes, never coerced, never dropped-with-a-warning (this schema
   is Director output, not a client roundtrip cast — fail-closed beats
   skip-and-render).
4. **Project-level:** unique sceneIds, closed production modes
   (free/standard/premium — the S184 modes ride the schema), at least one
   scene.

## 3. Timeline synchronization (the ONE mapping)

`KIND_TO_TRACK` maps the Director's six-mode world onto the S87
universal timeline's track kinds: graphics/whiteboard/3d/character keep
their kinds; **slides and classic render through the video lane** (their
segments ride as video — the composition's own vocabulary stays
unchanged). `projectUniversalScene` emits the exact S87 `TimelineClip`
shape (id `s{n}` per the S2 doctrine; asset pointer for image
backgrounds). The **inbound transition** of scene N is read from scene
N−1's `transition:` directive on `boundary:(N−1)` — the S163 boundary
indexing, projected into the timeline's `transitionIn`.
`projectUniversalTimeline` sequences back-to-back; an explicit `atSec`
wins (the sync hint).

## 4. Acceptance evidence

Battery 970/970 — pins: the closed six kinds / five origins / three
modes; a fully valid scene passes; provenance closure + duplicate ids
refused; the clock walls (0 / 200 / NaN / 2 000 000 / fractional all
refused); a seventh mode refused; junk color and short sha256 refused;
an invented directive invalidates the scene with the action named; the
six-mode→track-kind mapping table; the inbound-transition projection
from the previous scene's boundary directive; back-to-back sequencing
with atSec override; project uniqueness + mode closure; JSON-stable
sorted-key serialization round-trip.

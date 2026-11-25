# External reference study — friction2d/friction (the element editor slice)

| | |
|---|---|
| Trigger | The operator supplied `github.com/friction2d/friction` as reference input for the remaining graphics gap (the element-level canvas editor, named in the S123 close record §8) |
| Repo | https://github.com/friction2d/friction — friction.graphics; motion graphics for vector/raster animation; **fork of enve** (Maurycy Liebner) |
| License | **GPL-3.0-only** (`LICENSE.md`, "License (GPL-3.0-only)", copyright Ole-André Rodlie and contributors; enve lineage GPL as well) |
| Ibismuh Studio license | Proprietary, all rights reserved (`/LICENSE`) |
| Verdict | **Clean-room reference only.** Architecture/UX concepts are read and restated in our own words with our own implementation; **zero source copied, no translation, no derivative modules**. Same boundary the AGPL VoiceStudio study drew (independent sidecar, protocol-level only), one notch stricter because friction is GPL and its domain (canvas editing) is where we intend to build. |
| Evidence basis | Shallow clone inspected read-only: `src/core/canvas*.cpp/h`, `src/core/MovablePoints/`, `src/core/Boxes/boundingbox.h`, `src/core/canvasselectedboxesactions.cpp` |

## 1. What friction is architecturally (evidence)

| Concept | Evidence in friction | Restated shape (ours) |
|---|---|---|
| Tool-mode dispatch | `canvasmouseinteractions.cpp` — a `CanvasMode` state machine (`boxTransform`, `pointTransform`, `pathCreate`, `drawPath`, `pickFillStroke`, `rectCreate`, `textCreate`); pointer-down resolves per current mode | The studio exposes ONE geometry mode ("Layout"), entered explicitly; outside it the canvas stays the pure playback seam. A mode flag, not a tool palette — our grammar has no path editing to expose |
| Selection | `Canvas::getPointAtAbsPos(e.fPos, mCurrentMode, invScale)` — press resolves the topmost box at an absolute point, scaled by the view's inverse scale | Hit-test in doc space; the view scale cancels by converting pointer deltas through the known viewport scale; topmost = doc order (our composer paints in doc order) |
| Transform handles | `src/core/MovablePoints/` — `movablepoint.h`, `nonanimatedmovablepoint.h`, `pathpivot.h`; handles are their own widget class positioned over the canvas | Our overlay is a host-page SVG layer positioned in doc space over the iframe; the iframe itself is never polluted (the composed page IS the render contract — no editor chrome inside it) |
| Pivot-anchored scaling | `boundingbox.h` L294–344 (`getPivotAbsPos` / `setPivotRelPos` / `mSavedTransformPivot`) — transforms anchor at a movable pivot | Our v1 anchor is the placement point itself (`at.x, at.y`) — the composer's `translate(x,y) … scale(s)` already scales around it, so handle math is exact against the render contract with no second anchor model |
| Z-order vocabulary | `canvasselectedboxesactions.cpp` L645–676: `raiseSelectedBoxesToTop()`, `lowerSelectedBoxesToBottom()`, `raiseSelectedBoxes()`, `lowerSelectedBoxes()` — the four actions | Adopted as the four-action law (`raise/lower/top/bottom`) over the doc-order array, with the group-claim refusal (below) — the vocabulary is generic UI terms, the law over `scene.elements` is ours |
| Undo | Per-canvas `UndoRedoStack` (`canvas.h` L680/742/860), command objects with a `StackBlock` guard | NOT adopted this slice — our edits ride the validated PUT (every edit is a validator-checked doc write); a session-local undo stack is recorded as an honest gap |
| One truth per property | friction's animators own every value; the canvas is a view | Already our law in stronger form: `frameAt` owns motion truth, the composer owns the placed state, the ONE applier owns all DOM writes — the editor introduces no new writer (S124 pin) |

## 2. What the study adopts (and what it deliberately does not)

**Adopted (concepts, restated):**
1. The explicit geometry MODE (friction's boxTransform mode) — playback stays pristine; editing is a state you enter.
2. The four-action z-order vocabulary over doc order.
3. Handle-based interaction over an overlay that reads its geometry FROM the composed page (friction reads boxes' scene bounds; we read the iframe's own `#ge-{id}` rects — bounds come from the render contract, never a second estimator).
4. Hit-test = topmost at a doc-space point, view-scale inverted.

**Deliberately not adopted:**
1. No pivot-handle UI (the placement point is the only anchor in v1 — recorded).
2. No undo stack (validated PUT is the integrity wall; honest gap).
3. No path/point editing (the closed v1 grammar has no path geometry per element to edit — grammar sprawl is the named risk, row 5).
4. No drag-and-drop element creation (scaffolding owns creation; the editor owns geometry).

## 3. License boundary (binding for this slice and its follow-ups)

- No friction/enve source file, snippet, or translated logic enters the Ibismuh Studio tree — the implementation below is written against OUR contracts (`GraphicsDoc`, `Placement`, the ONE applier), not against friction's APIs.
- Friction's documentation/UI photographs are not embedded. Screenshots are not copied.
- If a future slice ever needs GPL code (e.g., a full SVG path editor), it must live in a **separate GPL process/sidecar** with a protocol boundary — the VoiceStudio decision, mirrored — never vendored into this tree.

## 4. Where this lands

The adopted concepts are implemented as S124 (`docs/design/s124-graphics-element-editor.md`): the placed-frame truth + group-claims export in the composer, a pure editor module (hit-test, placement math, the z-order law with the slots rebuild), the canvas overlay + studio Layout mode, and the validated-PUT round-trip — the exact slice the S123 close record named as the follow-up.

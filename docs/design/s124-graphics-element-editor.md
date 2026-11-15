# S124 — the element-level graphics editor (drag · scale · z-order)

| | |
|---|---|
| Status | Approved for execution under the standing "continue building till you finish all" authorization + the operator's "Continue" with the friction reference supplied (2026-11-14) |
| Scope | The S123 close record §8 gap: **element-geometry editing** — select, drag, corner-scale, z-order — through the validated PUT. NO grammar changes, NO new routes, NO server changes |
| Reference | `docs/audits/external-friction-editor-study.md` (clean-room; GPL-3.0 boundary binding) |
| Numbering | **S124** — the next free sN: scripts max `s94`+`s123`, design docs max `s123`; S121/S122 are taken by their own branches; this slice never touches those branches |

## 1. The laws this slice rides (no new laws invented)

1. **ONE applier** — every DOM write goes through `APPLY_GRAPHICS_FRAME_FN` (compose.ts). The editor never sets attributes itself; live drag preview is a payload through the same applier the renderer uses.
2. **Placed state is the composer's truth** — the skeleton poster already bakes the placed state; S124 exports it as a first-class frame (`placedGraphicsFrame`) so edit mode plays EXACTLY what the poster bakes (one-truth pin pins the equality).
3. **Z-order IS doc order** — the composer paints `scene.elements` in array order (claimed children ride their group's `<g>`). Z-order edits reorder the array; the composer/validator/frame truth learn nothing new.
4. **The validator is the wall** — every edit lands in the working buffer, and Save rides the existing validated PUT (engine validator verbatim, byte-stable write, LWW). No client-side validation fork.
5. **Bounds from the contract, not a model** — hit-testing reads the composed page's own `#ge-{id}` rects from the same-origin iframe. No second geometry/bounds estimator can drift.
6. **Group-claim honesty** — a child claimed by a group is composited inside the group's transform; v1 refuses geometry edits on claimed members with the owning group's id (the claims map is exported by the composer — ONE claim truth for both the emission pass and the editor).
7. **No new dependencies; no whiteboard import; no second clock; no director logic** (the five bans carry forward).

## 2. Design

### 2.1 The placed frame truth (compose.ts)

- `graphicsGroupClaims(scene): Map<string, string>` — child id → owning group id. `composeGraphicsScene`'s emission pass now reads THIS map (the inline loop is extracted verbatim; bytes pinned by the existing G1.3 suite).
- `placedGraphicsFrame(scene): GraphicsFrameState` — every element at its placement: `x/y/scale/rotateDeg` from `at`, `opacity` base, `progress: 1`, no `counterValue` (the counter's poster text stays its baked end state — the applier only touches it when the field is present). Serialized through the EXISTING `graphicsFramePayload` — no second payload shape.

### 2.2 The pure editor module (`graphics/editor.ts`)

- `ELEMENT_EDITOR_LIMITS = { scaleMin: 0.05, scaleMax: 20 }` — the validator keeps any `scale > 0` (non-positive collapses to 1 silently); the editor keeps the handle in a usable band and never ships a value the validator would silently rewrite.
- `topmostElementAt(bounds, px, py)` — last (doc-order) containing bounds wins; edges inclusive; miss → null.
- `movedPlacement(at, dx, dy)` — exact scene-unit deltas; NO positional clamp (the grammar is unbounded; slide entrances legitimately start off-canvas).
- `scaledPlacement(at, factor)` — anchor is the placement point (the composer's `translate … scale` semantics); clamped to the limits; non-finite factor → honest no-op.
- `applyZOrder(scene, elId, action)` — the friction four-action vocabulary over the unclaimed subsequence, rebuilt under the **slots law**: claimed children keep their exact array slots; the unclaimed elements fill the remaining slots in their new order. Unknown id → error; claimed member → error naming the owning group. Input never mutated.

### 2.3 The canvas overlay (`graphics-canvas.tsx`)

- New optional props: `editable`, `selectedId`, `onSelect(id | null)`, `onPlacement(elId, at, phase: "preview" | "commit")`.
- `editable && !playing` → edit mode: the placed frame applies once per (doc, active scene) change; the overlay (host-page SVG, doc-sized, inside the existing scaled wrapper so its units ARE doc units) draws the selected element's outline + a bottom-right scale handle; pointer interactions run with pointer capture.
- Drag: pointer deltas ÷ view scale → `movedPlacement` → live preview through the ONE applier (placed frame with the dragged element's geometry overridden) → `onPlacement(…, "commit")` on release.
- Scale: handle distance ratio from the anchor → `scaledPlacement` → same preview/commit path.
- Bounds cache rebuilds on every doc/scene change and after each applied frame — always read AFTER the applier's writes settle (rAF).
- Outside edit mode the component is byte-for-byte the S123 playback seam.

### 2.4 The studio (`graphics-studio.tsx`)

- A **Layout** toggle in the transport row (friction's boxTransform mode, one mode): ON forces pause, arms the overlay, selects nothing by default.
- Selection state lives in the studio; the active scene's element strip (visible in Layout mode) lists the unclaimed elements in doc order with kind · id · placement readout, select-on-click, the four z-order actions, and numeric x/y/scale inputs for the selected element (exact placement for coarse-finger drags). Claimed members render read-only with their owning group's id.
- `onPlacement(…, "commit")` patches the working buffer (dirty; Save rides the validated PUT). `preview` is a canvas-local event the studio ignores.
- Rotation stays display-only this slice (`rotateDeg` renders everywhere already; a rotation handle is a follow-up).

### 2.5 Tests

- **Unit** (`scripts/test-unit.mts`, suite "graphics — S124 the element editor"): placed-frame one-truth pin (the skeleton's baked transform/opacity per element == `placedGraphicsFrame`, parsed numerically), payload double-run byte-identity, the claims map vs the composer's emission, hit-test topmost law, placement math (exact deltas, clamps, finite guard), the z-order matrix (four actions × flat scene, the slots law with a group present, unknown id, claimed-member refusal, purity), and a z-ordered+moved doc round-tripping the validator byte-stable.
- **e2e** (`e2e/graphics.spec.ts`): the wire contract the commits ride — a z-reordered + re-placed doc PUTs, GETs back in the new order with the new placements, and still passes the preflight wall. (The suite's shape is API-level; the overlay interactions are unit-pinned on the pure module and human-verified — recorded honestly.)

## 3. Acceptance criteria

| # | Criterion |
|---|---|
| 1 | Compose/render bytes unchanged: the existing G1.1–G1.3/P3 suites stay green; `git diff` shows compose.ts gaining exports + the claims extraction, no emission-path edits |
| 2 | Edit-mode preview rides the ONE applier (source-pinned: no direct attribute writes in canvas/studio) |
| 3 | The placed frame == the skeleton poster (the one-truth pin) |
| 4 | Z-order round-trips: editor reorder → validated PUT → GET returns the new order; claimed members refuse with the group id |
| 5 | Scale stays in the editor limits; the validator never silently rewrites an editor-shipped placement |
| 6 | No grammar/route/server/QC changes; the whiteboard tree untouched |
| 7 | Unit battery 685 → N, 0 failed; tsc + eslint clean |

## 4. Honest gaps (recorded, not hidden)

- No undo/redo stack (validated PUT is the integrity wall; friction's command-stack concept recorded for a follow-up).
- No rotation handle (numeric grammar support exists; the handle is a follow-up slice).
- No group editing (membership, group placement) — claimed members are honestly read-only.
- No element creation/deletion in the editor (scaffolding owns creation).
- The e2e suite is API-level; the overlay's pointer interactions are pinned on the pure module and verified by hand this slice.

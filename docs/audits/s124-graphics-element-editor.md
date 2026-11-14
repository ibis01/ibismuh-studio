# S124 — the element-level graphics editor — Stage Audit Record

| | |
|---|---|
| Stage | **S124** — the element-level graphics editor (the S123 close record §8 follow-up slice): select · drag · scale · z-order in the Graphics Studio's **Layout mode** |
| Baseline | `s123/full-execution` (685 unit tests, the S123 proof GATE GREEN, production build exit 0) — the slice rode the standing "continue building till you finish all" authorization and the operator's "Continue" with the friction reference supplied (2026-11-14) |
| Reference | `docs/audits/external-friction-editor-study.md` — the **clean-room** study of friction2d/friction (GPL-3.0-only, enve lineage); TubeForge is proprietary, so concepts only: the explicit geometry mode, the four-action z-order vocabulary, overlay handles reading the composed page's own geometry. **Zero source copied** — the implementation is written against OUR contracts (`GraphicsDoc`, `Placement`, the ONE applier) |
| Design record | `docs/design/s124-graphics-element-editor.md` (the laws, the acceptance criteria, the honest gaps) |
| Result | **LANDED** on `s124/element-editor` (5 commits on `s123/full-execution`). The graphics studio edits element geometry through the validated PUT: hit-test → drag/scale gestures previewing through the ONE applier → commit → the strict byte-stable write. No grammar changes, no new routes, no server changes, no new dependencies |
| Gates | tsc clean · eslint `.` clean (repo-wide, the CI gate) · unit **685 → 699, 0 failed** (14 S124 pins) · billing 40 · queue restart-recovery PASS · coverage **52.68% ≥ 50%** floor · production build exit 0 · the regression law holds (`git diff 37796ce..HEAD -- src/lib/tubeforge/whiteboard/` **empty**) |

## 1. Commit map

| Commit | Content |
|---|---|
| `bc241ff` | the friction reference study (clean-room boundary, the evidence table) + the S124 design record |
| `526d73b` | compose.ts — `placedGraphicsFrame` (the placed state as a first-class frame: at, base opacity, progress 1, NO counter channel) + `graphicsGroupClaims` (the claim map extracted VERBATIM from the emission pass — ONE claim truth; skeleton bytes pinned by the existing G1.3 suite, they did not move) |
| `c91b7ff` | `graphics/editor.ts` — the PURE editor module: `ELEMENT_EDITOR_LIMITS`, `topmostElementAt`/`boundsContain` (doc-order topmost, inclusive edges, the hit slop for zero-area geometry), `movedPlacement` (exact, unclamped), `scaledPlacement` (placement-point anchor, clamped, non-finite no-op), `applyZOrder` (the four-action vocabulary over the unclaimed subsequence, rebuilt under the **slots law** — claimed children keep their exact array slots; refuses unknown ids and claimed members naming the owning group; never mutates its input) + the 14-pin unit suite |
| `016eb32` | graphics-canvas.tsx — the OPTIONAL edit arm on the S123 playback seam (outside it, byte-for-byte the S123 seam): edit mode plays the PLACED state through the ONE applier; a host-page overlay INSIDE the scaled wrapper (its units ARE doc units; the iframe is never polluted); bounds read the composed page's OWN `#ge-{id}` rects; gestures preview through the applier and commit ONCE; the outline is handler-written state (no ref reads during render — the react-hooks/refs law). graphics-studio.tsx — the Layout mode (forced pause, clock sync, clean selection) + the element strip (doc order, the four z-order actions, exact placement fields committed on blur/Enter, claimed members read-only with their owning group). e2e — the wire contract: a z-reordered + re-placed doc PUTs and GETs back in the new order with the new placements |
| (this commit) | the close record + README/S120/worklog status |

## 2. The laws (all pinned in the unit suite)

| Law | Pin |
|---|---|
| The placed frame IS the poster | the skeleton's baked `translate/rotate/scale/opacity` per element parses numerically equal to `placedGraphicsFrame` — if either side drifts, the pin breaks |
| ONE serializer, ONE applier | the placed payload rides `graphicsFramePayload` byte-stable (double-run identical); the edit-mode DOM writes ride `APPLY_GRAPHICS_FRAME_FN` exactly like the renderer's `page.evaluate` — source-pinned, no direct attribute writes anywhere in canvas/studio |
| The claim map is ONE truth | `graphicsGroupClaims` == the emission pass's nesting (h1/ic1 → grp on the mixed doc); claimed ids never appear unclaimed |
| Hit-test = doc order | the LAST containing bounds wins; edges inclusive; the slop keeps a bare `<line>` grabbable (4 doc units off misses at slop 0, lands inside slop 8) |
| Z-order = the slots law | `[A, GRP, B, C]` + `top(GRP)` → `[A, C, B, GRP]` — B keeps its slot; the composer nests it inside GRP so the child's effective z rides the group; refusals name the owner; input never mutated |
| The validator stays silent | a z-ordered + re-placed doc round-trips byte-stable; the editor band (0.05..20) survives validation with no rewrite at both edges |

## 3. What S124 did NOT do (honest gaps, mirrored in the design record)

- **No undo/redo stack** — the validated PUT is the integrity wall; friction's per-canvas command-stack concept is recorded for a follow-up slice.
- **No rotation handle** — `rotateDeg` renders everywhere and displays in the strip; the handle is a follow-up (the numeric band was the slice).
- **No group editing** — membership and group placement are read-only; claimed members render with their owning group's id and honest copy.
- **No element creation/deletion** — scaffolding owns creation; the editor owns geometry.
- **The overlay's pointer interactions are pinned on the pure module + verified by hand this slice** — the repo's e2e suites are API-level (`request` context, the graphics spec's own shape); no browser-driven pointer suite exists in the house pattern to extend. The wire contract (the PUT round-trip) IS e2e-covered.

## 4. Delivery

Same path as S123: the branch `s124/element-editor` rides on `s123/full-execution` (both packaged for the operator's push — `docs/tubeforge/s124-execution.bundle` + `s124-push.sh` in the sandbox docs folder, supersedes nothing; the s123 bundle stays valid). No write credentials exist in this sandbox and the chat-leaked token was never used — **it must still be revoked**.

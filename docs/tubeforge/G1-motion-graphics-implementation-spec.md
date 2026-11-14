# G1 — Motion Graphics Engine: File-by-File Implementation Specification

| | |
|---|---|
| Milestone | G1 — Motion graphics (animated text, charts, diagrams, shapes, transitions) under the S120 programme |
| Status | SPEC — awaiting review. Per programme rules, implementation begins only after this spec passes review. |
| Main repository | `ibis01/tubeforge` (all work happens here; TubeForge stays the single production orchestrator) |
| Baseline | G0 verified baseline report (`docs/tubeforge/G0-baseline-report.md`), TubeForge HEAD `37796ce` |
| Reference | `kaomei/stickman-video-director` — workflow patterns only (MIT); no motion-graphics code exists there to port |

## 0. Rule check — what already exists (do NOT rebuild)

- **Animation substrate (Stage S, landed `14b67fe`):** `src/lib/tubeforge/anim/easing.ts` (`EaseName` union, pure, clamped), `anim/keyframe.ts` (`Keyframe`, `evalAt`, strict-ascending validation), `anim/clock.ts` (`ANIM_FRAME_BUDGET = 25_920`, `quantizeClock`, `frameCountOf`). G1 **consumes** these; it never defines a second easing table, keyframe law or clock.
- **Shared timeline (S87):** `timeline.ts` — timeline is a projection, never the source of truth; per-scene windows measured from WAV durations when present.
- **Projection precedent:** `whiteboard/tracks.ts` — one clip per scene, 2-dp composition clock, frame-quantized, contiguous by construction, leaf-module import law.
- **Lane contract (S119):** `render-lane.ts` — pure `resolveRenderLane`, unit-pinned. `render3d.ts` is the peer-lane precedent (no second renderer).
- **Track-kind seats:** `types.ts` L580 already reserves `"graphics"` and `"character"` on `TimelineTrackDTO.kind`. `RENDER_MODES` (types.ts L107) does not yet contain `graphics`.
- **Renderer/QC:** one compositor (`render.ts`), approved-only manifest (`render-assembly.ts`, S117), 13-check QC battery (`render-qc.ts`, `qc.ts`).
- **Planner precedents:** `whiteboard/beat-plan.ts` + `llm-planner.ts` (deterministic plan first, LLM assist second).
- **Everything else reusable:** scene editor/repair stack, SFX (`sfx.ts`, −16 LUFS contract, off by default), captions, audiomix, SVG primitives (`whiteboard/svg.ts`), unit battery (`scripts/test-unit.mts`), e2e infra.

No duplicate engines, no duplicate timeline, no unnecessary rewrites. G1 adds a third engine consumer under the same wall, the same clock and the same one renderer.

## 1. Objective and scope

Grow the whiteboard engine into a motion-graphics engine sharing TubeForge's renderer, timeline and QC gates:

- Graphics grammar (declarative scene document)
- Text/typography animation (per-char/word/line reveals, kinetic type, counters)
- Shape and vector animation (draw-on, fill/stroke animation, bounded morph)
- Animated diagrams (process/flow graphs, staged reveals, path-following connectors)
- Animated charts and infographics (bar, line, area, donut, progress, big-number — data-driven)
- Keyframes and easing (compiled onto the Stage S substrate)
- Transitions (element-level and scene-level, overlap-accounted)
- Draft preview path and preflight (adapted from Stickman B6 patterns)
- Scene-level editing and repair through the existing scene stack

**Out of scope:** skeletal characters (K1), cinematic camera vocabulary beyond what `motion.ts` already provides (C2-ext), per-scene engine routing (Stage R), mixed-engine crossfades beyond lane ordering (Stage X), any VoiceStudio work (T-series).

## 2. External repositories and exact reference files

| Reference file (Stickman, MIT) | What G1 borrows | What G1 must NOT take |
|---|---|---|
| `skills/directing-stickman-videos/scripts/b6_character_preflight.py` | Preflight-before-spend pattern: structured JSON report, `not_certified` list, `scene_and_final_review_required` flag, exit-code semantics | The puppet/ink measurements (B6-specific) |
| `skills/directing-stickman-videos/scripts/b6_iteration.py` (`RenderViewport`, `iteration_plan`) | Immutable draft viewport: scale ∈ {0.5, 0.75, 1.0}, even dims, drafts labelled non-reviewable, `inherited_review_credit: false`; fingerprint-diff repair worklist with neighbor padding | Their 30 fps constant and 2/30 s padding (generalize to the scene fps) |
| `skills/directing-stickman-videos/references/b6-sample-1-acceptance.md` | QC matrix structure: subcheck IDs, required result, allowed variation, inspect/repair guidance, restricted N/A, "a passing broad category cannot cover an unchecked subcheck", three separate decisions (technical / review / user) | Their 35 B6-specific rows and the sample-locked quality target (SHA-pinned Eiffel reference) |
| `skills/directing-stickman-videos/scripts/b6_actions.py` | Timing-helper decoupling: validated preset helpers returning plain data, endpoint-agreement checks | The puppet pose presets |
| `skills/directing-stickman-videos/references/b6-fast-iteration.md` | "Draft grants no creative pass or user approval" rule | Nothing else |

Licensing: Stickman is MIT ("© 2026 Stickman Video Director contributors") — patterns may be adapted; if any file is vendored it carries attribution. VoiceStudio is out of G1 scope; AGPL constraints apply only from T1 onward (separate unmodified sidecar, API boundary).

## 3. Existing TubeForge files to modify (all changes additive; hunks kept small and isolated)

| File | Change |
|---|---|
| `src/lib/tubeforge/types.ts` | Add the `graphics` entry to `RENDER_MODES` (L107) in the same commit as the lane change (S120 lockstep rule). `TimelineTrackDTO.kind` L580 already has the seat — no change there |
| `src/lib/tubeforge/render-lane.ts` | Extend `RenderLane` and `resolveRenderLane` with the graphics lane; keep pure; extend the unit pins |
| `src/lib/tubeforge/render.ts` | Add the graphics segment builder + compositor case, mirroring the `render3d.ts` peer-lane integration; no new rasterizer — reuse existing canvas/SVG output contracts |
| `src/lib/tubeforge/render-assembly.ts` | Include graphics manifests for approved scenes only (S117 rule preserved: drafts never enter the assembly) |
| `src/lib/tubeforge/render-qc.ts` (+ `qc.ts`) | Register the graphics QC group in the existing battery |
| `src/lib/tubeforge/director.ts`, `director-plan.ts` | Allow `graphics` as a per-scene engine value in the plan payload (explicit routing intelligence stays in Stage R) |
| `src/app/api/videos/[id]/render/route.ts` | Accept and validate the graphics lane |
| `src/components/tubeforge/scene-editor.tsx` | Graphics preview + edit affordances, reusing existing scene-repair entry points |
| `scripts/test-unit.mts` | Register the new probe module |
| `README.md`, `docs/design/s120-2d-animation-roadmap.md` | Status updates at stage close (also lands the G0 §7 reconciliation edits) |
| `.github/workflows/ci.yml` | **No change** — the 8 jobs already run the unit battery and e2e globs |

## 4. New files to create

Engine modules (all leaf modules: import only the shared contract, `anim/*`, `whiteboard/svg.ts` primitives, and their own siblings):

| # | File | Purpose |
|---|---|---|
| 1 | `src/lib/tubeforge/graphics/grammar.ts` | `GraphicsDoc` schema: version, canvas, layer tree, typed payload unions per element kind |
| 2 | `src/lib/tubeforge/graphics/validate.ts` | Schema/bounds/budget validation; structured findings; sanitizes all text/URL payloads; rejects external fetches at render time |
| 3 | `src/lib/tubeforge/graphics/keyframes.ts` | Compile GraphicsDoc channels onto `anim/keyframe.ts`/`anim/easing.ts`; no new easing names without a shared commit |
| 4 | `src/lib/tubeforge/graphics/typography.ts` | Kinetic text: per-char/word/line reveals, counters; deterministic text metrics |
| 5 | `src/lib/tubeforge/graphics/shapes.ts` | Vector animation: draw-on, fill/stroke animation, bounded same-command-count morphs |
| 6 | `src/lib/tubeforge/graphics/charts.ts` | Data-driven animated charts (bar, line, area, donut, progress, big-number); pure data → geometry |
| 7 | `src/lib/tubeforge/graphics/diagrams.ts` | Process/flow diagrams, staged reveals, path-following connectors |
| 8 | `src/lib/tubeforge/graphics/transitions.ts` | Element/scene transitions (fade, scale, slide, wipe, clip-path) with overlap accounting on the 2-dp clock |
| 9 | `src/lib/tubeforge/graphics/planner.ts` | Script/beat → GraphicsDoc planner (deterministic fallback; LLM assist via the existing provider layer) |
| 10 | `src/lib/tubeforge/graphics/tracks.ts` | `graphicsTracks(doc, fps)` — the S87 projection, mirroring `whiteboard/tracks.ts` law: one clip per scene, contiguous by construction, frame-quantized |
| 11 | `src/lib/tubeforge/graphics/render.ts` | Deterministic frame renderer: `(doc, seed, tMs) → frame` — pure, no wall-clock, no network |
| 12 | `src/lib/tubeforge/graphics/preflight.ts` | Preflight before render (Stickman pattern): JSON report, `not_certified` list, `scene_and_final_review_required: true` |
| 13 | `src/lib/tubeforge/graphics/draft.ts` | Draft viewport adapter (Stickman `RenderViewport` pattern): scale ∈ {0.5, 0.75, 1.0}, even dims ≥ 64 px, output labelled non-reviewable, `inherited_review_credit: false` |
| 14 | `src/lib/tubeforge/graphics/qc.ts` | G1 subcheck matrix — TubeForge-authored rows using the Stickman matrix **structure**; unchecked subcheck fails the scene |
| 15 | `src/app/api/videos/[id]/graphics/route.ts` | Scaffold/CRUD for graphics scenes (mirror of the whiteboard route family) |
| 16 | `src/app/api/videos/[id]/graphics/render/route.ts` | Final + draft render endpoints (draft clearly labelled) |
| 17 | `src/components/tubeforge/graphics/graphics-canvas.tsx` | Preview canvas (role mirror of `wb-canvas.tsx`) |
| 18 | `src/components/tubeforge/graphics/graphics-studio.tsx` | Studio panel (role mirror of `whiteboard-studio.tsx`) |
| 19 | `scripts/g1-graphics-unit-probe.mts` | Unit battery module (rename to the next `sN` number if the team keeps that convention) |
| 20 | `scripts/g1-graphics-proof.mts` | Proof script (mirror of `scripts/w7-finishing-proof.mts`) |
| 21 | `e2e/graphics.spec.ts` | Playwright suite (mirror of `e2e/whiteboard.spec.ts`) |
| 22 | `docs/audits/g1-motion-graphics.md` | Stage audit record |
| 23 | `docs/audits/g1-blind-rescore.md` | S120 §4 blind re-score result for G1 (≥3 scorers, composite ≥ 4/5) |
| 24 | `docs/design/g1-motion-graphics-spec.md` | This spec, committed to the repo |

## 5. Architecture and data contracts

```ts
// grammar.ts (v1)
interface GraphicsDoc {
  version: "g1/1";
  sceneId: string;
  canvas: { width: number; height: number; fps: 24 | 30 };
  layers: GraphicsLayer[];            // z-order = array order, bottom-first
}
interface GraphicsLayer {
  id: string;
  kind: "text" | "shape" | "image" | "chart" | "diagram" | "group";
  window: { startMs: number; endMs: number };   // inside the scene window, shared clock
  transform?: Keyframe[];             // compiled via graphics/keyframes.ts
  opacity?: Keyframe[];
  enter?: TransitionSpec;
  exit?: TransitionSpec;
  payload: TextPayload | ShapePayload | ImagePayload | ChartPayload | DiagramPayload;
  children?: GraphicsLayer[];         // groups only
}
```

Laws:

1. **One clock:** every window/channel is quantized through `anim/clock.ts`; the 25,920-frame budget is shared. G1 is the third consumer under the same wall.
2. **One easing table:** easing values are drawn only from `anim/easing.ts` `EaseName`. Extending the union is a shared-substrate commit, not a G1-local one.
3. **Projection law:** `graphicsTracks` emits one clip per scene on the 2-dp composition clock, contiguous by construction; the video row stays the source of truth.
4. **Lane lockstep:** `RENDER_MODES` + `render-lane.ts` + `render.ts` case land in the same commit.
5. **One renderer:** the graphics segment builder plugs into the existing compositor like `render3d.ts` does; track order defines layer ordering; audio/subtitle lanes stay shared (`audiomix.ts`, `captions.ts`).
6. **Determinism:** frame = pure function of (doc, seed, tMs). Golden-frame hashes pin output. No network, no wall-clock, no unseeded randomness at render time.
7. **Draft ≠ approval (Stickman rule):** drafts carry `inherited_review_credit: false` and never enter `render-assembly.ts`; final QC runs only on the approved full-scale render.

## 6. Dependencies

- **Runtime:** zero new dependencies. Pure TypeScript over the existing `anim/` substrate, `whiteboard/svg.ts` primitives and the existing compositor.
- **Build/test:** existing toolchain only (unit battery, Playwright, CI jobs unchanged).
- **External:** none. Stickman contributes patterns (MIT); VoiceStudio is explicitly out of scope until T1.

## 7. Security and licensing considerations

- Stickman patterns are MIT; adapted files carry attribution "pattern adapted from Stickman Video Director (MIT © 2026 contributors)". Do not vendor their sample-locked quality target or B6-specific rows.
- CSP: any new SVG/DOM output must pass the S104 CSP gate (the whiteboard CSP regression `5e9eeef` is the precedent to avoid). `validate.ts` sanitizes all text/URL payloads; no inline script/style injection from GraphicsDoc data; no external fetches at render time.
- LLM planner calls go through the existing provider layer with existing key handling; no new secrets, no credential material in GraphicsDoc or logs.
- Charts must not leak source data into logs or error reports.

## 8. Tests

- **Unit (new probe module):** grammar/validate (schema, bounds, budget, sanitization), keyframes (ascending/clamped/easing law), typography/shapes/charts/diagrams (deterministic geometry from fixed inputs), transitions (overlap accounting), tracks (contiguity, frame quantization, 2-dp clock), render (golden-frame hashes), preflight/draft (report schema, scale restrictions, non-reviewable labels), qc (unchecked-subcheck failure rule).
- **Integration:** graphics route flow scaffold → plan → validate → draft → render; approved-only manifest enforcement for graphics scenes.
- **Regression:** the existing 597-test battery stays green; `render-lane.ts` unit pins extended, not broken; `git diff main -- src/lib/tubeforge/whiteboard/` must be empty at stage close (whiteboard untouched); QC battery grows from 13 checks with the graphics group.

## 9. Acceptance criteria

1. `resolveRenderLane` returns the graphics lane for the new mode; `RENDER_MODES`, lane and compositor case land in one lockstep commit.
2. `graphicsTracks` output is contiguous by construction and frame-quantized on the 2-dp composition clock (property-tested).
3. Same doc + seed → identical frame hashes (determinism proof recorded).
4. Draft at 0.5 scale measures ≥ 2× faster than final in the probe and carries the non-reviewable label and `inherited_review_credit: false`.
5. QC group enforced: any unchecked subcheck fails the scene (no broad-pass cover).
6. Blind perceptual re-score per S120 §4: ≥ 3 scorers, composite ≥ 4/5, recorded in `docs/audits/g1-blind-rescore.md`. A failing gate routes back into G1 before any Stage X work.
7. 8/8 CI gates green on the stage-close commit; unit battery count reported 597 → N in the close commit.
8. README + S120 doc updated at close (W-track-style status lines), including the G0 §7 reconciliation edits.
9. Whiteboard engine byte-identical (`src/lib/tubeforge/whiteboard/` diff empty).

## 10. Rollback strategy

- The graphics mode ships dark: present in code, not exposed in the UI until acceptance passes (or behind the repo's existing feature-flag pattern).
- All hunks additive and isolated per file; revert sequence: (1) revert the lockstep commit (types.ts + render-lane.ts + render.ts case), (2) delete the `graphics/` module dir, routes, components, scripts, docs. No data migrations; timeline rows are unaffected because the projection is empty when no graphics scenes exist.
- Golden-frame hashes and lane unit pins detect any accidental compositor drift at revert time.

## 11. Explicit completion evidence

At stage close, the G1 audit record (`docs/audits/g1-motion-graphics.md`) must contain: commit list with descriptive subjects; unit-battery output (597 → N); golden-frame hash table; draft-speed probe numbers; blind re-score kit results and composite score; CI run URL for the stage-close commit; the updated README/S120 status lines; e2e suite result.

## 12. Execution order

1. **P0 (prereq):** merge the G0 §7 S120 reconciliation edits; execute the outstanding post-W7 blind re-score (S120 §4 gates G1).
2. **P1:** `grammar.ts`, `validate.ts`, `keyframes.ts` + unit probes — pure modules, no pipeline touch.
3. **P2:** `tracks.ts` + the `RENDER_MODES`/lane/lockstep commit + graphics route scaffold + `draft.ts`, `preflight.ts`.
4. **P3:** `typography.ts`, `shapes.ts`, `charts.ts`, `diagrams.ts`, `transitions.ts`, then `planner.ts` (deterministic first, LLM second).
5. **P4:** `render.ts` segment builder + compositor case + `render-assembly.ts` + QC registration.
6. **P5:** e2e suite, proof script, blind re-score, docs close.

## 13. Open questions for spec review

1. Naming: keep `g1-*` script names or renumber to the next `sN` stage number?
2. Does the deterministic-first planner satisfy Stage R's later needs, or should planner output already carry R-routing hints now?
3. Canvas fps: S120 frames the budget at 24 fps; Stickman drafts at 30 fps. Should `GraphicsDoc.canvas.fps` accept 30 now (the clock math already generalizes) or stay 24-only until K1?

# S123 — Motion Graphics Engine (milestone G1): Implementation Specification — Rev 2

| | |
|---|---|
| Milestone | G1 — Motion graphics, executed as stage **S123** (decision D1) under the S120 programme |
| Revision | **Rev 2** (2026-11-14) — approved decisions D1–D4 incorporated; unmerged branch prior art reconciled into the plan |
| Status | **APPROVED with revisions.** P1 is prepared, **not authorized**. All repository operations remain read-only until separate implementation authorization (decision D4). |
| Main repository | `ibis01/tubeforge` (all work happens here; TubeForge stays the single production orchestrator) |
| Baseline | G0 verified baseline report (`docs/tubeforge/G0-baseline-report.md`), main HEAD `37796ce`, plus the branch inventory in §1 |
| References | `kaomei/stickman-video-director` (MIT — workflow patterns only); in-repo drafts `docs/audits/external-2d-animation-roadmap.md` + `docs/audits/external-w5-g1-api-drafts.md` (branch `docs/external-2d-roadmap`) |

## 0. Governing decisions (approved 2026-11-14 — binding)

| ID | Decision | Resolution in this revision |
|---|---|---|
| D1 | Script naming: `sN` — next available sequential milestone number; avoid collisions; update docs/CI consistently | **S123** (verified free — see §1.2). New scripts: `scripts/s123-graphics-proof.mts`, `scripts/s123-route-e2e.mjs`; design/audit docs carry `s123-` names; no CI changes required (CI already runs `scripts/test-unit.mts`, where G1 registers suites) |
| D2 | Director routing: optional advisory metadata only; no routing logic in G1; no Phase R dependency; G1 must work when routing metadata is absent | §5.1 — `GraphicsRoutingHints`, defined **locally** in `graphics/types.ts` (no `director-plan.ts` import); optional per-scene field; render pipeline never reads it; byte-identical output without it (pinned by test) |
| D3 | Frame rates: 24 and 30 fps end-to-end; shared time-based animation model; validate frame-index-to-time conversion at both rates | §5.2 — verified consistent against the actual substrate (`frameCountOf(durationMs, fps)`, `framePlanWindows(sceneMs, fps)` are fps-parameterized on main; `GraphicsDoc.fps: 24 \| 30` already in the branch grammar; `graphicsFrameCount` uses `doc.fps`). Remaining P1 work: per-fps unit pins + golden frames (§8) |
| D4 | Repository access read-only until separate implementation authorization | Honored: every statement in this revision is grounded in read-only API evidence; no commits, branches, PRs, or file modifications were made in TubeForge |

## 1. Branch reality — already-implemented prior art (adopt, do not duplicate)

Read-only inspection on 2026-11-14 revealed that the G1 programme has already been **drafted and partially implemented on unmerged branches**, all clean descendants of main `37796ce` (`behind: 0`).

### 1.1 Inventory

| Branch | Ahead | Content | Disposition |
|---|---|---|---|
| `feat/g1-graphics-doc` | 1 | `358412f` G1.1 — GraphicsDoc grammar + validator (`src/lib/tubeforge/graphics/types.ts`) + `test-unit.mts` registration | **ADOPT** (P1 core) |
| `feat/g1-graphics-frame` | 2 | + `be9eb0b` G1.2 — frame truth `frameAt(doc, tMs)` (`graphics/frame.ts`, pure) | **ADOPT** (P1 core) |
| `feat/g1-graphics-compose` | 3 | + `49b0d40` G1.3 — composer: static skeleton + one `APPLY_GRAPHICS_FRAME_FN` (`graphics/compose.ts`) | **ADOPT** (P2) |
| `feat/g1-graphics-planner` | 4 | + `540ca06` G1.4 — deterministic scaffold planner + metered LLM planner with per-element degradation (`graphics/planner.ts`, `graphics/llm-planner.ts`) | **ADOPT** (P2) |
| `feat/s121-p0…p3p4-scaling` | 6 | **S121 = unified integration roadmap** (`docs/design/s121-integration-roadmap.md`): VoiceStudio optional audio provider + measured word-timing ASR, semantic scene directives + pause-aware captions, consent ledger, `anim/camera|ik|contact|gait.ts` substrate, dub/diarization client, model-license policy, deployment security posture | **T-series/K1 substrate — numbering reserved**; outside G1 scope |
| `feat/s122-character-engine` | 7 | **S122 = K1 slice 1** — 2D character-engine substrate + VoiceStudio adapter (`docs/design/k1-character-engine.md`, `scripts/test-voicestudio-adapter.mts`) | **K1 — numbering reserved**; outside G1 scope |
| `docs/s120-status-reconcile` | 1 | `0ad5faf` — the S120 status reconciliation (W3–W7 LANDED), i.e. the G0 §7 edits already drafted | **ADOPT at P0** (merge instead of re-authoring) |
| `docs/external-2d-roadmap` | 1 | `498759b` — the external file-by-file 2D roadmap + W5/G1 API drafts, re-baselined at `37796ce` | Reference: the branch code cites it ("Drafted externally (Part F)") |

The `docs/s120-status-reconcile` branch records G1 as "**open as PRs #14–#17**" — the four `feat/g1-graphics-*` branches. The `s121` and `s122` chains stack on each other; the `g1` chain is independent but **both chains edit `scripts/test-unit.mts`** — expect a small, mechanical merge conflict (suite-registration blocks) at P1/P2 merge time.

### 1.2 Next sequential sN — evidence (decision D1)

| Source | Highest sN observed |
|---|---|
| `scripts/` (191 entries) | `s94` |
| `docs/design/` | `s120-2d-animation-roadmap.md` |
| `docs/audits/` | `s87-*` + the `wN-*` W-track records |
| `worklog.md` | no S121+ mention (grep `S12[0-9]`: only S118–S120 receipts) |
| Full main tree (`truncated: false`, 997 entries) | no `s12[3-9]` filenames; no `graphics` paths |
| Branches | **S121 taken** (4 branches, 6 commits), **S122 taken** (1 branch, 7 commits) |

**Resolution: S123 is the next available sequential milestone number.** The existing G1.x commit labels remain in history; at merge time, new commits and the PRs should carry S123 subjects (house style: `feat(graphics): S123 …`), and docs use `s123-` names: `docs/design/s123-motion-graphics.md`, `docs/audits/s123-motion-graphics.md`, `docs/audits/s123-blind-rescore.md`.

## 2. What already exists (do NOT rebuild)

**On main (verified):**
- `anim/` substrate (Stage S `14b67fe`): `anim/easing.ts` (`EaseName`, pure progress curves in [0,1], clamped, `evalEase`, `isEaseName` — ONE curve truth, fps-free); `anim/clock.ts` (`ANIM_FRAME_BUDGET = 25_920` frames; `quantizeClock` 2-dp; **`frameCountOf(durationMs, fps)`**; **`framePlanWindows(sceneMs, fps)`** — fps-validated, contiguity by construction). G1 consumes; never a second clock/easing table.
- S87 timeline + `whiteboard/tracks.ts` projection law (2-dp clock, frame-quantized, contiguous by construction, leaf-module imports); `render-lane.ts` (S119); `TimelineTrackDTO.kind` seat `"graphics"` (`types.ts` L580); `RENDER_MODES` (L107) without `graphics` yet; one compositor (`render.ts`) + approved-only assembly (S117) + QC battery; scene editor/repair stack; SVG primitives (`whiteboard/svg.ts` — `sanitizeSvg`, `pathSegments`, `totalLength`, `countPathCommands`, `Placement`); `estimateNarrationMs` (2.6-wps house clock, `whiteboard/timing.ts`); unit battery `scripts/test-unit.mts`.

**On `feat/g1-graphics-planner` (Rev 1's greenfield proposals are superseded by these):**
- `graphics/types.ts` (G1.1): `GraphicsDoc` v1 — `version`, `title`, `width`/`height` from `GRAPHICS_SURFACES` (1920×1080, 1080×1920, 1080×1080), **`fps: 24 | 30`**, `scenes[]`; closed v1 element set (`headline, subhead, bullet, counter, bar, barChart, icon, callout, shape, group`); closed motion set (`fade, rise, slide, pop, wipe, count, grow, draw`) with the enforced `MOTION_KINDS_BY_ELEMENT` compatibility table; typed payloads; `GRAPHICS_BUDGETS` named walls (32 elements/scene, 24 scenes, 120 s scene cap, 900 s explicit project cap, 8 bar rows, group depth 1, 512 icon path commands); house doc laws (versioned, tolerant parse, strict write, byte-stable round-trip; errors → `doc: null`, warnings → additive read, clamps with warnings); `parseGraphicsDoc` / `validateGraphicsDoc` / `writeGraphicsDoc`.
- `graphics/frame.ts` (G1.2): `frameAt(doc, tMs) → GraphicsFrameState` — THE pure frame truth, **millisecond-based**, clamped motion windows, fixed precedence **emphasis > exit > enter**, `GRAPHICS_MOTION_SEMANTICS` constants, `graphicsFrameCount(doc) = frameCountOf(totalMs, doc.fps)` (L274–279).
- `graphics/compose.ts` (G1.3): `composeGraphicsScene` + `graphicsFramePayload` + `APPLY_GRAPHICS_FRAME_FN` — one compose, one applier, two callers (renderer + editor); **no CSS animation**; deterministic number formatting; reveal mechanisms (bar lengths / stroke-dash / grow / wipe clip); `sanitizeSvg` first, HTML-escape second; `GRAPHICS_COMPOSE_DEFAULTS` one table; no camera — "the doc clock IS the timeline".
- `graphics/planner.ts` (G1.4): deterministic zero-AI scaffold (keyword → archetype rule table, icon library, per-kind motion defaults, never proposes illegal motions); `graphics/llm-planner.ts`: metered `aiCallJson` via the single budget choke point, per-element degradation, byte-identical fallback to the native scaffold.
- `scripts/test-unit.mts`: registered suites ("graphics — G1.1 the doc contract + validator", …) with imports of the above — the established registration pattern for this work.

**Consequence:** Rev 1's proposed `graphics/grammar.ts`, `graphics/validate.ts`, generic `Keyframe[]`-channel layer model, and per-stage probe scripts are **withdrawn** — adopting them would duplicate the branch's closed grammar and violate the no-rewrite rule. The closed motion-kind grammar replaces generic keyframes for G1; `anim/keyframe.ts` remains THE generic substrate for K1's needs.

## 3. Objective and scope (unchanged from Rev 1, restated against branch reality)

Land a motion-graphics engine sharing TubeForge's renderer, timeline and QC gates: declarative graphics doc, kinetic text, counters, bars/charts, icons, shapes, staged reveals, transitions; planner (native + LLM); draft/preflight paths; timeline projection; compositor integration; QC; studio UI; e2e.

**Out of scope:** skeletal characters (K1 = S122's track), cinematic camera (C2-ext), per-scene engine routing logic (Stage R — D2 keeps only advisory metadata), mixed-engine composition (Stage X), VoiceStudio (T-series = S121's track). Graphics is a peer lane: "no camera; the doc clock IS the timeline" (compose.ts).

## 4. External references and exact files

| Source | File | Use |
|---|---|---|
| Stickman (MIT) | `skills/directing-stickman-videos/scripts/b6_character_preflight.py` | Preflight-before-spend pattern (§7 `graphics/preflight.ts`) |
| Stickman (MIT) | `skills/directing-stickman-videos/scripts/b6_iteration.py` | Draft viewport pattern (scale ∈ {0.5, 0.75, 1.0}, drafts non-reviewable, `inherited_review_credit: false`); fingerprint-diff repair worklist |
| Stickman (MIT) | `skills/directing-stickman-videos/references/b6-sample-1-acceptance.md` | QC matrix **structure** only (IDs, required result, allowed variation, restricted N/A, no broad-pass cover) — rows are TubeForge-authored |
| In-repo drafts | `docs/audits/external-2d-animation-roadmap.md` (branch `docs/external-2d-roadmap`) | The file-by-file plan the G1.x branches implemented; its house-law table (no second renderer, one frame truth, determinism, named walls, leaf modules, AI-suggests-human-approves) binds this spec |
| In-repo drafts | `docs/audits/external-w5-g1-api-drafts.md` (same branch) | The G1 API draft — compare at P2 against the landed `types.ts`/`frame.ts`/`compose.ts`, record divergences like Part G did for W5 |

## 5. Architecture and data contracts

### 5.0 The contract as it exists on the branch (binding baseline — do not fork)

`GraphicsDoc` v1 → validated by `parseGraphicsDoc`/`validateGraphicsDoc` (closed sets, named walls, tolerant parse) → `frameAt(doc, tMs)` pure frame truth (ms clocks: explicit `durationMs` > `estimateNarrationMs`; channels opacity/x/y/scale/rotateDeg/progress/counterValue) → `composeGraphicsScene` + `APPLY_GRAPHICS_FRAME_FN` (one applier for render and editor) → projection to S87 tracks (P2) → lane lockstep into the one compositor (P3). Laws: pure modules, leaf-module imports, no CSS animation, no randomness, named walls on every unbounded dimension, closed sets grow only via design-doc slices.

### 5.1 (D2) Advisory routing metadata — the exact addition

Defined in `graphics/types.ts` (graphics-local; **no** `director-plan.ts` import — the leaf-module law is what keeps Phase R out):

```ts
/** Advisory ONLY (decision D2). Stage R may map this structurally later;
 *  G1's render pipeline never reads it. Absence changes nothing. */
export interface GraphicsRoutingHints {
  suggestedEngine?: "whiteboard" | "graphics" | "character" | "cinematic" | "mixed";
  confidence?: number;   // 0..1 — validator clamps with a warning
  reason?: string;       // ≤ 200 chars, advisory rationale
}
// GraphicsScene gains:  routing?: GraphicsRoutingHints;
// SCENE_KEYS gains:     "routing";
```

- Per-scene placement (routing is a per-scene concept in S120 §9); the doc stays valid with or without it.
- Junk `routing` is **dropped with a warning** under the tolerant-parse law — never an error, never defaulted.
- Readers: the LLM planner **may** populate it; UI may surface it; `frameAt`, `compose`, `tracks`, `render` **must not** branch on it.
- Neutrality pin (new unit test): a doc with and without `routing` round-trips byte-identically and yields identical `frameAt` states and identical compose output.

### 5.2 (D3) The 24/30 fps contract — verified against the substrate

The shared time-based model is already the substrate's design; fps enters **only at delivery boundaries**:

| Concern | Rule | Evidence |
|---|---|---|
| Motion truth | Milliseconds only — `frameAt(doc, tMs)`, scene clocks in ms, easing curves are pure functions of progress [0,1] | `frame.ts` (G1.2), `anim/easing.ts` |
| Frame counts | Derived, never stored: `frameCountOf(durationMs, fps)` | `anim/clock.ts` (fps-parameterized) |
| Track windows | `framePlanWindows(sceneMs, doc.fps)` — contiguity by construction at **either** fps; junk fps refuses loudly | `anim/clock.ts` |
| Doc contract | `fps: 24 \| 30` already declared | `graphics/types.ts` (`GraphicsDoc`) |
| Budget wall | `ANIM_FRAME_BUDGET = 25_920` **frames** → 18.0 min @ 24 fps, **14.4 min @ 30 fps**; every budget check must derive duration caps from `doc.fps` (never assume 24) | `anim/clock.ts`, `graphics/types.ts` (`GRAPHICS_FRAME_BUDGET`) |
| Frame counter | `graphicsFrameCount(doc) = frameCountOf(last.endMs, doc.fps)` — already fps-correct | `frame.ts` L274–279 (verified) |
| Audio sync | Scene windows in ms; VO-measured durations ride the render call — fps-independent | `frame.ts` (sceneClocks), the anchors-are-inputs law (W4) |
| Index↔time | `tMs = frame · 1000 / fps`, `frame = round(tMs · fps / 1000)` — conversion helpers derive from `frameCountOf`; indices are never stored in docs | P1 pins below |

**P1 validation pins (both rates):** for fps ∈ {24, 30} — (1) `frameCountOf` round-trip: `frameCountOf(timeAtFrame(n) · 1000, fps) === n` for n ≥ 1; (2) `framePlanWindows` contiguity + `deliveredSec === frames / fps`; (3) `graphicsFrameCount` equals `frameCountOf(totalMs, doc.fps)`; (4) golden-frame hashes captured **per fps** (same doc: identical ms-sampled states at coincident times, distinct frame series); (5) budget refusal computed at `doc.fps` (a 30 fps doc must refuse at 864 s, not 1080 s); (6) the D2 neutrality pin.

## 6. Existing TubeForge files to modify

| File | Change | Phase |
|---|---|---|
| `src/lib/tubeforge/graphics/types.ts` | Add §5.1 routing field + validator handling (advisory, tolerant) | P1 |
| `scripts/test-unit.mts` | Register the D2/D3 pin suites (routing neutrality, per-fps conversion pins, budget-at-fps) | P1 |
| `src/lib/tubeforge/types.ts` | Add the `graphics` entry to `RENDER_MODES` (L107) — lockstep with the lane change (S120 rule). `TimelineTrackDTO.kind` L580 already seats it | P2 |
| `src/lib/tubeforge/render-lane.ts` | Extend `RenderLane`/`resolveRenderLane` with the graphics lane; extend unit pins | P2 |
| `src/lib/tubeforge/render.ts` | Graphics segment builder + compositor case (the `render3d.ts` peer-lane precedent; one renderer) | P3 |
| `src/lib/tubeforge/render-assembly.ts` | Approved-only graphics manifests (S117 rule; drafts never enter) | P3 |
| `src/lib/tubeforge/render-qc.ts` + `qc.ts` | Register the graphics QC group | P3 |
| `src/app/api/videos/[id]/render/route.ts` | Accept/validate the graphics lane | P3 |
| `src/components/tubeforge/scene-editor.tsx` | Graphics preview/edit affordances via the existing scene stack | P4 |
| `README.md`, `docs/design/s120-2d-animation-roadmap.md` | Stage-close status; **merge branch `docs/s120-status-reconcile` at P0 instead of re-authoring** | P0/P5 |
| `.github/workflows/ci.yml` | **No change** — CI already runs `scripts/test-unit.mts` and the e2e globs | — |

Note: Rev 1 proposed giving `director-plan.ts` a graphics engine value; under D2 that change is **removed from G1 entirely** — routing metadata lives only in the graphics doc, and Stage R owns the director side.

## 7. New files to create

**Adopt from branches (not new work — merge `feat/g1-graphics-doc` + `feat/g1-graphics-frame` at P1; `feat/g1-graphics-compose` + `feat/g1-graphics-planner` at P2):** `graphics/types.ts`, `graphics/frame.ts`, `graphics/compose.ts`, `graphics/planner.ts`, `graphics/llm-planner.ts` + their `test-unit.mts` suites.

**Genuinely new (S123-named where applicable):**

| # | File | Purpose | Phase |
|---|---|---|---|
| 1 | `src/lib/tubeforge/graphics/tracks.ts` | `graphicsTracks(doc)` → S87 projection via `framePlanWindows(sceneMs, doc.fps)` — mirror of `whiteboard/tracks.ts` law; one clip per scene, contiguous by construction, fps-correct | P2 |
| 2 | `src/lib/tubeforge/graphics/preflight.ts` | Preflight-before-spend (Stickman pattern): JSON report, `not_certified` list, `scene_and_final_review_required`; budget wall enforced at `doc.fps` **before** chromium launches | P3 |
| 3 | `src/lib/tubeforge/graphics/draft.ts` | Draft viewport (scale ∈ {0.5, 0.75, 1.0}, even dims ≥ 64 px, labelled non-reviewable, `inherited_review_credit: false`) | P3 |
| 4 | `src/lib/tubeforge/graphics/qc.ts` | G1 subcheck matrix — TubeForge-authored rows in the Stickman **structure**; an unchecked subcheck fails the scene | P3 |
| 5 | `src/app/api/videos/[id]/graphics/route.ts` | Scaffold/CRUD (mirror of the whiteboard route family) | P4 |
| 6 | `src/app/api/videos/[id]/graphics/render/route.ts` | Final + labelled-draft render endpoints | P4 |
| 7 | `src/components/tubeforge/graphics/graphics-canvas.tsx` | Preview canvas playing `frameAt` through `APPLY_GRAPHICS_FRAME_FN` (one applier, two callers) | P4 |
| 8 | `src/components/tubeforge/graphics/graphics-studio.tsx` | Studio panel (mirror of `whiteboard-studio.tsx`) | P4 |
| 9 | `scripts/s123-graphics-proof.mts` | Proof script (D1 naming; mirrors `scripts/w7-finishing-proof.mts`) | P5 |
| 10 | `scripts/s123-route-e2e.mjs` | Route probe (D1 naming; the house `sN-route-e2e.mjs` pattern) | P5 |
| 11 | `e2e/graphics.spec.ts` | Playwright suite (mirror of `e2e/whiteboard.spec.ts`) | P4 |
| 12 | `docs/design/s123-motion-graphics.md` | This spec, committed | P1 |
| 13 | `docs/audits/s123-motion-graphics.md` | Stage audit record | P5 |
| 14 | `docs/audits/s123-blind-rescore.md` | S120 §4 blind re-score result (≥ 3 scorers, composite ≥ 4/5) | P5 |

## 8. Tests

- **Unit (in `scripts/test-unit.mts`, the branch's established pattern):** existing G1.1–G1.3 suites (grammar, walls, round-trip, compatibility table, group integrity, time sanity, frame truth, composer defaults/reveal mechanisms) — **plus new P1 pins**: D2 routing neutrality (byte-identical round-trip and frames with/without `routing`); D3 per-fps pins (§5.2 items 1–5).
- **Integration (P3/P4):** graphics routes scaffold → plan → validate → draft → render; approved-only manifest enforcement; budget refusal before chromium at `doc.fps`.
- **Regression:** the 597-test battery stays green; `render-lane.ts` pins extended not broken; `git diff main -- src/lib/tubeforge/whiteboard/` empty at close; QC battery grows by the graphics group; golden-frame hashes per fps.
- **Known merge note:** the `g1-*` and `s121/s122` chains both edit `scripts/test-unit.mts` — resolve at merge by keeping both suite blocks; no test-law conflicts (disjoint suites).

## 9. Acceptance criteria

1. D1: all new scripts/docs carry `s123-` names; commit subjects use S123; no collision with any existing ref (evidence §1.2).
2. D2: `routing` is optional, advisory, graphics-local; output is byte-identical with/without it (pinned); no `director-plan.ts` import anywhere under `graphics/`.
3. D3: all §5.2 pins pass at 24 and 30 fps; golden frames captured per fps; budget wall derived from `doc.fps`.
4. `resolveRenderLane` returns the graphics lane; `RENDER_MODES` + lane + compositor case land in one lockstep commit.
5. `graphicsTracks` contiguous by construction and frame-quantized via `framePlanWindows` at `doc.fps` (property-tested).
6. Same doc + seed → identical frame hashes (determinism proof recorded, per fps).
7. Draft at 0.5 scale ≥ 2× faster than final in the probe; drafts carry `inherited_review_credit: false` and never enter `render-assembly.ts`.
8. QC group enforced (no broad-pass cover); blind re-score recorded in `docs/audits/s123-blind-rescore.md`, composite ≥ 4/5 — a failing gate routes back before Stage X.
9. 8/8 CI gates green at close; unit count reported 597 → N; README + S120 doc updated (via the `docs/s120-status-reconcile` merge + close edits).
10. Whiteboard engine byte-identical (`src/lib/tubeforge/whiteboard/` diff empty).

## 10. Rollback strategy

- P1/P2 roll-forward is branch merges — rollback = do not merge (branches remain intact, main untouched).
- Post-integration: the graphics mode ships dark (not exposed in the UI until acceptance passes); revert sequence = revert the lockstep commit, then drop `graphics/` additions, routes, components, scripts, docs. No migrations; the S87 projection is empty when no graphics scenes exist.
- Golden-frame hashes and lane pins detect compositor drift at revert time.

## 11. Explicit completion evidence

Stage-close record in `docs/audits/s123-motion-graphics.md`: commit list (S123 subjects), unit-battery output 597 → N, golden-frame hash tables **per fps**, draft-speed probe numbers, blind re-score composite, CI run URL for the close commit, updated README/S120 status lines, e2e result, and the G1.x ↔ S123 commit mapping (PRs #14–#17).

## 12. Execution order

| Phase | Content | Authorization state |
|---|---|---|
| P0 | Merge `docs/s120-status-reconcile`; execute the outstanding post-W7 blind re-score (S120 §4 — the external roadmap explicitly gates G1.1 on it) | Not authorized |
| **P1** | **Merge `feat/g1-graphics-doc` + `feat/g1-graphics-frame`; add D2 routing metadata; add D3 per-fps pins; commit `docs/design/s123-motion-graphics.md`. Scope = schema, grammar, validation, evaluation on the `anim/` substrate, deterministic evaluation, unit tests + pins — exactly the approved P1 list. Must NOT: introduce a second clock, modify whiteboard, integrate a renderer, add routing logic, add runtime dependencies (zero required)** | **Prepared, not authorized** |
| P2 | Merge G1.3 + G1.4 (composer, planners); add `graphics/tracks.ts`; `RENDER_MODES`/lane lockstep | Not authorized |
| P3 | Renderer integration; preflight/draft/qc | Not authorized |
| P4 | Routes, studio UI, e2e | Not authorized |
| P5 | Proof script, blind re-score for S123, docs close | Not authorized |

## 13. P1 readiness — verification summary

The six approval checkboxes are verified with live-repo evidence in the companion report `docs/tubeforge/G1-P1-readiness-verification.md`. Result: **all six pass**; the two material corrections vs. Rev 1 are (a) the next sN is **S123**, not S121 (S121/S122 are taken by pushed branch chains), and (b) P1 is **not greenfield** — it is a merge-and-extend of the existing G1.1/G1.2 branches, which already implement the approved P1 scope on the house contract.

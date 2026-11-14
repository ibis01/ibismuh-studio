# G1 → P1 Readiness Verification Report (read-only review)

| | |
|---|---|
| Scope | The six approval checkboxes from the G1 specification approval (2026-11-14) |
| Method | Read-only GitHub API against `ibis01/tubeforge` (main `37796ce` + 11 pushed branches); no repository modifications |
| Result | **All six checkboxes PASS.** Two material corrections vs. the Rev 1 spec: next sN = **S123** (not S121), and P1 is **merge-and-extend** of existing branch work (not greenfield) |
| Spec revision | `docs/tubeforge/G1-motion-graphics-implementation-spec.md` **Rev 2** |

## Checklist

### 1. Both approved decisions are reflected in the G1 specification — PASS

- **D2 (advisory routing)** → Rev 2 §5.1: `GraphicsRoutingHints` defined locally in `graphics/types.ts` (no `director-plan.ts` import — the leaf-module law is the Phase-R firewall); optional per-scene field; junk dropped with warning under the tolerant-parse law; `frameAt`/`compose`/`tracks`/`render` never read it; byte-identical-output neutrality pinned by a new unit test. Rev 1's `director-plan.ts` change is **removed** from G1.
- **D3 (24/30 fps, time-based)** → Rev 2 §5.2: the fps contract table with per-concern evidence (below), plus the six P1 validation pins.
- **D1 (sN naming)** → Rev 2 §0/§1.2/§7/§9: all new scripts/docs carry `s123-` names; no CI reference changes needed.
- **D4 (read-only)** → honored throughout; noted in the Rev 2 status block.

### 2. The next sequential sN identifier is confirmed — PASS: **S123**

| Source | Observed |
|---|---|
| `scripts/` (191 entries) | max `s94` |
| `docs/design/` | max `s120` |
| `docs/audits/` | max `s87-*` + `wN-*` records |
| `worklog.md` | grep `S12[0-9]` → only S118–S120 receipts; no S121+ |
| Main tree (997 entries, `truncated: false`) | no `s12[3-9]` filenames; no `graphics` paths |
| Branches | **S121 taken** (`feat/s121-p0…p3p4-scaling`, 6 commits — the unified integration roadmap: VoiceStudio audio provider, measured word timing, `anim/{camera,ik,contact,gait}.ts`, dub/diarization, model-license policy, security posture); **S122 taken** (`feat/s122-character-engine`, 7 commits — K1 slice 1 + VoiceStudio adapter) |

The G1 branches are labeled G1.1–G1.4 and correspond to **PRs #14–#17** (per the `docs/s120-status-reconcile` branch). Recommendation: keep `G1` as the milestone name, execute as **S123** — new commits carry `feat(graphics): S123 …` subjects; docs use `docs/design/s123-motion-graphics.md`, `docs/audits/s123-motion-graphics.md`, `docs/audits/s123-blind-rescore.md`; new scripts `scripts/s123-graphics-proof.mts`, `scripts/s123-route-e2e.mjs`.

### 3. The 24/30 fps contract is technically consistent — PASS

Verified against the actual code, not assumed:

| Fact | Evidence |
|---|---|
| `GraphicsDoc.fps: 24 \| 30` is already in the grammar | branch `graphics/types.ts` (G1.1, `358412f`) |
| `frameCountOf(durationMs, fps)` and `framePlanWindows(sceneMs, fps)` are **fps-parameterized** on main; junk fps refuses loudly; contiguity by construction at either rate | `src/lib/tubeforge/anim/clock.ts` |
| Easing curves are pure functions of progress [0,1] — fps-free (one curve truth) | `src/lib/tubeforge/anim/easing.ts` |
| Frame truth is millisecond-based: `frameAt(doc, tMs)`, scene clocks in ms (`durationMs` > `estimateNarrationMs` 2.6-wps house clock) | branch `graphics/frame.ts` (G1.2) |
| The graphics frame counter already uses `doc.fps`: `graphicsFrameCount(doc) = frameCountOf(last.endMs, doc.fps)` | `graphics/frame.ts` L274–279 (verified) |
| The budget wall is **frame-based**: `ANIM_FRAME_BUDGET = 25_920` frames → 18.0 min @ 24 fps, **14.4 min @ 30 fps** — every budget check must derive duration caps from `doc.fps`, never assume 24 | `anim/clock.ts`; becomes a P1 pin (a 30 fps doc must refuse at 864 s, not 1080 s) |
| Audio sync is fps-independent: scene windows in ms; VO-measured durations ride the render call (anchors-are-inputs law, W4) | `graphics/frame.ts` `sceneClocks`; W4 receipts |

**Shared time-based model confirmed:** durations live in ms everywhere; frame indices are always derived (`tMs = frame · 1000 / fps`), never stored in docs. The remaining P1 work is the six validation pins in Rev 2 §5.2 (round-trip, contiguity, counter consistency, per-fps golden frames, budget-at-fps, D2 neutrality).

### 4. Optional Director metadata does not create a Phase R dependency — PASS

- The hints type lives in `graphics/types.ts` — the graphics module stays a leaf; **no import from `director.ts`/`director-plan.ts`** is added anywhere under `graphics/`.
- Nothing in the render pipeline (`frameAt`, `compose`, future `tracks`/`render`) branches on `routing`; the LLM planner may populate it; UI may display it; Stage R can map it structurally later with zero G1 changes.
- The neutrality pin (identical bytes and frames with/without `routing`) makes "absent metadata" a tested invariant, not an assumption.

### 5. P1 files and tests are mapped to actual repository paths — PASS

| Approved P1 item | Actual path | Status |
|---|---|---|
| Graphics document schema | `src/lib/tubeforge/graphics/types.ts` (`GraphicsDoc`, `GRAPHICS_VERSION`, `GRAPHICS_SURFACES`, `GRAPHICS_BUDGETS`) | **Exists** on `feat/g1-graphics-doc` (`358412f`) |
| Graphics grammar | same file — closed v1 element set (10 kinds) + closed motion set (8 kinds) + enforced `MOTION_KINDS_BY_ELEMENT` table | **Exists** (same commit) |
| Input validation | same file — `parseGraphicsDoc`/`validateGraphicsDoc`/`writeGraphicsDoc`; errors/warnings/clamps; byte-stable round-trip | **Exists** (same commit) |
| Keyframe evaluation on the existing substrate | `graphics/frame.ts` imports `evalEase`/`isEaseName` (`anim/easing.ts`), `frameCountOf`/`ANIM_FRAME_BUDGET` (`anim/clock.ts`), `estimateNarrationMs` (`whiteboard/timing.ts`) — no second clock, no second curve table | **Exists** on `feat/g1-graphics-frame` (`be9eb0b`) |
| Deterministic animation evaluation | `frameAt(doc, tMs) → GraphicsFrameState` — pure, clamped, fixed precedence emphasis > exit > enter | **Exists** (same commit) |
| Unit tests and validation fixtures | `scripts/test-unit.mts` suites ("graphics — G1.1 the doc contract + validator", …) registered by the branch | **Exists**; P1 adds the D2/D3 pin suites to the same file |
| P1 additions (this spec) | `graphics/types.ts` (routing field), `scripts/test-unit.mts` (six pins), `docs/design/s123-motion-graphics.md` | Mapped, not yet authorized |

Later phases map equally: `graphics/tracks.ts` (P2, via `framePlanWindows`), `render-lane.ts` + `types.ts` RENDER_MODES lockstep (P2), `render.ts`/`render-assembly.ts`/`render-qc.ts`/`qc.ts` + routes (P3/P4), studio components (P4), `scripts/s123-graphics-proof.mts` + `e2e/graphics.spec.ts` (P4/P5).

### 6. No existing functionality is duplicated — PASS

- Main tree contains **zero** `graphics` paths (verified, untruncated listing) — nothing on main to collide with.
- Rev 1's parallel proposals (`graphics/grammar.ts`, `graphics/validate.ts`, generic `Keyframe[]` layer channels, per-stage probe scripts) are **withdrawn** in Rev 2 — they would have duplicated the branch's closed grammar and generic-keyframe substrate seam.
- The branch consumes the shared substrate (`anim/easing.ts`, `anim/clock.ts`, `whiteboard/svg.ts`, `whiteboard/timing.ts`, `whiteboard/beat-plan.ts`) — the one-clock/one-curve/one-placement laws hold by import, not by convention.
- The composer follows the `wb-page.ts` one-applier law (renderer and editor share `APPLY_GRAPHICS_FRAME_FN`; no CSS animation).
- Watch-item: both the `g1-*` chain and the `s121/s122` chain edit `scripts/test-unit.mts` — a mechanical, disjoint-suite merge conflict to resolve at P1/P2; no test-law conflict.

## Execution boundary (decision D4)

| Activity | Status |
|---|---|
| Read GitHub repositories, inspect files/commits/tests/workflows | Done (read-only, this review) |
| Modify TubeForge files, create commits/branches/PRs | **Not performed, not authorized** |
| P1 implementation | **Prepared** (Rev 2 §12) — awaiting separate authorization |

Recommended P0 pre-step (also unexecuted until authorized): merge `docs/s120-status-reconcile` (the already-drafted S120 status fix) and run the outstanding post-W7 blind re-score — the external roadmap explicitly gates G1.1 on it.

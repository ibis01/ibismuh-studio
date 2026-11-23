# PAE — Architecture Reconciliation & Implementation Specification (Ibismuh Studio Procedural Animation Engine)

- **Date:** 2026-11-15
- **Commit audited:** `60a87e4` (branch `s124/element-editor`), working tree clean at audit time; re-verified gates: typecheck / lint / unit suite all green before any PAE change.
- **Method:** read-only audit first (zero code modified — the Phase 0 constraint), then this specification, then approval-gated incremental implementation. External reference: `lemomo-ai/lemo-opuscar`, cloned **anonymously** to `/tmp/lemo-opuscar` (no credentials used — all four leaked PATs remain revoked-pending; no token ever touched repo access).
- **Purpose:** integrate the strongest technical ideas from Lemo-Opuscar into Ibismuh Studio through a **native Procedural Animation Engine (PAE)** — reconciled against the existing architecture, not pasted over it.

---

## 0. The governing reconciliation

**Principle 0 — extend, never duplicate.** Ibismuh Studio already owns a deterministic, frame-quantized, per-frame-screenshot render pipeline with timeline projection, QC lenses, budget walls, job recovery and cost/security posture. Lemo-Opuscar independently converged on the same core law ("the picture is a function of time"), which is *confirmation, not competition*. PAE is therefore not a new engine: it is the set of **capabilities the existing engines lack**, grafted onto the existing seams.

### The five standing prohibitions, restated as design gates

| Prohibition | How PAE honors it |
|---|---|
| No second animation clock | Every PAE directive evaluates on the **scene-local clock** `frameAt` already resolves; frame counts come only from `anim/clock.ts framePlanWindows` at `doc.fps`. No new timebase exists anywhere in PAE. |
| The whiteboard engine is untouchable | Zero diffs under `src/lib/ibismuh/whiteboard/` across the whole PAE program (CI-verifiable by path filter). |
| No new renderer integration | Camera/tween/events render through the **existing** graphics composer (SVG + `APPLY_GRAPHICS_FRAME_FN`) and the **existing** three.js lane (S94). No Blender, no WebGL post pipeline, no third rasterizer. |
| No Director routing logic | PAE directives are doc-level data. No `director*.ts` file changes in S129–S134; planner *emission* of directives is a later, separately-approved stage. |
| No unjustified dependencies | **Zero new npm dependencies** across all PAE stages. three.js is already present (S94). |

### The reconciliation verdict on "2D/3D renderer adapters"

The directive's Phase 1 target list includes "2D and 3D renderer adapters". Read against the prohibition on new renderers, the honest architecture is:

- **The adapter contract already exists** — it is the shared `anim/` substrate (clock, easing, keyframe) plus the house frame laws (pure `frameAt`, clamped windows, never-NaN channels). The 2D adapter is the graphics lane (`graphics/frame.ts` → `compose.ts` → chromium); the 3D adapter is the S94 lane (`scene3d.ts` → `render3d.ts` → three.js under the same chromium pipeline). A hypothetical Blender exporter would emit the same `scene3d` contract — that is what "adapter" means (the S94 header records this law verbatim).
- **What PAE actually adds** is parity of *animation expressiveness* across both adapters: the 2D lane gains keyframed object tweens + camera motion; the 3D lane gains keyframed object transforms (its camera keyframes shipped in S94). **No adapter is introduced; two existing adapters are completed.** This reading was flagged in the Phase 0 findings as the approval gate; approval covers it explicitly.

---

## 1. Deliverable ① — current architecture inventory (evidence-based)

### 1.1 The shared animation substrate — `src/lib/ibismuh/anim/` (S120 §8)

| File | Exports | Law |
|---|---|---|
| `clock.ts` (70 L) | `ANIM_FRAME_BUDGET` (25,920 f = 18 min @ 24 fps), `quantizeClock` (2-dp), `frameCountOf`, `framePlanWindows` | THE one clock derivation; contiguity by construction; junk durations refuse loudly |
| `easing.ts` (109 L) | 5 curves (`linear`, `ease-in-out`, `ease-out`, `pop`, `ease-back`), `evalEase`, `zoomProgressExpr` | Pure, clamped, closed table; new curve = design-doc slice |
| `keyframe.ts` (68 L) | `Keyframe`, `evalAt` (clamped, per-segment ease from the DESTINATION key), `keyframes` sugar | Strict-ascending validation once; evaluation pure |

### 1.2 The graphics engine (G1, S123–S128) — the 2D procedural lane

| File | Role (verified) |
|---|---|
| `graphics/types.ts` (1,371 L) | Grammar v1: `GRAPHICS_ELEMENT_KINDS` (11), `GRAPHICS_MOTION_KINDS` (8: fade/rise/slide/pop/wipe/count/grow/draw), `MOTION_KINDS_BY_ELEMENT` (closed compat table), `GRAPHICS_BUDGETS` (elementsPerScene 32, scenesPerProject 24, iconPathCommandBudget 512, S128 walls `textCharsMax` 2,000 / `iconPathCharsMax` 4,096, `spriteFramesMax` 48) |
| `graphics/frame.ts` (306 L) | **`frameAt(doc, tMs)` — the ONE motion truth.** Pure, byte-identical pinned. Fixed composition order enter → exit → emphasis (emphasis LAST). Channels: opacity/x/y/scale/rotateDeg/progress/counterValue/frameIndex (S126). Scene-local motion windows (R-6 pin), clamped evaluation → never-NaN outside windows by construction |
| `graphics/compose.ts` (752 L) | SVG skeleton (`<svg id="board">`, one `<g id="ge-{id}">` per element) + `APPLY_GRAPHICS_FRAME_FN` (the ONE applier: set-only DOM per frame) + sanitize/escape security line 1 |
| `graphics/tracks.ts` (117 L) | Schema-3 verified tracks projection: VISUAL (graphics clips, `asset: null` = drawn), AUDIO (VO slots + bed), SUBTITLE — through `framePlanWindows` |
| `graphics/render.ts` (355 L) | Chromium per-frame screenshots (JPEG q92) → per-scene x264 encode → concat + bed; `assertGraphicsBudget` wall BEFORE launch; route-abort security line 2; per-scene context recycling (S75 E10); two-clock assert (plan ≡ delivered) before assembly; `frameStep` look-rate lever |
| `graphics/preflight.ts`, `qc.ts` | Budget wall; QC lens set |
| `graphics/import-store/-validate` (S126) | Sprite sheet/sequence import lane, fail-closed unresolved-asset refusal |
| `graphics/planner.ts`, `llm-planner.ts`, `editor.ts`, `draft.ts` | Deterministic planner; optional AI planner (AI-optional principle); scene edit/repair surface |

### 1.3 The 3D lane (S94) — the second adapter

- `scene3d.ts` (384 L): contract v1 — box/sphere/plane objects, ambient/directional lights, aspects; **camera keyframes already keyframed** (`Scene3DCameraKeyframe`, `cameraAt(keys, t)` — pure clamped linear lerp on normalized t ∈ [0,1]). Objects are **static** (position/rotation/scale have no keyframes).
- `render3d.ts` (224 L): three.js WebGL 2.0 under SwiftShader headless chromium, blob-URL module (no CDN), route-abort, per-frame screenshots, `cameraAt` per frame.

### 1.4 The surrounding infrastructure PAE must reuse (and does)

- `timeline.ts` (816 L) universal contract + Stage X verified engine-authored tracks; timeline is a **projection**, not truth.
- `motion.ts` (1,362 L) cinematic verbs for the ffmpeg zoompan lane (C2-ext: shake/push-follow/drift-crawl) — the ENCODE-level camera for the stock/kenburns lanes.
- `render-lane.ts` + `RENDER_MODES` CI lockstep; `composition-plan.ts` `planFromTracks` (the two-clock pin).
- QC system: `qc-policy.ts`, `graphics/qc.ts`, `scene-qc.ts`, `render-qc.ts`, `visual-qc.ts`; toleration law = required content refuses, optional decoration warns.
- Job infra: durable queue, claim primitive, crash-recovery per job kind; `arthash.ts` content hashing.
- Voice: W4 word anchors (word-timed placement — the opuscar voice-check idea, already shipped).

### 1.5 Lemo-Opuscar's strongest ideas — clean-room harvest

Cloned anonymously; **license tiers verified from its LICENSE file**: code (`core/`, `tools/`, `styleboard/`, `plugin/`) = **MIT**; all Markdown docs + image prompts = **CC BY-NC 4.0**; demo films = CC BY 4.0. Clean-room law: no code copied, no doc text reproduced (Ibismuh Studio is commercial; NC docs are concept-reference only). Ideas harvested at concept level:

| # | Opuscar idea | Ibismuh Studio verdict |
|---|---|---|
| 1 | `window.render(t)` — the picture is a pure function of time; any frame renderable alone, in any order, by any worker | **Already converged** (S123 `frameAt`, byte-identical pin) — confirmation |
| 2 | Seeded determinism (`mulberry`, `hash`); no unseeded randomness, no `Date.now()` | Already the house law (pure modules, `arthash`); PAE extends it: any future randomness in directives must be seeded |
| 3 | One timeline drives picture/voice/music/sound/subtitles | Already stronger (frame-quantized universal contract); PAE-3 adds the missing **event channel** |
| 4 | `window.EV` event list + `events.json` export for mixer sync | **Gap** → S131 |
| 5 | One world→screen function; camera/iris/spotlight follow through it; never hand-typed screen coords | **Gap in 2D** (3D has `cameraAt`) → S130 |
| 6 | `window.TEXTS(t)` + `readcheck` — every on-screen text stays long enough to read | **Gap** → S133 |
| 7 | Frame-parallel workers, JPEG screenshots, grain in ffmpeg not in page | Already the model (JPEG q92, per-frame, worker-level parallelism at the job layer) |
| 8 | Animate on twos for stylized looks; camera/light stay smooth | Already shipped as the `frameStep` look-rate lever (drafts only) |
| 9 | TTS → ASR word-timing check loop | Already shipped (W4 anchors) |
| 10 | `cuecheck` — visual hits vs music cues, 0 ms target | Partial (narration-sync QC) → S131 formalizes hit points as events |

---

## 2. Deliverable ② — capability gap analysis (the 8 Phase 1 targets)

| # | PAE target | State at `60a87e4` | Gap → ticket |
|---|---|---|---|
| 1 | Deterministic animation runtime | EXISTS (`anim/` + `frameAt`) — the strongest asset | Formalized; no work beyond the pins that already hold → no ticket |
| 2 | Animation directive schema | 8 fixed motion kinds in 3 fixed slots (enter/exit/emphasis); rotation never animates; no per-channel keyframes on elements | **S129** — the element tween directive (keyframed channels) |
| 3 | Keyframe/easing system | Substrate exists (`anim/keyframe evalAt`); unreachable from the doc grammar | Consumed by S129/S130/S134 (the substrate finally reaches the doc level) |
| 4 | 2D/3D renderer adapters | Both adapters exist and are honest peers | **Reconciled, not built** (see §0) — S134 completes 3D object parity |
| 5 | Camera & object animation | 2D: encode-level camera only (`motion.ts` zoompan lane); composer camera absent. 3D: camera yes, objects static | **S130** (2D camera) + S129 (2D objects) + **S134** (3D objects) |
| 6 | Timeline event integration | Tracks projection exists; no event/cue channel; graphics assembly has no SFX layer ("minus the SFX layer" — its own header records the hole) | **S131** — scene-level event channel + global projection |
| 7 | Frame-level rendering & recovery | Per-frame deterministic screenshots (yes); but scenes are atomic — a crash re-renders the whole project; no resume manifest | **S132** — resume manifest, scene-level skip + two-clock safety |
| 8 | Animation-specific QC | Validation lens + budget walls; no readability lens; determinism exists only as a test pin | **S133** — readcheck lens + determinism sweep elevation |

---

## 3. Deliverable ③ — proposed architecture

```
                     ┌────────────────────────────────────────────────────────┐
                     │  GraphicsDoc v1 (source of truth — UNCHANGED role)      │
                     │  scenes[] ─ elements[] ─ enter/exit/emphasis (v1)       │
                     │      + tweens?: ElementTween[]          (S129)          │
                     │      + camera?: GraphicsCamera          (S130, scene)   │
                     │      + events?: GraphicsEvent[]         (S131, scene)   │
                     └───────────────┬────────────────────────────────────────┘
                                     │ validateGraphicsDoc (walls + time-sanity, extended)
                                     ▼
   ┌──────────────────── THE ANIM SUBSTRATE (no new clock) ────────────────────┐
   │ anim/clock.framePlanWindows ── one frame derivation (25,920 wall)          │
   │ anim/easing.evalEase ───────── one curve table                              │
   │ anim/keyframe.evalAt ───────── clamped tween evaluation (finally doc-level)│
   └──────┬─────────────────────────────────────────────────────────┬──────────┘
          ▼                                                         ▼
   ┌── 2D adapter (graphics) ──────────────────┐   ┌── 3D adapter (S94) ────────┐
   │ frameAt(doc,tMs)  enter→tween→exit→emphasis│   │ cameraAt(keys,t)  (existing)│
   │ cameraAt(cam,tMs)  zoom/pan world→screen   │   │ objectAt(obj,t)   (S134 NEW)│
   │ events → global event list (S131)          │   │ objects keyed (S134)        │
   └──────┬─────────────────────────────────────┘   └──────┬──────────────────────┘
          ▼                                                 ▼
   ┌── compose.ts + APPLY_GRAPHICS_FRAME_FN ──┐      ┌── render3d.ts (three.js) ──┐
   │ + gcam wrapper group (S130, additive)    │      │ + per-object keyed transforms│
   └──────┬───────────────────────────────────┘      └──────┬─────────────────────┘
          ▼         (same chromium pipeline, route-abort, JPEG q92, x264)
          ▼
   ┌── render.ts: preflight wall → scene loop → two-clock assert → assembly ────┐
   │ + resume manifest (S132): docHash + per-scene status, encoded scenes skip  │
   │ + event-driven SFX mix seam (S131 projection consumed at assembly)         │
   └──────┬─────────────────────────────────────────────────────────────────────┘
          ▼
   tracks.ts (schema-3 projection) → composition-plan → QC lenses (S133 readcheck,
   determinism sweep) → render-lane lockstep → job queue recovery
```

Byte-identity law: a doc with **no** PAE directives renders **byte-identically** at every stage (pinned by tests per ticket). PAE is purely additive at every seam.

---

## 4. Deliverable ④ — per-file implementation plan

| Stage | File(s) | Change |
|---|---|---|
| S129 | `graphics/types.ts` | `TWEEN_CHANNELS` (dx, dy, scale, rotateDeg, opacity, progress), `ElementTween` (window + per-channel keyframe lists, window-relative tMs), `TweenChannelKeyframes`; budgets: `tweensPerElementMax: 4`, `tweenKeysPerChannelMax: 16`, value bounds; validator extension (ascending keys, window ⊆ scene clock — the R-6 law, ≥1 channel, closed channel set, `progress` legal only for the wipe/grow/draw kinds — the MOTION-kind table's logic, derived) |
| S129 | `graphics/frame.ts` | New `Channels.rotateDelta`; tween fold layer BETWEEN enter and exit (emphasis stays LAST — the G1.2 pin preserved): per tween per channel, `evalAt` on delay-shifted keys → additive dx/dy/rotateDelta, multiplicative scale/opacity/progress |
| S129 | `scripts/test-unit.mts` | Tween pins: eval windows, clamp behavior, composition order (emphasis still shapes final), rotation unlock, channel bounds, budget refusals (wall names in messages), multi-tween phases, byte-identity for tween-less docs |
| S130 | `graphics/types.ts` | `GraphicsScene.camera?: GraphicsCamera`; `SceneCameraKeyframe {tMs, zoom, tx, ty, ease?}`; budgets `cameraKeysMax: 16`; bounds zoom ∈ [1,4], \|tx\| ≤ doc.width, \|ty\| ≤ doc.height (validator knows the doc) |
| S130 | `graphics/camera.ts` (NEW, ~60 L) | `cameraAt(keyframes, tMs)` — pure, clamped, eased, evaluated on the scene-local clock; returns `{zoom, tx, ty}` |
| S130 | `graphics/frame.ts` | `GraphicsFrameState.camera?` — resolved only when the active scene carries a camera directive |
| S130 | `graphics/compose.ts` | `<g id="gcam">` wrapper added ONLY when the scene has a camera (byte-identity otherwise); applier sets `translate(cx cy) scale(k) translate(−cx −cy) translate(tx ty)` — the world→screen function, one place |
| S131 | `graphics/types.ts` | `GRAPHICS_EVENT_KINDS` (closed: `sfx`, `hit`, `cue`), `GraphicsEvent {tMs, kind, label?}`, `GraphicsScene.events?`; budget `eventsPerSceneMax: 16`; label ≤ 64 chars |
| S131 | `graphics/events.ts` (NEW, ~50 L) | `graphicsEventList(doc, fps)` — global-clock projection: `{frame, tSec, kind, label, sceneId}` frame-quantized through `frameCountOf`; the seam SFX/mix consumers read (audio wiring is the assembly's existing amix grammar; no new mixer) |
| S132 | `graphics/render.ts` | `resume?: boolean`; `manifest.json` {version, docHash (arthash), scenes: [{sceneId, status, file, frames}]}; encoded+present scene files skip re-render; manifest rewritten per scene; final assembly asserts all encoded before concat; frames dirs cleaned as today |
| S133 | `graphics/qc.ts` | `readcheck` lens — per on-screen text (text/callout payloads, bar labels): full-visibility window = [enter end, exit start] (exit absent → scene end); min window = clamp(400 + 30×chars, 400, 4000) ms; WARN severity (decoration-class advice; the battery judges) |
| S133 | `graphics/frame.ts` | `graphicsDeterminismHash(doc)` — arthash over a 100 ms sweep of `frameAt`; exported for QC/CI elevation |
| S134 | `scene3d.ts` | `Scene3DObject.channels?: {position?/rotation?/scale?: Scene3DObjectKeyframe[]}` (t ∈ [0,1] normalized — the lane's own convention, cameraAt-consistent); `objectAt(obj, t)` pure clamped lerp; validator extension |
| S134 | `render3d.ts` | Per-frame object transforms through `objectAt` (camera path untouched — pinned) |

**Explicitly unchanged files:** everything under `whiteboard/`; `director.ts`, `director-plan.ts`, `production-profiles.ts`; `motion.ts` (the encode-level lane); `timeline.ts`; `render-lane.ts`; `package.json` (zero new deps).

---

## 5. Deliverable ⑤ — dependency & license assessment

| Item | License | Use | Commercial verdict |
|---|---|---|---|
| lemo-opuscar code (core/tools/styleboard/plugin) | MIT | Concept reference only (clean-room; nothing copied) | Permissive; attribution in this doc satisfies MIT for any idea-level influence |
| lemo-opuscar docs (*.md, style prompts) | **CC BY-NC 4.0** | Concept reference ONLY — no text, tables, or prompt strings reproduced | **Non-commercial: Ibismuh Studio (a commercial SaaS) must not copy or adapt doc text.** This spec describes ideas, which are not copyrightable; no expression copied |
| lemo-opuscar demo films | CC BY 4.0 | Not used | n/a |
| three.js (existing dep, S94) | MIT | Unchanged usage in the 3D adapter | Fine |
| Playwright, ffmpeg (system) | Apache-2.0 / LGPL-GPL system binary | Unchanged | Existing posture |
| **New PAE dependencies** | — | **NONE — zero new packages across S129–S134** | Clean |

---

## 6. Deliverable ⑥ — test & benchmark strategy

**Unit pins (per stage, `scripts/test-unit.mts`; baseline 765 passed at `60a87e4`):**

- S129: tween evaluation math (window clamp, per-segment ease, multi-tween fold order), composition-order pin (emphasis last over tweens), rotation channel unlock, value-bound + wall refusals (wall names in messages — the S128 assertion convention), `progress` legality table, tween-less byte-identity.
- S130: `cameraAt` clamp/ease pins; frame-state camera only when directed; composer emits `gcam` only when directed; zoom/pan bound refusals; transform string pin; tween-less byte-identity.
- S131: event validation (kind set, time sanity, budget); global projection frame-quantization; empty-events shape stability.
- S132: manifest write/read pins; docHash mismatch refuses resume (fail-closed); encoded-scene skip; partial re-render correctness; no-resume behavior byte-identical to today's flow.
- S133: readcheck window math (chars → min ms; enter/exit boundaries); warn-not-refuse severity; determinism hash stability (two passes equal, one altered element changes the hash).
- S134: `objectAt` clamped lerp pins (cameraAt-consistent); keyframe validation; render3d arg pins with keyed objects; static-object byte-identity.

**Gates per stage:** `typecheck && lint && test` green; zero diffs under `whiteboard/`; no new deps in `package.json`; wall-name-in-error convention; stage commit with evidence receipt.

**Benchmarks (Phase 3 program):** fixed benchmark doc (3 scenes, ~30 s, every directive kind) — measure (a) frame-at evaluation cost (µs/frame, sweep), (b) full-render wall time vs the S128 baseline on the same rig, (c) determinism (hash equality across two full renders), (d) resume behavior (kill mid-render, resume, byte-compare concat inputs), (e) readability-lens report. Receipts land in `docs/baselines/pae-<stage>-<date>.txt`.

---

## 7. Deliverable ⑦ — prioritized implementation tickets

| # | Ticket | Capability | Independently testable | Priority |
|---|---|---|---|---|
| 1 | **S129** | Element tween directive — keyframed object animation in the 2D adapter | Yes (pure frame truth pins) | P0 — unlocks rotation + custom motion, the largest expressiveness gap |
| 2 | **S130** | Scene camera directive — world→screen pan/zoom in the 2D adapter | Yes (pure cameraAt + composer pins) | P0 — the opuscar camera law, gated by the same seam |
| 3 | **S131** | Scene event channel — cue/hit/sfx projection | Yes (pure projection) | P1 |
| 4 | **S132** | Render resume manifest — scene-level recovery | Yes (manifest + flow pins) | P1 |
| 5 | **S133** | Animation QC lenses — readcheck + determinism elevation | Yes (lens pins) | P1 |
| 6 | **S134** | 3D object keyframes — adapter parity completion | Yes (objectAt + arg pins) | P2 |

Phase 3 (production benchmarks: historical / educational / motion-graphics programs) runs after the six tickets land, on the benchmark harness of §6.

---

## 8. Approval record

- Phase 0 findings (inventory §1, gaps §2, reconciliation §0) were submitted for review with **zero code modified** during the audit.
- Approval received ("approved"); Phase 2 implementation proceeds in the §7 order, one independently testable capability per commit, gates green per commit.
- Standing reminder to the operator, repeated for the record: **all four GitHub PATs exposed in chat must be revoked immediately**; PAE work uses anonymous access only and never embeds any token.

# PAE — Implementation Record (Phase 2 complete: S129–S134)

- **Date:** 2026-11-15
- **Base:** `60a87e4` (the S128 tip) → **Tip:** `efaa5c7` on `s124/element-editor` — seven commits, one per approved increment.
- **Spec:** `docs/audits/pae-architecture-audit-and-spec.md` (the approved Phase 0/1 artifact). This record is its Phase 2 execution receipt.
- **Unit battery:** **805 passed, 0 failed** (765 at the base + 40 PAE pins). typecheck and lint clean at every commit.

---

## 1. Per-stage receipts

| Stage | Commit | Capability | New pins | Battery |
|---|---|---|---|---|
| spec | `8d7e367` | The Phase 0 audit + architecture spec (deliverables ①–⑦) | — | 765 |
| S129 | `5a3c4cf` | **PAE-1** the element tween directive — keyframed per-channel motion (dx/dy additive, scale/opacity/progress multiplicative, rotateDeg the delta that finally unlocks rotation), evaluated through the shared Stage-S substrate (`anim/keyframe evalAt` — the substrate reaches the doc level) | 14 | 779 |
| S130 | `ab47bbc` | **PAE-2** the scene camera — the ONE world→screen function for the 2D adapter (scene-local `{tMs, zoom, tx, ty}` keys → `graphics/camera.ts cameraAt`, the S94 shape), rendered through one additive `#gcam` wrapper in the existing applier | 10 | 789 |
| S131 | `642868e` | **PAE-3** the event channel — closed kind set {sfx, hit, cue}, one pure global projection (`graphics/events.ts graphicsEventList`: encoder-grid frame + 2-dp second), carried by the render result; deliberately NOT a track kind (cues are not clips) | 5 | 794 |
| S132 | `707c9d5` | **PAE-4** the render resume manifest — per-scene recovery for the graphics lane; the fingerprint (sha256 over the strict doc write + VO/music/frameStep/sprites) makes resume fail-closed; corrupt manifest = no manifest; completed renders delete it | 3 | 797 |
| S133 | `b20ee4c` | **PAE-5** the animation QC lenses — G1-READ-1 (the readcheck: every on-screen text fully visible ≥ clamp(400+30·chars, 400, 4000) ms, window = enter-end → exit-start) + G1-DET-1 (the determinism sweep elevation: ≤600 samples, twice, sha256, never-NaN walk); hold windows now count tweens + camera keys | 5 | 802 |
| S134 | `efaa5c7` | **PAE-6** the 3D object animation adapter — keyframes on the normalized scene clock (the lane's own convention), `objectAt` in the cameraAt shape per channel, one `__OBJECTS__` applier per frame; keyless objects byte-identical | 3 | 805 |

## 2. The prohibitions — verified on the merged range (`60a87e4..efaa5c7`)

| Prohibition | Verification |
|---|---|
| No second animation clock | Every directive evaluates on the scene-local clock `frameAt` resolves (or the 3D lane's own normalized t); frames come only from `anim/clock` — zero new timebase code |
| The whiteboard engine untouched | `git diff 60a87e4..efaa5c7 -- src/lib/tubeforge/whiteboard/` is **empty** (also gated in `pae-push.sh`) |
| No new renderer integration | The camera/tweens render through the existing SVG applier; the 3D objects through the existing three.js page — zero new rasterizers |
| No Director routing logic | `director*.ts`, `production-profiles.ts` untouched; directives are doc-level data |
| No unjustified dependencies | `git diff 60a87e4..efaa5c7 -- package.json bun.lock` is **empty** — zero new packages |

**File-set discipline:** the range touches exactly the spec §4 plan's eleven files (one doc, the test file, six graphics sources incl. two NEW — `camera.ts`, `events.ts` — and the two 3D sources); `pae-push.sh` asserts the set, so a stray edit can never ride the push.

## 3. Design laws that carried the program

- **Byte-identity everywhere:** a doc with no PAE directives renders byte-identically at every seam (frameAt payloads carry no `camera`/tween effects; the composer emits no `#gcam`; the 3D objects re-set their static fields; the renderer's no-resume flow unchanged) — pinned per stage.
- **The class split:** junk-shaped directives warn-drop (decoration-class, the tolerance law); time-sanity violations refuse (the motions-loop law); walls cite their names (the S128 assertion convention).
- **The G1.2 precedence pin, tween form:** composition order stays enter → tweens → exit → emphasis — emphasis still shapes the final state; pinned with exact math.
- **Two adapters, one vocabulary:** the 2D `cameraAt`/tween evaluation and the 3D `objectAt`/camera speak the same clamped-hold, destination-ease law — the reconciliation the directive asked for, with no adapter introduced and none replaced.

## 4. Remaining (Phase 3 — benchmarks, not code)

The production benchmark harness per the spec §6: render the historical / educational / motion-graphics programs on a fixed doc that exercises every directive kind; measure frame-at cost, full-render wall time vs the S128 baseline, determinism hash equality across runs (G1-DET-1 receipts), the resume drill (kill mid-render → resume → assembly), and the readcheck report. Receipts land in `docs/baselines/pae-<stage>-<date>.txt`.

## 5. Packaging

- **Bundle:** `/home/z/my-project/docs/tubeforge/pae-execution.bundle` (both branches, complete history; `git bundle verify` passes).
- **Push script:** `/home/z/my-project/docs/tubeforge/pae-push.sh` — credential-safe (the askpass pattern, no token in args/URLs/disk), five sanity gates incl. the PAE file-set assertion, CI expectation **805**.

## 6. The standing security note

The four GitHub tokens pasted into chat across sessions remain treated as **COMPROMISED**. Nothing in this program used any of them — the lemo-opuscar reference was cloned **anonymously** (license tiers verified from its LICENSE file: MIT code, CC BY-NC 4.0 docs — concept reference only, nothing reproduced); all repo access was anonymous. They must be revoked. The push script assumes a FRESH fine-grained token generated at push time on the operator's machine — never embedded, never reused from chat.

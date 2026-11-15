# S123 — Motion Graphics Engine (milestone G1) — Stage Audit Record

| | |
|---|---|
| Stage | **S123** — the Motion Graphics Engine (milestone G1 of the S120 2D programme), P0–P5 executed |
| Baseline | main `37796ce` (597 unit tests, 8 CI gates green); the G1.1–G1.4 branch chain (PRs #14–#17) + the S120 status/docs merges |
| Design record | `docs/design/s123-motion-graphics.md` (the approved Rev 2 spec, committed at P1.3); `docs/tubeforge/G0-baseline-report.md` + the merge-readiness playbook (sandbox docs) |
| Result | **P0–P5 LANDED** on `s123/p0-p2-execution` + the P3–P5 execution branch — the graphics engine is a peer lane end-to-end: grammar → frame truth → composer → planners → projection → preflight wall → renderer → drafts → routes → studio → QC group → proof. The unit battery reads **597 → 685**. |
| Ship state | The lane is WIRED (the lockstep commit landed the picker entry + route branch + compositor dispatch together — acceptance criterion 4); CI on the pushed branch is the remaining gate (the sandbox ran the full local battery; Docker smoke / PostgreSQL integration / clean-clone bootstrap / Playwright e2e run on GitHub). |

## 1. Commit map (the G1.x ↔ S123 mapping)

| Phase | Commit | Content |
|---|---|---|
| P0.1 | `d241c59` | merge PR #22 — S120 status reconciliation (W3–W7 LANDED) |
| P0.2 | `b52a4fb` | merge PR #13 — the external 2D roadmap + W5/G1 API drafts |
| P1.1a | `4dc507d` | merge PR #14 (G1.1, `358412f`) — the GraphicsDoc grammar + validator |
| P1.1b | `61b5005` | merge PR #15 (G1.2, `be9eb0b`) — `frameAt` pure frame truth |
| P1.2 | `50c235c` | D2 advisory routing hints + D3 fps pins + R-2/R-5 + **R-6 fix** (the multi-scene clock law) |
| P1.3 | `2404385` | `docs/design/s123-motion-graphics.md` (Rev 2) |
| P2.1a | `bf1d4ec` | merge PR #16 (G1.3, `49b0d40`) — the composer + the ONE applier |
| P2.1b | `8062fa5` | merge PR #17 (G1.4, `540ca06`) — the native planner + the metered LLM planner |
| P2.2 | `4531013` | `graphics/tracks.ts` (the S87 projection) + `graphics/preflight.ts` (**R-1 closed** — the wall reads the DELIVERED Σ-per-scene count) + pin completion |
| P2.3 | `874fc33` | the lane contract seats the graphics engine lane (ships dark) |
| **P3** | `c529a7e` | **the engine renderer** (`graphics/render.ts`), **the draft viewport** (`graphics/draft.ts`), **the QC group** (`graphics/qc.ts`), the battery's designed-hold judgments, and **THE LOCKSTEP COMMIT**: RENDER_MODES Motion graphics + the render route's graphics branch (admission-time preflight wall) + `runGraphicsJob` + the `graphics` job kind (queue handler, recovery wall, snapshot) + the compositor routing wall + `PlanVisualKind` + `Video.graphicsDoc` (migration `20261120000000_s123_graphics_doc`) + the artifact sweep |
| **P4** | `0a2f74e` | **the routes** (`graphics/` GET/PUT + scaffold + render/draft), **the Graphics Studio** (`graphics-canvas.tsx` the playback seam + `graphics-studio.tsx`), the dialog mount, the create-route front-door gate, **`e2e/graphics.spec.ts`** |
| **P5** | (this branch) | **the proof** (`scripts/s123-graphics-proof.mts`), **the route probe** (`scripts/s123-route-e2e.mjs`), the battery's graphics-lane QC calibrations, this close record + the rescore record |

## 2. Gate receipts (local, on the execution branch)

| Gate | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | **PASS** |
| Lint (`eslint .` on the touched trees) | **PASS** |
| Unit battery (`scripts/test-unit.mts`) | **PASS — 685 passed, 0 failed** (597 → 685: the four G1 suites + the S123 pin suite + the P3 lockstep/renderer/draft/QC suites; `resumableKinds` 25 → 26) |
| The S123 proof (`scripts/s123-graphics-proof.mts`) | **GATE GREEN — 21 assertions** (receipt: `validation/s123/s123-graphics-proof-receipt.json`, gitignored) |
| The route probe (`scripts/s123-route-e2e.mjs`) | written to the house pattern; needs a live server — CI/manual run |
| Regression law | `git diff main..HEAD -- src/lib/tubeforge/whiteboard/` **empty** (the whiteboard engine untouched; `normalizeVoSlot`/`probeDurationSec`/`WB_CHROMIUM_LAUNCH_ARGS` are IMPORTED, never copied) |
| Production build + Playwright e2e + Docker smoke + PostgreSQL integration + clean-clone bootstrap | **CI-run on push** (the sandbox has no daemon/CI runner) |

## 3. Determinism + golden-frame receipts (D3)

The S123 pin suite (committed in `scripts/test-unit.mts`) carries the per-fps golden hashes on the 3-scene pin fixture (5000 + 2500 + 1100 ms):

| Hash | Value | Meaning |
|---|---|---|
| ms-grid | `a26ebc7ba208c3bf3aed4c7c27bdc5627eac704b7223ed518d35fe86a203cbf0` | identical at 24 **and** 30 fps — motion truth is fps-free |
| frame series @ 24 | `035e460e45f7117420f5652790dcb5ff2e637330dcc6f273f2cf9479df07be77` (206 frames) | the delivered series, byte-pinned |
| frame series @ 30 | `4b8f8114c1b527795e142157e0abc21428ae7f8f55c0e5cf6150471066e77111` (258 frames) | distinct per rate, byte-pinned |

The P5 proof re-records the same laws on the SIX-scene proof doc (576 delivered frames): the sweep double-runs byte-identical (`cf4353420011b055…` head in the receipt), the 24/30 series are distinct, and the ms-sampled truth is fps-free.

## 4. The draft-speed probe (acceptance criterion 7)

| Measurement | Value |
|---|---|
| Full render (6 scenes, 24s, 576 frames @ 1920×1080, VO + bed) | 31.1s wall-clock |
| Labelled draft (0.5× surface + the look-rate) | 10.3s wall-clock — **3.02× faster** |
| The look's clock honesty | spans EXACTLY the program (24.02s ≈ 24.00s); every sampled frame rides its EXACT doc time |

**The recorded engineering finding behind criterion 7:** the 0.5× surface lever ALONE measured ~1.4× on the proof rig (an 8s probe doc) — the pipeline's fixed costs (VO normalization, browser launch, per-scene context setup, ffmpeg invocations) dominate a short program, and the raster saving is ~1.6× at best. The draft closes the ≥ 2× criterion with the LOOK-RATE lever (`frameStep: 2` — every other frame at its exact doc-clock time, encoded at doc.fps/2), the whiteboard preview's own precedent (720p/24 regardless of the project). The draft law holds: same doc clock, same frame truth, same ONE applier; only surface + temporal sampling deviate, and the artifact is labelled non-reviewable with `inherited_review_credit: false`.

## 5. The P5 findings (found by the proof, fixed, recorded)

| ID | Finding | Fix |
|---|---|---|
| R-7 | **The applier's evaluate contract.** The renderer interpolated the raw payload JSON into `page.evaluate`, passing an OBJECT to an applier that JSON.parses a STRING — the first real render died with `SyntaxError: "[object Object]" is not valid JSON`. The unit battery could not see it (the chromium loop is not unit-testable); the P5 proof exists precisely to catch this class. | The whiteboard's double-encode law applied verbatim (`JSON.stringify(payload)`); the fix is commented at the site. |
| R-8 | **freezedetect's noise floor cannot see kinetic motion.** The proof's frame extraction showed EVERY sampled frame differing (the motion renders), yet the battery flagged 2–6 frozen runs: a counting counter / a slow fade / a bar wipe move far fewer than 0.4% of the frame's pixels per frame (freezedetect `n=0.004`). The sampled static-shots lens passed on the same file. | The graphics lane's frozen-frames semantics became DEAD-COMPOSITOR coverage (`judgeGraphicsFreezes` — a freeze spanning ≥ 90% of the program is the defect); the in-scene truth rides the sampled static-shots lens (with the doc's designed hold windows). Every other lane: byte-identical. |
| R-9 | **The scene-cut threshold reads the format's grammar as "no cut".** The story lanes' 0.40 scene score assumes whole-frame imagery changes; a graphics background-tone swap scores ~0.03, so 4 of 5 hard cuts read as "missing". | `detectSceneCuts` gained a threshold parameter; the graphics lane calibrates 0.025 — still above the format's in-scene per-frame motion (≤ ~0.015, recorded). The proof's cut-alignment reads **all 5 cuts in place**. |
| R-10 | **A synthetic bed must be mastered like a real one.** The proof's first bed synth rode at −30 dB mean; ducked ×0.16 it measured −46 dB — below the −40 dB silence floor, and the dead-air lens correctly flagged it. A house library track is mastered near −16 LUFS. | The proof's bed synth is boosted to the realistic range (the ducked arm sits ≥ −28 dB). No product code change — the battery was right. |

## 6. Acceptance criteria (spec §9) — scored

| # | Criterion | Verdict |
|---|---|---|
| 1 | D1: all new scripts/docs carry s123 names; no ref collisions | **PASS** (S123 verified free — the readiness review; all commits/files use the s123 names) |
| 2 | D2: routing optional/advisory/graphics-local; byte-identical without it; no director-plan import | **PASS** (pinned: the D2 neutrality tests; `graphics/` imports no director module) |
| 3 | D3: §5.2 pins pass at 24 and 30 fps; golden frames per fps; budget from doc.fps | **PASS** (pin 1–6 + the proof's determinism receipts) |
| 4 | `resolveRenderLane` returns graphics; RENDER_MODES + lane + compositor land in ONE lockstep commit | **PASS** (`c529a7e` — the ship-dark pin flipped WITH the route branch + the compositor dispatch; source-pinned) |
| 5 | `graphicsTracks` contiguous by construction via `framePlanWindows` at doc.fps | **PASS** (P2 pins + the P3 audio-slot extension behind an additive opts arg — absent opts byte-identical) |
| 6 | Same doc + seed → identical frame hashes (determinism per fps) | **PASS** (the proof's sweep double-run + the committed golden hashes) |
| 7 | Draft at 0.5 scale ≥ 2× faster; drafts carry `inherited_review_credit: false`; never enter the assembly | **PASS** (3.02× with the look-rate lever — §4; drafts write only their own key, storage-checked by the route probe) |
| 8 | QC group enforced (no broad-pass cover); the rescore recorded | **PASS for the group** (the matrix + the lane calibrations; the rescore record is `docs/audits/s123-blind-rescore.md` — the HUMAN gate is pending, see that file) |
| 9 | 8/8 CI gates at close; unit count 597 → N; README + S120 doc updated | **LOCAL: 685. CI on push.** README + the S120 roadmap status lines updated in the close commit |
| 10 | Whiteboard engine byte-identical | **PASS** (`git diff main..HEAD -- src/lib/tubeforge/whiteboard/` empty) |

## 7. Explicit completion evidence (spec §11)

- Commits: the table in §1 (S123 subjects throughout; the G1.x history preserved with its mapping).
- Unit battery: **597 → 685, 0 failed** (local).
- Golden-frame hashes: §3 (per fps).
- Draft-speed probe numbers: §4 (full vs draft wall-clock + the look's clock honesty).
- The blind re-score composite: **pending human scorers** — `docs/audits/s123-blind-rescore.md` records the prepared kit protocol and the honest pending state.
- CI run URL for the close commit: **on push** (the sandbox executed the full local battery; the CI-only gates are listed in §2).
- e2e: `e2e/graphics.spec.ts` (the Playwright contract suite) + `scripts/s123-route-e2e.mjs` (the durable-evidence probe) — CI/manual run.
- README/S120 status: updated (see the close commit).

## 8. Honest gaps + what P5 did NOT do

- **The blind re-score needs ≥ 3 human scorers** — it cannot be executed autonomously, and no composite is fabricated here. The kit protocol is mapped and the gate state is recorded as pending (`docs/audits/s123-blind-rescore.md`).
- **The element-level editor** (drag/scale/z-order on the canvas) is not in P4's studio — the studio edits the scene-level doc fields (narration, explicit duration, background, text payloads) through the validated PUT; element-geometry editing is a follow-up slice (the grammar, validator and round-trip already support it).
- **The SFX layer** (W7's whiteboard cue planner) has no graphics equivalent in v1 — the graphics assembly mirrors the whiteboard's bed law minus the SFX arm; a graphics SFX cue plan is a future design-doc slice.
- **CI-only gates** (Docker smoke, PostgreSQL integration, clean-clone bootstrap, Playwright e2e) ran in the sandbox only as far as the local battery could reach; they are wired for the pushed branch.

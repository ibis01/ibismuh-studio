# S123 — Motion Graphics Engine (G1): Stage-Close Audit Record

| | |
|---|---|
| Stage | **S123** — milestone G1 (motion graphics) executed under the S120 programme (decision D1: the next sequential sN) |
| Status | **P0–P5 EXECUTED** (2026-11-14) on the `s123/p0-p2-execution` branch (P0–P2, 16 commits on main `37796ce`) + the P3–P5 commits on the same branch |
| Spec | `docs/design/s123-motion-graphics.md` (Rev 2, approved) — this record closes §11's evidence list |
| Authorization | "approved build all the gaps left" (2026-11-14) — extended by the operator to P3–P5 ("continue building till you finish all") |
| Baseline | The G0 read-only audit: 18 declarations verified against main HEAD `37796ce` |

## 1. The commit list (S123 subjects)

| Commit | Phase | Content |
|---|---|---|
| `d241c59` | P0.1 | Merge PR #22 (`docs/s120-status-reconcile`) — the S120 status reconciliation, W3–W7 LANDED |
| `b52a4fb` | P0.2 | Merge PR #13 (`docs/external-2d-roadmap`) — the design record the branch code cites |
| `4dc507d` | P1.1a | Merge PR #14 (G1.1): `graphics/types.ts` — the GraphicsDoc grammar + validator |
| `61b5005` | P1.1b | Merge PR #15 (G1.2): `graphics/frame.ts` — `frameAt` pure frame truth |
| `50c235c` | P1.2 | D2 advisory routing hints + D3 fps pins 1–4 + R-2/R-5/R-6-fix |
| `2404385` | P1.3 | `docs/design/s123-motion-graphics.md` (the approved Rev 2 spec) |
| `bf1d4ec` | P2.1a | Merge PR #16 (G1.3): `graphics/compose.ts` — one compose, one `APPLY_GRAPHICS_FRAME_FN` |
| `8062fa5` | P2.1b | Merge PR #17 (G1.4): `graphics/planner.ts` + `graphics/llm-planner.ts` |
| `4531013` | P2.2 | `graphics/tracks.ts` (S87 projection), `graphics/preflight.ts` (R-1 CLOSED: the delivered-count wall), D3 pin 5, D2 compose-neutrality |
| `874fc33` | P2.3 | The lane contract: `EngineLaneId`, `RenderLane`, the graphics truth-table rows, the ship-dark pin |
| `S123 P3` | P3 | The engine lane renders: `graphics/render.ts` (the chromium engine), `graphics/draft.ts` (the b6 draft viewport), `graphics/qc.ts` (the Stickman-structure QC subcheck matrix) + **THE LOCKSTEP COMMIT** (RENDER_MODES + the route branch + the compositor case flip the ship-dark pin), `Video.graphicsProject` (migration + sqlite mirror), `runGraphicsJob` + the "graphics" job kind + the qc-policy g-* rows (BLOCK, 10 → 16 blocking) |
| `S123 P4` | P4 | `api/videos/[id]/graphics{,/scaffold,/render}` (the whiteboard route family, mirrored), `graphics-studio.tsx` + `graphics-canvas.tsx` (the ONE applier's second caller), the dialog integration (picker icon, studio mount, the QC Graphics group, the lane-law render gate), the scene-editor honesty panel, `e2e/graphics.spec.ts` |
| `S123 P5` | P5 | `scripts/s123-graphics-proof.mts` (PROOF GREEN — the receipt below), the designed-evidence QC laws, `scripts/s123-route-e2e.mjs`, this record + the blind-rescore record |

## 2. The unit battery: 597 → N

| Gate | P0–P2 receipt | P5 close |
|---|---|---|
| Unit battery (`scripts/test-unit.mts`) | 679 passed / 0 failed (+82) | **689 passed / 0 failed** (+92 vs main's 597): the four G1 suites, the S123 pins suite, the P3 suite (draft viewport, QC matrix, render seams, envelope, contract seam, designed evidence) |
| Typecheck (`tsc --noEmit`) | PASS | PASS |
| Lint (`eslint .`) | PASS | PASS |
| Production build (`next build`) | PASS (P0–P2 tree) | re-run at close — see the CI row |
| Regression law | `git diff main -- src/lib/tubeforge/whiteboard/` empty | **still empty** — the whiteboard tree is byte-identical; `director-plan.ts`/`director.ts` untouched (D2's firewall) |

## 3. Golden-frame hashes (per fps — D3)

Fixture: 3 scenes (5000 + 2500 + 1100 ms), mixed motions covering every channel; committed in `scripts/test-unit.mts` (the S123 pins suite).

**The portability law (the first CI run's receipt, 2026-11-14):** the channel values ride libm transcendendentals (the easing curves) whose last-ULP results can differ across V8 platforms — the raw-float hash was stable locally and flipped on CI (the 30 fps series). The golden serialization QUANTIZES every numeric channel to 6 decimals (in the drift detector only — `frameAt`'s full-precision truth is untouched): 1-ULP differences absorb; real drift still flips the hash.

| Hash | Value | Meaning |
|---|---|---|
| ms-grid | `20e5d76684bba2a558f7107dd3329d0af613f375c0c2983a7c5e18175755796a` | identical at 24 **and** 30 fps — motion truth is fps-free |
| frame series @ 24 | `a01acd69cca04dbcb55ab85267795016d965c124e7b217ff16718aa225e1b695` (206 frames) | the delivered series, byte-pinned |
| frame series @ 30 | `44174a20cc885be009f288d3c3cd6efd8b83ca0879e58bd4c8ed5ee8db6a2a3e` (258 frames) | distinct per rate, byte-pinned |

Determinism (acceptance criterion 6): same doc + same inputs → identical hashes, pinned per fps; the render adds the VO-measured clock as an input (same WAVs → same effective doc → same bytes).

## 4. The draft-speed probe (acceptance criterion 7)

`scripts/s123-graphics-proof.mts` §3 — 6 dense scenes × 5000 ms (720 frames @ 24 fps), same doc both paths:

| Path | Time | Notes |
|---|---|---|
| Full raster (1920×1080 @ 24 fps) | 31.8 s | the certified render path |
| Draft (0.5× → 960×540 @ 12 fps) | 8.1 s | the labelled non-reviewable look |
| **Speedup** | **3.92×** | **≥ 2× required — MET** |

The mechanism receipts (found by the probe, fixed): (a) the draft rasters NATIVELY at the scaled size — the board's box sizes through the composer's own viewBox (a CSS transform only shrank the JPEG: measured 1.4×); (b) the draft fps floor (`graphicsDraftFps`: sub-1.0 drafts raster at min(doc.fps, 12), the whiteboard preview's own-fps precedent) delivers the SAME seconds with half the frames; (c) the skip-identical law — a frame whose payload is byte-identical to the applied one skips the round trip (the applier is idempotent by construction).

## 5. The real-render evidence (the probe §2)

The fixture through `renderGraphics`: chromium (fresh context per scene — the S75 E10 OOM receipt; the no-network security line; the applier installed once per page build, driven through the documented function+serialized-arg evaluate — see §7) + ffmpeg per-scene encodes + the concat assembly.

- ffprobe agrees with the delivered clock: 7.52 s ≈ 7.50 s.
- The contract plan agrees with the delivery: `plan.totalSec` = 7.50 (the assembly assertion held).
- The QC battery on the standing final: playable / duration / loudness (−16.5 LUFS) / true-peak / black-frames / frozen-frames / cut-alignment ALL PASS.
- The graphics QC group (the six g-* rows) passes on the render's doc.
- Receipt file: `validation/s123/s123-proof.json` (gitignored — the committed evidence is this record).

## 6. The QC evidence laws (the probe's findings, landed)

The probe measured three real defects and the fixes are laws now:

1. **The designed holds** (`graphicsDesignedHolds`): graphics has NO camera — between motion windows the composition holds BY DESIGN. The frozen-frames lens (freezedetect d=1.00, built for hold-last-frame DEFECTS) takes the designed windows as evidence (the expectedBlack pattern): the quiet open (through the second mover's delay — a lone small mover is sub-noise at the lens's frame-level mean, so the open is still by the lens's own measurement) and the graced tail hold (an easing asymptote goes sub-noise before its window's mathematical end; the grace is 1,000 ms — freezedetect's own minimum run). Per-evidence, never a lane-wide exemption: a freeze outside every window still fails.
2. **The designed black lead-ins** (`graphicsDesignedBlackWindows`): a scene whose background luma sits below the blackdetect threshold (0.10) is essentially black until its first content enters — that head window is the doc's own design; any OTHER black interval still fails.
3. **The renderer's evaluate seam**: playwright 1.65's string-evaluate changed semantics (the inline-IIFE form delivers the arg double-encoded; the string-as-function form never calls). The renderer installs the applier ONCE per page build through a script tag and drives it through the documented function+serialized-arg evaluate — the render3d `__CAMERA__` contract, version-stable. (The whiteboard's own seam is out of S123's scope by the regression law — flagged to its own soak gate.)

## 7. The e2e + CI evidence

- `e2e/graphics.spec.ts` (the whiteboard suite's mirror): auth → doc workflow → the scaffold's honest gate → a REAL scene-draft render → the FULL render through the shared POST /render lane branch (manifest mode "graphics", staleness fresh) → the cross-mode refusal. **Runs on CI** — the e2e job boots its own dev server; the whiteboard suite proves the harness.
- `scripts/s123-route-e2e.mjs` (the house sN pattern): the same contract as numbered checks against a running daemon; run ad hoc (like every sN probe — no package.json entry, per the family convention).
- **CI run URL for the close commit**: pending the push (the operator's token delivered the branch; the 8/8 gates incl. the Docker production smoke and the PostgreSQL `migrate deploy` — which applies `20261120000000_s123_graphics_project` — are CI-only, per the P0–P2 receipt's own gate table). This record updates with the run URL at merge time.

## 8. The G1.x ↔ S123 mapping (PRs #14–#17)

| PR | Branch | Content | S123 disposition |
|---|---|---|---|
| #14 | `feat/g1-graphics-doc` | G1.1 the grammar + validator | P1.1a merged |
| #15 | `feat/g1-graphics-frame` | G1.2 frame truth | P1.1b merged |
| #16 | `feat/g1-graphics-compose` | G1.3 the composer | P2.1a merged |
| #17 | `feat/g1-graphics-planner` | G1.4 the planners | P2.1b merged |
| #13, #22 | docs | the roadmap + the S120 reconciliation | P0 merged |

After the ONE PR `s123/p0-p2-execution` → main merges, PRs #13–#17 and #22 close as superseded (their commits are ancestors of the branch).

## 9. Acceptance criteria scorecard (spec §9)

| # | Criterion | Status |
|---|---|---|
| 1 | D1 sN naming, no collisions | MET — S123 (evidence spec §1.2); scripts `s123-graphics-proof.mts`, `s123-route-e2e.mjs`; docs `s123-*.md` |
| 2 | D2 routing advisory, graphics-local, byte-identical absence | MET — pinned (D2 neutrality: round-trip + frames + compose); no `director-plan.ts` import under `graphics/` |
| 3 | D3 pins at both rates, golden frames per fps, budget at doc.fps | MET — §3; the R-1 wall derives from doc.fps |
| 4 | `resolveRenderLane` returns graphics; RENDER_MODES + lane + compositor case in ONE lockstep commit | MET — the P3 commit; the ship-dark pin FLIPPED with all legs source-pinned |
| 5 | `graphicsTracks` contiguous, frame-quantized at doc.fps | MET — pinned per fps |
| 6 | Determinism: same doc + seed → identical hashes per fps | MET — §3 |
| 7 | Draft ≥ 2× faster in the probe | **MET — 3.92×** (§4) |
| 8 | QC group enforced, no broad-pass cover; blind re-score ≥ 4/5 | QC group ENFORCED (six g-* rows, per-id BLOCK, the emission-set pin updated); the blind re-score is **its own record** (`docs/audits/s123-blind-rescore.md`) — needs human scorers |
| 9 | CI green at close; unit count 597 → N; README + S120 updated | Unit count 597 → **689**; README + S120 updated; CI pending the push (§7) |
| 10 | Whiteboard byte-identical | MET — the diff is empty |

## 10. Rollback

P1/P2 roll forward as branch merges (revert per merge commit before main). P3–P5 are linear commits on the same branch — `git revert` per commit. The additive migration (`20261120000000_s123_graphics_project`) is a nullable column — no data migration, no backfill. The feature ships with the lane LIVE (the lockstep commit) — rollback = revert the P3 commit (the picker entry, the route branch and the wall flip together; the unit pins hold all legs to one commit so a partial revert fails the suite loudly).

# S123 P3–P5 — Execution Receipt (2026-11-14)

| | |
|---|---|
| Authorization | User: **"continue building till you finish all"** (reinforcing "approved build all the gaps left") — the motion-graphics remainder (P3 renderer integration → P4 routes/Studio/e2e → P5 proof/docs close), executed in one drop |
| Vehicle | Local clone restored from `s123-p0-p2-execution.bundle`; branch **`s123/full-execution`** (20 commits on main `37796ce`), packaged as `s123-full-execution.bundle` + `s123-push-full.sh` in this folder. **Supersedes** `s123-p0-p2-execution.bundle` / `s123-push.sh` and the authorization-gate table in `S123-P0-P2-execution-receipt.md` §7 (P3–P5 rows) |
| Result | **All remaining buildable gaps built and green.** The graphics lane is wired end-to-end (the lockstep commit landed the picker entry + route branch + compositor dispatch together — acceptance criterion 4). Four new findings (R-7…R-10) found by the P5 proof and fixed. The blind re-score's human gate remains honestly PENDING. Unit battery **597 → 685, 0 failed** |
| Local gates | tsc · eslint (full repo) · unit 685 · billing 40 · rate · storage · queue (26 kinds) · coverage 52.68% ≥ 50% floor · **production build exit 0** · the S123 proof GATE GREEN (21 assertions) |

## 1. What landed (commit by commit, on top of the P0–P2 branch)

| Commit | Content |
|---|---|
| `c529a7e` | **P3** — the engine renderer (`graphics/render.ts`: the R-1 preflight wall BEFORE chromium; per-scene fresh contexts + network abort; per-frame `frameAt(doc, cursorMs + scene-local)` through the ONE applier; the encode law — VO apad / anullsrc silent fill / `-t` delivered; the assembly law at the house bed gains; the two-clock contract assert), the draft viewport (`graphics/draft.ts` — scales {0.5,0.75,1.0}, even dims ≥ 64, `reviewable: false`, `inheritedReviewCredit: false`), the graphics QC group (`graphics/qc.ts` — the fail-closed matrix + hold windows + hard-cut expectation), the battery's designed-hold judgments, and **THE LOCKSTEP COMMIT**: `RENDER_MODES` Motion graphics + the render route's graphics branch (admission-time preflight wall) + `runGraphicsJob` + the `graphics` job kind (handler, recovery idempotence wall, artifactLanded, snapshot) + the compositor routing wall + `PlanVisualKind` + **`Video.graphicsDoc`** (migration `20261120000000_s123_graphics_doc`) + the artifact sweep |
| `0a2f74e` | **P4** — the doc routes (GET validated doc + measured voMs + budgets + preflight/QC evidence; PUT the engine validator verbatim + the strict byte-stable write), the scaffold route (native $0 / metered LLM, honest `plannerReport`, 409 without force, lane pin), the render/draft route (full + whole-doc + scene drafts), `graphics-canvas.tsx` (the playback seam — `frameAt` through the ONE applier in a same-origin srcdoc iframe, whole-doc playback on the doc clock), `graphics-studio.tsx` (scaffold → scrub/play → scene-level edits → labelled drafts → full render, evidence surfaced before the click), the dialog mount, the create-route front-door gate, `e2e/graphics.spec.ts` |
| `30e4563` | **P5** — `scripts/s123-graphics-proof.mts` (**GATE GREEN — 21 assertions**), `scripts/s123-route-e2e.mjs`, `docs/audits/s123-motion-graphics.md` (the close record), `docs/audits/s123-blind-rescore.md` (the human gate, PENDING), README + S120 roadmap status + worklog |
| `f202a4f` | test(queue) — the handler-registry pin counts graphics (25 → 26), caught by the coverage suite |

## 2. The P5 findings (each found by the real-engine proof, fixed, recorded — audit §5)

| ID | Finding | Fix |
|---|---|---|
| R-7 | The renderer interpolated the raw payload JSON into `page.evaluate` — an OBJECT reached an applier that JSON.parses a STRING; the first real render died (`SyntaxError: "[object Object]"`). The unit battery cannot see the chromium loop — the proof exists for exactly this class. | The whiteboard's double-encode law applied verbatim. |
| R-8 | freezedetect's noise floor cannot see kinetic motion (a counting counter moves < 0.4% of pixels/frame) — the lens flagged 2–6 "frozen runs" while frame extraction proved every sampled frame differs. | The graphics lane's frozen-frames semantics became **dead-compositor coverage** (`judgeGraphicsFreezes`, ≥ 90% of the program); the sampled static-shots lens (with the doc's designed hold windows) carries the in-scene truth. Other lanes byte-identical. |
| R-9 | The story lanes' scene-cut threshold (0.40) reads the format's subtle background cuts (~0.03 scene score) as "missing" — 4 of 5 hard cuts. | `detectSceneCuts` gained a threshold parameter; the graphics lane calibrates **0.025** (still above the format's in-scene per-frame motion ≤ ~0.015). The proof's cut-alignment reads **all 5 cuts in place**. |
| R-10 | The proof's synthetic bed measured −30 dB mean; ducked ×0.16 it fell below the −40 dB silence floor and dead-air correctly flagged it. | The bed synth mastered to a realistic range (house tracks ride ≈ −16 LUFS). Battery was right; no product change. |

## 3. The draft-speed probe (acceptance criterion 7)

| Measurement | Value |
|---|---|
| Full render (6 scenes, 24s, 576 frames @ 1920×1080, mixed VO + bed) | 31.1s |
| Labelled draft (0.5× surface + the look-rate `frameStep: 2`) | 10.3s — **3.02×** |
| Look-rate honesty | every sampled frame rides its EXACT doc time; encoded at doc.fps/2; the look spans EXACTLY the program (24.02s ≈ 24.00s) |

Recorded finding: the 0.5× surface lever ALONE measured ~1.4× (fixed pipeline costs dominate) — the draft closes the ≥ 2× criterion with the look-rate lever, the whiteboard preview's own rate-deviation precedent (720p/24 regardless of the project). Drafts stay non-reviewable, credit-free, and never touch final.mp4/the manifest (the route probe storage-checks it).

## 4. Delivering the work

No write credentials exist in this sandbox (the chat-leaked token was never stored here and **must be revoked regardless**). Delivery path:

1. Revoke the old token; create a fresh fine-grained token (contents: read+write).
2. Run `bash docs/tubeforge/s123-push-full.sh` (clone → bundle verify → fetch → whiteboard/director diff sanity gates → push).
3. Open **one** PR `s123/full-execution` → main. After merge, close PRs #14/#15/#16/#17/#22/#13 as superseded.
4. Watch CI: the unit battery must read **685**; Docker smoke (main-only) + PostgreSQL integration + clean-clone bootstrap + the Playwright e2e (now including `graphics.spec.ts`) run on GitHub only.

## 5. Remaining, gated on humans / separate authorization

| Item | Note |
|---|---|
| **The S123 blind re-score** | The kit protocol is mapped (`docs/audits/s123-blind-rescore.md`); needs **≥ 3 human scorers**, composite ≥ 4/5 — cannot be executed autonomously, NOT fabricated |
| **Element-level canvas editor** | The studio edits scene-level doc fields (narration/duration/background/text) through the validated PUT; element-geometry editing (drag/scale/z-order) is a follow-up slice — the grammar/validator/round-trip already support it |
| **Graphics SFX cue layer** | A future design-doc slice (the assembly mirrors the whiteboard bed law minus the SFX arm) |
| **S121/S122 stack** | #18–#21, #23 merge under their own authorization; the only shared file is `test-unit.mts` (disjoint suites) + `test-queue.mts` now — mechanical |
| **Token security** | The chat-leaked token must be revoked — it grants whatever scope it had to anyone who saw the transcript |

# S123 P0–P2 — Execution Receipt (2026-11-14)

| | |
|---|---|
| Authorization | User: **"approved build all the gaps left"** — the S123 playbook's P0 + P1 + P2 surface, executed in one drop |
| Vehicle | Local clone of `ibis01/tubeforge`, branch **`s123/p0-p2-execution`** (16 commits on main `37796ce`), packaged as `s123-p0-p2-execution.bundle` + `s123-push.sh` in this folder |
| Result | **All playbook gaps built and green.** One new high-severity finding (R-6) found and fixed by the new pins. P3–P5 remain gated per spec §12; the blind re-score needs human scorers |
| Supersedes | The authorization-gate table in `S123-P1-merge-readiness-and-playbook.md` §6 |

## 1. What landed (commit by commit)

| Commit | Content |
|---|---|
| `d241c59` | **P0.1** — Merge PR #22 (`docs/s120-status-reconcile`): S120 status reconciliation, W3–W7 LANDED |
| `b52a4fb` | **P0.2** — Merge PR #13 (`docs/external-2d-roadmap`): the design record the branch code cites |
| `4dc507d` | **P1.1a** — Merge PR #14 (G1.1): `graphics/types.ts` — the GraphicsDoc grammar + validator |
| `61b5005` | **P1.1b** — Merge PR #15 (G1.2): `graphics/frame.ts` — `frameAt` pure frame truth |
| `50c235c` | **P1.2** — the follow-up commit: **D2** advisory routing hints (types + validator + serializer, graphics-local, no `director-plan.ts` import) + **D3** fps pins 1–4 + D2 frame-truth neutrality + **R-2** comment fix + **R-5** suite relabels (G1.1/G1.2) + **R-6 fix** (below) |
| `2404385` | **P1.3** — `docs/design/s123-motion-graphics.md` (the approved Rev 2 spec, adapted to repo-internal references) |
| `bf1d4ec` | **P2.1a** — Merge PR #16 (G1.3): `graphics/compose.ts` — one compose, one `APPLY_GRAPHICS_FRAME_FN` |
| `8062fa5` | **P2.1b** — Merge PR #17 (G1.4): `graphics/planner.ts` + `graphics/llm-planner.ts` + `GRAPHICS_SURFACES` export; predicted `test-unit.mts` tail conflicts resolved by keeping both blocks, suites ordered by stage |
| `4531013` | **P2.2** — `graphics/tracks.ts` (S87 projection via `framePlanWindows(sceneMs, doc.fps)`), `graphics/preflight.ts` (**R-1 CLOSED**: the wall against the DELIVERED Σ-per-scene count), D3 pin 5 (budget-at-fps), D2 compose-neutrality half, tracks pins, R-5 relabels (G1.3/G1.4) |
| `874fc33` | **P2.3** — the lane contract: `EngineLaneId` set, `RenderLane = EngineLaneId \| "story"`, graphics rows of the truth table, lockstep law over both engine lanes, **ship-dark pin** |

## 2. New finding R-6 (HIGH) — found by the new pins, fixed

`frameAt` evaluated element motions against the **global** doc clock instead of the resolved scene's **local** clock. Motions are scene-local by the validator's own time-sanity law, so **every scene after the first skipped its entrances/exits/emphasis** (windows clamped complete). The G1.2 suite could not see it — its fixture (`MIXED_RAW`) is single-scene, where local ≡ global. Fixed in `frame.ts` (`elementFrame(el, t − active.startMs)`), regression-pinned by **S123 pin 5** (the multi-scene clock law: pre-window holds the start state, mid-window tweens, post-window holds the placed state — in scene 2 of a 2-scene doc). Golden hashes were captured **after** the fix.

## 3. Deliberate deviation from spec §6's table (recorded, not silently)

Spec §6 puts the `RENDER_MODES` graphics entry at P2; acceptance criterion 4 binds `RENDER_MODES` + lane + compositor case into **one** lockstep commit, and §10 ships the mode dark. The route's engine branch is `lane.lane === "whiteboard"` — a picker entry without its route branch would fall through to the story gates and silently degrade a graphics click into a story render (the exact S119 bug class). Therefore P2 seats the **contract** (resolver returns the graphics lane; lockstep law covers both engine lanes) and **pins the dark state** (`RENDER_MODES` must not offer graphics until the P3/P4 lockstep commit lands compositor case + route branch + picker entry together). That commit flips the pin.

## 4. Golden-frame hashes (per fps, captured on the R-6-fixed truth)

Fixture: 3 scenes (5000 + 2500 + 1100 ms), mixed motions covering every channel; committed in `scripts/test-unit.mts` (suite `graphics — S123 pins…`).

| Hash | Value | Meaning |
|---|---|---|
| ms-grid | `a26ebc7ba208c3bf3aed4c7c27bdc5627eac704b7223ed518d35fe86a203cbf0` | identical at 24 **and** 30 fps — motion truth is fps-free |
| frame series @ 24 | `035e460e45f7117420f5652790dcb5ff2e637330dcc6f273f2cf9479df07be77` (206 frames) | the delivered series, byte-pinned |
| frame series @ 30 | `4b8f8114c1b527795e142157e0abc21428ae7f8f55c0e5cf6150471066e77111` (258 frames) | distinct per rate, byte-pinned |

## 5. Gate receipts (local, on the final tree `874fc33`)

| Gate | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | **PASS** |
| Lint (`eslint .`) | **PASS** |
| Unit battery (`scripts/test-unit.mts`) | **PASS — 679 passed, 0 failed** (main was 597 → **+82**: the four G1 suites + the S123 pin suite) |
| Queue integration (`test:queue`) | **PASS** (real worker restart, resume contract) |
| Billing integrity (`test:billing`) | **PASS** (40 passed) |
| Rate limiter (`test:rate`) | **PASS** |
| Storage reservation (`test:storage`) | **PASS** |
| Money-path coverage (`test:coverage`) | **PASS — 53.37% lines** vs the 50% floor |
| Production build (`next build` + standalone) | **PASS** (exit 0) |
| Regression law | `git diff main -- src/lib/tubeforge/whiteboard/` **empty**; `director-plan.ts`/`director.ts`/`render.ts`/`render-assembly.ts` untouched |
| Alert probe | Flags the sandbox's missing `TUBEFORGE_AUTH_SECRET`/`TUBEFORGE_ENCRYPTION_KEY` — environment artifact (CI provisions them); no code finding |
| PostgreSQL integration · clean-clone bootstrap · Docker smoke · E2E Playwright | **CI-only** — run on GitHub after push (Docker smoke is a main-only job) |

## 6. Delivering the work

No write credentials exist in this sandbox (the token shared earlier in chat was never stored here and **must be revoked regardless**). Delivery path:

1. Revoke the old token; create a fresh fine-grained token (contents: read+write).
2. Run `bash docs/tubeforge/s123-push.sh` (validated end-to-end here: clone → bundle verify → fetch → whiteboard-diff sanity gate → push; it stops exactly at auth without credentials).
3. Open **one** PR `s123/p0-p2-execution` → main. After merge, close PRs #14/#15/#16/#17/#22/#13 as superseded (their commits are ancestors of the branch).
4. Watch CI: 8/8 gates incl. Docker smoke (main-only) must go green.

## 7. Remaining, gated on their own authorization

| Item | Note |
|---|---|
| **P3** | Renderer integration: `render.ts` compositor case (one renderer), `render-assembly.ts` approved-only manifests, `render-qc.ts`/`qc.ts` graphics group, `graphics/draft.ts` + full preflight/QC; **the RENDER_MODES + route + compositor lockstep commit flips the ship-dark pin** |
| **P4** | Graphics routes (`/api/videos/[id]/graphics…`), `graphics-canvas.tsx`/`graphics-studio.tsx` studio panel, scene-editor affordances, Playwright e2e |
| **P5** | `scripts/s123-graphics-proof.mts`, `scripts/s123-route-e2e.mjs`, `docs/audits/s123-motion-graphics.md` close record, `docs/audits/s123-blind-rescore.md` |
| **Post-W7 blind re-score** | Kit protocol is mapped (playbook §5); needs running repo code + **≥ 3 human scorers**, composite ≥ 4/5 — cannot be executed autonomously |
| **S121/S122 stack** | #18–#21, #23 merge under their own authorization; the only shared file is `test-unit.mts` (mechanical, disjoint suites) |
| **Token security** | The chat-leaked token must be revoked — it grants whatever scope it had to anyone who saw the transcript |

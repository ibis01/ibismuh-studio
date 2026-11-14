# S123 P1 — Merge-Readiness Review & Execution Playbook (read-only)

| | |
|---|---|
| Scope | Read-only review of everything P1 would merge: PRs #14–#17 (the G1.1–G1.4 chain), the docs PRs (#22, #13), the S121/S122 stack (#18–#23, context), CI evidence, code review, conflict analysis, and the P0 blind re-score kit preparation |
| Method | GitHub REST API + raw file reads only. No repository modifications. |
| Date | 2026-11-14 |
| Verdict | **P1 is technically ready**: all PRs `mergeable: clean`, CI green on branch heads, code review passes with 2 findings (1 low, 1 trivial). Execution remains **not authorized** (decision D4) |

## 1. PR and CI state (verified)

| PR | Title | Head | Base | State | Mergeable | CI on head |
|---|---|---|---|---|---|---|
| #14 | feat(graphics): G1.1 the GraphicsDoc grammar + validator | `358412f` | main | open | clean | green |
| #15 | feat(graphics): G1.2 frame truth — GraphicsFrameState (pure) | `be9eb0b` | main | open | clean | green |
| #16 | feat(graphics): G1.3 the composer — static skeleton + one APPLY_FRAME_FN | `49b0d40` | main | open | clean | green |
| #17 | feat(graphics): G1.4 the native planner + the LLM scaffold with per-element degradation | `540ca06` | main | open | clean | green |
| #22 | docs(design): S120 status reconciliation — W3–W7 are landed, not planned | `0ad5faf` | main | open | clean | docs-only |
| #13 | docs(audits): external 2D-animation roadmap + W5/G1 API drafts | `498759b` | main | open | clean | docs-only |
| #18–#21 | S121 stack (VoiceStudio provider → director/captions → anim IK/gait → dub/license) | stacked | #18→main | open | — | context |
| #23 | S122 K1 slice 1 (character-engine substrate + VoiceStudio adapter) | `7bd5b8a` | `feat/s121-p3p4-scaling` | open | — | context |

**CI evidence (tip `540ca06`, 9 check-runs):** Secret scan (gitleaks) success · Typecheck·Lint·Unit success · Production build success · Money-path coverage success · PostgreSQL integration success · Clean-clone bootstrap (P0.1) success · E2E (Playwright) success · **Docker production smoke (P0.6) skipped — main-only job, runs after merge** · Vercel Preview Comments success. The g1 chain has never been merged; all CI ran via the open PRs against main.

## 2. Code review of the P1 merge set

### 2.1 Confirmations (law-by-law, with evidence)

| Law | Verdict | Evidence |
|---|---|---|
| Versioned doc, tolerant parse, strict write, byte-stable round-trip | HOLDS | `types.ts` `parseDoc` (higher version parses with warning, lower refuses), `writeGraphicsDoc` (version first, stable key order) |
| Closed v1 element set + motion set + enforced compatibility table | HOLDS | `GRAPHICS_ELEMENT_KINDS` (10), `GRAPHICS_MOTION_KINDS` (8), `MOTION_KINDS_BY_ELEMENT`; unknown kinds drop with warning; illegal motion/kind pairs are **errors** |
| Named walls enforced | HOLDS | elementsPerScene 32, scenesPerProject 24, sceneDurationMsMax 120 s, projectExplicitDurationMsMax 900 s, barDataMax 8, groupDepthMax 1, iconPathCommandBudget 512 — all refused with named-wall messages |
| Id law | HOLDS | `GRAPHICS_ID_RE` + `--`/`::` ban; duplicate scene/element ids are errors |
| Time sanity | HOLDS | enter required; `durationMs > 0`, `delayMs ≥ 0`; **motion spans must end within the scene clock** (error past it) |
| fps contract (D3 groundwork) | HOLDS | `parseDoc`: `fps !== 24 && fps !== 30` → error; surfaces enforced to the three house sizes |
| Group integrity | HOLDS | self-reference/missing-ref/nested-group are errors; duplicate child dedupes with warning |
| Pure frame truth | HOLDS | `frameAt(doc, tMs)` — clamps to [0, total], cursor-walk scene resolution, **emphasis > exit > enter** fixed precedence, clamped channels (no NaN outside windows), emphasis in-window only (triangle envelope, motion's own ease), counter drain captured at exit start (boundary continuity) |
| One applier, idempotent, scoped | HOLDS | `APPLY_GRAPHICS_FRAME_FN` — absolute set-only writes (apply twice ≡ once), `:scope`-scoped mechanism queries (a group's pass cannot overwrite a child's reveal), no layout reads (the W1 `getBBox` lesson), no wall clock, no randomness, no CSS animation |
| Render-input security | HOLDS | icon paths `sanitizeSvg` **then** HTML-escape; text/attributes escaped; backgrounds `#rrggbb`-enforced (junk refused, never substituted); narration is a clock input, never rendered raw; no external fetches at render time |
| Planner degradation | HOLDS | LLM proposals policed per element against the closed grammar; a dropped element never sinks its scene; failed round-trip degrades byte-identically to the native scaffold |
| Substrate reuse (no duplication) | HOLDS | imports `anim/easing.ts` (`evalEase`, `isEaseName`), `anim/clock.ts` (`ANIM_FRAME_BUDGET`, `frameCountOf`), `whiteboard/svg.ts`, `whiteboard/timing.ts` (`estimateNarrationMs`), `whiteboard/beat-plan.ts` (`splitSentences`) — one clock, one curve table, one placement shape |

### 2.2 Findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| R-1 | Low | **Frame-count arithmetic asymmetry.** `graphicsFrameCount(doc)` rounds the whole doc duration once (`frameCountOf(last.endMs, doc.fps)`), but the encoder delivers Σ per-scene `frameCountOf(sceneMs, fps)` frames — per-scene rounding can exceed the whole-doc figure by up to ~N/2 frames (≤ 12 frames at the 24-scene wall). A render preflight that checks the wall against the whole-doc figure could pass while the actual render exceeds the budget. | Fix at P2/P3 (`graphics/preflight.ts`): compute the wall against `framePlanWindows(sceneMs, doc.fps)` Σ frames — the delivered count — and pin it with a unit test |
| R-2 | Trivial | **Comment/code mismatch.** `frame.ts` `graphicsFrameCount` doc comment says "Uses the anim/clock frame rule (ceil to whole frames)" but `anim/clock.ts` `frameCountOf` uses `Math.round`. | One-line comment fix in the P1 follow-up commit |
| R-3 | Planned | D2 routing field absent (confirmed: `SCENE_KEYS` is a closed set without `routing`). | P1 addition per Rev 2 §5.1 — parse tolerantly, serialize strictly, round-trip + neutrality pins |
| R-4 | Planned | D3 per-fps pins absent. | P1 addition per Rev 2 §5.2 (six pins) |
| R-5 | Naming | Test suites are labeled "graphics — G1.1…G1.4". | At merge, relabel suites to carry S123 (D1) or keep G1.x with the documented mapping; recommend relabeling in the P1 follow-up commit where `test-unit.mts` is already touched |

### 2.3 Review verdict

The branch code is house-style, law-conformant, and materially complete for its commits. **No blocker found.** P1 = merge #14 + #15, then one follow-up commit implementing D2 (routing hints) + D3 (per-fps pins) + R-2/R-5 touch-ups.

## 3. Merge-conflict analysis (`scripts/test-unit.mts`)

| Chain | Insertions |
|---|---|
| g1 (#14–#17) | import block ~L147–175 (graphics types/frame/compose/planner) + graphics suites at L15105 (G1.1), L15487 (G1.2), L15688 (G1.3), L15879 (G1.4) — inserted after the "W7 … whiteboard SFX" suite (L15003) |
| s121/s122 (#18–#23) | S121 P0 (L15071), S121 P1 (L15345), S121 P2 (L15520), S121 P3/P4 (L15645), S122 K1 (L15681) — same region, same import block |

**Conflict surface:** both chains append large suite blocks at the same location and extend the same import section. **Content is disjoint** (graphics vs providers/anim/characters). Resolution: keep both; order suites by stage number (S121 → S122 → S123-graphics); merge import blocks additively. Mechanical — minutes, not hours. No test-law conflict (disjoint assertions; both pin different modules).

## 4. Execution playbook (executes only on explicit authorization)

**Step 0 — P0 (docs + gate)**
1. Merge PR #22 (S120 status reconciliation — already drafted, `mergeable: clean`).
2. Merge PR #13 (external roadmap + W5/G1 API drafts — the design record the branch code cites).
3. Run the post-W7 blind re-score per the S120 §4 gate (see §5) — record the consolidated rescore doc. **Requires running repo code + human scorers → its own authorization.**

**Step 1 — P1 (the approved scope)**
1. Merge PR #14, then PR #15 (in order — each contains its predecessor; #16/#17 stay unmerged until P2).
2. One reviewable follow-up commit: `feat(graphics): S123 — advisory routing hints + the 24/30 fps pins` — implements Rev 2 §5.1 (routing field + validator + serializer + pins), §5.2 (six fps pins), R-2 (comment fix), R-5 (suite relabels).
3. Commit `docs/design/s123-motion-graphics.md` (the Rev 2 spec).
4. Post-merge verification (read-only): main tree contains `graphics/types.ts` + `graphics/frame.ts`; suite list shows the graphics suites; 8/8 gates green on the new main HEAD **including Docker smoke** (it runs main-only); unit count reported 597 → N; `compare main^...main` shows zero `src/lib/tubeforge/whiteboard/` changes.

**Step 2 — P2 (separate authorization):** merge #16 → #17; add `graphics/tracks.ts` (via `framePlanWindows(sceneMs, doc.fps)`); `RENDER_MODES`/`render-lane.ts` lockstep commit; resolve the `test-unit.mts` overlap with the S121 stack per §3 if it has merged meanwhile.

**Merge-order note:** the S121 stack (#18→#21) may merge before or after P1 — the only shared file is `test-unit.mts`. Recommendation: P1 first (matches the approved sequencing), the S121 stack under its own authorization.

**Rollback:** `git revert -m 1 <merge-sha>` per merged PR; no migrations; the feature ships dark (no UI/routes on main until P4); golden-frame hashes detect compositor drift.

## 5. P0 blind re-score kit — prepared from the house protocol (`docs/audits/w1-blind-rubric.md`)

Protocol facts captured (verbatim source): nine anchored dimensions (1–5, whole numbers; N/A only for the silent-audio lane); blind kit = codenamed MP4s + per-scene-type frames (`WB-XXXXXXXX.mp4`, `P1..P5.jpg`) with the code→artifact key **gitignored**; old + new artifacts **shuffled together**; per-dimension deltas recorded in the stage audit doc; baseline hashes make artifacts byte-comparable forever; gate is composite **≥ 4/5** with **≥ 3 scorers** (S120 §4); W1 baseline composite was **2.4/5** (non-blind operator proxy, honestly recorded).

For the post-W7 consolidated re-score: the frozen benchmark (`scripts/w1-whiteboard-benchmark.mts` — five scene types, three aspects, determinism pin) emits the new kit; W2–W7 changes are scored against the W1 baseline per dimension.

For S123 (later, at P5): author a **graphics-specific** dimension sheet — adapt the rubric's structure, not its rows (e.g., motion-naturalness, semantic-order, narration-alignment, chart/diagram-readability, text-readability, transition-quality, audio, comprehension) per the Stickman lesson (adapt structure, author new rows).

**Boundary note:** emitting the kit runs repo code locally (renders into gitignored `validation/`) and scoring needs humans — both require authorization; this playbook only prepares the protocol mapping.

## 6. Authorization gate (decision D4 — unchanged)

| Action | State |
|---|---|
| Merge PR #22 + #13 (P0 docs) | Not authorized |
| Merge PR #14 + #15 + D2/D3 follow-up commit (P1) | **Not authorized — awaiting your separate implementation authorization** |
| Merge PR #16 + #17 (P2) | Not authorized |
| Blind re-score execution (harness run + human scoring) | Not authorized |
| Everything read-only so far | Done (this review) |

To authorize, specify scope: e.g. "authorize P0" or "authorize P1" (optionally: "through #17 in one drop" to pull P2's merges forward).

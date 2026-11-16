# PR #24 — the security & integration review (the 2026-11-15 external audit's action 1)

| | |
|---|---|
| Reviewed branch | `s123/full-execution` @ `f202a4f` (PR #24's content, 25 commits over main `37796ce`) — read line-by-line from the verified bundle, not from the PR description |
| Reviewer | S128 session (autonomous, read-only on the PR's branch; the two code findings are FIXED on this branch's `s124/element-editor`, commit `d9e3256`) |
| Verdict | **APPROVE-WITH-FOLLOW-UPS.** No blocker found on the security surfaces the audit named. Two real hardening findings (F1, F2) — both closed by S128's named walls + 5 battery tests. One CI root cause (the skipped Docker smoke) — closed by the S128 trigger fix. |

## 1. The surfaces the audit named, verified in code

### 1.1 Authorization + tenant isolation — PASS
- All three graphics routes (`/api/videos/[id]/graphics` GET/PUT, `.../graphics/render` POST, `.../graphics/scaffold` POST) open with `requireUser(req)` → 401/403 surfaces, then `auth.enter()`, then `db` from **`tenant-db`** — the org-scoped client whose `$allOperations` hook filters every read/write by `organizationId` (the model set is lowercase-normalized and unit-pinned after the T-4.14 regression; `video` is in the set).
- Cross-tenant id guessing resolves to null (extended-where unique semantics) → the honest 404, exactly the behavior cross-tenant access must produce. The `tf/no-raw-db-in-api` ESLint rule + the tenant-db import law keep the raw client out of route handlers.
- The scaffold route additionally refuses non-story formats, empty scene lists, and over-budget scene counts BEFORE any spend.

### 1.2 Render-job isolation — PASS
- Renders enqueue through `startJob(jobKey, "graphics", …)` — the Stage-3 durable queue (atomic claim, retry with backoff, cancellation persisted cross-process, the S100 reaper with fencing-token bump on worker restart). The graphics lane introduces NO new queue mechanism.
- Job keys: the full render rides the videoId; scene drafts ride `<videoId>#g<sceneId>`; the voiceover interlock (409 while a VO regen runs) gives the graphics render the same safety the story and whiteboard lanes have — no half-old/half-new narration program.

### 1.3 Renderer resource limits — PASS
- The frame budget wall is checked at ADMISSION (route POST) AND at render, against the DELIVERED frame count (R-1: Σ per-scene `framePlanWindows(sceneMs, fps)` — per-scene rounding can exceed the whole-doc figure, and the delivered count is the truth). 25,920 frames; the refusal message derives the duration cap from the doc's own fps (the D3 law) and names the wall.
- Chromium: the whiteboard's `WB_CHROMIUM_LAUNCH_ARGS` reused verbatim (the single-renderer rule), per-scene viewports at `deviceScaleFactor: 1`, sanitizeSvg + HTML-escape in the composer, network-aborted pages.
- The grammar's structural walls (elementsPerScene 32, scenesPerProject 24, groupDepthMax 1, iconPathCommandBudget 512, sceneDurationMsMax, projectExplicitDurationMsMax, barDataMax 8) all refuse with named messages.

### 1.4 Storage / artifact invalidation — PASS
- A doc PUT runs `invalidateRenderedArtifacts(id)` then clears `hasVideo`/`videoDuration` — the same sweep discipline as slide edits; the S123 artifacts (per-scene `graphics/scene-N.mp4` + the labelled drafts `graphics/draft-*.mp4`) ride the sweep explicitly, and the S113 scene-scoped over-invalidation cost fix stays intact.
- Drafts are labelled, non-reviewable, no review credit, and never touch `hasVideo`/`final.mp4`/the render manifest (the b6 draft law).

### 1.5 Migration behavior — PASS
- One additive migration (`20261120000000_s123_graphics_doc`): `ALTER TABLE "Video" ADD COLUMN "graphicsDoc" TEXT` — no backfill, no rewrite; mirrored in both dialect schemas (postgres + sqlite, +12 lines each); LWW documented as the house rule with the doc's own `version` field as the grammar contract.

### 1.6 Rate limiting — PASS
- Two layers unchanged by the lane: the edge middleware's per-IP sliding window (all API routes, spoofable-XFF closed at both layers via proxy-trust) and the shared limiter enforced at `requireUser` — the graphics routes get both because they go through `requireUser`.

## 2. The findings

### F1 — free-form string content was unbounded (MEDIUM; FIXED in S128)
Every structural wall bounded SHAPE; nothing bounded the CHAR content of the strings riding inside the doc. A PUT could store a megabyte-scale `"text"` (or title, narration, callout, bar label) that round-trips verbatim into the doc row and the chromium page — memory amplification on parse, storage bloat, and a hang-class risk at render time. **Fix (commit `d9e3256`):** `GRAPHICS_BUDGETS.textCharsMax = 2000` — required content refuses with the named wall (never silently truncated); the OPTIONAL unit decorations warning-drop (the tolerance law). Enforced at all eight sites: doc title, scene narration, text payloads, callout payloads, bar labels, counter/bar units (drop), plus…

### F2 — the icon-path budget counted commands, not characters (MEDIUM; FIXED in S128)
`countPathCommands` is the EXPANDED command count, so a single `M` with one megabyte coordinate literal rode under the 512-command wall as ONE command. **Fix (same commit):** `GRAPHICS_BUDGETS.iconPathCharsMax = 4096` per path-data string — generous for 512 commands, bounds the worst single-literal payload. Five battery tests pin both walls (refusal names the wall at every site; the exactly-at-wall boundary parses; units drop with warnings; the one-command-huge-literal case refuses; the long-but-legal path rides). Battery 760 → **765, 0 failed**.

### F3 — a suspected broken proof script: DISMISSED after byte-verification
During the review, the S123 proof script's `designedFreezes` line appeared corrupted in two independent terminal reads. Byte-level verification (`od -c`) and a full kit re-run (the proof re-rendered GATE GREEN, 21 assertions) proved the file is intact — the phantom was an output-transport artifact of the reviewing toolchain, not the repository. Recorded here so the finding is not silently dropped: it was checked, it is not real, nothing was changed for it.

## 3. The CI root cause behind "Docker smoke: skipped"
The audit's qualification was correct and its cause is now fixed: `docker-smoke`'s `if` fired **only on pushes to main**, and main has not moved since `37796ce` — so both integration PRs legitimately show the job as skipped, not passed. **Fix (commit `d9e3256`):** the workflow gains `workflow_dispatch` (run the FULL gate on any branch from the Actions UI) and a PR opt-in via the `docker-smoke` label; the main-push trigger is unchanged. The smoke script itself was reviewed and needs no change (hub-free image sourcing, SeaweedFS instead of the retired MinIO binaries, the real topology walk incl. the reaper recovery).

## 4. What this review does NOT substitute for
- The Docker production topology walk (now dispatchable on GitHub — run it before merging #24; a container-less standalone boot + route probe was executed locally in the S128 session as a compensating control: 200/401/401/404 as expected, queue init clean).
- The ≥3-scorer blind re-scores (the kit is one command now: `scripts/blind-rescore-kit.mts`).
- A live authorization/concurrency/deployment audit of the RUNNING deployment (this is a code review of the branch).

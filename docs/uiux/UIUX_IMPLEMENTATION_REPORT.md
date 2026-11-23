# Ibismuh Studio — UI/UX Implementation Report (Milestone 1)

**Branch:** `uiux/production-workspace-refresh` (from main `90a2c54`)
**Plan:** the operator's 21-section UI/UX redesign plan
**Scope of this milestone:** Phase 0 (baseline audit + evidence) · Phase 1 (design
system codification) · Phase 2 (application shell & navigation consolidation) ·
regression tests for every behavior touched. Later phases (Director/Storyboard/
Canvas/Timeline/Inspector deep redesigns, microinteractions, perf passes) are staged
work — see §9.

---

## 1. Files modified

| File | Change |
|---|---|
| `src/components/ibismuh/production-board.tsx` | Fetch lifted into exported `useProductionBoard(videoId)` hook (one poll); exported `stageStateForArea()` stage→area mapping + `BOARD_STAGE_DOT`; `ProductionBoard` accepts `data` (pre-fetched) and `hideStages` props — self-fetch behavior preserved when omitted; the duplicate stage-chip strip becomes conditional |
| `src/components/ibismuh/production-workspace.tsx` | Owns the ONE board poll (`const board = useProductionBoard(video?.id)` before the null guard — hooks law); both breakpoints' area-tab lists carry each stage's production-state dot on the nav spine (title tooltip for state); `<ProductionBoard data={board} hideStages …/>` consumes the shared poll |
| `src/lib/store.ts` | `setView` + `restoreViewFromHash` normalize the legacy hub ids (`assets`→`cast`, `insights`→`analytics`) — one navigation map; ViewId type and deep-link law unchanged |
| `src/app/page.tsx` | HubTabs strips retired; every destination renders itself (`view === "cast" && <CastView/>` …); B1 group consts removed; VIEW_META hub entries converted to alias meta |
| `src/components/ibismuh/hub-tabs.tsx` | **Deleted** (no remaining imports; only doc-comment references) |
| `src/components/ibismuh/app-sidebar.tsx` | Doc comment updated to the one-navigation-map law (no code change) |
| `src/app/globals.css` | Additive Phase-1 type scale (`tf-display/h1/h2/h3/body/caption/mono`) — no existing rule modified |
| `e2e/premium-ux.spec.ts` | Stale navigation steps fixed to the 2026-11 sidebar law (Voice Studio / Cast / Topic Radar are direct sidebar destinations; hub-tab clicks removed). These steps were already broken on main since `8fe76ac` changed the sidebar |
| `scripts/test-unit.mts` | 4 new regression tests (§6) |
| `scripts/uiux/*.mjs` | Evidence-capture scripts (Playwright) committed for reproducibility |
| `docs/uiux/UIUX_BASELINE_AUDIT.md` | Phase-0 audit deliverable |
| `docs/uiux/DESIGN_SYSTEM.md` | Phase-1 design-system deliverable |
| `docs/uiux/baseline-screenshots/` | 43 screenshots (before + after evidence) |

## 2. Components created / reused

**Created:** none as new files — the milestone deliberately reuses the existing
library per the plan's reuse rule. New exported seams: `useProductionBoard`,
`stageStateForArea`, `BOARD_STAGE_DOT`, and the `.tf-*` type-scale utilities.

**Reused:** `EmptyState`, `StatusBadge`, `tf-focusable`, `tf-scroll-bar`, Radix
`Tabs`/`ResizablePanel` semantics (kept for the e2e `role=tab` selectors), the
ProductionBoard card, the store's ViewId contract.

## 3. Visual improvements

- The workspace's stacked **two-row navigation** (board stage chips + area tabs) is now
  ONE spine: five area tabs, each carrying the production state of the stage it owns
  (script→Director, storyboard→Storyboard, render→Timeline, voiceover→Inspector;
  Canvas owns none). Warnings ("what needs the human") stay visible from the board
  detail card; checkpoints/costs/history remain on demand.
  Before: `1920x1080-ws-storyboard.png` · After: `1920x1080-after-ws-storyboard.png`.
- Seven destination pages lost the redundant hub tab strip — content starts higher,
  one navigation map remains.
  After: `1920x1080-after-cast.png`, `1920x1080-after-analytics.png`.
- ~90px of vertical chrome removed above the workspace work area on every area page
  (two rows → one row + slim detail card).

## 4. Functional changes

- **None to production behavior.** The rendering engine, frame clock, export pipeline,
  queue guarantees, autosave/undo/redo, scene schema and API contracts are untouched
  (architecture-protection law). The board API is consumed identically (same endpoint,
  same poll rhythm 4s-while-running).
- Legacy deep links `#/assets` / `#/insights` now land on Cast / Analytics (they
  previously rendered a hub strip landing page). This is navigation-surface change
  only; the store's ViewId type keeps both ids so older hashes never 404.
- The e2e navigation steps were stale (broken on main since the sidebar law landed);
  they are repaired in this branch.

## 5. Gates executed (all green)

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | 0 errors |
| ESLint | `npm run lint` | 0 errors, 19 warnings (pre-existing `no-explicit-any` family, untouched files) |
| Unit suite | `npm run test` | **1030 passed, 0 failed** (1026 baseline + 4 new) |
| Production build | `npm run build` | ✓ compiled, 53/53 static pages, standalone assembled |
| Nightly-only e2e | `npm run test:e2e` | **Not executed in this environment** (requires provider-keyed server + full stack); selectors repaired by source-audit and pinned by unit text-assertions — flagged as pending in §8 |

## 6. New regression tests

1. **stage→area mapping** — live-imports `stageStateForArea`: Director=script state,
   Storyboard=storyboard, Timeline=render, Inspector=voiceover, Canvas=null,
   null-board=null (no layout shift while loading).
2. **hub normalization** — live-imports the store: `setView("assets")`→Cast,
   `setView("insights")`→Analytics, real ids pass through, hash restore normalizes,
   `#/timeline/<id>` deep-link law survives.
3. **ONE poll, ONE strip** — the workspace owns the board poll (hook placed before the
   null guard), the board card consumes `data` + `hideStages`, both breakpoints' tab
   lists carry the dots.
4. **hub strips retired** — `hub-tabs.tsx` gone, page.tsx renders each destination
   directly, store normalizes legacy ids (setView + hash restore).

## 7. Screenshots (evidence)

`docs/uiux/baseline-screenshots/` — 43 PNGs: 16 destinations @1920×1080, 5 workspace
areas with a seeded project, 4 laptop/tablet/mobile tiers, mobile nav sheet, login
gate, and the 6 AFTER captures of the changed surfaces. Capture scripts live in
`scripts/uiux/`.

## 8. Known limitations (honest)

1. **E2E suite not executed here** — the nightly workflow will run it; the touched
   selectors were verified by source inspection and the unit pins above.
2. **Provider-gated visual states** (generated storyboard art, assembled timeline
   clips, render-in-progress, error states) are documented from source + the operator
   screencast, not re-captured — no AI keys in this environment by design.
3. The icon-only-button aria-label gap list (audit §F8) is heuristic grep output;
   Phase 10 does the authoritative pass.
4. The workspace project header does not yet expose editable title / save status /
   render status (plan §5) — staged as Phase 6 work alongside the Timeline redesign.

## 9. Remaining plan work (staged, in plan order)

| Order | Workstream | Status |
|---|---|---|
| 0 | Repository & UI audit | **done** (this branch) |
| 1 | Design system | **done** (codified + type scale added) |
| 2 | Application shell & navigation | **done** (this milestone's implementation) |
| 3 | Timeline Studio redesign | next (P0 — strict gates, engine untouched) |
| 4–8 | Storyboard / Director / Canvas / Inspector / microinteractions | staged |
| 9–10 | Responsive + accessibility passes | staged (foundations already in place) |
| 11 | Performance measurement | staged (before/after Lighthouse on prod server) |
| 12 | Regression & visual validation battery | continuous per milestone |

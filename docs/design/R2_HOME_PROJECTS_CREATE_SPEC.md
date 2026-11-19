# R2 — HOME, PROJECTS AND CREATE (Cinematic upgrade, release 2)

**Programme:** `docs/design/CINEMATIC_FULL_STUDIO_UPGRADE_PLAN.md` (baseline: main `a9b24e2`, CI run #36 green 8/8)
**Release:** R2 of 6 — the C2 surfaces: Home (dashboard), Projects (library), Create, plus their satellite panels (attention, plan card, production board, research, calendar).
**Branch:** `r2-home-projects-create` (implementation approval per the plan's release gate).
**Law:** evolve B1–B4 + R1; no architecture changes; every regression rule from the plan §6 stands; R1's no-churn law continues ("changes only if an inconsistency is proven").

## 1. Audit (baseline main `a9b24e2`, R1 grammar now in the tree)

What already exists and is kept:

- R1 layer: `--tf-elev-1/2/3` + `.tf-elev-*`, `.tf-panel`, `.tf-scroll-bar` (the one scrollbar law), the GLOBAL reduced-motion guard, `PanelHeader` / `ErrorState` / `RetryButton` / `LoadingState` / `PreviewFrame` primitives.
- Stage-4a surfaces on every C2 card (`glass rounded-2xl`), `tf-card`/`tf-card-hover` on interactive rows, `tf-kicker` section labels, `tf-focusable` on interactive elements.
- Home's hero, KPI row, performance strip, pipeline chart, activity feed — already audited in Stage 4a; the R1 record explicitly kept them.

Gaps this release closes (each one proven, not stylistic preference):

1. **The library lies about failure.** `library-view.tsx` catches a failed `/api/videos` load and renders the EMPTY state ("No projects yet") — a real outage looks identical to a fresh install. The plan demands "empty, loading, error states are deliberately designed"; R1 built `ErrorState` for exactly this and C2 never adopted it.
2. **Research lies about failure.** `research-view.tsx`'s initial session load is a silent catch → "No scans yet" empty state on a real failure.
3. **The calendar lies about failure.** `calendar-view.tsx` toasts once, then the mobile agenda renders "Nothing scheduled" and the sidebar renders "No videos are ready yet" while the data never loaded.
4. **One proven palette violation.** `production-board.tsx` uses **indigo** (`bg-indigo-400` running dot, `text-indigo-300` spinner) for the running state — indigo is outside the studio's navy/cyan identity; every other live-state indicator in the app uses `primary` (cyan). The dashboard's own live accent, the workspace progress, the attention spinner — all cyan.
5. **Two scrollbar laws.** C2 still uses the legacy `scroll-area-bar` (dashboard activity list, library filter TabsList, calendar sidebar list) where R1 established `.tf-scroll-bar` as the law.

Deliberately kept (audited, documented — the no-churn law applied honestly):

- **`create-view.tsx` format/mode accents** (`character` → fuchsia, `slides` → violet): the format picker needs six distinguishable accents; four are taken by the identity ramp (primary/amber/sky/emerald). Fuchsia and violet are the reserved 5th/6th — replacing them would collide with existing modes. Same for the `studio` tier badge in `plan-card.tsx` (starter=neutral, creator=primary, studio=violet): tier-coding, shipped since Stage 7. Purple-family is therefore a DOCUMENTED allowance for tier/mode differentiators only — never for failure, attention or live states.
- **`attention-panel.tsx`**: no change. The cancel affordance correctly uses red (destructive), amber for attention (status color), silent-null when there is nothing to show (a contextual panel must not render noise).
- **`plan-card.tsx`**: no change. Load failure already surfaces an honest toast with the HTTP code on a Settings surface.
- **Home's panel headers stay inline card headers** (`h3` + caption inside `p-5` cards). R1's `PanelHeader` is a border-b bars header — a different panel shape that belongs to C3+'s dense inspection surfaces, not to the Stage-4a dashboard cards the R1 record explicitly kept.
- **Loading skeletons stay bespoke** where they preserve layout (dashboard KPI/chart skeleton, library card grid skeleton) — `LoadingState` is for blocks without a bespoke skeleton, swapping would churn without gain.

## 2. Deliverables (files)

| File | Change |
| --- | --- |
| `src/components/ibismuh/views/library-view.tsx` | Honest failure: `loadError` state; failed load renders `ErrorState` + `RetryButton` (retry clears error, reloads). Filter TabsList scrolls under `.tf-scroll-bar`. |
| `src/components/ibismuh/views/dashboard-view.tsx` | Stats failure renders `ErrorState` + `RetryButton` (was `EmptyState` — failure and empty are different states); activity list scrolls under `.tf-scroll-bar`. |
| `src/components/ibismuh/views/research-view.tsx` | Initial load failure renders `ErrorState` + `RetryButton` (was silent-catch → fake empty); success clears the flag. |
| `src/components/ibismuh/views/calendar-view.tsx` | Load failure renders compact `ErrorState` in the mobile agenda and the sidebar's "Ready to schedule" list (was fake-empty after a single toast); toast kept for immediacy. Sidebar list scrolls under `.tf-scroll-bar`. |
| `src/components/ibismuh/production-board.tsx` | Running state dot and spinner: indigo → `primary` (the live-state color law). |

Non-goal files (audited in §1): `create-view.tsx`, `plan-card.tsx`, `attention-panel.tsx`.

## 3. Non-goals

- No panel-header conversions on Stage-4a cards (§1).
- No palette expansion, no new tokens, no new primitives.
- No data/endpoint/store changes — the retry buttons call the same loaders the views already have.
- No schema, auth, billing, queue, render, storage or animation changes (plan §6).

## 4. Acceptance gates

- `npm run typecheck`, `npm run lint`, `npm run test` — all green.
- Playwright regression: `smoke`, `isolation`, `premium-ux`, `mobile-sweep` — green (no view-text pins are touched; all changed strings are new failure paths).
- Browser evidence: 1440×900 Home/Projects; the library error state captured LIVE (dev server stopped → fetch fails → designed error, not fake-empty); research/calendar states; ⌘K palette unchanged; mobile 390×844 no horizontal overflow.
- Real walkthrough: sign in → Home → Projects → Create (format picker accents intact) → Settings.
- Before/after visual evidence attached to the release record.

## 5. Regression rules in force

Unchanged from the plan §6 and R1 §5. The `loadError` flags are view-local state; no endpoint contract changes; no new dependencies.

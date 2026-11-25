# R1 — DESIGN SYSTEM AND SHELL (Cinematic upgrade, release 1)

**Programme:** `docs/design/CINEMATIC_FULL_STUDIO_UPGRADE_PLAN.md` (PROPOSED, baseline `b2fd3f3`)
**Release:** R1 of 6 — design tokens, shared panel grammar, navigation, header, loading/empty/error states, responsive shell.
**Branch:** `r1-cinematic-shell` (implementation approval per the plan's release gate).
**Law:** evolve B1–B4; no architecture changes; every regression rule from the plan §6 stands.

## 1. Audit (baseline at b2fd3f3 + ai fix 06a4009)

What already exists and is kept untouched:

- B1 token layer: deep-navy `oklch` surfaces, cyan `--primary`, chart palette (globals.css §B1).
- Stage-4a semantic tokens + utilities: `--tf-text-1..3`, `--tf-hairline(-strong)`, `--tf-surface-1/2`, status colors, motion tokens, `.tf-card`, `.tf-card-hover`, `.tf-kicker`, `.tf-num`, `.tf-focusable`, `.tf-scroll`, `.tf-fade-x`, `.tf-kbd`.
- Shell structure: sticky glass header, `main`, sticky footer (`mt-auto`), mobile Sheet nav, sidebar `w-60`.
- Shared primitives: `StatusBadge`, `StatCard`, `EmptyState`, `Kbd`, `Dot`, `Sparkline`, `TrendDelta`, `SkeletonRows`.
- Command palette (⌘K) with groups, aliases, shortcut sheet.

Gaps this release closes (the "cinematic" bar, not a rebuild):

1. **Reduced motion is partial.** Only the `.tf-tx/.tf-kb/.tf-eq` render primitives pause under `prefers-reduced-motion`; UI transitions (card lift, nav scale, palette) still run.
2. **No elevation grammar.** Panels/headers/popovers pick arbitrary shadows ad hoc; the plan demands "distinct depth, subtle borders and controlled elevation".
3. **No shared panel grammar.** Every view rolls its own panel title row; headings/spacing drift between views.
4. **No error state primitive.** `EmptyState` covers empty; failed loads have no designed state (the plan: "empty, loading, error states are deliberately designed").
5. **No cinematic preview frame.** Media presentation is per-view ad hoc; the plan wants "large, immersive, aspect-ratio-aware".
6. **Sidebar polish.** Active state is a tint + dot; no left rail, no section kicker, nav buttons lack the shared focus class.
7. **Scroll areas.** `.scroll-area-bar` exists for specific panes; inner lists need one shared scrollbar law.

## 2. Deliverables (files)

| File | Change |
| --- | --- |
| `src/app/globals.css` | Elevation tokens (`--tf-elev-1/2/3`), `.tf-elev-*`, `.tf-panel` panel chrome, `.tf-scroll-bar` scrollbar law, GLOBAL reduced-motion guard (transitions + animations), keep every existing token byte-stable |
| `src/components/ibismuh/shared.tsx` | `PanelHeader` (kicker + title + actions row), `ErrorState` (retry action, honest message), `LoadingState` (spinner block), `PreviewFrame` (aspect-ratio-aware media frame with rail + caption slot) |
| `src/components/ibismuh/app-sidebar.tsx` | Section kicker, active rail (left accent bar), `tf-focusable` on nav buttons, elevation on the status card |
| `src/app/page.tsx` | Header: kicker over title, consistent `tf-focusable`; shell keeps sticky header/footer laws unchanged |
| `src/components/ibismuh/command-palette.tsx` | Shared scrollbar law on the results list, group header rhythm, footer hint row polish |
| `src/components/ibismuh/brand.tsx`, `logo.tsx`, `icon.svg`, `manifest.webmanifest` | Verify alignment only; changes only if an inconsistency is proven (no churn) |

## 3. Non-goals

- No view-level redesigns (C2–C6 own those).
- No new dependencies; no new animation engine; no store/document/schema changes.
- No color-system change: navy/blue/cyan identity retained; red stays destructive-only.

## 4. Acceptance gates

- `npm run typecheck`, `npm run lint`, `npm run test` — all green.
- Playwright regression: `smoke`, `isolation`, `premium-ux`, `mobile-sweep` — green (existing pins stay honest; new primitives must not break the Stage-4a assertions).
- Browser evidence: 1440×900, 768, 390×844 screenshots; keyboard walk (tab order, visible focus); reduced-motion emulation check; no horizontal overflow.
- Real walkthrough: sign in → Home → Projects → open the failed-probe workspace (error state honest) → Settings.
- Before/after visual evidence attached to the release record.

## 5. Regression rules in force

Prisma schema/migrations, auth/session/tenant isolation, billing, provider credentials, queue semantics, render contracts, animation clocks, storage ownership — untouched. Any engineering change discovered mid-release is split out and separately justified.

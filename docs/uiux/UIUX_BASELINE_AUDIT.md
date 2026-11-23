# Ibismuh Studio — UI/UX Baseline Audit (Phase 0)

**Branch:** `uiux/production-workspace-refresh`
**Date:** 2026-11-23
**Method:** Source inspection of every file named in the plan's Phase-0 list, plus live
screenshots captured from a booted dev server (SQLite, registered audit account) with
Playwright. Every observation below is backed by a file/line reference or a screenshot in
`docs/uiux/baseline-screenshots/`. Nothing is invented; where evidence could not be
captured in this environment, it is marked **Pending evidence**.

**Reference commit:** `90a2c54` (main HEAD when this audit was captured).

---

## 1. Evidence set (Gate 0)

Captured with `scripts/uiux-baseline-shots.mjs` + `scripts/uiux-ws-shots.mjs`
(repo copies under `scripts/uiux/`), against the running app:

- 16 destinations at **1920×1080** — dashboard, library, create, the five workspace areas
  (no project open), cast, world, voice, analytics, research, calendar, channels, settings
  → `1920x1080-<view>.png`
- The five workspace areas **with a seeded demo project open** (story format, 3 scenes) →
  `1920x1080-ws-<area>.png`
- Key screens at **1440×900**, **1366×768**, **1024×768**, **390×844** → `<res>-<view>.png`
- Mobile nav sheet open → `390x844-mobile-nav.png`
- Sign-in gate → `1920x1080-login.png` (bonus state)

**Pending evidence** (requires an environment with real AI-provider credentials, which
this audit environment intentionally does not hold):

- Storyboard with generated art thumbnails (the seeded project renders the honest
  "Awaiting art" empty state — itself useful evidence).
- Timeline Studio with assembled clips + audio waveforms.
- Rendering-in-progress state (progress bar captured in code review only).
- Error state surfaces.

The pre-redesign operator screencast (analyzed earlier in this workstream) supplies
qualitative evidence for those states and is referenced where relevant.

---

## 2. Existing layout (what is there today)

### 2.1 Application shell

| Layer | Implementation | Screenshot |
|---|---|---|
| Desktop sidebar | `src/components/ibismuh/app-sidebar.tsx` — 240px (`w-60`), hidden below `lg`, groups: Studio / Production / Assets / Insights / Account; 16 direct destinations; active rail + `aria-current="page"`; status card + Sign out | `1920x1080-dashboard.png` |
| Mobile navigation | Sheet (`lg:hidden`) listing the same 16 items, `min-h-[44px]` touch targets | `390x844-mobile-nav.png` |
| Top bar | `src/app/page.tsx` — sticky, `glass-strong`, kicker/title/subtitle per view (VIEW_META), ⌘K palette trigger, contextual New Project button (hidden on create/settings/workspace areas) | all |
| URL law | Hash-anchored views (`viewToHash` / `restoreViewFromHash`, `src/lib/store.ts`); the five workspace areas anchor `#/<area>/<videoId>`; reload + deep links restore view AND project | — |
| View loading | `next/dynamic` lazy views with a spinner fallback (`ViewFallback`) | — |
| Footer | Static, two-line, present on every view | all |

### 2.2 Production workspace

`src/components/ibismuh/production-workspace.tsx` (4.7k lines) hosts ONE engine instance;
`area` prop steers the active page (commit `90a2c54` law: every area is a first-class
page — the workspace view is never remounted, state survives page changes).
Wide layout (≥1024px): `ResizablePanelGroup direction="horizontal"` — center work area +
inspector rail (Inspector focus = full width, no double mount). Below 1024px: Radix
stacked tabs. Each area owns a bold header via the page shell's VIEW_META.

- `1920x1080-ws-storyboard.png` — project header (badges, title, meta, back-to-Projects),
  board card, tab spine, AI Director bar, scene cards, inspector rail (voice/mix/kit/
  thumbnail/publish).
- `1920x1080-ws-timeline.png` — Timeline Studio as the work area + Render & Ship deck
  riding the rail (render modes, caption switches, export presets).

### 2.3 The five areas' internals

- **Director** — `scriptTab` (production-workspace.tsx:3424): brief input, script beats,
  pacing strip, director card, critic card.
- **Storyboard** — `storyboardArea` (:4219+): scene cards (SCENE n header, art
  placeholder, narration, chips, Edit scene, Re-roll), generate/regenerate controls,
  whiteboard variant (`WhiteboardStudio`) when `renderMode === "whiteboard"`.
- **Canvas** — `canvasArea` (:4254+): scene rail + `SceneStudioPanel` inline (no nested
  dialog), empty state points at the Director.
- **Timeline** — `timelineStrip` (:2068+) mounting `TimelineStudio`
  (src/components/ibismuh/timeline-studio.tsx, 5.3k lines): transport, timecode, zoom
  (DENSITY 16–320 px/s), playhead + snap, razor with split laws, history (cap 50),
  autosave/dirty states, narration sync playback.
- **Inspector** — `inspectorArea` (:4208+): QC scorecard (`qcCheckStatus` three-state
  law), voice panel, engagement kit, thumbnail A/B lab, publish flow, ship gate.

### 2.4 Shared components (reuse inventory)

`src/components/ibismuh/shared.tsx`: `StatusBadge`, `StatCard`, `EmptyState`,
`ErrorState`, `LoadingState`, `PanelHeader`, `Kbd`, `Dot`, `Sparkline`, `TrendDelta`,
`SkeletonRows`, `PreviewFrame`, `VoiceSelectWithPreview`, `formatDuration`, `timeAgo`.
Plus `ProductionBoard`, `PacingStrip`, `CommandPalette`, `HubTabs` (as of this commit).

---

## 3. Findings

### F1 — Navigation duplication (HIGH — fixed in this branch, §report)

At the reference commit the operator could reach the same place through two stacked rows
inside the workspace: the **ProductionBoard stage chips** (Script › Storyboard › Voice ›
Render › Publish, clickable, production-workspace.tsx:4437) **and** the **five area
tabs** (AREA_TABS strip, :4491). Two rows, two click models, ~90px of vertical chrome
above the work area — visible in `1920x1080-ws-storyboard.png` (before).

The same duplication existed on seven destination pages: the **HubTabs strips**
(`hub-tabs.tsx`) re-listed Cast/World/Voice Studio (and Analytics/Topic Radar/Calendar/
Channels) below the app bar while the sidebar already listed every one of them directly
(2026-11 law). Additionally, the e2e navigation steps still walked the removed
"Assets"/"Insights" sidebar entries (`e2e/premium-ux.spec.ts:185,230,286` — stale since
commit `8fe76ac` changed the sidebar; the nightly e2e suite was already broken there).

### F2 — Typography inconsistency (MEDIUM)

- **660** occurrences of `text-[10px]`/`text-[11px]` across `src/components/ibismuh/` —
  most carry interactive labels or metadata. The plan's rule: "Avoid using 9px or 10px
  text for important interactive labels." The ProductionBoard alone uses five different
  micro-sizes (10/11px labels in one card).
- Hierarchy exists (`tf-kicker`, `text-xs/sm/base/lg`), but there is no documented scale;
  headings mix `text-lg`, `text-xl`, `font-semibold`, `tracking-tight` ad hoc
  (e.g. production-workspace.tsx:4405 vs page.tsx:337).
- Numeric formatting: `.tf-num` (tabular-nums) exists and is used in ~30 places, but
  timeline timecodes and several KPI grids format numbers without it.

### F3 — Spacing/surface inconsistency (MEDIUM)

- **476** hardcoded `bg-white/N` overlays across **35 files** (3, 4, 5, 6, 8, 10, 12%
  …) vs the Stage-4a tokens (`--tf-surface-1/2`, `--tf-hairline`) used in ~59 places.
  Two coexisting systems: components reach for arbitrary alphas when a token exists.
- **42** arbitrary px spacing values (`gap-[Npx]`, `w-[Npx]` …) alongside the Tailwind
  scale.
- Card chrome is standardized (`tf-card`, `tf-panel`, `glass`, elevation law) but not
  universally adopted — e.g. ProductionBoard and several rail cards hand-roll
  `rounded-xl border border-white/10 bg-white/[0.02]` instead of `tf-card`.

### F4 — Workspace header / progress strip (MEDIUM — partially fixed in this branch)

- The project header (production-workspace.tsx:4354+) shows badges, title, meta,
  thumbnail — but no editable title, no save-status, and the render status only appears
  as a conditional bar below the board (:4456). The plan's §5 header asks for
  title/save/render visibility; Timeline Studio's save status lives inside the studio
  toolbar, invisible from other area pages. **Remaining work (Phase 6).**
- The ProductionBoard was a good compact board (clickable stages, attention chips,
  checkpoints, costs, collapsible history) but duplicated the nav (F1) and always
  rendered the full detail block above the work area.

### F5 — Timeline usability (LOW-MEDIUM, Phase 6 workstream)

Source review of timeline-studio.tsx (behavior preserved — architecture-protection law):

- Zoom (keyboard/UI) preserves the playhead via anchor logic (:907–942) — good.
- The razor requires the playhead INSIDE the clip's spoken read, with actionable toasts
  (:1095–1120) — good empty/error feedback.
- Track headers/labels are compact but rely on the same 10–11px micro text (F2).
- Preview area priority: the studio gives the preview the full center column at the top
  of the work area (layout evidence `1920x1080-ws-timeline.png`); render-in-progress
  visibility comes from the workspace-level progress bar (:4456) — adequate, refine in
  Phase 6.

### F6 — Storyboard usability (LOW)

Scene cards are consistent (uniform aspect placeholders, narration, chips, per-card
Re-roll). Gaps against plan §7: no explicit duplicate action on the card (clip-ops API
supports it), selection indicators are implicit (Canvas selection), and the
"no storyboard exists / generating" states render honest but terse text — an
`EmptyState` upgrade is a Phase-4 candidate.

### F7 — Responsive behavior (MEDIUM)

- Sidebar collapses to a sheet below `lg` — correct. At **1024×768** the persistent
  240px sidebar + max-w-[1400px] center works, but the Account card clips at the bottom
  (`1024x768-dashboard.png`) — cosmetic.
- The workspace's wide layout is gated at ≥1024px with stacked tabs below — the
  breakpoint matches the plan's laptop tier.
- Mobile (`390x844`): views stack single-column; no horizontal overflow observed on
  dashboard/library/create/settings. The workspace relies on scroll (no timeline
  editing promised on mobile — matches plan §12 guidance).

### F8 — Accessibility (MEDIUM)

- Good foundations: `tf-focusable` single focus law (globals.css:813), 139
  `aria-label`s in ibismuh components, `aria-current` on nav, `role=tab` semantics kept
  on the workspace spine, reduced-motion global guard (globals.css:918), AA-checked
  text tokens.
- Gaps: 8+ icon-only `size="icon"` buttons without an adjacent `aria-label` (heuristic
  grep — settings-music.tsx:301, library-view.tsx:243,259, world-view.tsx:212,
  calendar-view.tsx:304,316,545, channels-view.tsx:189); the plan's dialog
  focus-management and contrast re-verification remain Phase-10 items.

### F9 — Performance (informational)

Boot payload already mitigated (lazy views, page.tsx:32–50). The workspace is a large
client bundle by design (engine + 5 areas in one host — intentional per the 2026-11 law
that pages must not remount the engine). Timeline uses memoized derived state
(`activeClip`, `playheadInClip`). No new performance dependencies introduced by this
branch. Phase-11 measurement: before/after Lighthouse on a booted prod server.

---

## 4. Risks assessed per component (plan §3 audit deliverable)

| Component | Risk if changed | Disposition |
|---|---|---|
| `timeline-studio.tsx` | Highest — state, persistence, undo, render queue ride it | **Untouched** in this milestone; Phase 6 with strict gates |
| `production-workspace.tsx` | High — hosts the engine instance | Minimal, additive edits only (see report) |
| `production-board.tsx` | Medium — read-only card | Hook lift + props added; self-fetch behavior preserved when props omitted |
| `store.ts` | High — ViewId contract shared by palette/deep links | Additive normalization only; ViewIds unchanged |
| `page.tsx` | Medium — view switch + hash law | Render-map simplification; hash behavior unchanged |
| `app-sidebar.tsx` | Low | Doc-comment update only |
| `globals.css` | Medium — shared by everything | Additive token/utility block only (§DESIGN_SYSTEM) |

---

## 5. Existing components that should be reused (plan checklist)

`EmptyState`, `ErrorState`, `LoadingState`, `PanelHeader`, `StatusBadge`, `Kbd`,
`tf-card`/`tf-panel`/`tf-elev-*`, `tf-kicker`, `tf-num`, `tf-focusable`, `tf-kbd`,
`tf-scroll-bar` — adopted as the standard for all Phase 3+ work (see DESIGN_SYSTEM.md).

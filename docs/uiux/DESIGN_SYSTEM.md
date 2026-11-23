# Ibismuh Studio — Design System (Phase 1)

**Branch:** `uiux/production-workspace-refresh`
**Scope:** proposal + codification. The approved identity (navy/blue/cyan, Ibismuh
Studio logo, dark-only theme) is preserved byte-stable; this document names the single
source of truth for every new surface and standardizes what was ad hoc.

---

## 1. Color system (preserve — non-negotiable)

Defined once in `src/app/globals.css`. **Do not hardcode new variants of these values
in components**; the audit (§F3) counts 476 `bg-white/N` overlays that pre-date this
law — new code uses the tokens below.

### 1.1 Theme tokens (B1 foundation, `:root` / `.dark` block)

| Token | Value (oklch) | Use |
|---|---|---|
| `--background` | `0.145 0.02 248` | app canvas (deep navy) |
| `--card` | `0.19 0.024 250` | card surfaces |
| `--popover` | `0.205 0.024 250` | menus, palettes |
| `--primary` | `0.8 0.105 205` | primary accent (cyan) — actions, active states |
| `--secondary` | `0.24 0.024 250` | secondary surfaces |
| `--muted` / `--muted-foreground` | `0.225…` / `0.68…` | muted text |
| `--accent` | `0.27 0.04 232` | accent fill (blue-leaning) |
| `--destructive` | `0.704 0.191 22.216` | destructive/failed ONLY (red reserved) |
| `--border` / `--input` / `--ring` | white alphas / cyan ring | hairlines, focus |
| `--sidebar` family | `0.16…` canvas + cyan primary | app sidebar |

### 1.2 Semantic Stage-4a tokens (`:root`, AA-checked on the dark canvas)

| Token | Value | Use |
|---|---|---|
| `--tf-text-1` | white/96% | headings + values |
| `--tf-text-2` | white/74% | body / secondary |
| `--tf-text-3` | white/57% | captions / metadata |
| `--tf-hairline` / `--tf-hairline-strong` | white/8% / 15% | borders |
| `--tf-surface-1` / `--tf-surface-2` | white/3% / 5.5% | panel fills |
| `--tf-positive` / `--tf-warning` / `--tf-danger` / `--tf-info` | `#34d399` / `#fbbf24` / `#f87171` / `#7dd3fc` | status only |
| `--tf-dur-fast` / `--tf-dur` / `--tf-ease` | 120ms / 200ms / cubic-bezier(.25,.1,.25,1) | motion |

### 1.3 Production-state color law (R2, keep)

Stage/progress states use exactly one mapping — `BOARD_STAGE_DOT`
(`src/components/ibismuh/production-board.tsx`):

- done → emerald-400 · partial → amber-400 · preview → sky-400 ·
  **running → `bg-primary` (cyan, pulsing) — the same in-flight color everywhere** ·
  missing → zinc-600.

Red is destructive/failed only. Indigo/purple are outside the identity.

### 1.4 Elevation grammar (R1, keep)

`--tf-elev-1/2/3` (subtle black-alpha shadows) via `.tf-elev-1/2/3`; panels compose
`.tf-panel` (surface + hairline + elev-1 + top-light inset). `.glass` for translucent
cards, `.glass-strong` for sticky bars (opaque — header text must never bleed).

---

## 2. Typography

One stack: **Geist Sans** (UI) + **Geist Mono** (technical values) — loaded in
`src/app/layout.tsx`, no per-component font choices.

| Element | Class | Spec |
|---|---|---|
| Display | `.tf-display` | 24px / 1.2 / -2% / 700 / text-1 — one per page (the VIEW_META heading) |
| Heading 1 | `.tf-h1` | 20px / 1.3 / -1% / 600 — main section headings |
| Heading 2 | `.tf-h2` | 16px / 1.4 / 600 — panel headings |
| Heading 3 | `.tf-h3` | 14px / 1.45 / 600 — subsections |
| Body | `.tf-body` | 14px / 1.55 / text-2 |
| Secondary | `.tf-body` + muted tokens | descriptions, metadata |
| Label | `.tf-kicker` | 11px uppercase +8% tracking / 600 — section labels |
| Caption | `.tf-caption` | 12px / text-3 — supporting info; **never interactive labels** |
| Monospace | `.tf-mono` | Geist Mono + tabular numerals — timecodes, ids, hashes |
| Numerals | `.tf-num` | tabular-nums for KPIs, durations, timeline values |

**Laws carried from the plan:**
1. No 9–10px text for interactive labels (audit §F2: 660 legacy `text-[10/11px]` —
   migrated opportunistically, never in a bulk sweep that risks regressions).
2. Every heading takes a scale class; no ad-hoc `text-xl font-semibold` recombination
   in new code.
3. All timeline/duration numbers use `.tf-num`/`.tf-mono` (predictable column widths).

---

## 3. Spacing

The Tailwind 4px scale IS the spacing system (4/8/12/16/24/32/48 → `p-1…p-12` rhythm).
Laws:

1. Panel padding: `p-3` (12px) compact panels / `p-4` (16px) standard cards / `p-6`
   page gutters.
2. Section gaps: `space-y-3` (12px) within a panel, `space-y-5` (20px) between page
   sections — matching the existing page rhythm (`page.tsx`, workspace root).
3. No arbitrary px spacing in new code (`gap-[Npx]` etc. — audit counted 42 legacy
   uses; migrate only when touching the file anyway).
4. Timeline track geometry stays as-is (`LANE_H_VIDEO=64`, `LANE_H_AUDIO=30`) — it is
   renderer-adjacent contract, not free styling space.

---

## 4. Component standards

### 4.1 Reuse-first inventory (do not re-implement)

| Need | Component |
|---|---|
| Empty states | `EmptyState` (shared.tsx:142) |
| Error states | `ErrorState` (:380) + `RetryButton` (:416) |
| Loading | `LoadingState` (:438), `SkeletonRows` (:309), `Skeleton` |
| Status | `StatusBadge` (:77), `Dot` (:203), `BOARD_STAGE_DOT` map |
| Panel header | `PanelHeader` (:340) |
| Cards/panels | `.tf-card`, `.tf-card-hover`, `.tf-panel`, `.glass`, `.glass-strong` |
| KPI | `StatCard` (:98), `Sparkline` (:235), `TrendDelta` (:281) |
| Shortcut chip | `Kbd` (:198) / `.tf-kbd` |
| Focus | `.tf-focusable` — the one focus style, never suppressed |
| Voice pick | `VoiceSelectWithPreview` (:605) |

### 4.2 Interactive states (required for every control)

Every interactive control ships: default / hover / focus (`tf-focusable` ring) /
active / disabled (with a reason in `title` or adjacent copy where non-obvious) /
loading (spinner + label, e.g. the render bar pattern production-workspace.tsx:4456).
Transition durations: `--tf-dur-fast` for color/opacity, `--tf-dur` for
transform/shadow; `prefers-reduced-motion` collapses everything (global guard,
globals.css).

### 4.3 Vocabulary (one meaning, one word)

- Save states: **Saving… / Saved / Unsaved changes / Save failed** (timeline toolbar).
- Generation: **Generating…** + per-stage honest labels; never fake completion.
- Destructive: red only, confirmation dialog, verb-first copy ("Delete project").
- Navigation: the sidebar is the ONE map (2026-11 law); page kickers name the group;
  no page renders a second navigation row.

---

## 5. What this branch changed in the system layer

1. **Added** the `.tf-display/.tf-h1/.tf-h2/.tf-h3/.tf-body/.tf-caption/.tf-mono`
   scale (globals.css — additive `@layer utilities` block; zero existing rules
   modified).
2. **Documented** the existing token system as the source of truth (this file).
3. **No color, logo, radius, or theme values changed** — brand preservation verified
   against `docs/design/B1_DESIGN_SPECIFICATION.md` §2 and the R1/R2 release records.

Adoption: Phase 3+ screens take headings/body/captions from §2 and panels from §4.1.
Existing files migrate opportunistically (when already being edited), never in bulk.

---

## 6. A2 — the ambient aesthetic layer (2026-11 "more beautiful" pass)

Purpose: give the studio cinematic depth WITHOUT touching identity. Appended
to globals.css as a final layer; documented here as part of the system so it
is inherited, not reinvented.

### The five primitives

| Primitive | Utility / selector | What it does |
| --- | --- | --- |
| Ambient washes | `body::before` (fixed, z −1) | Blue crown upper-left, cyan rim upper-right, deep vignette anchoring the bottom — all sampled from the B1 navy/blue/cyan family at ≤ 7% alpha |
| Film grain | `body::after` (fixed, z −1) | Desaturated SVG turbulence at 3% opacity — kills gradient banding, adds texture; neutral, not color |
| Gradient hairline | `.tf-hairline-fade` | Divider brightest at center, gone at both ends — header's lower edge, footer's upper edge, sidebar's logo rule |
| Lit sidebar plane | `.tf-sidebar-surface` | Top-light gradient over the SAME `--sidebar` token — the rail reads as a separate lit surface |
| Rail-cast active nav | `.tf-nav-active` | Cyan→blue wash strongest at the rail edge, dissolving right, with inner hairline silhouette — replaces flat `bg-primary/15` |

Also: `::selection` joins the brand (cyan 28%), and `.bg-brand-gradient`
gains a painted top light (layered background, NOT box-shadow — glow-brand /
glow-brand-soft must keep winning the box-shadow cascade).

### Laws (non-negotiable, same as the rest of the system)

1. **No new hues.** Every wash uses the existing navy/blue/cyan family; the
   grain is monochrome. Red stays destructive-only.
2. **Whisper alphas.** Washes ≤ 7%, grain ≤ 3% — depth you feel, decoration
   you don't.
3. **Behind everything.** Both pseudo-layers are `position: fixed`,
   `z-index: -1`, `pointer-events: none` — zero layout impact, zero click
   interception, no component changes required.
4. **Static paint.** The layer is motionless; reduced-motion users get the
   identical look. Light text over the darker vignette tail gains contrast.

Adoption: automatic (global). New surfaces only need the utilities above;
never hand-roll radial washes or grain per component.

---

## 7. A3 — surface & control pass (the "more beautiful design and layout" round)

Where A2 lit the ROOM (ambient washes, grain, hairlines), A3 refines the
FURNITURE: the shared primitives every view inherits. One edit per primitive,
zero view files touched — the whole studio sharpens at once.

### The two new utilities (globals.css, appended after the A2 layer)

| Utility | Applies to | The law |
| --- | --- | --- |
| `.tf-pop` | Dialog, command palette, popover, dropdown, hover-card, select content, menubar, context-menu | ONE elevated chrome: popover token (one step lighter than the page), strong hairline silhouette, `--tf-elev-3` detachment, top-light inset. `shadow-md/lg` retired from those surfaces — tf-pop owns depth. Sheets are EXEMPT: the mobile sheet keeps `.tf-sidebar-surface` and must keep winning |
| `.tf-control` | Input, Textarea, Select trigger | ONE control surface: white-alpha field (4%), hover border-RAISE (12% → 20% + field lift) instead of the old bg fill, cyan focus edge (60%). The 3px focus ring stays owned by the primitives; tf-control only joins the border to it |

### Component deltas

1. **Button** — the press: `active:scale-[0.985]` on every variant; the base
   already carries `transition-all`, and the global reduced-motion guard
   collapses it to instant under the OS setting.
2. **Tabs** — the active pill is a raised surface (`white/7`) with an inset
   top light instead of the flat `bg-input` fill; geometry unchanged.
3. **Shell** — the header's page title steps up on desktop (`sm:text-xl`) so
   the kicker → title → subtitle stack reads as a masthead; the content
   column gains a touch of vertical air (`py-6 sm:py-8`).
4. **Input/Textarea/Select** — the old `dark:bg-input/30` /
   `dark:hover:bg-input/50` fills are retired; `.tf-control` is the single
   source for field surface, hover and focus edge.

### Laws (same as A2, unchanged)

1. **No new hues.** White-alpha surfaces over the existing navy tokens; cyan
   remains the single accent; red stays destructive-only.
2. **Caller overrides keep winning where it matters.** Explicit caller
   backgrounds on triggers (`bg-white/5` etc.) are visually identical to the
   new base — no visual break, and they now inherit the hover/focus law.
3. **Reduced motion.** Every transition added here rides the existing global
   `prefers-reduced-motion` guard — nothing new to exempt.
4. **Contrast.** All surface deltas are lightness/alpha moves inside the same
   palette; every text tone keeps its AA relationship (backgrounds moved by
   ≤ 2% alpha).

Adoption: automatic (all views inherit the primitives). New floating surfaces
use `.tf-pop`; new fields need nothing — `<Input>`/`<Textarea>`/`<SelectTrigger>`
carry the law in their base.

# Catalog Phase C, slice 1 — the MG design system (semantic components + animation recipes)

**Status:** LANDED (this slice closes the first half of Phase C; the icon
vocabulary's own growth is slice 2).
**Audit basis:** the catalog route's Phase C — "the MG design system
(semantic components, animation recipes)" (worklog PhaseB-S4/S5 stage
summaries; the audit's own sequencing in `docs/audits/s149-substrate-wiring.md`
§5 and `docs/audits/s150-typography.md` §5).
**Receipt battery:** `scripts/test-graphics-design-system.mts` — 28 laws
across 5 suites (recipes / components / native lane / LLM lane / wiring).

## 1. The question this slice answers

Phase B gave the whiteboard lane a production catalog (145 primitives, 4
compositions, 299 rows). Phase C turns to the motion-graphics lane: the
graphics scaffold knows how to place primitives and how to move them (the
S162 measured vocabulary), but the CHOREOGRAPHY KNOWLEDGE — which motion per
kind, which delay per order, which ease per role — lives as one hand-tuned
table with no named alternatives, and the professional BUILDING BLOCKS — the
stat card, the quote card, the CTA banner — are re-assembled by hand every
time. The design system names both: recipes make the choreography a
registry, components make the arrangements a registry. Neither grows the
grammar; both compile into the EXISTING `GraphicsDoc` element/motion
vocabulary at planning time.

## 2. What landed

### The native-defaults seam (`graphics/native-defaults.ts`, NEW)

The per-kind placement table, the enter/exit/camera choreography, and the
two text helpers moved VERBATIM out of `planner.ts` (the icon move's
one-source law, G1.5: planner.ts RE-EXPORTS every name so every legacy
import path keeps resolving — never a second table). The seam breaks the
adoption cycle: the design-system modules ride the defaults without
importing the planner, while the planner adopts their registries. Pure and
deterministic; the unit suite's 1064 pins prove the move byte-identical.

### The recipe registry (`graphics/recipes.ts`, NEW)

Five named recipes — `house-baseline`, `count-up-spotlight`, `cascade-list`,
`chart-grow`, `quiet-card` — each a per-kind OVERRIDE delta on the native
defaults (a kind absent from the delta falls through to the native table;
no recipe is a second complete table). The laws:

- **The identity law:** `house-baseline` carries ZERO overrides BY LAW —
  its whole definition is delegation to `nativeEnterFor`/`nativeExitFor`,
  so adopting the registry cannot drift the scaffold's pinned outputs.
  Pinned EXHAUSTIVELY: every kind × order 0..8 × clock {4000, 4375, 6500,
  12000} × count 1..4 — the baseline compiles byte-identical to the native
  table.
- **Legality:** every override rides its `MOTION_KINDS_BY_ELEMENT` row and
  the closed ease table (`isEaseName` — one source of curve truth); the
  gate runs at EVERY compile (assertOverrideLegal), not just at load.
- **Fitting:** every enter fits the estimator's 4000ms floor at the
  planner's per-kind orders (≤ 5); every exit completes before the scene
  tail for any clock ≥ the floor (the exit override's `delayMs` is
  TAIL-ANCHORED — the end-before anchor, nativeExitFor's fadeAt shape).
- **Fail-closed:** an unknown recipe id throws a NAMED error at the
  compile seam (a planner bug, like every closed-table violation); the
  self-check (`assertRecipeRegistry`, injectable for defect tests, run at
  load) refuses the baseline carrying overrides, unknown ids, illegal
  kinds/eases, negative spans — every defect BY NAME.
- **The doc stays grammar-pure:** recipes compile at PLANNING time into the
  existing `ElementMotion` directives; the doc never carries a recipe id
  (the preset registry's shape at the scene scale).

### The component registry (`graphics/components.ts`, NEW)

Five semantic components — `stat-card`, `kicker-card`, `big-quote`,
`cta-banner`, `icon-caption` — each a parameterized arrangement of
primitive parts with a 16:9 anchor, per-part offsets, and a CONTENT SLOT
(`text` / `sub` / `counter` / `icon`). The laws:

- **The single-syntax law (the compounds' law):** a component NEVER enters
  the doc. `expandComponent` is the ONE seam constructor — it expands into
  primitive elements with derived ids (`<componentId>-<partId>`), placements
  remapped from the anchor (the S68 law), payloads from the caller's
  story-derived content, and enter motions from the native table (legality
  by construction). Exits are NOT set here — the scaffold's staged pass
  owns exits for every archetype (one exit law, one writer).
- **The content law:** the expansion INVENTS NO FACTS. Text rides the
  caller's strings (the ONE capLine law); the counter rides the caller's
  number (positive, finite — the v1 count-up law); the icon rides a
  REGISTERED library id. A required slot without content is a NAMED
  refusal; an optional slot (stat-card's accent, every `sub`) omits its
  part — the ids of present parts stay stable. INVALID content (an
  unregistered iconId) refuses for BOTH — the caller asked for something
  that does not exist, and that is worth naming.
- **Fail-closed:** the self-check (`assertComponentRegistry`, injectable,
  run at load) refuses duplicate component/part ids, charset-illegal
  derived ids (the `validGraphicsId` law — no `--`/`::`), unknown part
  kinds, non-finite offsets, anchors off the 16:9 frame, empty parts —
  every defect BY NAME.
- **The planKind bridge:** each component declares its lane-plan family
  (`statistic` / `headline` / `quote` / `cta` / `icon-group` — planner-types'
  GraphicComponentKind vocabulary), so the declarative seam's names and the
  doc-level expansions share one vocabulary.

### The planner adoption (additive, byte-preserving)

- **The quote archetype:** a REAL quoted span (`"..."` / curly / guillemets,
  ≥ 3 chars — a paraphrase is not a quote) in a middle scene scaffolds the
  `big-quote` component: the quote text is the story's own span, the
  attribution is the story's text after the closing quote (omitted when the
  quote ends the narration — no invented source). Ordered AFTER
  chart/stat so data scenes stay data scenes (the archetype order IS the
  policy, first-hit-wins). Quote-free narrations scaffold WITHOUT any
  component-derived id — pinned against the unit suite's own pinned
  stories; every pinned narration byte-stable (unit 1064/0).
- **The LLM component channel:** a proposal may name `component` (the
  registry's vocabulary; the prompt teaches it, riding `componentNames()` —
  no second list). The expansion runs BEFORE the cap (parts face it
  individually; the container is not an element), and every part rides the
  EXISTING police — kind set, payload shape, motion compatibility, id law,
  the scene clock — so a dropped part never sinks its siblings and every
  drop is named (the per-element degradation law, verbatim). A proposal
  naming BOTH a component and a kind dies (ambiguous by construction); an
  unknown component id dies with the registry's name in the reason; an
  invalid iconId kills the whole expansion (named). Component-less
  proposals normalize exactly as before (pinned).

### The battery (`scripts/test-graphics-design-system.mts`, NEW)

28 laws across 5 suites — recipes (9), components (8), native lane (5),
LLM lane (4), wiring (2: the prompt source pin + the check-chain/CI
wiring). Wired into `npm run check` (`test:graphics-design`, after
whiteboard-compounds) and the CI check job.

## 3. What deliberately did NOT land

- **No recipe ADOPTION in the native scaffold's outputs** — the scaffold
  stays on `house-baseline` (the identity recipe); the variants exist as
  seat vocabulary (the C2 picker's data source) and are proven compilable
  and legal. A recipe field on the lane plan is a follow-up slice.
- **No catalog rows for components** — the palette is whiteboard-lane;
  graphics components ride the registries until a graphics palette exists.
- **No grammar growth** — zero fields added to `GraphicsDoc`/elements;
  recipes and components are planner-side vocabulary by construction.
- **The icon vocabulary's own growth** — Phase C slice 2 (150 → the
  audit's band), its own PR on the same one-source law.

## 4. Verification receipts (this slice)

- `npm run test:graphics-design` — 28/28 (first run, after the registry
  optionality fix; the battery caught three of my own defects before CI:
  the stat-card accent's required/optional law, a sprite-is-legal defect
  fixture, and the police's house ease floor on the LLM path).
- `npm run test` — 1064/0 (every pinned planner narration byte-stable
  across the seam extraction + the quote archetype).
- `npm run test:catalog` — 25/25. placement 27/0. multipick 16/0.
  compounds 15/0. The full check chain green; drill RTO 498ms; HEALTH 0
  (after the sandbox .env re-provision — the workspace reset again
  mid-session; the secrets are sandbox-local, never committed).
- `npx tsc --noEmit` clean; repo-wide eslint clean.

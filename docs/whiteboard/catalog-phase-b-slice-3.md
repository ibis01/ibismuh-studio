# Phase B slice 3 — compound asset graphs: the composition lane

Date: 2026-11-25
Scope: the re-audit's Phase B third slice — "compound asset graphs", the
honest remainder's next item after slice 2 (multi-pick layouts) cleared the
planner queue. Status: IMPLEMENTED — compound battery green (14 laws, six
suites), catalog suite green (coverage laws extended over the graph), unit
suite green, typecheck clean, lint clean, full check chain green.

## The defect this slice removes

The library drew 95 primitives but could not SAY a composition: a scene
teaching "a whole smart farm" boarded one barn (the primitive table's single
"farm" hit) — the system (barn + sun + tractor + corn + sprout) existed only
as five unrelated assets the planner could never board together. Composition
is the leverage the audit named for the mass-production phase: a handful of
primitives yields dozens of teachable boards without drawing new art.

## The design: composition is metadata; the doc carries primitives

**The one-syntax law**: a compound NEVER reaches the doc. The engine's
`WhiteboardProject` syntax carries primitive placements only — one geometry
law, one validator. A compound pick EXPANDS at the planner seam into its
parts (`expandCompound` — the one constructor), each part a first-class
placement under placement identity with a derived, human-readable address
(`smart-farm-system-barn`). Every downstream law the engine already speaks —
per-instance scheduling, per-instance beats, the ambiguity law, the carry
plan — applies to the parts for free, because they ARE placements. A doc
that somehow names a compound id is already refused by the validator's
library-membership law (fail-closed by construction).

### The registry (`whiteboard/compounds.ts`)

Four seed compositions over registered primitives: `smart-farm-system`
(barn, sun-nature, tractor-wb, corn-cob, sprout — the audit's own example
family), `money-growth-cycle` (coin, arrow-growth, bar-chart,
piggy-bank-wb), `online-classroom` (blackboard-wb, computer-screen,
lightbulb, wifi-waves), `water-harvest-cycle` (sun-nature, droplet,
water-can, sprout). Each spec declares its parts (draw order, offsets, part
scale factors), match vocabulary, a11y line, and footprint (declared, not
derived).

`assertCompoundRegistry` refuses every defect BY NAME: a ghost part (the
dead-end law), duplicate compound ids, duplicate parts within a composition,
charset violations on the id AND the derived part ids, non-finite offsets,
non-positive scales, empty compositions. The self-check is exported, never
run at import — the catalog build calls it, so a defective graph refuses the
manifest (fail-closed by construction).

### The catalog (`catalog/contracts.ts`, `catalog/manifest.ts`)

`CatalogAssetMeta` gains the optional `composition` graph (parts with
assetId/dx/dy/scale), parsed fail-closed by the contracts row validator (a
part without an assetId, a non-finite offset, a non-positive scale — each
refused with its name). A compound's content IS its graph: the row's
contentHash covers the composition spec (`compoundContentHash`), so the
manifest's fingerprint is tamper-evident over the graph — mutating one
offset breaks the parse. Rows derive mechanically: category "composition",
concepts from the spec's tags + aliases (the search vocabulary), complexity
from the part count. The builtin manifest now carries 99 whiteboard rows
(95 primitives + 4 compositions), and `searchCatalog` finds a composition by
its phrases ("farm system" → smart-farm-system) — the browser UI's surface
for free.

### The native scaffold (the composition lane)

`WB_COMPOUND_PICKS` — narration rules naming compositions, consulted BEFORE
the primitive table for the rich path's MIDDLE scenes only. Every rule is a
multi-word phrase the primitive table cannot claim ("smart farm", "money
flow", "online course", "water cycle"), so every existing pick is
byte-identical in behavior — plain "farm" still picks the barn (pinned). On
a pick, the middle scene expands the composition at the declared slot (scale
1, parts spread ±400-ish scene-space units, footprint follows scale) and the
support pick steps aside — the composition IS the scene's content, exactly
like the count lane's twin. The anti-repeat carry excludes a compound AND
its parts (the next scene picks a genuinely different cast). Openers and
closers never expand (the cards own those boards). A compound-less story
emits no placementId field anywhere — byte-identical.

### The LLM lane

The compositions ride the planner catalog (`buildPlannerCatalog`'s additive
second parameter — the model sees them with their declared footprints and
the prompt's new composition note). `normalizeLlmScenePlans` gains
`compoundIds`: a composition's instance cap is ONE — a second pick is the
parts repeated, refused with the law named ("places its parts itself — one
composition per scene"). `composeLlmScaffold` expands a composition pick at
the pick's own coordinates (the pick's scale sizes the whole footprint); the
parts ride the pick's beat rank as ONE concept (ordering happens on the
pre-expansion picks). Primitive picks compose byte-identically (the order
cursor reproduces the old structural.length + j exactly).

## What landed (files)

- `src/lib/ibismuh/whiteboard/compounds.ts` — NEW: the registry, the
  self-check, the expansion constructor.
- `src/lib/ibismuh/catalog/contracts.ts` — `CatalogCompositionPart`,
  the `composition` field + fail-closed parse law, `compoundContentHash`.
- `src/lib/ibismuh/catalog/manifest.ts` — `compoundCatalogRows`, the
  builtin manifest carries the compositions (registry self-check rides the
  build).
- `src/lib/ibismuh/whiteboard/whiteboard-planner.ts` —
  `WB_COMPOUND_PICKS`, `pickCompoundForScene`, the composition lane in the
  rich middle scenes, the carry set over compound parts.
- `src/lib/ibismuh/whiteboard/llm-planner.ts` — the catalog's compound
  entries, the one-composition-per-scene normalize law, the compose
  expansion, the prompt's composition note.
- `src/app/api/videos/[id]/whiteboard/scaffold/route.ts` — the route passes
  `WB_COMPOUNDS` to the LLM scaffold.
- `scripts/test-whiteboard-compounds.mts` — 14 laws across six suites.
  Joins `npm run check` and the CI check job
  (`test:whiteboard-compounds` after `test:whiteboard-multipick`).
- `scripts/test-catalog.mts` — the coverage laws extended over the graph
  (row count = ASSETS + compounds; every registry row registered).

## What deliberately did NOT land (the honest remainder)

- **The palette surface** — the compositions are searchable in the catalog
  engine; the browser UI that renders that search into the editor palette is
  the next Phase B item.
- **Nested graphs** — depth-1 compositions (parts are primitives). Multi-
  level graphs need cycle/depth laws beyond the registry's duplicate law;
  the seed compositions don't earn them yet.
- **Compound-level animation** — the parts schedule as individual
  placements (their draw order is the spec's order); a choreographed group
  animation ("the whole farm draws in one sweep") is an engine follow-up.
- **Compound-aware repair** — a repaired composition scene swaps each part
  independently (each part is a concept); preserving composition semantics
  through repair is a deliberate follow-up.

## Verification receipts (this slice)

- `npm run test:whiteboard-compounds` — 14/14 (first run).
- `npm run test:catalog` — 24/24 (coverage laws extended).
- `test:whiteboard-multipick` 16/16 · `test:whiteboard-placement` 27/0 ·
  `npm run test` 1064/0 · the full check chain green · drill RTO 493ms ·
  alert probe HEALTH 0.
- `npx tsc --noEmit` clean; eslint clean on every touched file.

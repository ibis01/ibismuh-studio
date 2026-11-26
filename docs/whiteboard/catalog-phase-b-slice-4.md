# Phase B slice 4 — the catalog browser: the palette adopts the search engine

Date: 2026-11-25
Scope: the re-audit's Phase B fourth slice — "the catalog browser UI", the
honest remainder's last Phase B item before the mass-production pass. The
Phase A search engine (deterministic, filtered, explained) finally gets its
palette surface. Status: IMPLEMENTED — compound battery green (15 laws, the
bundle-safety suite added), catalog suite green, unit suite green, full
check chain green.

## The defect this slice removes

The editor palette listed every built-in id as a flat wall of buttons — 99
rows ordered by wire arrival, no search, no filters, no explanation of what
a row is, and the compound compositions (slice 3) invisible entirely. The
audit's Phase A delivered the search ENGINE precisely so a surface could
adopt it; until now nothing did.

## The design: the engine runs where the click happens

### The client-safe extraction (`catalog/search.ts`)

The search is pure text/enum logic and needs NO hashing — but `contracts.ts`
imports `node:crypto` (the canonical serializer's sha256), and the browser
has none. The engine extracted into `catalog/search.ts`:
`searchRows(rows, query)` is the browser's entry point (bare rows, no
fingerprint); `searchCatalog(manifest, query)` is the unchanged server-side
wrapper (`searchRows(manifest.assets, query)`); contracts re-exports
everything, so every existing caller keeps one vocabulary. THE laws ride
along unchanged: AND semantics (every token must match), the tiebreak IS the
sort ((score desc, lane asc, id asc) — same query, same order forever), and
the match reasons ride every hit (the audit's selection explanations).

### The wire (the GET route)

The whiteboard GET response gains `catalogRows: CatalogAssetMeta[]` — the
memoized builtin manifest's whiteboard rows (95 primitives + 4 compound
compositions, the CI laws' own hashed rows) plus mechanically derived rows
for this video's uploads (`whiteboardCatalogRows`, the same derivation —
the search matches on their tags) plus the compound rows. One list, one
vocabulary; additive to the response (the e2e palette assertions, which are
request-based, hold).

### The browser surface (`whiteboard-studio.tsx`)

The palette becomes the browser: a search input + a category filter (the
categories derive from the rows themselves — a filter can never offer an
empty category) + the ranked result grid. The status line names the engine
("ranked by the catalog engine — same query, same order") and each result's
hover title carries its match reasons ("why matched: id matches \"farm\"",
"concept matches \"farm\"") — the audit's observability ask on the surface.
Unfiltered, the list is the full catalog in catalog order; compositions
carry a ◫ badge with their part count; uploads carry an "upload" badge.

Placement flows through one seam (`placeFromRow`): primitives and uploads
place directly (the existing addPlacement — the repeatable-placement law);
a composition click expands through `expandCompound` — THE planner-seam
constructor, now imported by the editor too — into named parts
(`<compoundId>-<partAssetId>`) appended as one draw sequence, the first
part selected. The doc carries primitives only (the one-syntax law holds in
the editor's hands too).

### The client-safety laws (pinned, not remembered)

- `compounds.ts` lost its value import of the asset library — the
  self-check's registered ids are a REQUIRED parameter (the manifest build
  passes ASSETS' ids) — so the palette can import the expansion without
  pulling the engine chain.
- The compound battery gained the BUNDLE SAFETY suite: a source scan
  asserting `compounds.ts` and `catalog/search.ts` carry no `node:`
  imports and no asset-library value import — the browser-facing modules
  stay client-clean by law, and the scan fails CI if the class returns.

## What landed (files)

- `src/lib/ibismuh/catalog/search.ts` — NEW: the extracted engine
  (`searchRows` + `searchCatalog`), pure, no crypto.
- `src/lib/ibismuh/catalog/contracts.ts` — the search block replaced by the
  re-export (one vocabulary, both callers).
- `src/lib/ibismuh/whiteboard/compounds.ts` — client-safe (required-ids
  self-check; `expandCompound` widened to `Pick<spec, "id" | "parts">` so
  the editor can expand from a wire row).
- `src/lib/ibismuh/catalog/manifest.ts` — the build passes ASSETS' ids to
  the self-check.
- `src/app/api/videos/[id]/whiteboard/route.ts` — `catalogRows` on the GET
  response.
- `src/components/ibismuh/whiteboard/whiteboard-studio.tsx` — the browser
  surface (search + filter + ranked reasons + composition placement); plain
  derivations, not hooks — the component's early returns sit above (the
  rules-of-hooks receipt).
- `scripts/test-whiteboard-compounds.mts` — the BUNDLE SAFETY suite (15
  laws now).

## What deliberately did NOT land (the honest remainder)

- **Palette thumbnails** — the browser lists ids + badges; raw-SVG previews
  for built-ins remain Phase C ("palette raw SVG + uploads → E11" — the
  uploads already preview).
- **The graphics lane's surface** — the browser searches the whiteboard
  lane (the board it browses); a cross-lane catalog panel is a separate
  surface decision.
- **Advanced filters** — complexity bands and subject-pack filters exist in
  the engine (`searchRows` accepts them); the UI ships text + category
  until boards ask for more.

## Verification receipts (this slice)

- `npm run test:whiteboard-compounds` — 15/15 (bundle-safety suite added).
- `npm run test:catalog` — 24/24 (the search laws hold through the
  re-export).
- `npm run test:typography-scale` — 0 sub-12px utilities (the browser's
  first draft used text-[11px]; the floor caught it).
- `npm run test` 1064/0 · the full check chain green · drill RTO 506ms ·
  alert probe HEALTH 0.
- `npx tsc --noEmit` clean; eslint clean repo-wide.

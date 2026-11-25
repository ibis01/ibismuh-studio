# Catalog Phase A — the shared catalog contract, the production library, the icon vocabulary

Date: 2026-11-25
Scope: the re-audit's Priority 1 + Priority 2 + Phase A (catalog foundation), landed as one additive slice.
Status: IMPLEMENTED — contract suite green (`npm run test:catalog`, 24 laws), unit suite green, typecheck clean, lint clean.

## What landed

### 1. The shared catalog contract (Priority 2 / Phase A)

`src/lib/ibismuh/catalog/contracts.ts` — the identity, provenance, versioning,
licensing, and search vocabulary for BOTH visual lanes:

- `CatalogAssetMeta` — the complete metadata record: id, lane, version,
  contentHash (sha256 over the canonical drawable content), category,
  subcategory, aliases, concepts, subjectPacks, styleFamily, complexity
  (1..5 drawing-cost rating), a11y, license (SPDX + attribution + approval
  gate), provenance (`hand-authored | upload | traced | generated`),
  publishState (`draft | review | published | retired`), ownerTenantId
  (null = global), and deprecation (replacedBy + reason).
- `buildCatalogManifest` — the ONLY sanctioned constructor: refuses
  duplicates, sorts canonically (lane, then id), fingerprints the result.
- `parseCatalogManifest` — the drawable-ir fail-closed discipline: unknown
  enums, missing fields, non-canonical order, duplicate rows, or ANY
  fingerprint mismatch throw. A stored manifest is tamper-evident.
- `searchCatalog` — deterministic ranked search: tokenized text (AND
  semantics), exact-match filters (lane, category, subjectPack,
  styleFamily, complexity min/max, publishStates, globalOnly,
  provenance), results sorted (score desc, lane, id) with match REASONS
  attached — the selection-explanation receipts the observability section
  asked for.

`src/lib/ibismuh/catalog/manifest.ts` — the builtin manifest builder:
mechanically derives one row for EVERY `ASSETS` entry and EVERY graphics
icon (the coverage law), with deterministic derivation rules (category from
the lead tag / the 16-domain scan, complexity from the stroke count,
concepts from the library's own tags) — no per-asset wiring to drift.

### 2. The graphics icon vocabulary (Priority 1, motion-graphics half)

`src/lib/ibismuh/graphics/icons.ts` — the icon library grew from 4 starter
icons to 150 tagged icons across the audit's production domains (people,
education, agriculture, tools, technology, healthcare, business, finance,
engineering, communication, cybersecurity, environment, transport,
buildings, devices, warning/status). The starter four moved verbatim (ids
and tags are contract — stored docs reference them).

- planner.ts RE-EXPORTS the same object: ONE icon source, never a second
  table (llm-planner's catalog and the unit suite ride the same record).
- `iconForScene` is now a deterministic ordered rule table
  (`ICON_KEYWORD_PICKS`, first hit wins — the whiteboard planner's
  KEYWORD_PICKS pattern), ~140 rules; the fallback cycle grew from 4 to a
  12-icon diverse rotation.

### 3. The whiteboard production pack (Priority 1, whiteboard half)

`src/lib/ibismuh/whiteboard/library-pack.ts` — 48 hand-authored stroke
assets (education, business, agriculture, health, technology, nature,
everyday-generic), every one through the SAME gates as the benchmark set:
sanitize at construction, the W3 validator at load (a failure throws),
the sketch pass, extraction. The library is 95 registered built-ins.

- The W2 mention matcher (`KEYWORD_PICKS`) grew from 8 to 50 rules using
  words the starter table does not claim (appended after — every existing
  pick is byte-identical in behavior), and the no-cue fallback cycle grew
  from 8 to a 16-asset diverse rotation. The repair rotation
  (`WB_CONCEPT_IDS`) derives from the same tables, so repairs speak the
  new vocabulary for free.

### 4. The contract suite (CI)

`scripts/test-catalog.mts` — 24 laws across six suites: coverage,
completeness, tamper evidence (9 defect classes rejected), determinism,
search, and the INTEGRITY dead-end law (every planner pick and fallback
entry must name a registered library row). Wired into `npm run check` and
the CI check job (`test:catalog` step after plan-contracts).

## What deliberately did NOT land (the honest remainder)

- **Placement IDs / repeated placement (audit §3.5, Priority 3)** — the
  scheduler's FrameState keys (`draws`, `texts`, `placements`) are keyed
  by assetId, and the page applier targets elements by id; two placements
  of one asset collide in both maps and duplicate element ids in the page.
  The fix is a real Phase-B refactor (placement-scoped keys + namespace
  rendered element ids + golden re-pins), not an editor-only change. The
  editor's one-placement-per-asset guard stays until that refactor lands.
- **Compound asset graphs** — Phase B, after placement identity exists.
- **The catalog browser UI** — the search ENGINE is here (deterministic,
  filtered, explained); the editor palette adopts it in Phase B.
- **Mass asset production (the 250-400 target)** — the contract now exists
  precisely so the next production pass creates rows, not debt.

## Verification receipts (this slice)

- `npm run test:catalog` — 24/24.
- `loadLibrary()` — 95 built-ins register, 0 validator failures, 0 warnings.
- `npx tsc --noEmit` — clean.
- eslint on every touched file — clean.
- Full unit suite + whiteboard batteries — run in the same push (see CI).

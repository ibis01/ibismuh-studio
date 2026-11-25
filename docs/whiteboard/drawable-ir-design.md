# Drawable IR — Design (Whiteboard lane)

**Status:** implemented in `src/lib/ibismuh/whiteboard/drawable-ir.ts`; pinned by
`scripts/test-drawable-ir.mts` (`npm run test:drawable-ir`).

## Purpose

The lane's drawable knowledge is scattered across `WhiteboardAsset` (metadata +
sanitized SVG fragment), `ExtractedAsset` (id/d/pen attributes in document
order), trace receipts, and placements. The Drawable IR unifies them into ONE
versioned, immutable, serializable document so editing, timing, caching,
provenance, repair, and preview/final parity all read the same contract.

## Design laws

1. **Around, not instead.** The IR is compiled FROM the existing engine types
   (`WhiteboardAsset` + `ExtractedAsset` + optional `AssetValidationReport`).
   The engine, renderer, and preview seams are untouched.
2. **Measured geometry, not copied strings.** Every path node carries measured
   arc length, bounding box, expanded command count, and start/end points —
   the facts timing, camera, and hand-travel planning pay for anyway.
3. **Provenance is mandatory.** Every IR records its source kind
   (`library` | `traced-upload` | `generated`), a source reference, and the
   sha256 content hash of the sanitized SVG fragment it was compiled from.
   A visible mark without provenance is invalid.
4. **Deterministic serialization.** `serializeDrawableIr` emits a canonical
   form (sorted keys, fixed-precision numbers, document-ordered arrays).
   Identical input ⇒ byte-identical serialization ⇒ identical fingerprint.
5. **Version-first, fail-closed parsing.** `parseDrawableIr` rejects unknown
   versions, missing fields, bad enums, and ANY fingerprint mismatch — a
   stored IR is tamper-evident by construction.
6. **Semantic roles are explicit.** Each path declares `role`
   (`outline` | `fill`) and `semanticGroup` (pen-group membership or
   `default`), and a resolved draw `order` (explicit `drawOrder` wins,
   document order fills the rest).

## Document shape

```ts
interface DrawableIr {
  version: number;                 // DRAWABLE_IR_VERSION, currently 1
  assetId: string;
  source: { kind: "library" | "traced-upload" | "generated"; ref?: string; contentHash: string };
  viewBox: { w: number; h: number };
  paths: Array<{
    id: string; d: string;
    length: number;                // measured arc length
    bbox: { x: number; y: number; w: number; h: number };
    commands: number;              // expanded command count (the E1 budget unit)
    start: { x: number; y: number }; end: { x: number; y: number };  // pen-up travel anchors
    role: "outline" | "fill";
    semanticGroup: string;         // pen group id or "default"
    order: number;                 // resolved draw order
    pen: { stroke?: string; strokeWidth?: number; linecap?: string; fill?: string };
  }>;
  texts: Array<{ id: string; content: string; x: number; y: number; size: number }>;
  rejected: Array<{ kind: "path" | "text"; id: string; reason: string }>;   // E11/S65 law, surfaced
  validationReceipt: { ran: boolean; checksRun: string[]; failedChecks: string[]; findingCount: number };
  fingerprint: string;             // sha256 over the canonical serialization
}
```

## Downstream consumers

- **Timing** reads `length`, `commands`, and `order` for calibrated draw
  duration (gap G7 in `gap-analysis.md`).
- **Hand travel** reads `start`/`end` for pen-up distance.
- **Stage cache** keys normalized-asset stages on `fingerprint`.
- **Repair** diffs two revisions at IR granularity (per-path, not per-asset).
- **Preview/final parity** compares plan hashes that embed IR fingerprints.

## What this deliberately does NOT do

It does not replace `ExtractedAsset` as the renderer's working format, does not
re-validate geometry (the validator stays the gate; the IR carries its receipt),
and does not introduce a second geometry engine — `svg.ts` remains the only
parser/flattener.

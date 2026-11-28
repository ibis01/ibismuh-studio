#!/usr/bin/env node
// pack-coverage-metrics.mts — Phase 6 (master plan after 941a6ee): MEASURED,
// per-pack quality metrics over the nine curated subject packs.
//
// The plan's demand: the packs may not stop at "no dead packs"
// (scripts/test-catalog.mts owns that law) — each pack must be MEASURED:
// query success and fallback rate, acceptable vs false-friend selections,
// duplicate semantic concepts, stroke/path continuity, hand-travel
// distance, draw-order coherence, safe bounds and aspect behavior, and
// provenance completeness. This script computes all of it from the REAL
// catalog data (READ-ONLY — the registry, the libraries, and the resolver
// are imported, never edited) and writes a typed receipt.
//
// What is measured, per pack (the data sources in parentheses):
//   · conceptCount / distinctSemantics — declared terms (concepts +
//     aliases) and their distinct set (catalog rows of the pack).
//   · duplicatePairs — unordered row pairs whose declared vocabularies are
//     IDENTICAL: semantically indistinguishable twins no matcher can tell
//     apart. Verdict-bearing (expected 0).
//   · overlappingPairs — pairs sharing at least one term. Informational:
//     pack membership is concept-derived, so healthy packs overlap by
//     design; this is density context, not a defect count.
//   · intraRowDupRows — rows declaring the same term twice. Informational:
//     today's row builders concatenate [...tags, ...alts] without dedup
//     (catalog/manifest.ts), so a repeated term inflates that row's match
//     weight in the resolver and the search engine. A catalog-wide
//     row-builder property, made visible here per pack; its fix belongs to
//     the row builder, not to the packs.
//   · querySuccessRate / fallbackRate / falseFriendRate — the §15.2 fixed
//     suite (the 15 queries, copied verbatim from
//     scripts/test-query-benchmark.mts — THAT script owns the law; this
//     script only measures through it) run through the SAME resolver the
//     benchmark uses (deriveVisualBeats over every manifest row, wire ids
//     lane:id, bare-id comparisons). A query is assigned to the pack whose
//     rows cover the most of its acceptable ids (ties break in registry
//     order) — mechanical, deterministic, data-derived.
//   · handTravel — per drawable asset: the drawing travel (Σ measured
//     stroke arc lengths) plus the pen-lift travel between consecutive
//     strokes in RESOLVED draw order, normalized by the viewBox diagonal.
//     Mean + max per pack (whiteboard: Drawable IR measurements; graphics:
//     the same svg.ts grammar over the 24-unit icon grid).
//   · strokeContinuity — fraction of strokes NOT broken. A stroke (one
//     path element — the authoring law's unit) is broken when it flattens
//     to fewer than one drawable subpath, or to MORE than one (a mid-path
//     M/m teleports the hand — the S67 law, asset-validate.ts checkTeleport,
//     re-measured here with attribution), or when an inter-subpath jump
//     exceeds STROKE_GAP_WALL of the viewBox diagonal. Mean per pack.
//   · drawOrderCoherence — fraction of drawable assets whose resolved
//     order tiles 0..n-1 with no ghost or duplicate pins (the ORDER LAW of
//     scripts/test-drawable-ir.mts: "explicit drawOrder pins 0..k-1; the
//     unlisted remainder follows document order after the block" — the
//     combined sequence must tile exactly; a pin naming no path, or named
//     twice, breaks the tiling). Graphics icons declare no drawOrder —
//     document order IS the lane's declared order, coherent by construction.
//   · safeBounds — fraction of drawable assets whose flattened geometry
//     AND text anchors stay inside the asset's own viewBox (the drawable
//     frame the renderer clips at; asset-validate.ts checkOrientation
//     already pins labels inside it) within SAFE_EDGE_TOLERANCE.
//   · aspect — the viewBox aspect-ratio behavior: min/max ratio and the
//     count outside ASPECT_BAND. Informational, NOT verdict-bearing: the
//     measured outliers (title-hero 4.0, close-card 3.64, ecg-pulse 3.33,
//     fx-underline 3.0) are intentional banner/strip cards, not defects.
//   · provenanceGaps — rows missing SPDX license id, attribution,
//     approval, accessibility text, or version (the completeness law of
//     scripts/test-catalog.mts, measured per pack; expected 0).
//
// THE FLOORS (defensible because the underlying laws are gated at load —
// loadLibrary throws on a failing built-in, the manifest refuses an
// incomplete row — so the metric is an independent tripwire over gates the
// engine already enforces; measured 2026-11 on this head: 1458/1458
// strokes continuous, 0 unsafe assets, 0 incoherent orders, 0 gaps):
//   · falseFriendRate  = 0      (the RELEVANCE law admits no exceptions;
//     a pack the fixed suite does not name — today travel-food and
//     sports-music, whose concepts no §15.2 query covers — holds the
//     floor VACUOUSLY: zero false friends observed. The suite-coverage
//     gap is recorded in the queries column, never faked into a 0/0 rate
//     nor punished as a false-friend defect — the repo's three-state
//     posture: measured, or honestly unmeasured, never invented.)
//   · duplicatePairs   = 0      (twins are a defect by definition)
//   · provenanceGaps   = 0      (the completeness law admits no gaps)
//   · safeBounds       = 100%   (the viewBox is the drawable frame)
//   · strokeContinuity >= 1.0   (the one-stroke law is load-gated)
//   · drawOrderCoherence >= 1.0 (the order tiling is mechanical)
// A pack PASSES only when every floor holds; the receipt lists the failing
// dims otherwise, and the process EXITS 1 when any pack fails (fail-visible).
//
// Text-only whiteboard assets (today: heart-labels — zero drawable paths)
// are refused by the Drawable IR compiler by law; they are counted per pack
// and excluded from the geometry metrics (there is no stroke to measure).
// Compound rows have no own drawable (their content IS the part graph) and
// are likewise excluded from geometry, present everywhere else.
//
// Run:            node --import tsx scripts/pack-coverage-metrics.mts
// Self-test:      node --import tsx scripts/pack-coverage-metrics.mts --self-test
// Receipt:        scratch/pack-coverage-metrics.json
// (pure — no DB, no DOM, no network; CI step)

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { builtinCatalogManifest } from "../src/lib/ibismuh/catalog/manifest";
import type { CatalogAssetMeta } from "../src/lib/ibismuh/catalog/contracts";
import { SUBJECT_PACKS, type SubjectPackId } from "../src/lib/ibismuh/catalog/subject-packs";
import { deriveVisualBeats, type VisualBeatCandidate } from "../src/lib/ibismuh/planners/visual-beats";
import { compileDrawableIr, type DrawableIr } from "../src/lib/ibismuh/whiteboard/drawable-ir";
import { ASSETS, type WhiteboardAsset } from "../src/lib/ibismuh/whiteboard/assets";
import { GRAPHICS_ICON_LIBRARY } from "../src/lib/ibismuh/graphics/planner";
import type { GraphicsIcon } from "../src/lib/ibismuh/graphics/icons";
import { pathSegments, totalLength, type Point } from "../src/lib/ibismuh/whiteboard/svg";

// ---------------------------------------------------------------------------
// The documented walls (each one cited to the law it re-measures)
// ---------------------------------------------------------------------------

/** Stroke-gap wall: an inter-subpath jump beyond this fraction of the
 *  viewBox diagonal is a broken stroke (the distance detector under the
 *  one-stroke law, which already forbids any second subpath outright). */
export const STROKE_GAP_WALL = 0.6;

/** Safe-area edge tolerance (asset units): the flattener's sampling plus
 *  stroke antialias — a measured tolerance, not a license to bleed. */
export const SAFE_EDGE_TOLERANCE = 0.5;

/** Aspect band (viewBox w/h): composition sanity across the house aspects
 *  (16:9, 1:1, 9:16 — benchmark-scenarios.ts's design spaces). Assets
 *  outside the band are counted and named, not failed. */
export const ASPECT_BAND = { min: 0.5, max: 2.0 } as const;

/** The verdict floors (see the header). */
export const FLOORS = {
  falseFriendRateMax: 0,
  duplicatePairsMax: 0,
  provenanceGapsMax: 0,
  safeBoundsMin: 1,
  strokeContinuityMin: 1,
  drawOrderCoherenceMin: 1,
} as const;

/** The graphics lane's icon grid (icons.ts geometry law: "every icon lives
 *  on the 24-unit grid"). */
const ICON_VIEWBOX = 24;

// ---------------------------------------------------------------------------
// The fixed §15.2 suite — copied VERBATIM from scripts/test-query-benchmark.mts
// (that script owns the law; this script measures through it. Drift here is
// a defect: the two tables must stay word-identical.)
// ---------------------------------------------------------------------------

/** The narrow benchmark-query shape the query metrics consume (the full
 *  FixedQuery record extends it with the receipt's documentation fields). */
export interface BenchmarkQuery {
  query: string;
  acceptable: readonly string[];
  unacceptable: readonly string[];
  fallbackId: string;
}

interface FixedQuery extends BenchmarkQuery {
  expectedConcepts: string[];
  headTerm: string;
}

const FIXED_QUERIES: readonly FixedQuery[] = [
  {
    query: "cattle entering farmland",
    expectedConcepts: ["cattle", "farmland"],
    acceptable: ["cow", "tractor", "farm-house", "smart-farm-system", "wheat", "corn-cob"],
    unacceptable: ["heart-main", "balance-scale-wb", "solar-panel"],
    headTerm: "cattle",
    fallbackId: "farm-cast",
  },
  {
    query: "AI sensor",
    expectedConcepts: ["ai", "sensor"],
    acceptable: ["chip", "robot", "robot-head", "antenna", "signal-tower", "robot-arm"],
    unacceptable: ["heart-main", "tractor"],
    headTerm: "sensor",
    fallbackId: "tech-cast",
  },
  {
    query: "warning alert",
    expectedConcepts: ["warning", "alert"],
    acceptable: ["warning-triangle", "bell", "bell-ring", "alarm-clock"],
    unacceptable: ["solar-panel", "tractor"],
    headTerm: "alert",
    fallbackId: "status-cast",
  },
  {
    query: "business growth",
    expectedConcepts: ["business", "growth"],
    acceptable: ["arrow-growth", "chart-line-up", "chart-up", "dollar", "piggy-bank-wb", "briefcase"],
    unacceptable: ["heart-main", "stethoscope-wb"],
    headTerm: "growth",
    fallbackId: "business-cast",
  },
  {
    query: "student learning",
    expectedConcepts: ["student", "learning"],
    acceptable: ["backpack", "graduation-cap", "backpack-wb", "online-classroom", "school-building", "blackboard-wb", "blackboard"],
    unacceptable: ["tractor", "solar-panel"],
    headTerm: "student",
    fallbackId: "education-cast",
  },
  {
    query: "hospital emergency",
    expectedConcepts: ["hospital", "emergency"],
    acceptable: ["hospital-cross", "medical-cross", "stethoscope", "stethoscope-wb", "heart-pulse", "pill"],
    unacceptable: ["solar-panel", "tractor"],
    headTerm: "emergency",
    fallbackId: "health-cast",
  },
  {
    query: "cybersecurity lock",
    expectedConcepts: ["cybersecurity", "lock"],
    acceptable: ["lock", "key", "shield", "shield-check", "eye-scan", "fingerprint"],
    unacceptable: ["solar-panel", "tractor"],
    headTerm: "cybersecurity",
    fallbackId: "security-cast",
  },
  {
    query: "solar energy",
    expectedConcepts: ["solar", "energy"],
    acceptable: ["solar-panel", "sun", "sun-nature", "wind-turbine"],
    unacceptable: ["heart-main", "tractor"],
    headTerm: "solar",
    fallbackId: "energy-cast",
  },
  {
    query: "process steps",
    expectedConcepts: ["process", "steps"],
    acceptable: ["flow-steps", "pipeline", "gear", "arrow-growth"],
    unacceptable: ["heart-main", "stethoscope"],
    headTerm: "steps",
    fallbackId: "process-cast",
  },
  {
    query: "compare two values",
    expectedConcepts: ["compare", "values"],
    acceptable: ["balance-scale", "balance-scale-wb", "chart-up", "chart-line-up"],
    unacceptable: ["tractor", "cow"],
    headTerm: "compare",
    fallbackId: "compare-cast",
  },
  {
    query: "phone notification",
    expectedConcepts: ["phone", "notification"],
    acceptable: ["smartphone", "smartphone-wb", "phone-call", "bell", "bell-ring"],
    unacceptable: ["tractor", "stethoscope"],
    headTerm: "notification",
    fallbackId: "device-cast",
  },
  {
    query: "supply chain",
    expectedConcepts: ["supply", "chain"],
    acceptable: ["pipeline", "link", "factory", "truck", "server", "warehouse"],
    unacceptable: ["heart-main", "balance-scale"],
    headTerm: "supply",
    fallbackId: "logistics-cast",
  },
  {
    query: "classroom",
    expectedConcepts: ["classroom"],
    acceptable: ["online-classroom", "blackboard-wb", "blackboard", "school-building", "backpack", "graduation-cap"],
    unacceptable: ["tractor", "solar-panel"],
    headTerm: "classroom",
    fallbackId: "education-cast",
  },
  {
    query: "heart and lungs",
    expectedConcepts: ["heart", "lungs"],
    acceptable: ["heart-pulse", "heart-main", "heart-labels", "lungs", "stethoscope"],
    unacceptable: ["tractor", "solar-panel"],
    headTerm: "lungs",
    fallbackId: "health-cast",
  },
  {
    query: "engineering control system",
    expectedConcepts: ["engineering", "control", "system"],
    acceptable: ["blueprint", "gear", "robot-arm", "bridge", "crane", "factory", "pipeline", "robot"],
    unacceptable: ["heart-main", "bell"],
    headTerm: "engineering",
    fallbackId: "engineering-cast",
  },
];

// ---------------------------------------------------------------------------
// The metric types (the receipt's vocabulary)
// ---------------------------------------------------------------------------

export interface SemanticMetrics {
  /** Declared terms across the pack's rows (concepts + aliases, repeats counted). */
  conceptCount: number;
  /** Distinct terms in the pack's vocabulary. */
  distinctSemantics: number;
  /** Unordered row pairs with IDENTICAL term sets — the duplicate semantic
   *  concepts (verdict-bearing; expected 0). */
  duplicatePairs: number;
  /** The twin pairs, named (bounded attribution). */
  duplicatePairIds: string[];
  /** Pairs sharing at least one term — overlap density (informational). */
  overlappingPairs: number;
  /** Rows declaring the same term twice (informational visibility). */
  intraRowDupRows: number;
}

export interface QueryMetrics {
  /** Queries assigned to the pack (the mechanical max-coverage rule). */
  queries: number;
  /** "query:text" — the assignment, auditable. */
  assignedQueries: string[];
  /** Selection intersects the acceptable band with no false friend and no fallback. */
  querySuccessRate: number | null;
  /** Queries whose receipt resolved via a DECLARED fallback (never silent). */
  fallbackRate: number | null;
  /** Selections carrying an unacceptable id or missing the acceptable band. */
  falseFriendRate: number | null;
  /** Per-query attribution (bounded). */
  findings: string[];
}

export interface GeometryMetrics {
  /** Drawable assets measured (whiteboard primitives + graphics icons). */
  drawableCount: number;
  /** Text-only whiteboard assets (the IR refuses them by law) — counted, not measured. */
  textOnlyCount: number;
  /** Normalized hand travel (drawing + pen-lift travel / viewBox diagonal). */
  handTravel: { mean: number | null; max: number | null };
  /** Strokes flattened and judged. */
  strokeCount: number;
  /** Fraction of strokes NOT broken (mean per pack). */
  strokeContinuity: number | null;
  /** The broken strokes, named (bounded attribution). */
  brokenStrokes: string[];
  /** Fraction of drawable assets with a coherent resolved draw order. */
  drawOrderCoherence: number | null;
  /** The incoherent assets, named (bounded attribution). */
  incoherentOrders: string[];
  /** Fraction of drawable assets inside the viewBox safe area. */
  safeBounds: number | null;
  /** The unsafe assets, named (bounded attribution). */
  unsafeAssets: string[];
  /** Aspect behavior: min/max ratio and the count outside ASPECT_BAND. */
  aspect: { min: number | null; max: number | null; outsideBand: number };
}

export interface ProvenanceMetrics {
  /** Missing SPDX/attribution/approval/a11y/version fields across the pack's rows. */
  provenanceGaps: number;
  /** The gap rows, named with their missing fields (bounded attribution). */
  provenanceGapRows: string[];
}

export interface PackMetrics {
  pack: SubjectPackId;
  label: string;
  /** Catalog rows riding the pack (both lanes + compounds). */
  rowCount: number;
  semantics: SemanticMetrics;
  queries: QueryMetrics;
  geometry: GeometryMetrics;
  provenance: ProvenanceMetrics;
  verdict: "PASS" | "FAIL";
  failingDims: string[];
}

// ---------------------------------------------------------------------------
// Geometry sampling — ONE code path over both lanes
// ---------------------------------------------------------------------------

/** The lane-neutral drawable sample the geometry metrics consume. */
export interface DrawableSample {
  assetId: string;
  viewBox: { w: number; h: number };
  /** One entry per stroke (path element), in RESOLVED draw order. */
  strokes: { id: string; d: string }[];
  /** Pen anchors aligned with `strokes` (pen-down start / pen-up end). */
  anchors: { start: Point; end: Point }[];
  /** Measured arc length per stroke (the IR's own measurement or the
   *  svg.ts grammar's totalLength for graphics icons). */
  lengths: number[];
  /** Text anchors (label-anchor safe-bounds checks). */
  texts: { id: string; x: number; y: number }[];
  /** The lane's explicit drawOrder pins, when the lane declares them
   *  (whiteboard only — graphics document order IS the declared order). */
  explicitOrder?: readonly string[];
}

const diag = (w: number, h: number): number => Math.hypot(w, h);

function bboxOf(d: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const seg of pathSegments(d)) {
    for (const pt of seg.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** The stroke verdict: one path element, flattened. Broken when it carries
 *  no drawable subpath, MORE than one drawable subpath (a mid-path M/m
 *  teleports the hand — the S67 one-stroke law, asset-validate.ts
 *  checkTeleport, re-measured here with attribution), or an inter-subpath
 *  jump beyond STROKE_GAP_WALL of the viewBox diagonal. */
export function analyzeStroke(
  stroke: { id: string; d: string },
  viewBoxDiagonal: number,
): { continuous: boolean; reasons: string[] } {
  const subs = pathSegments(stroke.d).filter((s) => s.points.length >= 2);
  const reasons: string[] = [];
  if (subs.length === 0) {
    reasons.push(`stroke "${stroke.id}" has fewer than two drawable points — nothing for the pen to trace`);
  }
  if (subs.length > 1) {
    reasons.push(`stroke "${stroke.id}" draws ${subs.length} separate subpaths (a mid-path M/m teleports the hand)`);
  }
  for (let i = 1; i < subs.length; i++) {
    const prev = subs[i - 1].points[subs[i - 1].points.length - 1];
    const cur = subs[i].points[0];
    const gap = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (gap > STROKE_GAP_WALL * viewBoxDiagonal) {
      reasons.push(
        `stroke "${stroke.id}" jumps ${gap.toFixed(1)} units between subpaths (wall ${STROKE_GAP_WALL}×diagonal)`,
      );
    }
  }
  return { continuous: reasons.length === 0, reasons };
}

/** The per-asset geometry measurement (both lanes ride this one function). */
export function measureDrawable(sample: DrawableSample): {
  handTravel: number;
  brokenStrokes: string[];
  brokenReasons: string[];
  orderCoherent: boolean;
  orderProblems: string[];
  safe: boolean;
  safeProblems: string[];
  aspect: number;
} {
  const d = diag(sample.viewBox.w, sample.viewBox.h);
  // Hand travel: drawing travel (Σ measured arc lengths) + pen-lift travel
  // between consecutive strokes in resolved draw order, normalized.
  let travel = sample.lengths.reduce((s, x) => s + x, 0);
  for (let i = 1; i < sample.anchors.length; i++) {
    const prev = sample.anchors[i - 1].end;
    const next = sample.anchors[i].start;
    travel += Math.hypot(next.x - prev.x, next.y - prev.y);
  }
  const handTravel = d > 0 ? travel / d : 0;

  // Stroke continuity.
  const brokenStrokes: string[] = [];
  const brokenReasons: string[] = [];
  for (const stroke of sample.strokes) {
    const verdict = analyzeStroke(stroke, d);
    if (!verdict.continuous) {
      brokenStrokes.push(`${sample.assetId}#${stroke.id}`);
      brokenReasons.push(...verdict.reasons);
    }
  }

  // Draw-order coherence (the test-drawable-ir.mts ORDER LAW, re-measured
  // with attribution: "explicit drawOrder pins 0..k-1; the unlisted
  // remainder follows document order after the block" — the resolved
  // sequence must tile exactly 0..n-1, with no ghost and no duplicate pin).
  const orderProblems: string[] = [];
  if (sample.explicitOrder !== undefined) {
    const pins = sample.explicitOrder;
    const known = new Set(sample.strokes.map((s) => s.id));
    const ghosts = pins.filter((id) => !known.has(id));
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const id of pins) {
      if (seen.has(id)) dups.push(id);
      seen.add(id);
    }
    if (ghosts.length > 0) orderProblems.push(`${sample.assetId}: drawOrder pins name unknown paths [${ghosts.join(", ")}]`);
    if (dups.length > 0) orderProblems.push(`${sample.assetId}: drawOrder pins duplicated [${dups.join(", ")}]`);
    // The tiling check over the RESOLVED order: recompute the way the IR does.
    const explicitIndex = new Map<string, number>();
    for (const [i, id] of pins.entries()) if (!explicitIndex.has(id)) explicitIndex.set(id, i);
    const unlisted = sample.strokes.filter((s) => !explicitIndex.has(s.id));
    const resolved = sample.strokes.map((s) => {
      const hit = explicitIndex.get(s.id);
      return hit !== undefined ? hit : pins.length + unlisted.findIndex((u) => u.id === s.id);
    });
    const sorted = [...resolved].sort((a, b) => a - b);
    if (!sorted.every((o, i) => o === i)) {
      orderProblems.push(`${sample.assetId}: resolved orders [${sorted.join(",")}] do not tile 0..${sample.strokes.length - 1}`);
    }
  }
  const orderCoherent = orderProblems.length === 0;

  // Safe bounds: every flattened point and text anchor inside the viewBox
  // within SAFE_EDGE_TOLERANCE (the drawable frame the renderer clips at).
  const safeProblems: string[] = [];
  const TOL = SAFE_EDGE_TOLERANCE;
  for (const stroke of sample.strokes) {
    const box = bboxOf(stroke.d);
    if (!box) continue;
    if (
      box.minX < -TOL ||
      box.minY < -TOL ||
      box.maxX > sample.viewBox.w + TOL ||
      box.maxY > sample.viewBox.h + TOL
    ) {
      safeProblems.push(
        `${sample.assetId}#${stroke.id} bbox (${box.minX.toFixed(1)},${box.minY.toFixed(1)})..(${box.maxX.toFixed(1)},${box.maxY.toFixed(1)}) leaves the ${sample.viewBox.w}×${sample.viewBox.h} viewBox`,
      );
    }
  }
  for (const t of sample.texts) {
    if (t.x < -TOL || t.y < -TOL || t.x > sample.viewBox.w + TOL || t.y > sample.viewBox.h + TOL) {
      safeProblems.push(`${sample.assetId} text "${t.id}" anchor (${t.x},${t.y}) lands outside the viewBox`);
    }
  }

  return {
    handTravel,
    brokenStrokes,
    brokenReasons,
    orderCoherent,
    orderProblems,
    safe: safeProblems.length === 0,
    safeProblems,
    aspect: sample.viewBox.h > 0 ? sample.viewBox.w / sample.viewBox.h : 0,
  };
}

/** Whiteboard asset → sample (through the Drawable IR — the same measured
 *  facts timing, camera, and hand travel pay for anyway). Returns null for
 *  a text-only asset (the IR refuses to compile it by law). */
export function sampleWhiteboard(asset: WhiteboardAsset): { sample: DrawableSample } | { textOnly: true } {
  let ir: DrawableIr;
  try {
    ir = compileDrawableIr({ asset, sourceKind: "library" });
  } catch (err) {
    if (err instanceof Error && /zero drawable paths/.test(err.message)) return { textOnly: true };
    throw err;
  }
  const ordered = [...ir.paths].sort((a, b) => a.order - b.order);
  return {
    sample: {
      assetId: asset.id,
      viewBox: { w: ir.viewBox.w, h: ir.viewBox.h },
      strokes: ordered.map((p) => ({ id: p.id, d: p.d })),
      anchors: ordered.map((p) => ({ start: p.start, end: p.end })),
      lengths: ordered.map((p) => p.length),
      texts: ir.texts.map((t) => ({ id: t.id, x: t.x, y: t.y })),
      explicitOrder: asset.drawOrder ?? [],
    },
  };
}

/** Graphics icon → sample (the 24-unit grid; each path is ONE stroke per
 *  the icons.ts geometry law; document order IS the declared order). */
export function sampleGraphicsIcon(id: string, icon: GraphicsIcon): DrawableSample {
  const strokes: DrawableSample["strokes"] = [];
  const anchors: DrawableSample["anchors"] = [];
  const lengths: number[] = [];
  for (const d of icon.paths) {
    const segs = pathSegments(d).filter((s) => s.points.length >= 2);
    strokes.push({ id: `${strokes.length}`, d });
    if (segs.length > 0) {
      const pts = segs[segs.length - 1].points;
      const first = segs[0].points[0];
      const last = pts[pts.length - 1];
      anchors.push({ start: { x: first.x, y: first.y }, end: { x: last.x, y: last.y } });
      lengths.push(totalLength(segs));
    } else {
      anchors.push({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } });
      lengths.push(0);
    }
  }
  return {
    assetId: id,
    viewBox: { w: ICON_VIEWBOX, h: ICON_VIEWBOX },
    strokes,
    anchors,
    lengths,
    texts: [],
  };
}

// ---------------------------------------------------------------------------
// Semantic metrics (duplicate-semantic-concept detection)
// ---------------------------------------------------------------------------

const termsOf = (row: { concepts: readonly string[]; aliases: readonly string[] }): string[] =>
  [...row.concepts, ...row.aliases].map((t) => t.trim().toLowerCase()).filter((t) => t !== "");

export function semanticMetrics(rows: readonly { id: string; lane: string; concepts: readonly string[]; aliases: readonly string[] }[]): SemanticMetrics {
  const declared: { key: string; terms: string[] }[] = rows.map((r) => ({ key: `${r.lane}:${r.id}`, terms: termsOf(r) }));
  const conceptCount = declared.reduce((s, r) => s + r.terms.length, 0);
  const distinct = new Set(declared.flatMap((r) => r.terms));

  let duplicatePairs = 0;
  const duplicatePairIds: string[] = [];
  let overlappingPairs = 0;
  for (let i = 0; i < declared.length; i++) {
    for (let j = i + 1; j < declared.length; j++) {
      const a = declared[i];
      const b = declared[j];
      const setA = new Set(a.terms);
      const shares = b.terms.some((t) => setA.has(t));
      if (shares) overlappingPairs++;
      if (
        shares &&
        setA.size === b.terms.length &&
        a.terms.length === setA.size && // a itself declares no repeats
        [...setA].every((t) => b.terms.includes(t))
      ) {
        duplicatePairs++;
        duplicatePairIds.push(`${a.key} = ${b.key}`);
      }
    }
  }

  let intraRowDupRows = 0;
  for (const r of declared) {
    if (new Set(r.terms).size !== r.terms.length) intraRowDupRows++;
  }

  return {
    conceptCount,
    distinctSemantics: distinct.size,
    duplicatePairs,
    duplicatePairIds: duplicatePairIds.slice(0, 10),
    overlappingPairs,
    intraRowDupRows,
  };
}

// ---------------------------------------------------------------------------
// Query metrics (the resolver's receipts, per pack)
// ---------------------------------------------------------------------------

export function candidatesFromRows(rows: readonly CatalogAssetMeta[]): VisualBeatCandidate[] {
  return rows.map((r) => ({
    id: `${r.lane}:${r.id}`,
    concepts: r.concepts,
    aliases: r.aliases,
    tags: [r.category, ...(r.subcategory !== undefined ? [r.subcategory] : [])],
  }));
}

const bareId = (wireId: string): string => (wireId.includes(":") ? wireId.slice(wireId.indexOf(":") + 1) : wireId);

export interface QueryVerdict {
  query: string;
  selected: string[];
  fallbackResolved: boolean;
  falseFriend: boolean;
  success: boolean;
}

/** Run one query through the SAME resolver the benchmark uses, with the
 *  benchmark's own relevance bookkeeping (selection nonempty, intersects
 *  the acceptable band, no unacceptable id) plus the honesty receipt
 *  (a beat resolved via the DECLARED fallback). */
export function runQuery(
  fq: { query: string; acceptable: readonly string[]; unacceptable: readonly string[]; fallbackId: string },
  candidates: readonly VisualBeatCandidate[],
  sceneId = "pack-metrics",
): QueryVerdict {
  const receipt = deriveVisualBeats({
    sceneId,
    narration: fq.query,
    candidates,
    sceneDurationMs: 6000,
    fallbackId: fq.fallbackId,
  });
  const selected = receipt.beats.flatMap((b) => b.selectedIds).map(bareId);
  const fallbackResolved = receipt.beats.some((b) => b.fallback !== undefined);
  const intersects = selected.some((id) => fq.acceptable.includes(id));
  const falseFriend =
    selected.length === 0 || !intersects || selected.some((id) => fq.unacceptable.includes(id));
  return {
    query: fq.query,
    selected,
    fallbackResolved,
    falseFriend,
    success: !fallbackResolved && !falseFriend,
  };
}

/** Assign each fixed query to the pack whose rows cover the most of its
 *  acceptable ids (ties break in registry order) — mechanical, data-derived. */
export function assignQueriesToPacks(
  queries: readonly BenchmarkQuery[],
  manifest: { assets: readonly CatalogAssetMeta[] },
): Map<SubjectPackId, BenchmarkQuery[]> {
  const assignment = new Map<SubjectPackId, BenchmarkQuery[]>(SUBJECT_PACKS.map((p) => [p.id, []]));
  const packRowIds = new Map<SubjectPackId, Set<string>>(
    SUBJECT_PACKS.map((p) => [p.id, new Set(manifest.assets.filter((r) => r.subjectPacks.includes(p.id)).map((r) => r.id))]),
  );
  for (const fq of queries) {
    let best: { pack: SubjectPackId; covered: number } | null = null;
    for (const pack of SUBJECT_PACKS) {
      const ids = packRowIds.get(pack.id) ?? new Set<string>();
      const covered = fq.acceptable.filter((a) => ids.has(a)).length;
      // Strict > keeps registry order on ties (the first pack to reach a
      // coverage count owns the query — deterministic, data-derived).
      if (best === null || covered > best.covered) best = { pack: pack.id, covered };
    }
    if (best !== null && best.covered > 0) assignment.get(best.pack)?.push(fq);
  }
  return assignment;
}

export function packQueryMetrics(queries: readonly BenchmarkQuery[], candidates: readonly VisualBeatCandidate[]): QueryMetrics {
  const verdicts = queries.map((fq) => runQuery(fq, candidates));
  const findings: string[] = [];
  for (const v of verdicts) {
    if (v.fallbackResolved) findings.push(`${v.query}: resolved via the declared fallback`);
    if (v.falseFriend) findings.push(`${v.query}: false friend / empty band — selection [${v.selected.join(", ")}]`);
  }
  const n = queries.length;
  const rate = (count: number): number | null => (n === 0 ? null : count / n);
  return {
    queries: n,
    assignedQueries: queries.map((q) => `${q.query}`),
    querySuccessRate: rate(verdicts.filter((v) => v.success).length),
    fallbackRate: rate(verdicts.filter((v) => v.fallbackResolved).length),
    falseFriendRate: rate(verdicts.filter((v) => v.falseFriend).length),
    findings: findings.slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Provenance metrics (the completeness law, measured per pack)
// ---------------------------------------------------------------------------

export function provenanceMetrics(rows: readonly CatalogAssetMeta[]): ProvenanceMetrics {
  let gaps = 0;
  const gapRows: string[] = [];
  for (const r of rows) {
    const missing: string[] = [];
    if (r.license.spdx.trim() === "") missing.push("spdx");
    if ((r.license.attribution ?? "").trim() === "") missing.push("attribution");
    if (r.license.approved !== true) missing.push("approval");
    if (r.a11y.trim() === "") missing.push("a11y");
    if (r.version.trim() === "") missing.push("version");
    if (missing.length > 0) {
      gaps += missing.length;
      gapRows.push(`${r.lane}:${r.id}[${missing.join("+")}]`);
    }
  }
  return { provenanceGaps: gaps, provenanceGapRows: gapRows.slice(0, 10) };
}

// ---------------------------------------------------------------------------
// Geometry aggregation per pack
// ---------------------------------------------------------------------------

interface GeometryInput {
  whiteboard: readonly WhiteboardAsset[];
  graphics: readonly { id: string; icon: GraphicsIcon }[];
}

export function geometryMetrics(input: GeometryInput): GeometryMetrics {
  const travels: number[] = [];
  const aspects: number[] = [];
  let strokeCount = 0;
  let broken = 0;
  let coherent = 0;
  let safe = 0;
  let textOnlyCount = 0;
  const brokenStrokes: string[] = [];
  const incoherentOrders: string[] = [];
  const unsafeAssets: string[] = [];

  for (const asset of input.whiteboard) {
    const sampled = sampleWhiteboard(asset);
    if ("textOnly" in sampled) {
      textOnlyCount++;
      continue;
    }
    const m = measureDrawable(sampled.sample);
    travels.push(m.handTravel);
    aspects.push(m.aspect);
    strokeCount += sampled.sample.strokes.length;
    broken += m.brokenStrokes.length;
    if (m.brokenStrokes.length > 0) brokenStrokes.push(...m.brokenStrokes, ...m.brokenReasons);
    if (m.orderCoherent) coherent++;
    else incoherentOrders.push(...m.orderProblems);
    if (m.safe) safe++;
    else unsafeAssets.push(...m.safeProblems);
  }
  for (const { id, icon } of input.graphics) {
    const m = measureDrawable(sampleGraphicsIcon(id, icon));
    travels.push(m.handTravel);
    aspects.push(m.aspect);
    strokeCount += icon.paths.length;
    broken += m.brokenStrokes.length;
    if (m.brokenStrokes.length > 0) brokenStrokes.push(...m.brokenStrokes, ...m.brokenReasons);
    coherent++; // no drawOrder surface in the lane — document order IS the declared order
    if (m.safe) safe++;
    else unsafeAssets.push(...m.safeProblems);
  }

  const drawableCount = travels.length;
  const mean = drawableCount > 0 ? travels.reduce((s, x) => s + x, 0) / drawableCount : null;
  const max = drawableCount > 0 ? Math.max(...travels) : null;
  return {
    drawableCount,
    textOnlyCount,
    handTravel: { mean, max },
    strokeCount,
    strokeContinuity: strokeCount > 0 ? (strokeCount - broken) / strokeCount : null,
    brokenStrokes: brokenStrokes.slice(0, 10),
    drawOrderCoherence: drawableCount > 0 ? coherent / drawableCount : null,
    incoherentOrders: incoherentOrders.slice(0, 10),
    safeBounds: drawableCount > 0 ? safe / drawableCount : null,
    unsafeAssets: unsafeAssets.slice(0, 10),
    aspect: {
      min: aspects.length > 0 ? Math.min(...aspects) : null,
      max: aspects.length > 0 ? Math.max(...aspects) : null,
      outsideBand: aspects.filter((a) => a < ASPECT_BAND.min || a > ASPECT_BAND.max).length,
    },
  };
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

export function verdictFor(metrics: {
  queries: QueryMetrics;
  semantics: SemanticMetrics;
  geometry: GeometryMetrics;
  provenance: ProvenanceMetrics;
}): { verdict: "PASS" | "FAIL"; failingDims: string[] } {
  const failing: string[] = [];
  const { queries: q, semantics: s, geometry: g, provenance: p } = metrics;
  // The falseFriend floor holds VACUOUSLY for a pack with no assigned
  // queries (zero false friends observed — the suite-coverage gap is
  // recorded in queries.queries, not punished as a relevance defect).
  if (q.falseFriendRate !== null && q.falseFriendRate > FLOORS.falseFriendRateMax) {
    failing.push(`falseFriendRate=${q.falseFriendRate} (floor 0)`);
  }
  if (s.duplicatePairs > FLOORS.duplicatePairsMax) failing.push(`duplicatePairs=${s.duplicatePairs} (floor 0)`);
  if (p.provenanceGaps > FLOORS.provenanceGapsMax) failing.push(`provenanceGaps=${p.provenanceGaps} (floor 0)`);
  if (g.drawableCount > 0) {
    if (g.safeBounds === null || g.safeBounds < FLOORS.safeBoundsMin) failing.push(`safeBounds=${g.safeBounds ?? "n/a"} (floor 1)`);
    if (g.strokeContinuity === null || g.strokeContinuity < FLOORS.strokeContinuityMin) {
      failing.push(`strokeContinuity=${g.strokeContinuity ?? "n/a"} (floor ${FLOORS.strokeContinuityMin})`);
    }
    if (g.drawOrderCoherence === null || g.drawOrderCoherence < FLOORS.drawOrderCoherenceMin) {
      failing.push(`drawOrderCoherence=${g.drawOrderCoherence ?? "n/a"} (floor ${FLOORS.drawOrderCoherenceMin})`);
    }
  }
  return { verdict: failing.length === 0 ? "PASS" : "FAIL", failingDims: failing };
}

// ---------------------------------------------------------------------------
// The round helper (receipt numbers are typed + bounded-precision)
// ---------------------------------------------------------------------------

const round = (x: number | null, digits = 4): number | null =>
  x === null ? null : Math.round(x * 10 ** digits) / 10 ** digits;

const pct = (x: number | null): string => (x === null ? "  --" : `${(x * 100).toFixed(1)}%`);

// ---------------------------------------------------------------------------
// Main — measure the nine packs, print the table, write the receipt
// ---------------------------------------------------------------------------

function measureAllPacks(): PackMetrics[] {
  const manifest = builtinCatalogManifest();
  const candidates = candidatesFromRows(manifest.assets);
  const wbById = new Map(ASSETS.map((a) => [a.id, a]));
  const assignment = assignQueriesToPacks(FIXED_QUERIES, manifest);

  const out: PackMetrics[] = [];
  for (const pack of SUBJECT_PACKS) {
    const rows = manifest.assets.filter((r) => r.subjectPacks.includes(pack.id));
    const whiteboard = rows
      .filter((r) => r.lane === "whiteboard" && r.composition === undefined)
      .map((r) => wbById.get(r.id))
      .filter((a): a is WhiteboardAsset => a !== undefined);
    const graphics = rows
      .filter((r) => r.lane === "graphics")
      .map((r) => ({ id: r.id, icon: GRAPHICS_ICON_LIBRARY[r.id] }))
      .filter((g): g is { id: string; icon: GraphicsIcon } => g.icon !== undefined);

    const semantics = semanticMetrics(rows);
    const queries = packQueryMetrics(assignment.get(pack.id) ?? [], candidates);
    const geometry = geometryMetrics({ whiteboard, graphics });
    const provenance = provenanceMetrics(rows);
    const { verdict, failingDims } = verdictFor({ queries, semantics, geometry, provenance });

    out.push({
      pack: pack.id,
      label: pack.label,
      rowCount: rows.length,
      semantics,
      queries,
      geometry,
      provenance,
      verdict,
      failingDims,
    });
  }
  return out;
}

function printTable(packs: readonly PackMetrics[]): void {
  console.log("\n  the per-pack coverage metrics (Phase 6, measured on this head):");
  const header =
    "  pack".padEnd(20) +
    "rows".padStart(5) +
    "draw".padStart(6) +
    "conc".padStart(6) +
    "uniq".padStart(6) +
    "twin".padStart(5) +
    "q".padStart(3) +
    "succ".padStart(7) +
    "fb".padStart(7) +
    "ff".padStart(7) +
    "hand(avg)".padStart(10) +
    "hand(max)".padStart(10) +
    "cont".padStart(7) +
    "order".padStart(7) +
    "safe".padStart(7) +
    "prov".padStart(5) +
    "  verdict";
  console.log(header);
  for (const p of packs) {
    const row =
      `  ${p.pack}`.padEnd(20) +
      String(p.rowCount).padStart(5) +
      String(p.geometry.drawableCount).padStart(6) +
      String(p.semantics.conceptCount).padStart(6) +
      String(p.semantics.distinctSemantics).padStart(6) +
      String(p.semantics.duplicatePairs).padStart(5) +
      String(p.queries.queries).padStart(3) +
      pct(p.queries.querySuccessRate).padStart(7) +
      pct(p.queries.fallbackRate).padStart(7) +
      pct(p.queries.falseFriendRate).padStart(7) +
      (p.geometry.handTravel.mean === null ? "  --" : p.geometry.handTravel.mean.toFixed(2)).padStart(10) +
      (p.geometry.handTravel.max === null ? "  --" : p.geometry.handTravel.max.toFixed(2)).padStart(10) +
      pct(p.geometry.strokeContinuity).padStart(7) +
      pct(p.geometry.drawOrderCoherence).padStart(7) +
      pct(p.geometry.safeBounds).padStart(7) +
      String(p.provenance.provenanceGaps).padStart(5) +
      `  ${p.verdict}`;
    console.log(row);
    if (p.verdict === "FAIL") {
      for (const dim of p.failingDims) console.log(`    FAILING: ${dim}`);
    }
  }
}

function writeReceipt(packs: readonly PackMetrics[]): void {
  const manifest = builtinCatalogManifest();
  const receipt = {
    generatedAt: new Date().toISOString(),
    script: "scripts/pack-coverage-metrics.mts",
    measurement: {
      manifestFingerprint: manifest.fingerprint,
      catalogVersion: manifest.catalogVersion,
      rowsTotal: manifest.assets.length,
      drawableTotal: packs.reduce((s, p) => s + p.geometry.drawableCount, 0),
      strokesTotal: packs.reduce((s, p) => s + p.geometry.strokeCount, 0),
      querySuite: "the §15.2 fixed suite (15 queries) — scripts/test-query-benchmark.mts is the law's home",
      assignmentRule: "each query rides the pack whose rows cover the most of its acceptable ids (ties break in registry order)",
    },
    floors: {
      ...FLOORS,
      note: "defensible because the underlying laws are load-gated (loadLibrary throws on a failing built-in; the manifest refuses an incomplete row); this metric is the independent tripwire",
      walls: {
        strokeGapWall: STROKE_GAP_WALL,
        strokeGapWallNote: "an inter-subpath jump beyond 0.6 × the viewBox diagonal is a broken stroke (the one-stroke law already forbids any second subpath)",
        safeEdgeTolerance: SAFE_EDGE_TOLERANCE,
        safeEdgeToleranceNote: "viewBox edge tolerance in asset units for flattener sampling + stroke antialias — not a license to bleed",
        aspectBand: ASPECT_BAND,
        aspectBandNote: "informational, not verdict-bearing — the measured outliers (title-hero 4.0, close-card 3.64, ecg-pulse 3.33, fx-underline 3.0) are intentional banner cards",
      },
    },
    definitions: {
      duplicatePairs: "unordered row pairs with IDENTICAL declared vocabularies (semantically indistinguishable twins) — verdict-bearing",
      overlappingPairs: "pairs sharing at least one declared term — pack coherence density, informational (membership is concept-derived)",
      intraRowDupRows: "rows declaring the same term twice — informational; the row builders concatenate [...tags, ...alts] without dedup (catalog/manifest.ts), inflating match weight",
      handTravel: "(Σ measured stroke arc lengths + Σ pen-lift travel between consecutive strokes in resolved draw order) / viewBox diagonal",
      strokeContinuity: "fraction of strokes (one path element each) that flatten to exactly one drawable subpath with no inter-subpath jump beyond the wall",
      drawOrderCoherence: "fraction of drawable assets whose resolved draw order tiles exactly 0..n-1 with no ghost or duplicate pin (the ORDER LAW of scripts/test-drawable-ir.mts)",
      safeBounds: "fraction of drawable assets whose flattened geometry and text anchors stay inside the asset viewBox within SAFE_EDGE_TOLERANCE",
      provenanceGaps: "counted missing fields (spdx, attribution, approval, a11y, version) across the pack's rows",
    },
    packs: packs.map((p) => ({
      pack: p.pack,
      label: p.label,
      rowCount: p.rowCount,
      semantics: {
        conceptCount: p.semantics.conceptCount,
        distinctSemantics: p.semantics.distinctSemantics,
        duplicatePairs: p.semantics.duplicatePairs,
        duplicatePairIds: p.semantics.duplicatePairIds,
        overlappingPairs: p.semantics.overlappingPairs,
        intraRowDupRows: p.semantics.intraRowDupRows,
      },
      queries: {
        queries: p.queries.queries,
        assignedQueries: p.queries.assignedQueries,
        querySuccessRate: round(p.queries.querySuccessRate),
        fallbackRate: round(p.queries.fallbackRate),
        falseFriendRate: round(p.queries.falseFriendRate),
        findings: p.queries.findings,
      },
      geometry: {
        drawableCount: p.geometry.drawableCount,
        textOnlyCount: p.geometry.textOnlyCount,
        handTravel: {
          mean: round(p.geometry.handTravel.mean, 3),
          max: round(p.geometry.handTravel.max, 3),
        },
        strokeCount: p.geometry.strokeCount,
        strokeContinuity: round(p.geometry.strokeContinuity),
        brokenStrokes: p.geometry.brokenStrokes,
        drawOrderCoherence: round(p.geometry.drawOrderCoherence),
        incoherentOrders: p.geometry.incoherentOrders,
        safeBounds: round(p.geometry.safeBounds),
        unsafeAssets: p.geometry.unsafeAssets,
        aspect: {
          min: round(p.geometry.aspect.min, 3),
          max: round(p.geometry.aspect.max, 3),
          outsideBand: p.geometry.aspect.outsideBand,
        },
      },
      provenance: {
        provenanceGaps: p.provenance.provenanceGaps,
        provenanceGapRows: p.provenance.provenanceGapRows,
      },
      verdict: p.verdict,
      failingDims: p.failingDims,
    })),
    aggregate: {
      packsTotal: packs.length,
      pass: packs.filter((p) => p.verdict === "PASS").length,
      fail: packs.filter((p) => p.verdict === "FAIL").length,
      failedPacks: packs.filter((p) => p.verdict === "FAIL").map((p) => p.pack),
    },
  };
  const receiptPath = fileURLToPath(new URL("../scratch/pack-coverage-metrics.json", import.meta.url));
  mkdirSync(fileURLToPath(new URL("../scratch", import.meta.url)), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`\n  receipt written: ${receiptPath}`);
}

// ---------------------------------------------------------------------------
// The self-test — the metric functions judged on synthetic assets
// ---------------------------------------------------------------------------

function selfTest(): number {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];
  const check = (cond: unknown, name: string): void => {
    if (cond) {
      passed++;
      console.log(`  ✓ ${name}`);
    } else {
      failed++;
      failures.push(name);
      console.log(`  ✗ ${name}`);
    }
  };

  console.log("\n◆ self-test — the metric functions on synthetic assets");

  // 1. A known-broken geometry asset must score broken: one path element
  //    carrying TWO M commands (the S67 teleport), far apart.
  const brokenD = "M 10 10 L 40 10 M 90 90 L 95 95";
  const broken = analyzeStroke({ id: "broken", d: brokenD }, diag(100, 100));
  check(!broken.continuous, "a two-M path (mid-path teleport) scores broken");
  check(broken.reasons.length >= 1, "the broken verdict carries its reason");
  const healthy = analyzeStroke({ id: "healthy", d: "M 10 10 L 90 10" }, diag(100, 100));
  check(healthy.continuous, "a plain one-stroke line scores continuous (the long line is NOT a break)");
  const dot = analyzeStroke({ id: "dot", d: "M 42 42" }, diag(100, 100));
  check(!dot.continuous, "a subpath with a single point (nothing to trace) scores broken");

  // 2. The full per-asset measurement on the broken asset: continuity <
  //    floor, and the broken stroke is named.
  const brokenSample: DrawableSample = {
    assetId: "synthetic-broken",
    viewBox: { w: 100, h: 100 },
    strokes: [{ id: "b1", d: brokenD }],
    anchors: [
      { start: { x: 10, y: 10 }, end: { x: 40, y: 10 } },
      { start: { x: 90, y: 90 }, end: { x: 95, y: 95 } },
    ],
    lengths: [30, Math.hypot(5, 5)],
    texts: [],
  };
  const brokenMeasure = measureDrawable(brokenSample);
  check(brokenMeasure.brokenStrokes.length === 1, "the per-asset measurement names the broken stroke");
  check(brokenMeasure.handTravel > 0, "hand travel is measured even on the broken asset");

  // 3. Safe bounds: a point outside the viewBox is caught; a point on the
  //    edge within tolerance is not.
  const outsideSample: DrawableSample = {
    assetId: "synthetic-outside",
    viewBox: { w: 100, h: 100 },
    strokes: [{ id: "o1", d: "M 90 90 L 130 90" }],
    anchors: [{ start: { x: 90, y: 90 }, end: { x: 130, y: 90 } }],
    lengths: [40],
    texts: [],
  };
  const outsideMeasure = measureDrawable(outsideSample);
  check(!outsideMeasure.safe, "geometry leaving the viewBox scores unsafe");
  check(outsideMeasure.safeProblems.some((p) => p.includes("synthetic-outside#o1")), "the unsafe verdict names the asset + stroke");
  const edgeSample: DrawableSample = {
    assetId: "synthetic-edge",
    viewBox: { w: 100, h: 100 },
    strokes: [{ id: "e1", d: "M 0 0 L 100 100" }],
    anchors: [{ start: { x: 0, y: 0 }, end: { x: 100, y: 100 } }],
    lengths: [Math.hypot(100, 100)],
    texts: [],
  };
  const edgeMeasure = measureDrawable(edgeSample);
  check(edgeMeasure.safe, "on-edge geometry (within SAFE_EDGE_TOLERANCE) scores safe");

  // 4. Draw-order coherence: a ghost pin and a duplicate pin are caught.
  const orderedSample: DrawableSample = {
    assetId: "synthetic-order",
    viewBox: { w: 100, h: 100 },
    strokes: [
      { id: "a", d: "M 10 10 L 20 10" },
      { id: "b", d: "M 30 10 L 40 10" },
      { id: "c", d: "M 50 10 L 60 10" },
    ],
    anchors: [
      { start: { x: 10, y: 10 }, end: { x: 20, y: 10 } },
      { start: { x: 30, y: 10 }, end: { x: 40, y: 10 } },
      { start: { x: 50, y: 10 }, end: { x: 60, y: 10 } },
    ],
    lengths: [10, 10, 10],
    texts: [],
    explicitOrder: ["c", "a"], // b follows after the explicit block — tiles
  };
  const orderedMeasure = measureDrawable(orderedSample);
  check(orderedMeasure.orderCoherent, "a partial drawOrder that lets the rest follow tiles (coherent)");
  const ghostSample: DrawableSample = { ...orderedSample, assetId: "synthetic-ghost", explicitOrder: ["a", "ghost"] };
  const ghostMeasure = measureDrawable(ghostSample);
  check(!ghostMeasure.orderCoherent, "a drawOrder pin naming an unknown path is incoherent");
  const dupSample: DrawableSample = { ...orderedSample, assetId: "synthetic-dup", explicitOrder: ["a", "a", "b"] };
  const dupMeasure = measureDrawable(dupSample);
  check(!dupMeasure.orderCoherent, "a duplicated drawOrder pin is incoherent");

  // 5. Duplicate semantics: a duplicate-alias pair must be detected.
  const twinRows = [
    { id: "one", lane: "whiteboard", concepts: ["farm", "barn"], aliases: ["farm building"] },
    { id: "two", lane: "whiteboard", concepts: ["barn", "farm"], aliases: ["farm building"] },
    { id: "three", lane: "whiteboard", concepts: ["farm", "tractor"], aliases: [] },
  ] as const;
  const twinMetrics = semanticMetrics(twinRows);
  check(twinMetrics.duplicatePairs === 1, "a duplicate-alias pair (identical vocabularies) is detected");
  check(twinMetrics.overlappingPairs === 3, `overlap density counts every shared-term pair (got ${twinMetrics.overlappingPairs})`);
  check(twinMetrics.distinctSemantics === 4, `distinct semantics counted once (got ${twinMetrics.distinctSemantics})`);
  const intraRows = [
    { id: "repeater", lane: "whiteboard", concepts: ["farm", "farm"], aliases: ["farm"] },
  ] as const;
  check(semanticMetrics(intraRows).intraRowDupRows === 1, "a row declaring the same term twice is counted");
  check(semanticMetrics(intraRows).duplicatePairs === 0, "a single row cannot form a duplicate PAIR");

  // 6. Query metrics: a false-friend selection is detected; a no-vocabulary
  //    query resolves via its declared fallback; a healthy query succeeds.
  const miniCandidates: VisualBeatCandidate[] = [
    { id: "wb:tractor", concepts: ["tractor"], aliases: [], tags: ["agriculture"] },
    { id: "wb:heart", concepts: ["heart"], aliases: [], tags: ["health"] },
  ];
  const falseFriendSuite = [
    { query: "tractor", acceptable: ["heart"], unacceptable: ["tractor"], fallbackId: "fb" },
  ];
  const falseFriendMetrics = packQueryMetrics(falseFriendSuite, miniCandidates);
  check(falseFriendMetrics.falseFriendRate === 1, "a selection riding an unacceptable id scores falseFriendRate 1");
  check(falseFriendMetrics.querySuccessRate === 0, "a false-friend query is not a success");
  const fallbackSuite = [{ query: "Zqxj wvvrkp blnth smd", acceptable: ["tractor"], unacceptable: [], fallbackId: "declared-fallback" }];
  const fallbackMetrics = packQueryMetrics(fallbackSuite, miniCandidates);
  check(fallbackMetrics.fallbackRate === 1, "a no-vocabulary query resolves via its DECLARED fallback");
  const healthySuite = [{ query: "tractor", acceptable: ["tractor"], unacceptable: ["heart"], fallbackId: "fb" }];
  const healthyMetrics = packQueryMetrics(healthySuite, miniCandidates);
  check(
    healthyMetrics.querySuccessRate === 1 && healthyMetrics.falseFriendRate === 0 && healthyMetrics.fallbackRate === 0,
    "a healthy query succeeds with zero false friends and zero fallbacks",
  );
  const emptySuite = packQueryMetrics([], miniCandidates);
  check(
    emptySuite.querySuccessRate === null && emptySuite.fallbackRate === null && emptySuite.falseFriendRate === null,
    "a pack with no queries reports null rates (an honest null, not a fake zero)",
  );
  const vacuous = verdictFor({
    queries: emptySuite,
    semantics: { conceptCount: 2, distinctSemantics: 2, duplicatePairs: 0, duplicatePairIds: [], overlappingPairs: 0, intraRowDupRows: 0 },
    geometry: {
      drawableCount: 1, textOnlyCount: 0, handTravel: { mean: 1, max: 1 }, strokeCount: 1,
      strokeContinuity: 1, brokenStrokes: [], drawOrderCoherence: 1, incoherentOrders: [],
      safeBounds: 1, unsafeAssets: [], aspect: { min: 1, max: 1, outsideBand: 0 },
    },
    provenance: { provenanceGaps: 0, provenanceGapRows: [] },
  });
  check(
    vacuous.verdict === "PASS",
    "a pack with no queries holds the falseFriend floor vacuously (zero false friends observed)",
  );

  // 7. Provenance: the gap counter names its missing fields.
  const provRows = [
    {
      id: "full", lane: "whiteboard" as const, version: "1.0.0", a11y: "something",
      license: { spdx: "LicenseRef-X", attribution: "x", approved: true },
    },
    {
      id: "gap", lane: "whiteboard" as const, version: "", a11y: "",
      license: { spdx: "", attribution: undefined, approved: false },
    },
  ] as unknown as CatalogAssetMeta[];
  const prov = provenanceMetrics(provRows);
  check(prov.provenanceGaps === 5, `each missing field counts once (got ${prov.provenanceGaps})`);
  check(prov.provenanceGapRows.some((r) => r.startsWith("whiteboard:gap[")), "the gap row is named with its missing fields");

  // 8. The verdict: a clean pack passes; a pack with one failing dim fails
  //    and names the dim.
  const clean = verdictFor({
    queries: healthyMetrics,
    semantics: { conceptCount: 2, distinctSemantics: 2, duplicatePairs: 0, duplicatePairIds: [], overlappingPairs: 0, intraRowDupRows: 0 },
    geometry: {
      drawableCount: 1, textOnlyCount: 0, handTravel: { mean: 1, max: 1 }, strokeCount: 1,
      strokeContinuity: 1, brokenStrokes: [], drawOrderCoherence: 1, incoherentOrders: [],
      safeBounds: 1, unsafeAssets: [], aspect: { min: 1, max: 1, outsideBand: 0 },
    },
    provenance: { provenanceGaps: 0, provenanceGapRows: [] },
  });
  check(clean.verdict === "PASS" && clean.failingDims.length === 0, "a pack holding every floor PASSES");
  const dirty = verdictFor({
    queries: falseFriendMetrics,
    semantics: { conceptCount: 2, distinctSemantics: 2, duplicatePairs: 1, duplicatePairIds: ["a = b"], overlappingPairs: 1, intraRowDupRows: 0 },
    geometry: {
      drawableCount: 1, textOnlyCount: 0, handTravel: { mean: 1, max: 1 }, strokeCount: 1,
      strokeContinuity: 0.5, brokenStrokes: ["x#y"], drawOrderCoherence: 1, incoherentOrders: [],
      safeBounds: 1, unsafeAssets: [], aspect: { min: 1, max: 1, outsideBand: 0 },
    },
    provenance: { provenanceGaps: 2, provenanceGapRows: ["whiteboard:gap[spdx+a11y]"] },
  });
  check(dirty.verdict === "FAIL", "a pack breaking any floor FAILS");
  check(
    dirty.failingDims.some((d) => d.startsWith("falseFriendRate")) &&
      dirty.failingDims.some((d) => d.startsWith("duplicatePairs")) &&
      dirty.failingDims.some((d) => d.startsWith("strokeContinuity")) &&
      dirty.failingDims.some((d) => d.startsWith("provenanceGaps")),
    "the FAIL verdict lists every failing dim",
  );

  console.log(`\n  self-test: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  return failed > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

const SELF_TEST = process.argv.includes("--self-test");
if (SELF_TEST) {
  process.exit(selfTest());
} else {
  const packs = measureAllPacks();
  printTable(packs);
  const failing = packs.filter((p) => p.verdict === "FAIL");
  writeReceipt(packs);
  console.log(`\n=== pack-coverage-metrics: ${packs.length - failing.length} PASS, ${failing.length} FAIL of ${packs.length} packs ===`);
  if (failing.length > 0) {
    for (const p of failing) console.log(`  ✗ ${p.pack}: ${p.failingDims.join(" · ")}`);
    process.exit(1);
  }
}

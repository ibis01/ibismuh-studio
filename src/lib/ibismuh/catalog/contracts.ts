// catalog/contracts.ts — THE SHARED CATALOG CONTRACT (the re-audit's
// Phase A): one identity, provenance, versioning, licensing, and search
// vocabulary for BOTH visual lanes — the Whiteboard asset library and the
// Motion Graphics icon library — while each lane keeps its own geometry.
//
// Why this lands BEFORE mass asset creation (the audit's Priority 2):
// creating hundreds of files ahead of the catalog contract creates catalog
// debt — rows that cannot say what they are, who drew them, under what
// license, at which version, and whether they may ship. This module is the
// debt-proof: every row of every catalog must carry the full metadata
// record or the manifest refuses to build.
//
// The laws (pinned by scripts/test-catalog.mts):
//   · COVERAGE — the builtin manifest covers EVERY whiteboard ASSETS entry
//     and EVERY graphics icon; an unregistered library asset is a defect.
//   · COMPLETENESS — a row without category, complexity, a11y, license,
//     provenance, publish state, and version does not parse.
//   · TAMPER EVIDENCE — every row carries a sha256 content hash over its
//     canonical drawable content; the manifest carries a sha256 fingerprint
//     over its canonical form; drawable-ir-style fail-closed parsing
//     rejects any mismatch, unknown version, bad enum, or missing field.
//   · DETERMINISM — same inputs → the same manifest, byte for byte (rows
//     sort by lane then id; the canonical serializer is ../canonical's).
//   · SEARCH IS DETERMINISTIC — same query, same filters → the same
//     ranked results with the match reasons attached (selection
//     explanations, the audit's observability ask).
//
// Pure module: no fs, no clock, no network, no randomness.

import { canonicalStringify, sha256Hex } from "../canonical";

export const CATALOG_VERSION = "1";

/** The lanes a catalog row can serve. */
export type CatalogLane = "whiteboard" | "graphics";

/** How a row's art came into existence. */
export type CatalogProvenance = "hand-authored" | "upload" | "traced" | "generated";

/** The publish lifecycle (audit §3.2: publish state + retirement). */
export type CatalogPublishState = "draft" | "review" | "published" | "retired";

export interface CatalogLicense {
  /** SPDX identifier — a real license id or a LicenseRef-* for in-house art. */
  spdx: string;
  /** Human attribution line (optional; required by some licenses). */
  attribution?: string;
  /** Where the source art lives (optional; uploads carry their origin). */
  sourceUrl?: string;
  /** License review state (optional; the production workflow's gate). */
  approved?: boolean;
}

/** The audit's deprecation behavior: a retired row names its replacement. */
export interface CatalogDeprecation {
  replacedBy: string;
  reason?: string;
}

export interface CatalogAssetMeta {
  id: string;
  lane: CatalogLane;
  /** Row version (semver-ish string; bumped when the art changes). */
  version: string;
  /** sha256 over the canonical drawable content (the tamper evidence). */
  contentHash: string;
  category: string;
  subcategory?: string;
  /** Alternative match names (search + the mention matcher's vocabulary). */
  aliases: string[];
  /** Concept tags the semantic layer matches on. */
  concepts: string[];
  /** Curated subject packs the row belongs to (empty = none yet). */
  subjectPacks: string[];
  /** Style family (the visual-language grouping; "classic" is the built-ins). */
  styleFamily: string;
  /** 1 (minimal strokes) … 5 (very dense) — the drawing-cost rating. */
  complexity: number;
  /** Accessibility description — screen readers and alt text. */
  a11y: string;
  license: CatalogLicense;
  provenance: CatalogProvenance;
  publishState: CatalogPublishState;
  /** null = a GLOBAL row (every tenant sees it); otherwise the owning tenant. */
  ownerTenantId: string | null;
  deprecation?: CatalogDeprecation;
}

export interface CatalogManifest {
  catalogVersion: string;
  /** The lanes the manifest covers (a manifest may hold one or both). */
  lanes: CatalogLane[];
  /** Row count per lane — the coverage receipt at a glance. */
  counts: Record<string, number>;
  assets: CatalogAssetMeta[];
  /** sha256 over the canonical form of the manifest sans fingerprint. */
  fingerprint: string;
}

// ---------------------------------------------------------------------------
// The closed vocabularies (validated — an unknown value fails the parse)
// ---------------------------------------------------------------------------

const LANES: readonly CatalogLane[] = ["whiteboard", "graphics"];
const PROVENANCES: readonly CatalogProvenance[] = ["hand-authored", "upload", "traced", "generated"];
const PUBLISH_STATES: readonly CatalogPublishState[] = ["draft", "review", "published", "retired"];

const isStr = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function fail(reason: string): never {
  throw new Error(`catalog manifest: ${reason}`);
}

function str(v: unknown, where: string, allowEmpty = false): string {
  if (!isStr(v)) fail(`${where} must be a string`);
  if (!allowEmpty && v.trim() === "") fail(`${where} must not be empty`);
  return v;
}

function strArray(v: unknown, where: string): string[] {
  if (!Array.isArray(v)) fail(`${where} must be an array of strings`);
  return v.map((s, i) => str(s, `${where}[${i}]`));
}

function optionalStr(v: unknown, where: string): string | undefined {
  if (v === undefined) return undefined;
  return str(v, where);
}

// ---------------------------------------------------------------------------
// Content hashing — the canonical drawable bytes per lane
// ---------------------------------------------------------------------------

/** The drawable-content view of a whiteboard asset (the fields the renderer
 *  actually consumes; extra metadata is descriptor, not geometry). */
export interface WhiteboardContentShape {
  id: string;
  svg: string;
  viewBox: { w: number; h: number };
  tags: string[];
  role?: string;
  alts?: string[];
  textMode?: string;
}

/** The drawable-content view of a graphics icon. */
export interface GraphicsContentShape {
  id: string;
  paths: string[];
  tags: string[];
}

export function whiteboardContentHash(content: WhiteboardContentShape): string {
  return sha256Hex(canonicalStringify(content));
}

export function graphicsContentHash(content: GraphicsContentShape): string {
  return sha256Hex(canonicalStringify(content));
}

// ---------------------------------------------------------------------------
// Row construction + manifest build/parse
// ---------------------------------------------------------------------------

function validateRow(value: unknown, where: string): CatalogAssetMeta {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${where} must be an object`);
  }
  const r = value as Record<string, unknown>;
  const id = str(r.id, `${where}.id`);
  if (!LANES.includes(r.lane as CatalogLane)) {
    fail(`${where}.lane must be one of ${LANES.join(" | ")} (got ${String(r.lane)})`);
  }
  if (!PROVENANCES.includes(r.provenance as CatalogProvenance)) {
    fail(`${where}.provenance must be one of ${PROVENANCES.join(" | ")}`);
  }
  if (!PUBLISH_STATES.includes(r.publishState as CatalogPublishState)) {
    fail(`${where}.publishState must be one of ${PUBLISH_STATES.join(" | ")}`);
  }
  if (!isNum(r.complexity) || !Number.isInteger(r.complexity) || r.complexity < 1 || r.complexity > 5) {
    fail(`${where}.complexity must be an integer 1..5 (got ${String(r.complexity)})`);
  }
  const licenseRaw = r.license;
  if (licenseRaw === null || typeof licenseRaw !== "object" || Array.isArray(licenseRaw)) {
    fail(`${where}.license must be an object`);
  }
  const lic = licenseRaw as Record<string, unknown>;
  const license: CatalogLicense = {
    spdx: str(lic.spdx, `${where}.license.spdx`),
    attribution: optionalStr(lic.attribution, `${where}.license.attribution`),
    sourceUrl: optionalStr(lic.sourceUrl, `${where}.license.sourceUrl`),
  };
  if (lic.approved !== undefined) {
    if (!isBool(lic.approved)) fail(`${where}.license.approved must be a boolean`);
    license.approved = lic.approved;
  }
  let deprecation: CatalogDeprecation | undefined;
  if (r.deprecation !== undefined) {
    if (r.deprecation === null || typeof r.deprecation !== "object" || Array.isArray(r.deprecation)) {
      fail(`${where}.deprecation must be an object`);
    }
    const dep = r.deprecation as Record<string, unknown>;
    deprecation = {
      replacedBy: str(dep.replacedBy, `${where}.deprecation.replacedBy`),
      reason: optionalStr(dep.reason, `${where}.deprecation.reason`),
    };
  }
  if (r.ownerTenantId !== null && r.ownerTenantId !== undefined && !isStr(r.ownerTenantId)) {
    fail(`${where}.ownerTenantId must be a string or null`);
  }
  const row: CatalogAssetMeta = {
    id,
    lane: r.lane as CatalogLane,
    version: str(r.version, `${where}.version`),
    contentHash: str(r.contentHash, `${where}.contentHash`),
    category: str(r.category, `${where}.category`),
    subcategory: optionalStr(r.subcategory, `${where}.subcategory`),
    aliases: strArray(r.aliases, `${where}.aliases`),
    concepts: strArray(r.concepts, `${where}.concepts`),
    subjectPacks: strArray(r.subjectPacks, `${where}.subjectPacks`),
    styleFamily: str(r.styleFamily, `${where}.styleFamily`),
    complexity: r.complexity,
    a11y: str(r.a11y, `${where}.a11y`, true),
    license,
    provenance: r.provenance as CatalogProvenance,
    publishState: r.publishState as CatalogPublishState,
    ownerTenantId: (r.ownerTenantId as string | null) ?? null,
  };
  if (deprecation) row.deprecation = deprecation;
  return row;
}

/** Canonical row order: lane asc, then id asc. THE sort — both the builder
 *  and the parser enforce it, so a manifest's bytes are layout-independent. */
export function compareRows(a: CatalogAssetMeta, b: CatalogAssetMeta): number {
  if (a.lane !== b.lane) return a.lane < b.lane ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function computeManifestFingerprint(manifest: Omit<CatalogManifest, "fingerprint">): string {
  return sha256Hex(canonicalStringify(manifest));
}

/**
 * Build a manifest from validated rows — the ONLY sanctioned constructor.
 * Refuses duplicates (an id must map to exactly one row per manifest),
 * refuses an empty lane set (counts must be honest), sorts canonically,
 * and fingerprints the result. Throws on any defect (fail-closed build).
 */
export function buildCatalogManifest(input: {
  catalogVersion?: string;
  assets: CatalogAssetMeta[];
}): CatalogManifest {
  const { assets } = input;
  const seen = new Set<string>();
  for (const [i, row] of assets.entries()) {
    const key = `${row.lane}:${row.id}`;
    if (seen.has(key)) fail(`duplicate row ${key} at index ${i}`);
    seen.add(key);
  }
  const lanes: CatalogLane[] = [];
  const counts: Record<string, number> = {};
  for (const lane of LANES) {
    const n = assets.filter((a) => a.lane === lane).length;
    if (n > 0) {
      lanes.push(lane);
      counts[lane] = n;
    }
  }
  if (lanes.length === 0) fail("a manifest must carry at least one row");
  const sorted = [...assets].sort(compareRows);
  const sans: Omit<CatalogManifest, "fingerprint"> = {
    catalogVersion: input.catalogVersion ?? CATALOG_VERSION,
    lanes,
    counts,
    assets: sorted,
  };
  return { ...sans, fingerprint: computeManifestFingerprint(sans) };
}

/**
 * Fail-closed parse (the drawable-ir discipline): unknown version shape,
 * missing fields, bad enums, wrong sort order, duplicate rows, or ANY
 * fingerprint mismatch throws — a stored manifest is tamper-evident by
 * construction.
 */
export function parseCatalogManifest(text: string): CatalogManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("document is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("document must be an object");
  }
  const m = parsed as Record<string, unknown>;
  if (!isStr(m.catalogVersion) || m.catalogVersion.trim() === "") {
    fail("catalogVersion must be a non-empty string");
  }
  if (!Array.isArray(m.assets)) fail("assets must be an array");
  const assets = m.assets.map((row, i) => validateRow(row, `assets[${i}]`));
  const lanes: CatalogLane[] = [];
  const counts: Record<string, number> = {};
  for (const lane of LANES) {
    const n = assets.filter((a) => a.lane === lane).length;
    if (n > 0) {
      lanes.push(lane);
      counts[lane] = n;
    }
  }
  if (lanes.length === 0) fail("a manifest must carry at least one row");
  const sorted = [...assets].sort(compareRows);
  for (const [i, row] of sorted.entries()) {
    if (assets[i] !== undefined && (assets[i].lane !== row.lane || assets[i].id !== row.id)) {
      fail(`assets are not in canonical order (lane,id) at index ${i}`);
    }
  }
  const seen = new Set<string>();
  for (const row of assets) {
    const key = `${row.lane}:${row.id}`;
    if (seen.has(key)) fail(`duplicate row ${key}`);
    seen.add(key);
  }
  const sans: Omit<CatalogManifest, "fingerprint"> = {
    catalogVersion: m.catalogVersion,
    lanes,
    counts,
    assets: sorted,
  };
  const expected = computeManifestFingerprint(sans);
  if (!isStr(m.fingerprint)) fail("fingerprint must be a string");
  if (m.fingerprint !== expected) {
    fail(
      `fingerprint mismatch: document says ${m.fingerprint.slice(0, 12)}, content hashes to ${expected.slice(0, 12)}`
    );
  }
  return { ...sans, fingerprint: m.fingerprint };
}

/** Serialize a manifest to canonical JSON bytes (parse → the same
 *  fingerprint, always). */
export function serializeCatalogManifest(manifest: CatalogManifest): string {
  const { fingerprint, ...sans } = manifest;
  return JSON.stringify({ ...sans, fingerprint }, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Deterministic search — the catalog browser's engine (audit §3.3)
// ---------------------------------------------------------------------------

export interface CatalogQuery {
  /** Free-text query (tokenized; every token must match something). */
  text?: string;
  lane?: CatalogLane;
  category?: string;
  subjectPack?: string;
  styleFamily?: string;
  /** Max complexity (the drawing-cost ceiling). */
  maxComplexity?: number;
  /** Min complexity. */
  minComplexity?: number;
  /** Default: published only. Explicit array = exactly those states. */
  publishStates?: CatalogPublishState[];
  /** true = only GLOBAL rows (ownerTenantId null). */
  globalOnly?: boolean;
  provenance?: CatalogProvenance;
}

export interface CatalogSearchHit {
  row: CatalogAssetMeta;
  /** 0 = no text query; higher = stronger match. */
  score: number;
  /** WHY this row matched (the selection explanation). */
  reasons: string[];
}

/** Tokenize a query: lowercase words, drop punctuation. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== "");
}

function rowTokens(row: CatalogAssetMeta): { aliases: Set<string>; concepts: Set<string>; idParts: Set<string> } {
  const norm = (s: string): string[] =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t !== "");
  return {
    idParts: new Set(norm(row.id)),
    aliases: new Set(row.aliases.flatMap(norm)),
    concepts: new Set(row.concepts.flatMap(norm)),
  };
}

/**
 * Deterministic ranked search over a manifest. Every text token must match
 * the row's id, aliases, or concepts (AND semantics — a partial board is
 * worse than an empty one). Filters are exact-match conjunctions. Results
 * sort by (score desc, lane asc, id asc) — the tiebreak is THE sort, so
 * the same query returns the same order forever.
 */
export function searchCatalog(manifest: CatalogManifest, query: CatalogQuery): CatalogSearchHit[] {
  const states = query.publishStates ?? (["published"] as CatalogPublishState[]);
  const tokens = query.text !== undefined ? tokenize(query.text) : [];
  const hits: CatalogSearchHit[] = [];
  for (const row of manifest.assets) {
    if (query.lane !== undefined && row.lane !== query.lane) continue;
    if (query.category !== undefined && row.category !== query.category) continue;
    if (query.subjectPack !== undefined && !row.subjectPacks.includes(query.subjectPack)) continue;
    if (query.styleFamily !== undefined && row.styleFamily !== query.styleFamily) continue;
    if (query.provenance !== undefined && row.provenance !== query.provenance) continue;
    if (query.globalOnly === true && row.ownerTenantId !== null) continue;
    if (query.minComplexity !== undefined && row.complexity < query.minComplexity) continue;
    if (query.maxComplexity !== undefined && row.complexity > query.maxComplexity) continue;
    if (!states.includes(row.publishState)) continue;
    if (tokens.length > 0) {
      const t = rowTokens(row);
      let score = 0;
      const reasons: string[] = [];
      let all = true;
      for (const token of tokens) {
        if (t.idParts.has(token)) {
          score += 3;
          reasons.push(`id matches "${token}"`);
        } else if (t.aliases.has(token)) {
          score += 2;
          reasons.push(`alias matches "${token}"`);
        } else if (t.concepts.has(token)) {
          score += 1;
          reasons.push(`concept matches "${token}"`);
        } else {
          all = false;
          break;
        }
      }
      if (!all) continue;
      hits.push({ row, score, reasons });
    } else {
      hits.push({ row, score: 0, reasons: ["no query — listed by catalog order"] });
    }
  }
  hits.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return compareRows(a.row, b.row);
  });
  return hits;
}

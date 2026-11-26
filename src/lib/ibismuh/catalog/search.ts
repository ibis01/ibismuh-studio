// catalog/search.ts — THE DETERMINISTIC SEARCH ENGINE (the audit §3.3),
// extracted from contracts.ts into a CLIENT-SAFE module: the palette's
// catalog browser runs this search in the browser, and the browser has no
// node:crypto — the search is pure text/enum logic and needs NO hashing.
// contracts.ts re-exports everything here (one vocabulary, both callers).
//
// The laws (pinned by scripts/test-catalog.mts):
//   · DETERMINISM — same query, same filters → the same ranked results with
//     the match reasons attached (selection explanations, the audit's
//     observability ask).
//   · AND semantics — every text token must match the row's id, aliases, or
//     concepts; a partial board is worse than an empty one.
//   · THE tiebreak is THE sort — (score desc, lane asc, id asc) — so the
//     same query returns the same order forever.
//
// Pure module: no fs, no clock, no network, no randomness, no crypto.
import type {
  CatalogAssetMeta,
  CatalogLane,
  CatalogManifest,
  CatalogProvenance,
  CatalogPublishState,
} from "./contracts";

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

function compareRows(a: CatalogAssetMeta, b: CatalogAssetMeta): number {
  if (a.lane !== b.lane) return a.lane < b.lane ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * The ranked search over BARE ROWS — the browser's entry point (the palette
 * searches the wire's catalog rows without building a fingerprinted
 * manifest; hashing is the manifest's law, not the search's). Every text
 * token must match the row's id, aliases, or concepts (AND semantics).
 * Results sort by (score desc, lane asc, id asc) — the tiebreak is THE
 * sort, so the same query returns the same order forever.
 */
export function searchRows(rows: readonly CatalogAssetMeta[], query: CatalogQuery): CatalogSearchHit[] {
  const states = query.publishStates ?? (["published"] as CatalogPublishState[]);
  const tokens = query.text !== undefined ? tokenize(query.text) : [];
  const hits: CatalogSearchHit[] = [];
  for (const row of rows) {
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

/**
 * The manifest-level search (the server-side entry point, unchanged for
 * every existing caller): a fingerprinted manifest's rows through the same
 * engine. THE search — same query, same filters → the same ranked results.
 */
export function searchCatalog(manifest: CatalogManifest, query: CatalogQuery): CatalogSearchHit[] {
  return searchRows(manifest.assets, query);
}

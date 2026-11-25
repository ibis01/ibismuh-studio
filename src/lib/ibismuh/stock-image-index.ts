// The stock IMAGE lane — the photo adapter contract + the per-scene candidate
// index (the still-image sibling of stock-index.ts's S89 footage lane).
//
// The deficiency the lane closes: the story pipeline paints every scene's art
// with a generation API, and when that provider fails (no key, quota, outage)
// the scene falls back to a gradient board. Real photos exist for most
// subjects, carry a license, and cost $0 — so the engine now DOWNLOADS the
// image a scene needs at the moment it needs it: search the photo adapters,
// rank, download, verify, attach. Same architecture as the footage lane, one
// seam at a time:
//   • SOURCES — the photo adapter contract: Pexels photos + Pixabay photos are
//     the first two adapters; a future source is a one-file addition plus its
//     key wiring (S76 §5 P2: one source at a time, never a batch)
//   • INDEX — all of a scene's queries gather into ONE deduped candidate pool
//     (source:id keyed), instead of per-query fragments
//   • RANK — stock-image-ranker.ts scores the pool (license floor, resolution,
//     aspect, tag semantics, cross-scene duplicate penalty)
//   • VERIFY — stock-image.ts decodes the bytes (ffprobe), floors the size,
//     and asks the relevance inspector ONCE — the verdict is recorded on the
//     ref, fail-open-but-RECORDED, never a silent claim
//   • the photo downloads into the video dir as stockimg-XX.jpg and the Scene
//     gains a `stockImage` ref — the render's Ken Burns executor picks it up
//     automatically when the AI art is missing, and art still wins when it
//     exists (the look of the video stays the look the creator chose).
//
// THE LICENSE LAW (stock-index.ts, verbatim here): a candidate without a
// license label never enters the index. "No unverified footage silently
// accepted" starts here — an adapter that cannot state the license terms its
// results carry contributes nothing.
//
// The pure parts (provider JSON normalization, index merge/dedupe) are
// exported for the offline unit suite; only fetchJson does I/O.

import { log } from "./log";
import { fetchJson, type StockKeys } from "./stock-index";

const imageIndexLog = log.child({ mod: "stock-image-index" });

/** One normalized candidate photo, provider-agnostic. */
export interface StockImageCandidate {
  source: "pexels" | "pixabay"; // widens the day a third adapter lands
  /** The photo's id at its source — the dedupe key half (`source:id`). */
  id: string;
  /** Direct downloadable image URL (jpeg/png). */
  url: string;
  width: number;
  height: number;
  author: string;
  pageUrl: string;
  /** REQUIRED — the license every result from this source carries. */
  license: string;
  /** Pixabay returns tags; Pexels photo search does not (factor stays neutral). */
  tags?: string[];
}

/** The photo source adapter contract (the footage adapter's shape, stills). */
export interface StockImageSourceAdapter {
  id: StockImageCandidate["source"];
  label: string;
  /** The license label stamped on every candidate this adapter returns. */
  license: string;
  keyUrl: string;
  search(query: string, apiKey: string): Promise<StockImageCandidate[]>;
}

/** One indexed candidate: the photo + every scene query that surfaced it. */
export interface SceneImageIndexEntry {
  candidate: StockImageCandidate;
  matchedQueries: string[];
}

/** The stable dedupe key for a candidate (`pexels:1234`). */
export function imageKey(c: Pick<StockImageCandidate, "source" | "id">): string {
  return `${c.source}:${c.id}`;
}

// ---------- Pexels (photo search) ----------
// https://www.pexels.com/api/documentation/#photographs

interface PexelsPhotoSrc {
  original?: string;
  large2x?: string;
  landscape?: string;
}

interface PexelsPhoto {
  id?: number;
  width?: number;
  height?: number;
  url?: string;
  photographer?: string;
  alt?: string;
  src?: PexelsPhotoSrc;
}

/** Pure: normalize a Pexels photo-search response into candidates. */
export function pexelsPhotoParse(data: unknown): StockImageCandidate[] {
  const d = data as { photos?: PexelsPhoto[] };
  const out: StockImageCandidate[] = [];
  for (const p of d.photos ?? []) {
    // The original is the sharpest asset (search was orientation-filtered);
    // large2x is the fallback when a photo hides its original file.
    const url = p.src?.original || p.src?.large2x || p.src?.landscape || "";
    if (!url) continue;
    if ((p.width ?? 0) < 1280 || (p.width ?? 0) <= (p.height ?? 1)) continue;
    out.push({
      source: "pexels",
      id: String(p.id ?? ""),
      url,
      width: p.width ?? 0,
      height: p.height ?? 0,
      author: p.photographer?.trim() || "Pexels creator",
      pageUrl: p.url || "https://www.pexels.com/photos/",
      license: "Pexels License",
    });
  }
  return out;
}

const pexelsImageAdapter: StockImageSourceAdapter = {
  id: "pexels",
  label: "Pexels",
  license: "Pexels License",
  keyUrl: "https://www.pexels.com/api/",
  async search(query, apiKey) {
    const url =
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
      `&orientation=landscape&size=medium&per_page=15`;
    return pexelsPhotoParse(await fetchJson(url, { Authorization: apiKey }));
  },
};

// ---------- Pixabay (photo search) ----------
// https://pixabay.com/api/docs/

/** Pure: normalize a Pixabay photo-search response into candidates. */
export function pixabayPhotoParse(data: unknown): StockImageCandidate[] {
  const d = data as {
    hits?: {
      id?: number;
      pageURL?: string;
      tags?: string;
      imageWidth?: number;
      imageHeight?: number;
      largeImageURL?: string;
      user?: string;
    }[];
  };
  const out: StockImageCandidate[] = [];
  for (const hit of d.hits ?? []) {
    if (!hit.largeImageURL) continue;
    if ((hit.imageWidth ?? 0) < 1280 || (hit.imageWidth ?? 0) <= (hit.imageHeight ?? 1)) continue;
    out.push({
      source: "pixabay",
      id: String(hit.id ?? ""),
      url: hit.largeImageURL,
      width: hit.imageWidth ?? 0,
      height: hit.imageHeight ?? 0,
      author: hit.user?.trim() || "Pixabay creator",
      pageUrl: hit.pageURL || "https://pixabay.com/photos/",
      license: "Pixabay Content License",
      tags: (hit.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12),
    });
  }
  return out;
}

const pixabayImageAdapter: StockImageSourceAdapter = {
  id: "pixabay",
  label: "Pixabay",
  license: "Pixabay Content License",
  keyUrl: "https://pixabay.com/api/docs/#api_key",
  async search(query, apiKey) {
    const url =
      `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}` +
      `&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal` +
      `&safesearch=true&per_page=24`;
    return pixabayPhotoParse(await fetchJson(url, {}));
  },
};

// ---------- the registry ----------

/** The registered photo adapters, in stable order. */
export const STOCK_IMAGE_SOURCES: readonly StockImageSourceAdapter[] = [
  pexelsImageAdapter,
  pixabayImageAdapter,
];

/**
 * The photo adapters with a configured key. Zero configured → the SAME pinned
 * operator error the footage lane throws (the queue suite and the POST gate
 * assert it byte-identically — the image lane is the same feature to the
 * operator, not a second settings surface).
 */
export function configuredImageSources(keys: StockKeys): StockImageSourceAdapter[] {
  const out = STOCK_IMAGE_SOURCES.filter((s) => keys[s.id].trim() !== "");
  if (out.length === 0)
    throw new Error(
      "No stock provider is configured — add a free Pexels or Pixabay key in Settings → Stock footage"
    );
  return out;
}

// ---------- the index ----------

/**
 * Pure: merge one query's candidates into the index. Same `source:id`
 * surfacing again under another query UNIONS its matchedQueries (the
 * strongest relevance signal we have pre-download) instead of duplicating
 * the row. Insertion order is preserved (first sighting wins the position).
 */
export function mergeIntoImageIndex(
  index: Map<string, SceneImageIndexEntry>,
  query: string,
  candidates: StockImageCandidate[]
): Map<string, SceneImageIndexEntry> {
  for (const c of candidates) {
    // THE LICENSE LAW — no license, no entry (see module header).
    if (!c.license || !c.id || !c.url) continue;
    const key = imageKey(c);
    const existing = index.get(key);
    if (existing) {
      if (!existing.matchedQueries.includes(query)) existing.matchedQueries.push(query);
    } else {
      index.set(key, { candidate: c, matchedQueries: [query] });
    }
  }
  return index;
}

/**
 * Build one scene's candidate index: every query × every configured photo
 * source, fail-soft per (source, query) — a misbehaving source or a dead
 * query never blocks the others (the footage lane's per-provider semantics,
 * kept). Only the zero-configured-providers error propagates.
 */
export async function buildSceneImageIndex(opts: {
  queries: string[];
  keys: StockKeys;
}): Promise<SceneImageIndexEntry[]> {
  const sources = configuredImageSources(opts.keys);
  const index = new Map<string, SceneImageIndexEntry>();
  for (const query of opts.queries) {
    for (const source of sources) {
      try {
        const candidates = await source.search(query, opts.keys[source.id]);
        mergeIntoImageIndex(index, query, candidates);
      } catch (err) {
        imageIndexLog.warn("photo source search failed (skipped)", {
          source: source.id,
          query,
          err: err instanceof Error ? err.message : err,
        });
      }
    }
  }
  return [...index.values()];
}

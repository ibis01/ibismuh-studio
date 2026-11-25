// The stock IMAGE lane — the photo ranker + the relevance-verdict math.
// PURE module: no I/O, no DB, no network — every rule is pinnable offline
// (scripts/test-unit.mts, "stock image ranker" suites). The still-image
// sibling of stock-ranker.ts.
//
// rankImageCandidates turns the scene image index into an ordered walk list:
//   HARD FLOORS (a candidate is dropped, not down-ranked):
//     • landscape ≥ 1280×720 — the delivery frame is 16:9 1080p and a photo
//       below that letterboxes or upscales visibly
//     • a license label — the index already enforces it; the floor is the
//       second lock (defense in depth, the footage lane's law verbatim)
//   FACTORS (each 0..1, weighted out of 100):
//     • resolution — absolute sharpness + the ≥1080p step (dominant: a still
//       is rendered frame-by-frame, so its pixels ARE the video's pixels)
//     • aspect — closeness to the 16:9 delivery target
//     • semantic — tag overlap with the scene's content words (Pixabay
//       carries tags; Pexels photo search does not — the factor is NEUTRAL
//       for tag-less candidates, never a penalty)
//   DUPLICATE POLICY — a photo already placed on another scene of this video
//     (same source:id) is not banned: it takes the fixed duplicate penalty so
//     every fresh candidate outranks it. A repeated still is more visible than
//     a repeated clip — the penalty bites harder, visibly, in the breakdown.
//
// imageRelevanceVerdict is the verifier's reducer (see stock-image.ts): ONE
// inspection per photo (a still has nothing to move), mapped:
//   score ≥ 8  → pass  (the inspector's own "clearly shows the subject" band)
//   score ≤ 3  → reject (the inspector's "unrelated subject" band — the
//               classic Pexels failure, caught before the photo ships)
//   otherwise  → null ("related but vague", inspector outage) → the photo is
//               KEPT but stamped "unverified" on the ref — fail-open, RECORDED,
//               never a silent pass. No motion test exists for a still.

import type { SceneImageIndexEntry, StockImageCandidate } from "./stock-image-index";
import { imageKey } from "./stock-image-index";

// ---------- ranking ----------

/** The factor weights (out of 100). Exported for the pins. */
export const RANK_IMAGE_WEIGHTS = {
  resolution: 40,
  aspect: 20,
  semantic: 40,
} as const;

/** The fixed score subtraction for a photo already used on another scene. */
export const DUPLICATE_IMAGE_PENALTY = 1000;

/** The relevance bands (the inspector's prompt names them: 8-10 clear,
 *  4-7 vague, 0-3 unrelated). A score inside the clear band passes; inside
 *  the unrelated band rejects; between them the photo stays, unverified. */
export const IMAGE_RELEVANCE_PASS_SCORE = 8;
export const IMAGE_RELEVANCE_REJECT_SCORE = 3;

/** The delivery target every story render composes into. */
const TARGET_ASPECT = 16 / 9;

export interface RankImageContext {
  /** `source:id` keys already placed on OTHER scenes of this video. */
  usedImageKeys: ReadonlySet<string>;
  /** The scene's content words (visual + narration) — the semantic factor. */
  sceneTerms: string[];
}

export interface RankedImageCandidate {
  entry: SceneImageIndexEntry;
  score: number;
  factors: {
    resolution: number;
    aspect: number;
    semantic: number;
    duplicatePenalty: number;
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The hard floors — a candidate that fails any rule is UNUSABLE, not merely weak. */
export function imageCandidateFloors(c: StockImageCandidate): string | null {
  if (!c.license) return "no license label";
  if (!c.id || !c.url) return "no stable id or download url";
  if (c.width < 1280 || c.height < 720) return "below 720p";
  if (c.width <= c.height) return "portrait";
  return null;
}

function imageResolutionFactor(c: StockImageCandidate): number {
  // 70% linear sharpness (capped at 4K) + 30% the ≥1080p step.
  return 0.7 * (Math.min(c.width, 3840) / 3840) + 0.3 * (c.width >= 1920 ? 1 : 0);
}

function imageAspectFactor(c: StockImageCandidate): number {
  const ratio = c.width / Math.max(c.height, 1);
  return clamp01(1 - Math.abs(ratio - TARGET_ASPECT) / TARGET_ASPECT);
}

/** Tag overlap with the scene's terms; NEUTRAL (0) when the source has no tags. */
export function imageSemanticFactor(c: StockImageCandidate, terms: string[]): number {
  if (!c.tags || c.tags.length === 0 || terms.length === 0) return 0;
  const wanted = new Set(terms.map((t) => t.toLowerCase()));
  const overlap = c.tags.filter((t) => wanted.has(t.toLowerCase())).length;
  return clamp01(overlap / 3); // 3+ shared terms = full marks
}

/**
 * Rank the image index for one scene. Deterministic: score desc, then image
 * key asc — the same index always produces the same walk order (reproducible
 * runs, pinnable).
 */
export function rankImageCandidates(
  entries: SceneImageIndexEntry[],
  ctx: RankImageContext
): RankedImageCandidate[] {
  const ranked: RankedImageCandidate[] = [];
  for (const entry of entries) {
    const c = entry.candidate;
    if (imageCandidateFloors(c) !== null) continue; // dropped, not down-ranked
    const factors = {
      resolution: imageResolutionFactor(c),
      aspect: imageAspectFactor(c),
      semantic: imageSemanticFactor(c, ctx.sceneTerms),
      duplicatePenalty: ctx.usedImageKeys.has(imageKey(c)) ? DUPLICATE_IMAGE_PENALTY : 0,
    };
    const score =
      RANK_IMAGE_WEIGHTS.resolution * factors.resolution +
      RANK_IMAGE_WEIGHTS.aspect * factors.aspect +
      RANK_IMAGE_WEIGHTS.semantic * factors.semantic -
      factors.duplicatePenalty;
    ranked.push({ entry, score, factors });
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score || imageKey(a.entry.candidate).localeCompare(imageKey(b.entry.candidate))
  );
  return ranked;
}

// ---------- the relevance-verdict reducer ----------

export interface ImageVerdict {
  pass: boolean | null; // true = pass, false = reject, null = keep-unverified
  reason: string;
}

/**
 * Map ONE inspection of ONE photo to the accept/reject/keep decision. The
 * bands are the inspector's own (see the constants above); a null score —
 * the inspector was unavailable, or returned garbage — never rejects.
 */
export function imageRelevanceVerdict(score: number | null): ImageVerdict {
  if (score == null || !Number.isFinite(score))
    return { pass: null, reason: "inspector unavailable — kept unverified" };
  if (score >= IMAGE_RELEVANCE_PASS_SCORE)
    return { pass: true, reason: `clearly the required content (score ${score})` };
  if (score <= IMAGE_RELEVANCE_REJECT_SCORE)
    return { pass: false, reason: `unrelated subject (score ${score})` };
  return {
    pass: null,
    reason: `related but vague (score ${score}) — kept unverified`,
  };
}

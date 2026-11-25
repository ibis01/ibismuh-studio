// The stock IMAGE lane — download + verify + attach real photos to scenes
// (stock-image-index.ts finds them, stock-image-ranker.ts orders them, this
// module moves the bytes). The still-image sibling of stock.ts.
//
// The law of the lane: a scene WITHOUT a matched b-roll clip still deserves a
// real visual. The engine searches the photo adapters with the scene's own
// query derivation, ranks the pool, downloads the best photo into the video
// dir as stockimg-XX.jpg, verifies it (decode + size floor + ONE relevance
// inspection), and attaches a `stockImage` ref the render's Ken Burns executor
// consumes when the AI art is missing. Art still wins when it exists — the
// photo covers the GAP (failed generation, no image provider, a re-roll that
// hasn't landed), it never repaints a scene the creator already approved.
//
// Never-silent (the S89 law, restated): the ref's verification record states
// exactly what was checked. verdict "pass" requires the inspector's clear
// band (score ≥ 8); a vague match, an inspector outage, or a failed decode is
// stamped "unverified" — visible, recorded, never claimed as clean.
//
// The relevance function is INJECTABLE (the stock-verify.ts precedent): the
// offline unit suite injects deterministic fakes; production wires
// quality.relevanceCheck.

import { execFile } from "child_process";
import { promisify } from "util";
import { db } from "./tenant-db";
import * as storage from "./storage";
import { safeFetch } from "./net-guard";
import { contentWords, sceneQueries } from "./stock-query";
import {
  buildSceneImageIndex,
  imageKey,
  type SceneImageIndexEntry,
} from "./stock-image-index";
import type { StockKeys } from "./stock-index";
import { imageRelevanceVerdict, rankImageCandidates } from "./stock-image-ranker";
import type { Scene, StockImageRef } from "./types";
import { log } from "./log";
import { commitSceneChanges, ensureSceneIdsInPlace } from "./scene-revisions";
import { parseTimeline } from "./timeline";
import { relevanceCheck } from "./quality";

const imageLog = log.child({ mod: "stock-image" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const execFileAsync = promisify(execFile);
const FFPROBE_TIMEOUT_MS = 15_000;
const FFPROBE_MAX_BUFFER = 2 * 1024 * 1024;

/** Where a scene's downloaded photo lives inside the video dir. */
export function stockImageFile(index: number): string {
  return `stockimg-${String(index).padStart(2, "0")}.jpg`;
}

// Transport bounds: a real landscape HD photo is hundreds of KB; an error
// page or thumbnail is not. The cap is generous for 4K originals but still
// bounds a misbehaving source.
const IMAGE_MIN_BYTES = 20_000;
const IMAGE_MAX_BYTES = 30 * 1024 * 1024;

/** ffprobe one image's real dimensions + codec (null when undecodable). */
export async function probeImage(
  imagePath: string
): Promise<{ width: number; height: number; codec: string } | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,codec_name",
        "-of", "json",
        imagePath,
      ],
      { timeout: FFPROBE_TIMEOUT_MS, maxBuffer: FFPROBE_MAX_BUFFER }
    );
    const stream = (JSON.parse(stdout)?.streams as
      | { width?: number; height?: number; codec_name?: string }[]
      | undefined)?.[0];
    if (!stream?.width || !stream?.height) return null;
    return { width: stream.width, height: stream.height, codec: stream.codec_name ?? "" };
  } catch {
    return null;
  }
}

/** The relevance gate seam (quality.relevanceCheck's shape). */
export type ImageRelevanceFn = (
  imagePath: string,
  context: string
) => Promise<{ pass: boolean | null; score: number | null; summary: string | null }>;

export interface ImageVerifyOutcome {
  pass: boolean | null; // false = reject (remove the file), null = keep-unverified
  score: number | null;
  summary: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Verify one DOWNLOADED photo for one scene. Never throws — every failure
 * degrades to the unverified outcome (pass:null), exactly like the footage
 * lane's fail-open-but-RECORDED gate. Order matters: decode FIRST (garbage
 * bytes never reach the inspector), relevance SECOND.
 */
export async function verifyImage(opts: {
  imagePath: string;
  scene: Scene;
  /** Production default: quality.relevanceCheck. Tests inject fakes. */
  relevance?: ImageRelevanceFn;
}): Promise<ImageVerifyOutcome> {
  const relevance = opts.relevance ?? relevanceCheck;

  // Gate 1 — decode: the bytes must be a real image, and its dimensions are
  // the truth that lands on the ref (the provider's metadata is advisory).
  const probe = await probeImage(opts.imagePath);
  if (!probe)
    return {
      pass: null,
      score: null,
      summary: "image could not be decoded — kept unverified",
      width: null,
      height: null,
    };

  // Gate 2 — relevance: ONE inspection (a still has nothing to move). The
  // reducer maps the score: ≥8 pass, ≤3 reject, between = keep-unverified.
  const context =
    `stock photo for scene ${opts.scene.index} "${opts.scene.title}" of a story video — ` +
    `the image must show: ${opts.scene.visual} ` +
    `(mood: ${opts.scene.mood}; narration at this moment: "${opts.scene.narration.slice(0, 140)}")`;
  let score: number | null = null;
  let summary: string | null = null;
  try {
    const v = await relevance(opts.imagePath, context);
    score = v.score;
    summary = v.summary;
  } catch {
    /* one gate failure never rejects the photo */
  }
  const verdict = imageRelevanceVerdict(score);
  return {
    pass: verdict.pass,
    score,
    summary: verdict.pass === null && score == null ? verdict.reason : (summary ?? verdict.reason),
    width: probe.width,
    height: probe.height,
  };
}

/** Download + size-floor one photo into the video dir. */
async function downloadImage(videoId: string, sceneIndex: number, url: string): Promise<boolean> {
  // Guarded transport: photo CDN URLs are provider-returned (a compromised
  // or malicious provider response could point anywhere) — validate the
  // destination, cap the bytes, bound the time (the clip lane's law).
  try {
    const res = await safeFetch(url, {
      timeoutMs: 60_000,
      maxBytes: IMAGE_MAX_BYTES,
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < IMAGE_MIN_BYTES) return false;
    // Storage seam (T-3.7): the photo persists through the driver (quota + s3).
    await storage.put(`${videoId}/${stockImageFile(sceneIndex)}`, buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find + download the best stock photo for one scene: index every query's
 * candidates, rank the pool, then walk the top 3 — downloaded photos must
 * survive the decode + relevance gates. Returns null when nothing fits
 * (the scene simply keeps its generated art or gradient board — never an
 * error). Skipped candidates are removed from the disk before the walk moves
 * on: a rejected photo never lingers.
 */
async function fetchImageForScene(
  videoId: string,
  scene: Scene,
  keys: StockKeys,
  queries: string[],
  usedImageKeys: ReadonlySet<string>
): Promise<StockImageRef | null> {
  const sceneTerms = contentWords(`${scene.visual} ${scene.narration}`, 8);

  let entries: SceneImageIndexEntry[] = [];
  try {
    entries = await buildSceneImageIndex({ queries, keys });
  } catch (err) {
    // Config errors surface on the first scene; per-scene they just mean
    // "no match this round" (the footage lane's semantics, kept).
    if (err instanceof Error && /No stock provider/.test(err.message)) throw err;
    return null;
  }

  const ranked = rankImageCandidates(entries, { usedImageKeys, sceneTerms });

  for (const { entry } of ranked.slice(0, 3)) {
    const photo = entry.candidate;
    try {
      const ok = await downloadImage(videoId, scene.index, photo.url);
      if (!ok) continue;
      const verdict = await storage.withLocalFile(
        `${videoId}/${stockImageFile(scene.index)}`,
        (p) => verifyImage({ imagePath: p, scene })
      );
      if (verdict.pass === false) {
        await storage.remove(`${videoId}/${stockImageFile(scene.index)}`);
        imageLog.warn("photo rejected", {
          scene: scene.index,
          reason: verdict.summary,
          score: verdict.score,
        });
        continue;
      }
      return {
        source: photo.source,
        file: stockImageFile(scene.index),
        query: entry.matchedQueries[0] ?? queries[0] ?? "",
        credit: `Photo by ${photo.author} (${photo.source === "pexels" ? "Pexels" : "Pixabay"})`,
        pageUrl: photo.pageUrl,
        license: photo.license,
        providerId: photo.id,
        width: verdict.width ?? photo.width,
        height: verdict.height ?? photo.height,
        verification: {
          // The never-silent law: only the inspector's clear band makes
          // "pass"; a fail-open accept is stamped unverified, visibly.
          verdict: verdict.pass === true ? "pass" : "unverified",
          score: verdict.score,
          summary: verdict.summary,
        },
      };
    } catch (err) {
      imageLog.warn("download failed for scene", {
        scene: scene.index,
        err: err instanceof Error ? err.message : err,
      });
    }
  }
  return null;
}

export async function readSceneStockImage(videoId: string, index: number): Promise<Buffer | null> {
  if (!Number.isInteger(index) || index < 1 || index > 99) return null;
  const key = `${videoId}/${stockImageFile(index)}`;
  if (!(await storage.exists(key))) return null;
  return storage.get(key);
}

// ---------- orchestration ----------

export interface StockImageRunResult {
  matched: number; // scenes that got (or already had) a photo
  fetched: number; // photos downloaded this run
  skipped: number; // scenes covered by a clip or left with their generated art
}

/**
 * Fetch stock photos for every scene that still needs one (or all scenes
 * when `force`). The keys ride in from the caller (the footage run's second
 * pass already resolved them; a standalone caller reads them first) — the
 * lane never decrypts credentials itself, and never imports the footage
 * module (the one-way seam keeps the two lanes decoupled). A scene with a
 * matched b-roll CLIP is never a photo target (the clip plays; the photo
 * would never be seen), and a scene that already carries a photo keeps it
 * unless `force` (re-search, replace) or `onlyScene` (the single-scene
 * refetch) says otherwise. Progress persists scene-by-scene, so an
 * interrupted run resumes where it stopped — the footage lane's
 * crash-resumable law, kept.
 */
export async function fetchImagesForScenes(opts: {
  videoId: string;
  scenes: Scene[];
  /** The decrypted provider keys (readStockKeys, resolved by the caller). */
  keys: StockKeys;
  force?: boolean;
  shouldCancel?: () => boolean;
  onProgress?: (done: number, total: number, label: string) => void;
  /** Per-scene override — the single-scene refetch. */
  onlyScene?: number;
  /** Search with the user's exact words instead of the scene-derived
   *  queries (the per-scene re-pick's semantics). No fallbacks: an override
   *  that finds nothing is an honest no-match. */
  queryOverride?: string;
}): Promise<StockImageRunResult> {
  const keys = opts.keys;

  let matched = 0;
  let fetched = 0;

  ensureSceneIdsInPlace(opts.scenes);
  const video = await db.video.findUnique({ where: { id: opts.videoId } });
  const beforeDoc = video ? parseTimeline(video.timeline) : null;
  let prevScenes = JSON.parse(JSON.stringify(opts.scenes)) as Scene[];

  // The duplicate ledger: every placed photo's key (legacy refs without
  // providerId contribute nothing — recorded, not guessed), joined by every
  // ref this run accepts.
  const usedImageKeys = new Set<string>();
  for (const s of opts.scenes)
    if (s.stockImage?.providerId)
      usedImageKeys.add(imageKey({ source: s.stockImage.source, id: s.stockImage.providerId }));

  const targets = opts.scenes.filter((scene) => {
    if (scene.stock) return false; // the clip plays — the photo would never be seen
    if (opts.onlyScene != null && scene.index !== opts.onlyScene) return false;
    if (!opts.force) return scene.stockImage == null; // keep the existing photo
    return true; // force re-searches every unclipped scene
  });

  for (const [i, scene] of targets.entries()) {
    if (opts.shouldCancel?.()) throw new Error("__CANCELLED__");
    opts.onProgress?.(
      i,
      targets.length,
      `Searching photos for scene ${scene.index} (${i + 1}/${targets.length})`
    );

    const ref = await fetchImageForScene(
      opts.videoId,
      scene,
      keys,
      opts.queryOverride ? [opts.queryOverride] : sceneQueries(scene),
      usedImageKeys
    );
    opts.onProgress?.(
      i + 1,
      targets.length,
      ref ? `Scene ${scene.index} photo matched` : `Scene ${scene.index} — no photo found`
    );

    if (ref) {
      scene.stockImage = ref;
      if (ref.providerId)
        usedImageKeys.add(imageKey({ source: ref.source, id: ref.providerId }));
      matched++;
      fetched++;
    } else if (opts.force || opts.onlyScene != null) {
      // A forced refetch that finds nothing clears the stale ref so the
      // badge doesn't claim a photo that was replaced/removed.
      scene.stockImage = undefined;
    }

    // Persist incrementally so a crash mid-run keeps finished scenes (each
    // incremental persist IS the revision commit — the footage lane's law).
    if (video) {
      await commitSceneChanges({
        video,
        beforeScenes: prevScenes,
        beforeDoc,
        afterScenes: opts.scenes,
        afterDoc: beforeDoc,
        kind: "edit",
        origin: "stock-image",
      });
      prevScenes = JSON.parse(JSON.stringify(opts.scenes)) as Scene[];
    } else {
      await db.video.update({
        where: { id: opts.videoId },
        data: { scenes: JSON.stringify(opts.scenes) },
      });
    }
    if (i < targets.length - 1) await sleep(1200); // pace both free APIs
  }

  const clipCovered = opts.scenes.filter((s) => s.stock).length;
  return {
    matched,
    fetched,
    skipped: Math.max(opts.scenes.length - clipCovered - matched, 0),
  };
}

/**
 * Remove every stock photo + ref (clips and storyboard art stay untouched).
 * The clear is a scene-content change per cleared scene — it lands as
 * revisions (origin "stock-image-clear") in the same transaction as the row
 * write, with the pre-clear state snapshotted BEFORE the loop mutates.
 */
export async function clearStockImages(videoId: string, scenes: Scene[]): Promise<number> {
  const beforeScenes = JSON.parse(JSON.stringify(scenes)) as Scene[];
  ensureSceneIdsInPlace(scenes);
  const video = await db.video.findUnique({ where: { id: videoId } });
  let cleared = 0;
  for (const scene of scenes) {
    if (scene.stockImage) {
      scene.stockImage = undefined;
      cleared++;
    }
    await storage.remove(`${videoId}/${stockImageFile(scene.index)}`).catch(() => {});
  }
  if (cleared > 0) {
    if (video) {
      await commitSceneChanges({
        video,
        beforeScenes,
        beforeDoc: parseTimeline(video.timeline),
        afterScenes: scenes,
        afterDoc: parseTimeline(video.timeline),
        kind: "edit",
        origin: "stock-image-clear",
      });
    } else {
      await db.video.update({
        where: { id: videoId },
        data: { scenes: JSON.stringify(scenes) },
      });
    }
  }
  return cleared;
}

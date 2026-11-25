// stage-cache.ts — THE STAGE FINGERPRINT CACHE (P3).
//
// The plan's third priority: "repairable scene-level rendering with stage
// fingerprints". Before this module, re-rendering a video recomputed EVERY
// scene from scratch even when one scene (or only the captions) changed —
// the render idempotency key (render:<id>:<updatedAt>) deduped *requests*,
// never *work*. A one-scene repair paid the full compositor bill again.
//
// THE LAW: a rendered artifact is reusable exactly when a fingerprint over
// ALL of its deterministic inputs is unchanged. The fingerprint covers the
// scene content, the art identity, the motion plan, the measured narration
// length, the creative layer (grade/title/chroma/pip/fades/levels), the
// sound picks, the geometry (aspect/fps) and a cache schema version. ANY
// change to anything the pixels depend on changes the fingerprint; nothing
// else does. A caption-only edit re-uses the segment (captions ride the
// document-level pass); a camera-only edit re-uses it; an art re-take or a
// narration re-cut invalidates exactly the scenes they touch.
//
// Failure posture: the cache is always advisory. A read miss or a write
// failure degrades to the plain render path (logged, never thrown) — the
// cache can make a render cheaper, never wronger: a stale hit is impossible
// because the key IS the content hash of the inputs.

import { createHash } from "crypto";
import { stat, copyFile as fspCopyFile, rm as fspRm } from "fs/promises";
import * as storage from "./storage";
import { log } from "./log";

const stageCacheLog = log.child({ mod: "stage-cache" });

/** Cache schema version — bump ONLY when the segment builder's meaning of
 *  an existing input changes shape (a new input must join the fingerprint
 *  instead). Old entries become unreachable, not wrong. */
export const STAGE_CACHE_SCHEMA = 1;

/** Deterministic JSON: keys sorted recursively so field order never
 *  changes a fingerprint. Non-JSON values (functions/undefined) drop, the
 *  same way they would in a payload round-trip. */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === null) return null;
    const t = typeof v;
    if (t === "number") return Number.isFinite(v) ? v : String(v);
    if (t !== "object") return v;
    if (Array.isArray(v)) return v.map(walk);
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      const child = obj[k];
      if (child === undefined) continue;
      out[k] = walk(child);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

/** The stage fingerprint: sha256 over the canonical form of every input the
 *  stage consumed. Same inputs in, same hex out — across processes, boots
 *  and hosts. */
export function stageFingerprint(parts: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson({ schema: STAGE_CACHE_SCHEMA, ...parts })).digest("hex");
}

/** Kill switch (default ON). `IBISMUH_STUDIO_SCENE_CACHE=0` returns the
 *  pre-P3 byte path: every scene rebuilds. */
export function sceneCacheEnabled(): boolean {
  return process.env.IBISMUH_STUDIO_SCENE_CACHE !== "0";
}

/** Storage key for a rendered compositor segment. Per-video prefix mirrors
 *  the uploads layout law (every non-system key lives under its video). */
export function sceneCacheKey(videoId: string, fingerprint: string): string {
  return `${videoId}/scene-cache/${fingerprint}.mp4`;
}

/** Cheap content identity for a local file: size + mtime. A re-taken art or
 *  a re-cut narration produces a new file → a new identity → a new
 *  fingerprint. (Byte hashing the WAVs on every render would re-read the
 *  whole narration; identity is the honest cheap proxy the art pipeline's
 *  write-once storage makes safe.) */
export async function fileIdentity(path: string): Promise<string> {
  try {
    const st = await stat(path);
    return `${st.size}:${String(st.mtimeMs)}`;
  } catch {
    return "missing";
  }
}

/** Materialize a cached segment for reuse, or null on any miss/failure. */
export async function getCachedSceneSegment(
  videoId: string,
  fingerprint: string
): Promise<string | null> {
  if (!sceneCacheEnabled()) return null;
  try {
    const key = sceneCacheKey(videoId, fingerprint);
    if (!(await storage.exists(key))) return null;
    return await storage.materialize(key);
  } catch (err) {
    stageCacheLog.warn("scene cache read failed — rendering instead", {
      err: String(err).slice(0, 160),
    });
    return null;
  }
}

/**
 * Store a freshly rendered segment WITHOUT consuming it. putFromPath's
 * local driver is copy-then-RM (the move keeps uploads tidy for artifacts
 * whose source is scratch) — handing it the live segment would delete the
 * file the running render is about to stitch. The segment is copied to a
 * staging file first; the PUT consumes the staging copy and the real
 * segment stays exactly where the compositor expects it. Best-effort: any
 * failure degrades to "next render recomputes".
 */
export async function putCachedSceneSegment(
  videoId: string,
  fingerprint: string,
  localPath: string
): Promise<void> {
  if (!sceneCacheEnabled()) return;
  const staging = `${localPath}.cachetmp`;
  try {
    await fspCopyFile(localPath, staging);
  } catch (err) {
    stageCacheLog.warn("scene cache staging copy failed", {
      err: String(err).slice(0, 160),
    });
    return;
  }
  try {
    await storage.putFromPath(sceneCacheKey(videoId, fingerprint), staging);
  } catch (err) {
    stageCacheLog.warn("scene cache store failed — next render recomputes", {
      err: String(err).slice(0, 160),
    });
  } finally {
    await fspRm(staging, { force: true });
  }
}

/** Evict every cached segment for a video (scene re-takes that want a
 *  cold rebuild; the artifacts sweep's companion). Returns the driver's
 *  removed measure (bytes on the local driver, object count on s3). */
export async function evictSceneCache(videoId: string): Promise<number> {
  try {
    return await storage.removePrefix(`${videoId}/scene-cache/`);
  } catch {
    return 0;
  }
}

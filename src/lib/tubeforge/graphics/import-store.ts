// S126 — the external import lane's STORE (the whiteboard asset-store's
// shape, mirrored — the manifest row + the storage objects). The ONE seam
// every consumer uses: the import route (writes), the render job (resolves
// sprite bytes for the compose ctx), the editor's resolve endpoint, and the
// delete route (reference-guarded at the caller). The manifest row is the
// truth about WHAT was admitted; the objects are the bytes the gates
// verified.
//
// Quota (gate 6 — the ONE quota surface): per-video + per-org COUNT walls
// through the manifest queries; per-org BYTES ride storage.put's
// assertQuota (every non-system put passes it).
import { db } from "@/lib/tubeforge/tenant-db";
import { get, put, remove } from "@/lib/tubeforge/storage";
import { IMPORT_WALLS } from "./import-validate";

/** The storage key layout — one prefix per import. */
export function graphicsImportKey(videoId: string, importId: string, file: string): string {
  return `${videoId}/graphics/imports/${importId}/${file}`;
}

export interface GraphicsImportRow {
  id: string;
  organizationId: string;
  videoId: string;
  importId: string;
  layout: "sheet" | "sequence";
  mime: string;
  frames: number;
  fps: number;
  frameW: number;
  frameH: number;
  bytes: number;
  source: string | null;
  license: string | null;
  uploadedBy: string;
  createdAt: Date;
}

/** The manifest rows for one video (oldest first). */
export async function listVideoImports(videoId: string): Promise<GraphicsImportRow[]> {
  const rows = await db.graphicsImport.findMany({
    where: { videoId },
    orderBy: { createdAt: "asc" },
  });
  return rows as GraphicsImportRow[];
}

/** Gate 6 — the ONE quota surface's count half (bytes ride put). */
export async function importCountWalls(
  organizationId: string,
  videoId: string
): Promise<{ videoCount: number; orgCount: number; videoCap: number; orgCap: number }> {
  const [videoCount, orgCount] = await Promise.all([
    db.graphicsImport.count({ where: { videoId } }),
    db.graphicsImport.count({ where: { organizationId } }),
  ]);
  return { videoCount, orgCount, videoCap: IMPORT_WALLS.importsPerVideo, orgCap: IMPORT_WALLS.importsPerOrg };
}

/** The row's storage object names in frame order: sheet → ["sheet.png"];
 *  sequence → ["f0000.png", …]. */
export function importObjectNames(row: Pick<GraphicsImportRow, "layout" | "frames">): string[] {
  if (row.layout === "sheet") return ["sheet.png"];
  return Array.from({ length: row.frames }, (_, i) => `f${String(i).padStart(4, "0")}.png`);
}

/** Store the verified bytes + write the manifest row (gates 6–7; the caller
 *  has run gates 1–5 and the count walls). storage.put enforces the per-org
 *  BYTE quota. */
export async function saveImport(
  video: { id: string; organizationId: string },
  data: {
    importId: string;
    layout: "sheet" | "sequence";
    mime: string;
    frames: number;
    fps: number;
    frameW: number;
    frameH: number;
    source: string | null;
    license: string | null;
  },
  files: { name: string; bytes: Buffer }[],
  uploadedBy: string
): Promise<GraphicsImportRow> {
  let total = 0;
  for (const f of files) {
    await put(graphicsImportKey(video.id, data.importId, f.name), f.bytes);
    total += f.bytes.length;
  }
  return db.graphicsImport.create({
    data: {
      organizationId: video.organizationId,
      videoId: video.id,
      importId: data.importId,
      layout: data.layout,
      mime: data.mime,
      frames: data.frames,
      fps: data.fps,
      frameW: data.frameW,
      frameH: data.frameH,
      bytes: total,
      source: data.source,
      license: data.license,
      uploadedBy,
    },
  }) as Promise<GraphicsImportRow>;
}

/** Delete one import (manifest row + objects). Returns false when the
 *  importId has no row on this video. The route guards doc references
 *  BEFORE calling this — deleting a referenced import would fail-closed the
 *  next render (honest, but avoidable). */
export async function deleteVideoImport(videoId: string, importId: string): Promise<boolean> {
  const row = await db.graphicsImport.findUnique({
    where: { videoId_importId: { videoId, importId } },
  });
  if (!row) return false;
  await db.graphicsImport.delete({ where: { id: row.id } });
  for (const name of importObjectNames(row as GraphicsImportRow)) {
    await remove(graphicsImportKey(videoId, importId, name)).catch(() => {});
  }
  return true;
}

/** THE ONE RESOLUTION SEAM: the sprite asset map for a doc's render/compose
 *  ctx — assetKey → data URIs (sheet = [strip], sequence = [f0..fN]),
 *  built from THIS store. Only the keys the doc REFERENCES are resolved
 *  (an unreferenced import costs nothing). A vanished object records the
 *  key as missing (the render refuses fail-closed — the QC lens's
 *  enforcement half). */
export async function resolveSpriteAssets(
  videoId: string,
  referencedKeys: Iterable<string>
): Promise<{ assets: Map<string, string[]>; missing: string[] }> {
  const keys = [...new Set(referencedKeys)];
  const assets = new Map<string, string[]>();
  const missing: string[] = [];
  if (keys.length === 0) return { assets, missing };
  const rows = await listVideoImports(videoId);
  const byId = new Map(rows.map((r) => [r.importId, r]));
  for (const key of keys) {
    const row = byId.get(key);
    if (!row) {
      missing.push(key);
      continue;
    }
    const names = importObjectNames(row);
    const uris: string[] = [];
    let allPresent = true;
    for (const name of names) {
      try {
        const buf = await get(graphicsImportKey(videoId, row.importId, name));
        uris.push(`data:${row.mime};base64,${buf.toString("base64")}`);
      } catch {
        allPresent = false;
        break;
      }
    }
    if (!allPresent) {
      missing.push(key);
      continue;
    }
    assets.set(key, uris);
  }
  return { assets, missing };
}

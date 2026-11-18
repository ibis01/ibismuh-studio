// S126 — the external import lane's STORE (the whiteboard asset-store's
// shape, mirrored — the manifest row + the storage objects). The ONE seam
// every consumer uses: the import route (writes), the render job (resolves
// sprite bytes for the compose ctx), the editor's resolve endpoint, and the
// delete route (reference-guarded at the caller). The manifest row is the
// truth about WHAT was admitted; the objects are the bytes the gates
// verified.
//
// Quota (gate 6 — the ONE quota surface): per-video + per-org COUNT walls
// ride THE ADMISSION TRANSACTION inside saveImport (S140 — the audit's F2:
// the old flow counted in the route, then saved later — two concurrent
// imports both passed the cap, the read-check-write-write race S101 already
// killed for BYTES); per-org BYTES ride storage.put's assertQuota (every
// non-system put passes it).
//
// S140 — the audit's F1: the old saveImport put files one by one and THEN
// wrote the row — a put failure or a row failure orphaned every byte already
// written (invisible quota consumption, un-leakable through any surface).
// saveImport is now the atomic admission wall: the bytes land first with a
// COMPENSATION SWEEP on any failure path (nothing is admitted unless the
// manifest row committed), and the count wall + the row create are ONE
// serialized transaction.
import { Prisma } from "@prisma/client";
import { db, rawDatabase } from "@/lib/ibismuh/tenant-db";
import { get, put, removePrefix } from "@/lib/ibismuh/storage";
import { IMPORT_WALLS } from "./import-validate";

/** The count-wall refusal — the AUTHORITATIVE gate 6 thrown from inside
 *  saveImport's admission transaction (the route maps it to 409). Distinct
 *  from the route's fast pre-check so a caller can tell "the wall refused
 *  the admission" from "the pre-check bounced it for UX". */
export class ImportCountRefusal extends Error {
  constructor(
    readonly scope: "video" | "org",
    readonly count: number,
    readonly cap: number
  ) {
    super(
      scope === "video"
        ? `This video already carries ${count} graphics imports (cap ${cap}) — delete one first`
        : `This organization already carries ${count} graphics imports (cap ${cap})`
    );
    this.name = "ImportCountRefusal";
  }
}

/** THE ADMISSION GATE — the S140 drill's hard finding: three CONCURRENT
 *  interactive transactions deadlock Prisma's SQLite connector until the
 *  transaction budget expires (the drill measured it: serial admissions run
 *  3-6ms, a wave of two is fine, a wave of three stalls the full budget and
 *  dies P2028/P1008). Racers therefore serialize HERE — in-process, in
 *  arrival order, only the transaction-sized critical section — so the
 *  engine sees ONE admission transaction at a time. The DB transaction
 *  stays the correctness anchor: within a process this gate orders the
 *  racers; across processes (Postgres) Serializable refuses the loser by
 *  conflict. Imports are rare user uploads; the queue never builds. */
let admissionQueue: Promise<unknown> = Promise.resolve();
function enqueueAdmission<T>(fn: () => Promise<T>): Promise<T> {
  const run = admissionQueue.then(fn, fn);
  admissionQueue = run.catch(() => {});
  return run;
}

/** The S101 admission pattern, mirrored for the count half of gate 6:
 *  Serializable on Postgres (P2034 → retry against the winner's committed
 *  rows, storage-quota.ts's law); SQLite runs the default isolation — the
 *  engine serializes interactive transactions (BEGIN IMMEDIATE) and the
 *  S136 contention floor (busy_timeout=10000 + WAL) makes racers wait
 *  politely instead of failing. The loser's count, taken INSIDE its own
 *  transaction, sees the winner's committed row and refuses.
 *
 *  The transaction rides rawDatabase — the SAME posture as storage-quota's
 *  admission tx: scripts and routes land here only after the route's
 *  tenant-scoped video lookup already proved video.organizationId IS the
 *  acting tenant, so the counts see exactly the org's own rows. */
async function importAdmissionTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const serializable = !`${process.env.DATABASE_URL ?? ""}`.startsWith("file:");
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await rawDatabase.$transaction(fn, {
        // The S135 budget law — the drill found this the hard way: under
        // contention a racer's BEGIN IMMEDIATE waits on the writer lock
        // (busy_timeout's 10s floor) and Prisma's default 5s transaction
        // budget expired the txn MID-CALLBACK. Contended waits must resolve
        // INSIDE the transaction's lifetime.
        timeout: 60_000,
        maxWait: 15_000,
        ...(serializable ? { isolationLevel: "Serializable" as const } : {}),
      });
    } catch (err) {
      // P2034 — the transaction conflict Serializable exists to produce.
      if ((err as { code?: string })?.code === "P2034" && attempt < 4) {
        await new Promise((r) => setTimeout(r, 25 * attempt));
        continue;
      }
      throw err;
    }
  }
}

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

/** The atomic admission wall (gates 6–7 — S140): the bytes land first
 *  (storage.put runs the S101 byte-quota admission), then the COUNT wall and
 *  the manifest row are ONE serialized transaction. On ANY failure path the
 *  compensation sweep removes every byte under this importId — the lane
 *  never leaves orphaned objects without a manifest row (the audit's F1).
 *  The route may still run its fast pre-check for UX; THIS is the wall the
 *  audit asked for. */
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
  // Fail-closed BEFORE any storage touch: the compensation sweep runs on the
  // import prefix, so an empty or traversal-shaped importId would aim the
  // sweep at the video prefix (it would delete OTHER imports). The route's
  // minted-id gate guarantees the shape — this is the belt to its suspenders.
  if (!data.importId || data.importId.includes("/")) {
    throw new Error("saveImport: importId must be a non-empty single path segment");
  }
  const prefix = graphicsImportKey(video.id, data.importId, "");
  try {
    let total = 0;
    for (const f of files) {
      await put(graphicsImportKey(video.id, data.importId, f.name), f.bytes);
      total += f.bytes.length;
    }
    // THE ADMISSION TRANSACTION (F2): count walls + manifest create, one
    // serialized unit — through the in-process gate (the drill's deadlock
    // finding) with the Serializable + retry law beneath it for cross-
    // process racers. Concurrent imports cannot both pass: the loser counts
    // the winner's committed row.
    const row = await enqueueAdmission(() =>
      importAdmissionTx(async (tx) => {
        const videoCount = await tx.graphicsImport.count({ where: { videoId: video.id } });
        if (videoCount >= IMPORT_WALLS.importsPerVideo) {
          throw new ImportCountRefusal("video", videoCount, IMPORT_WALLS.importsPerVideo);
        }
        const orgCount = await tx.graphicsImport.count({ where: { organizationId: video.organizationId } });
        if (orgCount >= IMPORT_WALLS.importsPerOrg) {
          throw new ImportCountRefusal("org", orgCount, IMPORT_WALLS.importsPerOrg);
        }
        return tx.graphicsImport.create({
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
        });
      })
    );
    return row as GraphicsImportRow;
  } catch (err) {
    // THE COMPENSATION LAW: nothing is admitted unless the row committed.
    // Every byte under THIS importId dies with the attempt (the byte holds
    // release through removePrefix's usage accounting). Best-effort — a sweep
    // that itself fails still surfaces the ORIGINAL error honestly.
    await removePrefix(prefix).catch(() => {});
    throw err;
  }
}

/** Delete one import (manifest row + objects). Returns false when the
 *  importId has no row on this video. The route guards doc references
 *  BEFORE calling this — deleting a referenced import would fail-closed the
 *  next render (honest, but avoidable).
 *
 *  S140 — the sweep is removePrefix, not a per-object loop: it takes the
 *  WHOLE import directory (any stray bytes die too — the delete twin of
 *  saveImport's compensation law) and releases the byte holds through
 *  usage accounting. Row-first: a failed sweep orphans bytes — a leak,
 *  never a fail-closed render (resolution runs through the row). */
export async function deleteVideoImport(videoId: string, importId: string): Promise<boolean> {
  const row = await db.graphicsImport.findUnique({
    where: { videoId_importId: { videoId, importId } },
  });
  if (!row) return false;
  await db.graphicsImport.delete({ where: { id: row.id } });
  await removePrefix(graphicsImportKey(videoId, importId, "")).catch(() => {});
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

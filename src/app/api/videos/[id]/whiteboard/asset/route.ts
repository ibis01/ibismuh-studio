import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/tubeforge/tenant-db";
import { requireUser } from "@/lib/tubeforge/tenant";
import { StorageQuotaError } from "@/lib/tubeforge/storage";
import { loadLibrary } from "@/lib/tubeforge/whiteboard/assets";
import { parseWhiteboardDoc } from "@/lib/tubeforge/whiteboard/whiteboard-planner";
import { probeAssetRasterization } from "@/lib/tubeforge/whiteboard/render";
import {
  RasterTraceError,
  WB_TRACE_MAX_BYTES,
  WB_TRACE_MAX_DIM,
  WB_TRACE_MIN_DIM,
  sniffRasterKind,
  traceRasterToSvgDoc,
} from "@/lib/tubeforge/whiteboard/raster-trace";
import { WB_UPLOAD_MAX_BYTES, validateUploadedSvg } from "@/lib/tubeforge/whiteboard/upload";
import {
  deleteVideoUpload,
  listVideoUploads,
  saveVideoUpload,
  uploadCountWalls,
  whiteboardAssetKey,
} from "@/lib/tubeforge/whiteboard/asset-store";
import { get } from "@/lib/tubeforge/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * S151 — decode an uploaded raster to the RGB buffer the tracer consumes:
 * EXIF-oriented, alpha flattened over white, sRGB, downscaled to the
 * tracer's 1280px long-side ceiling when above it (the decode cost and the
 * skeletonization work are both bounded by the pixel count).
 */
async function decodeRasterForTrace(
  raw: Buffer
): Promise<{ rgb: Uint8Array; w: number; h: number }> {
  const base = sharp(raw, { failOn: "error", limitInputPixels: 33554432 });
  const meta = await base.metadata();
  const mw = meta.width ?? 0;
  const mh = meta.height ?? 0;
  if (mw < WB_TRACE_MIN_DIM || mh < WB_TRACE_MIN_DIM)
    throw new RasterTraceError(
      "empty",
      `the image is ${mw}×${mh} — tracing needs at least ${WB_TRACE_MIN_DIM}px on each axis`
    );
  let w = mw;
  let h = mh;
  let pipe = sharp(raw, { failOn: "error", limitInputPixels: 33554432 })
    .rotate() // EXIF orientation
    .flatten({ background: "#ffffff" }) // alpha compositing onto paper white
    .toColourspace("srgb");
  if (Math.max(w, h) > WB_TRACE_MAX_DIM) {
    const scale = WB_TRACE_MAX_DIM / Math.max(w, h);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    pipe = pipe.resize(w, h, { fit: "fill", kernel: "lanczos3" });
  }
  const { data, info } = await pipe.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3 || info.width !== w || info.height !== h)
    throw new RasterTraceError(
      "empty",
      `the decoder produced ${info.width}×${info.height}×${info.channels} — expected ${w}×${h}×3 (RGB)`
    );
  return { rgb: new Uint8Array(data.buffer, data.byteOffset, data.length), w, h };
}

/**
 * S69 — the Whiteboard Engine's upload path (E9 Phase C / E11 §7), the
 * seven gates IN ORDER, each naming its unit-pinned sibling:
 *
 *   1. Transport  — multipart POST, 256 KB raw byte cap for SVG / 8 MB
 *                  for rasters (413 over).
 *   2. Sniff      — UTF-8 + single root <svg> + usable viewBox
 *                  (upload.ts); PNG/JPEG/WebP by magic bytes, traced to
 *                  stroke geometry by the S151 sketch-trace pass first
 *                  (raster-trace.ts — sharp decode → deterministic trace
 *                  → an SVG DOCUMENT that rides gates 2–5 UNCHANGED).
 *   3. Sanitize   — sanitizeSvg, the S64 attack battery (upload.ts).
 *   4. Budget     — 512/path, 2,048/asset commands, zero extractAsset
 *                  rejections — with the reasons (upload.ts); the tracer
 *                  fits its output inside these walls by construction.
 *   5. Rasterize-before-trust — the SAME network-aborted chromium the
 *                  renderer uses, ~5 s wall clock (render.ts).
 *   6. Quota      — per-org asset counts here; per-org BYTES through
 *                  storage.put's assertQuota (asset-store.ts).
 *   7. Storage    — <videoId>/whiteboard/assets/<assetId>.svg (the
 *                  SANITIZED fragment) + the manifest row with provenance.
 *                  A traced upload stores the TRACED SVG, never the raster.
 *
 * DELETE — removes one upload, refusing (409, with the scene list) while
 * the current project still references the asset: deleting a placed asset
 * would have the next save read "unknown asset" and the GET quietly fall
 * back to "no project" — a brick the user cannot see coming.
 *
 * What is stored is the sanitized FRAGMENT, never the raw document: the
 * pipeline neutralizes rather than punishes (a file whose script subtree
 * gets stripped still uploads — the palette preview shows exactly what
 * survived), and nothing that failed a gate is ever persisted.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter();

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (video.format !== "story")
    return NextResponse.json({ error: "Not a scene-based video" }, { status: 400 });

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data"))
    return NextResponse.json(
      { error: "Send the SVG or image (PNG/JPEG/WebP) as multipart/form-data with a 'file' field" },
      { status: 400 }
    );
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "Attach an SVG or image file in the 'file' field" }, { status: 400 });
  const raw = Buffer.from(await file.arrayBuffer());

  // Gate 1 — the transport wall, type-aware (headers can lie about size;
  // the parsed File is the truth the music-upload precedent checks too).
  const rasterKind = sniffRasterKind(raw);
  const byteCap = rasterKind ? WB_TRACE_MAX_BYTES : WB_UPLOAD_MAX_BYTES;
  const kindLabel = rasterKind ? "image" : "SVG";
  if (raw.length > byteCap)
    return NextResponse.json(
      { error: `The ${kindLabel} is ${Math.round(raw.length / 1024)} KB — the upload cap is ${byteCap / 1024} KB` },
      { status: 413 }
    );

  // S151 — the sketch-trace branch: a raster is decoded and traced into an
  // SVG DOCUMENT first; every gate below then applies UNCHANGED. What is
  // stored is the traced stroke geometry, never the raster bytes.
  let uploadBuf = raw;
  let traceStats: { strokes: number; fills: number; tolerance: number } | null = null;
  if (rasterKind) {
    try {
      const decoded = await decodeRasterForTrace(raw);
      const traced = traceRasterToSvgDoc(decoded.rgb, decoded.w, decoded.h);
      uploadBuf = Buffer.from(traced.svg, "utf-8");
      traceStats = { strokes: traced.stats.strokes, fills: traced.stats.fills, tolerance: traced.stats.tolerance };
    } catch (err) {
      if (err instanceof RasterTraceError)
        return NextResponse.json({ error: err.message }, { status: 400 });
      const msg = err instanceof Error ? err.message : "unknown decode failure";
      return NextResponse.json(
        { error: `The image could not be decoded for tracing: ${msg}` },
        { status: 400 }
      );
    }
  }

  // Gates 2–4 — the pure battery (sniff, sanitize, budgets), with the id
  // collision wall the route owns: built-ins + this video's existing rows.
  const reserved = new Set(loadLibrary().assets.keys());
  for (const row of await listVideoUploads(id)) reserved.add(row.assetId);
  const v = validateUploadedSvg(uploadBuf, file.name || "upload.svg", reserved);
  if (!v.ok)
    return NextResponse.json({ error: "The upload failed the gates", errors: v.errors }, { status: 400 });

  // Gate 5 — rasterize-before-trust (the SAME renderer, network-aborted).
  const probe = await probeAssetRasterization(v.asset);
  if (!probe.ok)
    return NextResponse.json({ error: probe.error ?? "The SVG failed the raster probe" }, { status: 400 });

  // Gate 6 — the COUNT walls (bytes ride storage.put inside gate 7).
  const walls = await uploadCountWalls(video.organizationId, id);
  if (walls.videoCount >= walls.videoCap)
    return NextResponse.json(
      { error: `This video already carries ${walls.videoCount} uploaded whiteboard assets (cap ${walls.videoCap}) — delete one first` },
      { status: 409 }
    );
  if (walls.orgCount >= walls.orgCap)
    return NextResponse.json(
      { error: `This organization already carries ${walls.orgCount} uploaded whiteboard assets (cap ${walls.orgCap})` },
      { status: 409 }
    );

  // Gate 7 — storage + manifest. A byte-quota hit surfaces as 413, not 500.
  try {
    const row = await saveVideoUpload(video, v.asset, auth.ctx.userId);
    const traceNote = traceStats
      ? `, traced from ${rasterKind} at tolerance ${traceStats.tolerance}px (${traceStats.strokes} strokes, ${traceStats.fills} fills)`
      : "";
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: auth.ctx.userId,
        videoId: id,
        stage: "whiteboard",
        message: `Whiteboard asset uploaded — "${v.asset.id}" (${v.paths} paths, ${v.texts} texts, ${v.commands} commands, ${row.bytes} B stored, raster probe ${probe.ms} ms${traceNote})`,
      },
    });
    return NextResponse.json(
      {
        assetId: v.asset.id,
        w: v.asset.viewBox.w,
        h: v.asset.viewBox.h,
        paths: v.paths,
        texts: v.texts,
        commands: v.commands,
        bytes: row.bytes,
        probeMs: probe.ms,
        ...(traceStats ? { traced: { from: rasterKind, ...traceStats } } : {}),
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof StorageQuotaError)
      return NextResponse.json({ error: err.message }, { status: 413 });
    throw err;
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter();

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const assetId = new URL(req.url).searchParams.get("assetId")?.trim() ?? "";
  if (!assetId)
    return NextResponse.json({ error: "Pass ?assetId= of the upload to delete" }, { status: 400 });

  const rows = await listVideoUploads(id);
  if (!rows.some((r) => r.assetId === assetId))
    return NextResponse.json({ error: `No uploaded asset "${assetId}" on this video` }, { status: 404 });

  // The reference guard — the current project's placements + events must not
  // address this asset, or the next save bricks the doc with "unknown asset".
  const doc = parseWhiteboardDoc(video.whiteboardProject);
  const referencingScenes = (doc?.project?.scenes ?? [])
    .filter(
      (s) =>
        s.placements.some((p) => p.assetId === assetId) ||
        s.animations.some((a) => a.assetId === assetId)
    )
    .map((s) => s.id);
  if (referencingScenes.length > 0)
    return NextResponse.json(
      {
        error: `Scenes ${referencingScenes.join(", ")} still place "${assetId}" — remove those placements before deleting the asset`,
      },
      { status: 409 }
    );

  const bytes = rows.find((r) => r.assetId === assetId)?.bytes ?? 0;
  const deleted = await deleteVideoUpload(id, assetId);
  if (!deleted)
    return NextResponse.json({ error: `No uploaded asset "${assetId}" on this video` }, { status: 404 });
  await db.activity.create({
    data: {
      organizationId: video.organizationId,
      userId: auth.ctx.userId,
      videoId: id,
      stage: "whiteboard",
      message: `Whiteboard asset deleted — "${assetId}" (${bytes} B freed)`,
    },
  });

  // Honest confirmation: the object really is gone (get() throwing is the
  // success signal — a stale object would keep burning org quota).
  let verified = false;
  try {
    await get(whiteboardAssetKey(id, assetId));
  } catch {
    verified = true;
  }
  return NextResponse.json({ ok: true, assetId, verified });
}

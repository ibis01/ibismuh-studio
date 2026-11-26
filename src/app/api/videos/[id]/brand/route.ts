import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/ibismuh/tenant-db";
import { requireUser } from "@/lib/ibismuh/tenant";
import { invalidateRenderedArtifacts } from "@/lib/ibismuh/render";
import { brandLogoKey, sanitizeBrandAccent } from "@/lib/ibismuh/slides";
import { sniffImageFormat } from "@/lib/ibismuh/image-upload";
import { sanitizeSvg } from "@/lib/ibismuh/whiteboard/svg";
import * as storage from "@/lib/ibismuh/storage";

type Ctx = { params: Promise<{ id: string }> };

/** SVG candidate check for the brand lane: valid UTF-8 (fatal decode), no
 * NUL bytes, exactly one root <svg> element. The sanitizer runs afterwards
 * (in POST); this sniff only decides WHETHER the bytes are an SVG document. */
function sniffBrandSvg(buffer: Buffer): { ok: true; text: string } | { ok: false } {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return { ok: false };
  }
  if (text.includes("\u0000")) return { ok: false };
  const body = text
    .replace(/^\uFEFF/, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .trim();
  const open = body.search(/<svg[\s>]/i);
  if (open === -1) return { ok: false };
  if (body.slice(0, open).trim().length > 0) return { ok: false };
  const close = body.toLowerCase().lastIndexOf("</svg>");
  if (close === -1) return { ok: false };
  if (body.slice(close + 6).trim().length > 0) return { ok: false };
  return { ok: true, text: body };
}

const LOGO_MIME: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
};
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** GET — serve the uploaded brand logo (UI preview on the brand kit card). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  const { id } = await ctx.params;
  // Scoped lookup FIRST — the uploads/<id>/brand-logo.* file is only served
  // after the row is proven to belong to the caller's organization.
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const key = await brandLogoKey(id);
  if (!key)
    return NextResponse.json({ error: "No brand logo uploaded" }, { status: 404 });

  const ext = key.split(".").pop() ?? "";
  let body: Buffer;
  try {
    body = await storage.get(key);
  } catch {
    return NextResponse.json({ error: "No brand logo uploaded" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": LOGO_MIME[ext] ?? "application/octet-stream",
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-cache",
      // The audit's F-1 hardening: the logo is a served file — pin the
      // disposition so no agent ever treats it as an executable document.
      "Content-Disposition": `inline; filename="brand-logo.${ext}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * POST — upload the brand logo (multipart: file). PNG / WebP / SVG up to
 * 5 MB; transparency-friendly formats so it sits clean on any slide.
 * The badge shows on every keynote slide (until switched off), and the
 * rendered video becomes stale.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form with a logo file" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "Attach the logo as the 'file' field" }, { status: 400 });

  if (file.size > MAX_LOGO_BYTES)
    return NextResponse.json({ error: "Logo exceeds the 5 MB limit" }, { status: 413 });

  // The audit's F-1: the browser-supplied MIME type is UNTRUSTED — the bytes
  // decide. Raster formats are admitted by magic-byte sniff (sniffImageFormat);
  // SVG must be valid UTF-8 with exactly one root <svg> AND passes the same
  // sanitizer the whiteboard lane trusts before a single byte is stored (the
  // GET route serves these bytes back as image/svg+xml from the app origin).
  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImageFormat(buffer);
  let ext: "png" | "webp" | "svg";
  let bytes: Buffer;
  if (sniffed === "png") {
    ext = "png";
    bytes = buffer;
  } else if (sniffed === "webp") {
    ext = "webp";
    bytes = buffer;
  } else if (sniffed === "jpeg" || sniffed === "heic") {
    return NextResponse.json(
      { error: "That file's bytes are JPEG/HEIC — convert it to PNG or WebP (transparency-friendly formats)" },
      { status: 415 }
    );
  } else {
    const svg = sniffBrandSvg(buffer);
    if (!svg.ok)
      return NextResponse.json(
        { error: "Logos must be PNG, WebP, or SVG (detected by file content, not by name)" },
        { status: 415 }
      );
    ext = "svg";
    bytes = Buffer.from(sanitizeSvg(svg.text), "utf8");
  }

  // One logo per video — remove other variants first (ext may change).
  // Stage 4a (T-4.0): the logo is a storage object, so variant swaps go
  // through the driver (s3-safe, quota-correct).
  for (const e of Object.keys(LOGO_MIME)) {
    if (e !== ext) await storage.remove(`${id}/brand-logo.${e}`).catch(() => {});
  }
  await storage.put(`${id}/brand-logo.${ext}`, bytes);

  // The badge is baked into slide PNGs at screenshot time — stale now.
  await invalidateRenderedArtifacts(id, { slidePngs: true });
  await db.video.update({
    where: { id },
    data: { brandLogoOn: true, hasVideo: false, videoDuration: null, error: null },
  });
  await db.activity.create({
    data: {
      organizationId: auth.ctx.organizationId,
      userId: auth.ctx.userId,
      videoId: id,
      stage: "storyboard",
      message: `Brand logo uploaded (${ext.toUpperCase()}) — badge shows on every slide`,
    },
  });

  return NextResponse.json({ ok: true, hasLogo: true, logoUrl: `/api/videos/${id}/brand` });
}

/**
 * PATCH — brand kit settings. Body: { accent?: "#rrggbb"|null,
 * showLogo?: boolean }. Accent null = back to the built-in per-slide
 * catalog accents. Both are baked into the slide PNGs, so both invalidate.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};
  let changed = false;

  if (body?.accent !== undefined) {
    if (body.accent === null) {
      data.brandAccent = null;
      changed = true;
    } else {
      const hex = sanitizeBrandAccent(body.accent);
      if (!hex)
        return NextResponse.json(
          { error: "Accent must be a hex color like #0A7CFF" },
          { status: 400 }
        );
      data.brandAccent = hex;
      changed = true;
    }
  }
  if (typeof body?.showLogo === "boolean") {
    data.brandLogoOn = body.showLogo;
    changed = true;
  }

  if (!changed)
    return NextResponse.json({ error: "Nothing to update — send accent or showLogo" }, { status: 400 });

  await invalidateRenderedArtifacts(id, { slidePngs: true });
  const updated = await db.video.update({
    where: { id },
    data: { ...data, hasVideo: false, videoDuration: null, error: null },
  });

  return NextResponse.json({
    ok: true,
    brandAccent: updated.brandAccent,
    brandLogoOn: updated.brandLogoOn ?? true,
  });
}

/** DELETE — remove the brand logo (badge disappears from every slide). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });

  for (const e of Object.keys(LOGO_MIME)) {
    await storage.remove(`${id}/brand-logo.${e}`).catch(() => {});
  }

  await invalidateRenderedArtifacts(id, { slidePngs: true });
  await db.video.update({ where: { id }, data: { brandLogoOn: null } });
  await db.activity.create({
    data: {
      organizationId: auth.ctx.organizationId,
      userId: auth.ctx.userId,
      videoId: id,
      stage: "storyboard",
      message: "Brand logo removed",
    },
  });

  return NextResponse.json({ ok: true, hasLogo: false });
}

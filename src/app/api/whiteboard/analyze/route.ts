/**
 * POST /api/whiteboard/analyze
 *
 * Server-side run of the whiteboard pipeline: accepts a downscaled PNG
 * data URL, decodes it with sharp, runs the deterministic reveal-time
 * analysis, and returns the RLE-encoded timing map plus plan + stats.
 * The interactive Studio runs the same engine client-side for instant
 * previews; this endpoint is the automation/headless surface and keeps
 * both paths on one implementation.
 */

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  analyzeWhiteboard,
  DEFAULT_OPTIONS,
  type WhiteboardOptions,
} from "@/lib/whiteboard/schedule";
import { encodeTimingRle } from "@/lib/whiteboard/encode";

export const maxDuration = 120;

const MAX_DIM = 1280;
const MAX_DATA_URL_BYTES = 12 * 1024 * 1024;

interface AnalyzeBody {
  dataUrl?: string;
  options?: Partial<WhiteboardOptions>;
}

export async function POST(request: NextRequest) {
  let body: AnalyzeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const dataUrl = body.dataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return NextResponse.json(
      { error: "dataUrl must be an image data URL" },
      { status: 400 },
    );
  }
  if (dataUrl.length > MAX_DATA_URL_BYTES) {
    return NextResponse.json(
      { error: "image too large; keep uploads under ~8MB" },
      { status: 413 },
    );
  }

  const commaIdx = dataUrl.indexOf(",");
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : "";
  if (!b64) {
    return NextResponse.json({ error: "malformed data URL" }, { status: 400 });
  }

  let raw: sharp.OutputInfo & { data: Buffer };
  try {
    const buffer = Buffer.from(b64, "base64");
    const image = sharp(buffer, { limitInputPixels: 268402689 }).rotate();
    const meta = await image.metadata();
    if (!meta.width || !meta.height) {
      return NextResponse.json(
        { error: "cannot read image dimensions" },
        { status: 400 },
      );
    }
    const scale = Math.min(1, MAX_DIM / Math.max(meta.width, meta.height));
    const targetW = Math.max(1, Math.round(meta.width * scale));
    const targetH = Math.max(1, Math.round(meta.height * scale));
    const { data, info } = await image
      .resize(targetW, targetH, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    raw = { ...info, data };
  } catch (err) {
    return NextResponse.json(
      {
        error: `failed to decode image: ${err instanceof Error ? err.message : "unknown error"}`,
      },
      { status: 400 },
    );
  }

  const options: WhiteboardOptions = {
    ...DEFAULT_OPTIONS,
    ...(body.options ?? {}),
    sceneDuration: Math.min(Math.max(Number(body.options?.sceneDuration) || DEFAULT_OPTIONS.sceneDuration, 1), 600),
    fadeDuration: Math.min(Math.max(Number(body.options?.fadeDuration) || DEFAULT_OPTIONS.fadeDuration, 0.01), 1),
    drawFraction: Math.min(Math.max(Number(body.options?.drawFraction ?? DEFAULT_OPTIONS.drawFraction), 0.1), 1),
  };

  try {
    const analysis = analyzeWhiteboard(
      new Uint8Array(raw.data),
      raw.width,
      raw.height,
      options,
    );
    return NextResponse.json({
      width: analysis.width,
      height: analysis.height,
      timingRle: encodeTimingRle(analysis.timing),
      timingFps: 30,
      drawEnd: analysis.drawEnd,
      totalDuration: analysis.totalDuration,
      plan: analysis.plan,
      stats: analysis.stats,
      warnings: analysis.warnings,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `analysis failed: ${err instanceof Error ? err.message : "unknown error"}`,
      },
      { status: 500 },
    );
  }
}

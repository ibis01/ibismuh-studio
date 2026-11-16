/**
 * GET  /api/whiteboard/scenes — list saved scenes (metadata only)
 * POST /api/whiteboard/scenes — save a scene (image + options + stats)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const scenes = await db.whiteboardScene.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        width: true,
        height: true,
        options: true,
        stats: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ scenes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "database error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "Untitled sketch";
    const dataUrl: unknown = body.dataUrl;
    if (
      typeof dataUrl !== "string" ||
      !dataUrl.startsWith("data:image/") ||
      dataUrl.length > 16 * 1024 * 1024
    ) {
      return NextResponse.json(
        { error: "dataUrl must be an image data URL under ~12MB" },
        { status: 400 },
      );
    }
    const width = Number(body.width);
    const height = Number(body.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      return NextResponse.json({ error: "width/height required" }, { status: 400 });
    }
    const scene = await db.whiteboardScene.create({
      data: {
        name,
        width: Math.round(width),
        height: Math.round(height),
        options: JSON.stringify(body.options ?? {}),
        stats: JSON.stringify(body.stats ?? {}),
        imageData: dataUrl,
      },
      select: { id: true, name: true, createdAt: true },
    });
    return NextResponse.json({ scene }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "database error" },
      { status: 500 },
    );
  }
}

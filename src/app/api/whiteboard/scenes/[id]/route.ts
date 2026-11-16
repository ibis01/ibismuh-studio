/**
 * GET    /api/whiteboard/scenes/[id] — load a saved scene (with image)
 * DELETE /api/whiteboard/scenes/[id] — remove a saved scene
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const scene = await db.whiteboardScene.findUnique({ where: { id } });
    if (!scene) {
      return NextResponse.json({ error: "scene not found" }, { status: 404 });
    }
    return NextResponse.json({ scene });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "database error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.whiteboardScene.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "database error" },
      { status: 500 },
    );
  }
}

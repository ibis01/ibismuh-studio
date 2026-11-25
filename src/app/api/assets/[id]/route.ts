// /api/assets/:id — serve asset bytes from db/assets/<storageKey>.
// Content-Type by kind, immutable cache headers (content-hash addressed),
// tenant-checked, 404 when the row or the bytes are missing.

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { db } from "@/lib/ibismuh/tenant-db";
import { ORG, errorResponse, safeAssetPath } from "@/lib/ibismuh/dto-mappers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const row = await db.assetRecord.findFirst({ where: { id, organizationId: ORG } });
    if (!row) return NextResponse.json({ error: "asset not found" }, { status: 404 });

    const filePath = safeAssetPath(row.storageKey);
    let bytes: Buffer;
    try {
      bytes = await readFile(filePath);
    } catch {
      return NextResponse.json({ error: "asset bytes are missing on disk" }, { status: 404 });
    }

    // Content-Type: audio is WAV; images follow the REAL stored extension
    // (the provider emits PNG or JPEG per call — the extension is truth).
    const isAudio = row.kind === "audio";
    const mime = isAudio
      ? "audio/wav"
      : row.storageKey.endsWith(".jpg")
        ? "image/jpeg"
        : "image/png";

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

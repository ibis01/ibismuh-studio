import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/ibismuh/tenant-db";
import { requireUser } from "@/lib/ibismuh/tenant";
import { readSceneStockImage } from "@/lib/ibismuh/stock-image";

type Ctx = { params: Promise<{ id: string; n: string }> };

// Stage 1 (task T-1.12): `n` must be a positive integer (the per-scene stock
// route's law, kept).
const ParamsSchema = z.object({
  id: z.string().min(1),
  n: z.coerce.number().int().positive(),
});

/**
 * GET — stream one scene's downloaded stock photo (drives the inspector's
 * photo badge / any UI surface that wants to show the fetched image). 404
 * when the scene has no photo on disk — an honest miss, not an error.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope

  const parsed = ParamsSchema.safeParse(await ctx.params);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid scene index" }, { status: 400 });
  const { id } = parsed.data;
  const index = parsed.data.n;

  // The sibling stock route's guard: the row lookup is tenant-scoped, so a
  // foreign (or nonexistent) video id is a 404 before any storage key is read.
  const video = await db.video.findUnique({ where: { id } });
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const buf = await readSceneStockImage(id, index);
  if (!buf)
    return NextResponse.json({ error: "No stock photo for this scene" }, { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=60",
    },
  });
}

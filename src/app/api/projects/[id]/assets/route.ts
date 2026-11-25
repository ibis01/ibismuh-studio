// /api/projects/:id/assets — generate scene art, then recompile the plan so
// the manifest seats the new assets (plan-revision law).

import { NextResponse } from "next/server";
import { generateAssets, getCurrentPlanRevision } from "@/lib/ibismuh/repo";
import { errorResponse } from "@/lib/ibismuh/dto-mappers";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const assets = await generateAssets(id);
    const planRevision = await getCurrentPlanRevision(id);
    return NextResponse.json({ assets, planRevision }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

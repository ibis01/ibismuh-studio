// /api/projects/:id/qc — run the deterministic QC engine now (POST) or read
// the latest stored report (GET).

import { NextResponse } from "next/server";
import { getLatestQc, runQcForProject } from "@/lib/ibismuh/qc-engine";
import { errorResponse } from "@/lib/ibismuh/dto-mappers";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    return NextResponse.json(await runQcForProject(id));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    return NextResponse.json(await getLatestQc(id));
  } catch (err) {
    return errorResponse(err);
  }
}

// /api/projects/:id/plan — compile a NEW plan revision from the current brief.

import { NextResponse } from "next/server";
import { createPlanRevision } from "@/lib/ibismuh/repo";
import { errorResponse } from "@/lib/ibismuh/dto-mappers";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const planRevision = await createPlanRevision(id);
    return NextResponse.json({ planRevision }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

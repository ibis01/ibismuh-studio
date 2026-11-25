// /api/projects/:id — full project state (GET) and brief/settings edits (PATCH).

import { NextResponse } from "next/server";
import { getProjectState, updateProject } from "@/lib/ibismuh/repo";
import { errorResponse, readJsonBody } from "@/lib/ibismuh/dto-mappers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    return NextResponse.json(await getProjectState(id));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const body = await readJsonBody(req);
    return NextResponse.json(await updateProject(id, body));
  } catch (err) {
    return errorResponse(err);
  }
}

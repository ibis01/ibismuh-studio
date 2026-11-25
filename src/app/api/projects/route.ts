// /api/projects — project collection (GET list, POST create).

import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/ibismuh/repo";
import { errorResponse, readJsonBody } from "@/lib/ibismuh/dto-mappers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return NextResponse.json(await listProjects());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJsonBody(req);
    const state = await createProject(body);
    return NextResponse.json(state, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// /api/projects — project collection (GET list, POST create).

import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/ibismuh/repo";
import { errorResponse, readJsonBody } from "@/lib/ibismuh/dto-mappers";
import { requireUser } from "@/lib/ibismuh/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  // The audit's F-2: the projects/assets lane admits through the SAME gate
  // every content lane uses — signature-only middleware checks never
  // replace the route-level guard (revoked sessions, bearers of any org,
  // and the shared rate limiter all live here).
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: orgId() + the tenant-db query guard

  try {
    return NextResponse.json(await listProjects());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  // The audit's F-2: the projects/assets lane admits through the SAME gate
  // every content lane uses — signature-only middleware checks never
  // replace the route-level guard (revoked sessions, bearers of any org,
  // and the shared rate limiter all live here).
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: orgId() + the tenant-db query guard

  try {
    const body = await readJsonBody(req);
    const state = await createProject(body);
    return NextResponse.json(state, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

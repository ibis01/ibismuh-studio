// /api/projects/:id — full project state (GET) and brief/settings edits (PATCH).

import { NextRequest, NextResponse } from "next/server";
import { getProjectState, updateProject } from "@/lib/ibismuh/repo";
import { errorResponse, readJsonBody } from "@/lib/ibismuh/dto-mappers";
import { requireUser } from "@/lib/ibismuh/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  // The audit's F-2: the projects/assets lane admits through the SAME gate
  // every content lane uses — signature-only middleware checks never
  // replace the route-level guard (revoked sessions, bearers of any org,
  // and the shared rate limiter all live here).
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: orgId() + the tenant-db query guard

  try {
    const { id } = await params;
    return NextResponse.json(await getProjectState(id));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  // The audit's F-2: the projects/assets lane admits through the SAME gate
  // every content lane uses — signature-only middleware checks never
  // replace the route-level guard (revoked sessions, bearers of any org,
  // and the shared rate limiter all live here).
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: orgId() + the tenant-db query guard

  try {
    const { id } = await params;
    const body = await readJsonBody(req);
    return NextResponse.json(await updateProject(id, body));
  } catch (err) {
    return errorResponse(err);
  }
}

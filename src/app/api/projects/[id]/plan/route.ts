// /api/projects/:id/plan — compile a NEW plan revision from the current brief.

import { NextRequest, NextResponse } from "next/server";
import { createPlanRevision } from "@/lib/ibismuh/repo";
import { errorResponse } from "@/lib/ibismuh/dto-mappers";
import { requireUser } from "@/lib/ibismuh/tenant";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  // The audit's F-2: the projects/assets lane admits through the SAME gate
  // every content lane uses — signature-only middleware checks never
  // replace the route-level guard (revoked sessions, bearers of any org,
  // and the shared rate limiter all live here).
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: orgId() + the tenant-db query guard

  try {
    const { id } = await params;
    const planRevision = await createPlanRevision(id);
    return NextResponse.json({ planRevision }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

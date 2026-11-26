// /api/projects/:id/qc — run the deterministic QC engine now (POST) or read
// the latest stored report (GET).

import { NextRequest, NextResponse } from "next/server";
import { getLatestQc, runQcForProject } from "@/lib/ibismuh/qc-engine";
import { errorResponse } from "@/lib/ibismuh/dto-mappers";
import { requireUser } from "@/lib/ibismuh/tenant";

export const dynamic = "force-dynamic";

/** The audit's F-2 admission: the projects lane goes through the SAME
 * route-level guard every content lane uses — signature-only middleware
 * checks never replace it (revoked sessions, bearers of any org, and the
 * shared rate limiter all live in requireUser). */
function admit(req: NextRequest) {
  return requireUser(req);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await admit(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: orgId() + the tenant-db query guard
  try {
    const { id } = await params;
    return NextResponse.json(await runQcForProject(id));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await admit(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter();
  try {
    const { id } = await params;
    return NextResponse.json(await getLatestQc(id));
  } catch (err) {
    return errorResponse(err);
  }
}

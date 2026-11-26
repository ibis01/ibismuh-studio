// POST /api/projects/:id/repair — the scoped repair operation (Workstream B).
//
// ONE declared op bound to ONE scene. The op must seat in the lane's
// registry repairOperations (fail closed), the current plan must exist,
// and the result is a NEW plan revision linked to the amended one —
// never an in-place rewrite. The response carries the new revision, the
// changed scene, affected assets, and the stages that must rerun.

import { NextRequest, NextResponse } from "next/server";
import { repairProject, type RepairInput } from "@/lib/ibismuh/pipeline";
import { getProjectState } from "@/lib/ibismuh/repo";
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
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    if (typeof b.op !== "string" || b.op.length === 0) {
      return NextResponse.json({ error: "op is required (a registry repair-operation id)" }, { status: 400 });
    }
    if (typeof b.instruction !== "string" || b.instruction.trim().length === 0) {
      return NextResponse.json({ error: "instruction is required" }, { status: 400 });
    }
    const input: RepairInput = {
      op: b.op,
      ...(typeof b.sceneRef === "string" ? { sceneRef: b.sceneRef } : {}),
      instruction: b.instruction,
    };
    const result = await repairProject(id, input);
    const state = await getProjectState(id);
    return NextResponse.json({ ...result, state }, { status: 200 });
  } catch (err) {
    return errorResponse(err);
  }
}

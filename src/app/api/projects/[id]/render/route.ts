// /api/projects/:id/render — the render job actions (start|cancel|resume|retry).
// start/resume/retry return immediately with the queued job; the pipeline
// executes asynchronously and the UI polls GET /api/projects/:id.

import { NextResponse } from "next/server";
import {
  cancelActiveRender,
  resumeRender,
  retryRender,
  startRender,
} from "@/lib/ibismuh/pipeline";
import { errorResponse, readJsonBody } from "@/lib/ibismuh/dto-mappers";

export const dynamic = "force-dynamic";

const ACTIONS = ["start", "cancel", "resume", "retry"] as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const body = await readJsonBody(req);
    const action = body.action;
    if (typeof action !== "string" || !(ACTIONS as readonly string[]).includes(action)) {
      return NextResponse.json({ error: `action must be one of: ${ACTIONS.join(", ")}` }, { status: 400 });
    }
    const job =
      action === "start"
        ? await startRender(id)
        : action === "cancel"
          ? await cancelActiveRender(id)
          : action === "resume"
            ? await resumeRender(id)
            : await retryRender(id);
    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

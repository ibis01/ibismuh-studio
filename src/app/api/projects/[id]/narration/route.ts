// /api/projects/:id/narration — synthesize + measure narration into an
// AudioReceipt, then recompile the plan so beats ride the measured windows.

import { NextResponse } from "next/server";
import { generateNarration } from "@/lib/ibismuh/repo";
import { errorResponse } from "@/lib/ibismuh/dto-mappers";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const { audioReceipt, planRevision, narrationAssetId } = await generateNarration(id);
    return NextResponse.json({ audioReceipt, planRevision, narrationAssetId }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

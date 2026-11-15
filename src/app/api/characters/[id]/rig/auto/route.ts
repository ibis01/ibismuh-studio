import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/tubeforge/tenant-db";
import { requireUser } from "@/lib/tubeforge/tenant";
import { generateCharacterParts } from "@/lib/tubeforge/characters";

type Ctx = { params: Promise<{ id: string }> };

// S125 (K1) — the rig/auto planner pass (roadmap §6: ".../rig/auto
// (planner pass)"): the LLM authors the parts library + the pose-sheet
// proposal, the validators police every row, and what lands in the columns
// is a VALIDATED CharacterRigDoc byte-stable write. Per-part degradation is
// reported (the graphics scaffold's law) — never a 500 on junk rows, never
// an invented rig. In-request (the graphics scaffold's shape — one LLM
// round-trip, not a job).

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope

  const { id } = await ctx.params;
  const character = await db.character.findUnique({ where: { id } });
  if (!character)
    return NextResponse.json({ error: "Character not found" }, { status: 404 });

  if (!character.appearance && !character.identityAnchor)
    return NextResponse.json(
      { error: "Add an appearance description (or run the AI bible) first — the parts pass decomposes the identity" },
      { status: 400 }
    );

  try {
    const result = await generateCharacterParts({
      characterId: character.id,
      name: character.name,
      appearance: character.appearance,
      identityAnchor: character.identityAnchor,
      artStyle: character.artStyle,
    });
    return NextResponse.json({ started: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "the parts pass failed" },
      { status: 502 }
    );
  }
}

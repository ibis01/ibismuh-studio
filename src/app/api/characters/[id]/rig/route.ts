import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/tubeforge/tenant-db";
import { requireUser } from "@/lib/tubeforge/tenant";
import { validateRigDoc, validateRigParts, writeRigDoc, writeRigParts } from "@/lib/tubeforge/characters/rig2d";

type Ctx = { params: Promise<{ id: string }> };

// S125 (K1) — the rig doc's CRUD route (roadmap §6: "GET/PUT rig doc").
// The validator is the admission gate: a PUT that fails validateRigDoc (or
// validateRigParts) returns the errors and writes NOTHING — the columns only
// ever carry a validated doc (the graphicsDoc house law). Concurrency:
// last-write-wins (the house rule for every engine doc column).

/** GET — the stored rig doc + parts library, parsed (or nulls when absent). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope

  const { id } = await ctx.params;
  const character = await db.character.findUnique({ where: { id } });
  if (!character)
    return NextResponse.json({ error: "Character not found" }, { status: 404 });

  const partsResult = character.parts
    ? validateRigParts(safeParse(character.parts))
    : { parts: null, errors: [] as string[], warnings: [] as string[] };
  const docResult = character.rigDoc
    ? validateRigDoc(safeParse(character.rigDoc), partsResult.parts)
    : { doc: null, errors: [] as string[], warnings: [] as string[] };

  return NextResponse.json({
    hasRig: Boolean(character.rigDoc && partsResult.parts && docResult.doc),
    doc: docResult.doc,
    parts: partsResult.parts,
    errors: [...partsResult.errors, ...docResult.errors],
    warnings: [...partsResult.warnings, ...docResult.warnings],
  });
}

/** PUT — validate + store the rig doc AND the parts library together (the
 *  doc's svgRefs resolve against the parts in the SAME payload — the two
 *  gates cannot disagree). */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope

  const { id } = await ctx.params;
  const character = await db.character.findUnique({ where: { id } });
  if (!character)
    return NextResponse.json({ error: "Character not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const { doc, parts } = (body ?? {}) as { doc?: unknown; parts?: unknown };

  const partsResult = validateRigParts(parts);
  if (!partsResult.parts) {
    return NextResponse.json(
      { error: "the parts library was refused", errors: partsResult.errors },
      { status: 400 }
    );
  }
  const docResult = validateRigDoc(doc, partsResult.parts);
  if (!docResult.doc) {
    return NextResponse.json(
      { error: "the rig doc was refused", errors: docResult.errors },
      { status: 400 }
    );
  }

  const updated = await db.character.update({
    where: { id },
    data: {
      rigDoc: writeRigDoc(docResult.doc),
      parts: writeRigParts(partsResult.parts),
    },
  });

  return NextResponse.json({
    hasRig: true,
    doc: docResult.doc,
    parts: partsResult.parts,
    warnings: [...partsResult.warnings, ...docResult.warnings],
    updatedAt: updated.updatedAt.toISOString(),
  });
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

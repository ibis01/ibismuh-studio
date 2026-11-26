import { makeReferenceHandlers } from "@/lib/ibismuh/reference-routes";
import { db } from "@/lib/ibismuh/tenant-db";
import { CHARACTER_REFERENCE_CAP } from "@/lib/ibismuh/references";
import { assertCharacterPolicyAdmission } from "@/lib/ibismuh/characters";

/**
 * S51 — cast reference photos: the writer for `Character.referenceImages`
 * (the column runContinuityCheck has read since Stage 5). GET lists, POST
 * appends (multipart: file), DELETE removes one (?key=<storage key>).
 *
 * A-1 (the audit's P1): the cast seam refuses restricted figures BEFORE the
 * bytes are read — a reference photo for a restricted figure exists only to
 * feed a recognizable portrait seed, which this application never mints.
 */
const handlers = makeReferenceHandlers({
  noun: "character",
  prefixFor: (id) => `characters/${id}`,
  cap: CHARACTER_REFERENCE_CAP,
  stage: "character",
  find: (id) => db.character.findUnique({ where: { id } }),
  saveKeys: (id, keys) =>
    db.character.update({
      where: { id },
      data: { referenceImages: JSON.stringify(keys) },
    }),
  admission: (row) => {
    try {
      assertCharacterPolicyAdmission(row, "Cast reference");
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Reference refused by content policy";
    }
  },
});

export const GET = handlers.list;
export const POST = handlers.add;
export const DELETE = handlers.remove;

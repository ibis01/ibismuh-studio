import { makeReferenceHandlers } from "@/lib/ibismuh/reference-routes";
import { db } from "@/lib/ibismuh/tenant-db";
import { CHARACTER_REFERENCE_CAP } from "@/lib/ibismuh/references";

/** S51 — serve one cast reference PNG (`ref-<n>.png`). */
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
});

export const GET = handlers.serve;

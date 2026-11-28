// recipes-fingerprint.ts — the RECIPE CONTRACT FINGERPRINT (master plan
// Phase 6; the lane-contracts Phase-1.3 precedent: a versioned, canonical
// sha256 stamp over the registry so silent body changes are detectable).
//
// Server-only sibling of recipes.ts (node:crypto lives here — the browser
// never imports this module; the registry itself stays client-safe).
//
// The stamp answers one question: DID THE RECIPES CHANGE? A receipt or a
// baseline produced under fingerprint F remains reproducible exactly when
// the registry still computes F. Recipe BODIES may evolve — but the
// change then announces itself through a new stamp, it never sneaks.

import { createHash } from "node:crypto";
import { GRAPHICS_RECIPES } from "./recipes";
import { GRAPHICS_RECIPE_IDS } from "./recipe-ids";

/** Bump when any recipe BODY changes shape or value (additions, edits,
 *  removals). Version 1 = the registry as of master plan Phase 6. */
export const GRAPHICS_RECIPE_VERSION = 1;

/** Canonical sha256 over the registry: id order rides the closed
 *  vocabulary (GRAPHICS_RECIPE_IDS), each body serialized canonically
 *  (sorted keys, no whitespace). Deterministic across processes. */
export function computeRecipeFingerprint(): string {
  const bodies = GRAPHICS_RECIPE_IDS.map((id) => {
    const r = GRAPHICS_RECIPES[id];
    const canonical = (o: unknown): unknown => {
      if (Array.isArray(o)) return o.map(canonical);
      if (o !== null && typeof o === "object") {
        return Object.fromEntries(
          Object.entries(o as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => [k, canonical(v)]),
        );
      }
      return o;
    };
    return { id, body: canonical({ label: r.label, intent: r.intent, enter: r.enter, exit: r.exit }) };
  });
  return createHash("sha256")
    .update(JSON.stringify({ version: GRAPHICS_RECIPE_VERSION, recipes: bodies }))
    .digest("hex");
}

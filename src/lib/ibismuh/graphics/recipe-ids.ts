// recipe-ids.ts — the CLOSED RECIPE VOCABULARY, as a leaf (the re-audit's
// step 4: "validated recipe fields"). The doc validator (types.ts) judges
// recipe ids; the registry (recipes.ts) owns the recipe BODIES. One
// vocabulary, two consumers, zero import cycle: the leaf carries only the
// ids — the validator imports THIS (no bodies, no compile seam), and the
// registry re-exports it (every existing import path keeps resolving).
//
// Pure data: no fs, no clock, no randomness; client-safe.

export const GRAPHICS_RECIPE_IDS = [
  "house-baseline",
  "count-up-spotlight",
  "cascade-list",
  "chart-grow",
  "quiet-card",
  "comparison-bars",
  "timeline-steps",
  "process-steps",
  "icon-group-entrance",
  "final-summary",
  "problem-solution",
] as const;
export type GraphicsRecipeId = (typeof GRAPHICS_RECIPE_IDS)[number];

/** The doc's effective recipe: the scene override wins, then the doc's
 *  choice, then the house baseline (the identity recipe — the native
 *  table). ONE inheritance law for every consumer (the editor's apply,
 *  the receipts, a future render seam). */
export function effectiveRecipe(
  doc: { recipe?: string },
  scene: { recipe?: string }
): GraphicsRecipeId {
  const id = scene.recipe ?? doc.recipe ?? "house-baseline";
  return (GRAPHICS_RECIPE_IDS as readonly string[]).includes(id) ? (id as GraphicsRecipeId) : "house-baseline";
}

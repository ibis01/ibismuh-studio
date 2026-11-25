// S177 — Image Generation Intelligence (Programme E): the Director
// decides WHICH scenes need pixels from WHERE — by cost ladder, not by
// reflex. "Avoid unnecessary generation — a chart should be drawn by
// the graphics engine, not generated as an image."
//
// The closed decision set + the cost ladder (cheapest that satisfies):
//   native < reuse < stock < generate
//
// Pure module — reads the S169 scene's own data, no I/O, no model.

import type { UniversalScene } from "./universal-scene";

export const ASSET_STRATEGY_VERSION = 1;

export const ASSET_STRATEGIES = ["native", "reuse", "stock", "generate"] as const;
export type AssetStrategy = (typeof ASSET_STRATEGIES)[number];

/** The cost ladder — the rank is the contract (cheaper beats dearer). */
export const ASSET_COST_RANK: Readonly<Record<AssetStrategy, number>> = Object.freeze({
  native: 0,
  reuse: 1,
  stock: 2,
  generate: 3,
});

export interface AssetDecision {
  readonly strategy: AssetStrategy;
  readonly costRank: number;
  readonly reason: string;
  /** The asset id a reuse decision binds to (provenance-closed by S169). */
  readonly assetId?: string;
}

/** The chart/graphics tells — the directive actions that mean the NATIVE
 *  engine already renders this scene's content. */
const NATIVE_TELLS = ["enter:count", "enter:grow", "enter:draw", "enter:wipe", "slide-kinetic-reveal", "3d:object-add"];

/** Decide ONE scene's asset strategy. Deterministic rules, cheapest-first. */
export function decideAssetStrategy(scene: UniversalScene): AssetDecision {
  // 1. Native tells: the scene's own directives prove the graphics/3D
  //    engine renders the content — generation would be waste.
  const nativeTell = scene.directives.find((d) => NATIVE_TELLS.includes(d.action));
  if (nativeTell !== undefined) {
    return { strategy: "native", costRank: ASSET_COST_RANK.native, reason: `the scene's own ${nativeTell.action} directive renders natively — a chart is drawn by the engine, never generated as an image` };
  }
  // 2. Reuse: the scene already declares the asset it needs.
  const bg = scene.background;
  if (bg?.type === "image" && typeof bg.assetId === "string") {
    const owned = scene.assets.find((a) => a.id === bg.assetId && (a.origin === "upload" || a.origin === "reuse" || a.origin === "stock"));
    if (owned !== undefined) {
      return { strategy: "reuse", costRank: ASSET_COST_RANK.reuse, reason: `the scene's background is already declared (${owned.origin}) — reuse it`, assetId: owned.id };
    }
  }
  // 3. Stock before generation — the classic lane's stock-footage surface
  //    first (the house's own stock lane is the cheap public catalog).
  if (scene.kind === "classic" && bg?.type === "image") {
    return { strategy: "stock", costRank: ASSET_COST_RANK.stock, reason: "a stock surface satisfies a classic scene's image at a fraction of generation cost" };
  }
  // 4. Generation is the LAST resort — a scene that explicitly wants an
  //    image and has no native tell, no owned asset, no stock lane.
  if (bg?.type === "image") {
    return { strategy: "generate", costRank: ASSET_COST_RANK.generate, reason: "unique imagery is explicitly required (no native tell, no owned asset, no stock lane)" };
  }
  return { strategy: "native", costRank: ASSET_COST_RANK.native, reason: "the scene needs no bitmap at all — the engine composes it" };
}

/** The whole-project ledger: every scene decided, the wasted-generation
 *  count named (the intelligence the roadmap asks for). */
export function planAssetIntelligence(scenes: readonly UniversalScene[]): {
  readonly decisions: readonly { readonly sceneId: string; readonly decision: AssetDecision }[];
  readonly generateCount: number;
  readonly wastedGenerationRisk: readonly string[];
} {
  const decisions = scenes.map((s) => ({ sceneId: s.sceneId, decision: decideAssetStrategy(s) }));
  const generateCount = decisions.filter((d) => d.decision.strategy === "generate").length;
  const wastedGenerationRisk = decisions
    .filter((d) => d.decision.strategy === "generate" && d.decision.costRank > ASSET_COST_RANK.native)
    .map((d) => d.sceneId);
  return { decisions, generateCount, wastedGenerationRisk };
}

// S183 + S184 — Cost and Performance (Programme H). "Affordability is a
// product requirement, not an afterthought."
//
// S183 — Production Cost Intelligence: the ESTIMATE rides the compiled
// plan BEFORE generation (per-line: script, voice, images, music,
// rendering, storage), budgets gate it, and duplicate-generation is
// prevented by content address — the same plan hash means reuse, not a
// second spend.
//
// S184 — Affordable Production Mode: the three operating modes as
// closed contracts, with the anti-cripple law structural: the FREE mode
// must still produce COMPLETE videos — every scene kind must compile
// and every capability it uses must be available at its tier (native
// assets, zero-cost voice), never an artificially limited demo.
//
// Pure module — no I/O, no wall-clock, no randomness.

import crypto from "node:crypto";
import type { CompiledProject } from "./animation-compiler";

/** Stable stringify — key-sorted at every level (the plan hash is
 *  key-order-independent, the house JSON-stability law). */
function stableStringifyOf(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x !== null && typeof x === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(x as Record<string, unknown>).sort()) out[k] = sort((x as Record<string, unknown>)[k]);
      return out;
    }
    return x;
  };
  return JSON.stringify(sort(v));
}

export const COST_INTELLIGENCE_VERSION = 1;

export const MICRO_PER_UNIT = { perNarrationChar: { zero: 0, freetier: 0, paid: 60 }, perRenderedSecond: 12, perImageNative: 0, perImageGenerated: 8000, perAssetReused: 0, perSceneStored: 15 } as const;

export type CostClass = "zero" | "freetier" | "paid";

export interface CostLineItem {
  readonly line: "script" | "voice" | "images" | "music" | "rendering" | "storage";
  readonly microUsd: number;
  readonly basis: string;
}

export interface CostEstimate {
  readonly version: typeof COST_INTELLIGENCE_VERSION;
  readonly lines: readonly CostLineItem[];
  readonly totalMicroUsd: number;
  /** The content address of the plan — the duplicate-generation key. */
  readonly planHash: string;
}

/** The estimate — BEFORE generation, from the plan's own data. The voice
 *  class is the S176 router's cost class for the chosen tier. */
export function estimateProductionCost(plan: CompiledProject, voiceClass: CostClass): CostEstimate {
  const narrationChars = plan.scenes.reduce((sum, s) => sum + (s.narration?.text.length ?? 0), 0);
  const imageOps = plan.scenes.reduce((sum, s) => sum + s.assetIds.length, 0);
  const totalSec = plan.totalMs / 1000;
  const lines: CostLineItem[] = [
    { line: "voice", microUsd: narrationChars * MICRO_PER_UNIT.perNarrationChar[voiceClass], basis: `${narrationChars} narration chars at the ${voiceClass} tier` },
    { line: "images", microUsd: imageOps * MICRO_PER_UNIT.perImageNative, basis: `${imageOps} scene asset(s) — native rendering carries no per-image spend` },
    { line: "rendering", microUsd: Math.ceil(totalSec) * MICRO_PER_UNIT.perRenderedSecond, basis: `${Math.ceil(totalSec)} s of local render time (compute, not API spend)` },
    { line: "storage", microUsd: plan.scenes.length * MICRO_PER_UNIT.perSceneStored, basis: `${plan.scenes.length} scene artifact(s)` },
    { line: "music", microUsd: plan.suggestions.length * 0, basis: `${plan.suggestions.length} suggestion(s) — the catalog rides free` },
  ];
  const totalMicroUsd = lines.reduce((sum, l) => sum + l.microUsd, 0);
  return { version: COST_INTELLIGENCE_VERSION, lines, totalMicroUsd, planHash: planHashOf(plan) };
}

/** The content address — stable stringify, sha256 (the same plan is the
 *  same hash, whatever the key order). */
export function planHashOf(plan: CompiledProject): string {
  return crypto.createHash("sha256").update(stableStringifyOf(plan)).digest("hex");
}

export interface BudgetVerdict {
  readonly ok: boolean;
  readonly reason?: string;
  readonly estimate: CostEstimate;
}

/** The budget gate — a project over budget refuses BEFORE any spend. */
export function gateBudget(estimate: CostEstimate, budgetMicroUsd: number): BudgetVerdict {
  if (!Number.isFinite(budgetMicroUsd) || budgetMicroUsd < 0) {
    return { ok: false, reason: "the budget must be a non-negative number of micro-USD", estimate };
  }
  if (estimate.totalMicroUsd > budgetMicroUsd) {
    return {
      ok: false,
      reason: `the estimate (${estimate.totalMicroUsd} µ$) exceeds the budget (${budgetMicroUsd} µ$) — the gate fires BEFORE generation, never after`,
      estimate,
    };
  }
  return { ok: true, estimate };
}

/** Duplicate-generation prevention: the same plan hash means REUSE —
 *  the artifacts exist, the spend is zero, the render is deterministic
 *  (the same inputs produced those bytes once; they will again). */
export function dedupeCheck(planHash: string, knownHashes: readonly string[]): { duplicate: boolean; action: string; spendMicroUsd: number } {
  if (knownHashes.includes(planHash)) {
    return { duplicate: true, action: "reuse the existing artifacts — the plan's content address matches a prior generation", spendMicroUsd: 0 };
  }
  return { duplicate: false, action: "generate — first sighting of this plan", spendMicroUsd: -1 };
}

// ---------------------------------------------------------------------------
// S184 — the three operating modes, with the anti-cripple law.
// ---------------------------------------------------------------------------

export const PRODUCTION_MODES = ["free", "standard", "premium"] as const;
export type ProductionMode = (typeof PRODUCTION_MODES)[number];

export interface ModeContract {
  readonly mode: ProductionMode;
  readonly voiceClasses: readonly CostClass[];
  readonly maxAssetCostRank: 0 | 1 | 2 | 3; // the S177 ladder's ceiling
  readonly description: string;
}

export const MODE_CONTRACTS: Readonly<Record<ProductionMode, ModeContract>> = Object.freeze({
  free: {
    mode: "free",
    voiceClasses: ["zero"],
    maxAssetCostRank: 1, // native + reuse — no stock API spend, no generation
    description: "local rendering, self-hosted voice, native/reused assets, native animation — COMPLETE videos, never a crippled demo",
  },
  standard: { mode: "standard", voiceClasses: ["zero", "freetier"], maxAssetCostRank: 2, description: "affordable cloud AI, optional generated assets" },
  premium: { mode: "premium", voiceClasses: ["zero", "freetier", "paid"], maxAssetCostRank: 3, description: "higher-quality paid voices, image generation, advanced services" },
});

export interface ModeAdmission {
  readonly ok: boolean;
  readonly refusals: readonly string[];
  /** The anti-cripple receipt: every scene kind the free mode can
   *  render (all six — completeness is the law). */
  readonly completeVideoPossible: boolean;
}

/** Admit a project at a mode. The FREE mode's checks are hard refusals
 *  — the tier contract rides S176/S177's closed data. */
export function enforceModeCapabilities(input: { readonly mode: ProductionMode; readonly voiceClass: CostClass; readonly maxAssetRankUsed: number }): ModeAdmission {
  const contract = MODE_CONTRACTS[input.mode];
  const refusals: string[] = [];
  if (!contract.voiceClasses.includes(input.voiceClass)) {
    refusals.push(`voice class "${input.voiceClass}" is not in the ${input.mode} mode's contract (${contract.voiceClasses.join(", ")}) — the S176 router refuses paid steps it has not been given`);
  }
  if (input.maxAssetRankUsed > contract.maxAssetCostRank) {
    refusals.push(`asset cost rank ${input.maxAssetRankUsed} exceeds the ${input.mode} ceiling (${contract.maxAssetCostRank}) — the S177 ladder keeps the tier honest`);
  }
  return {
    ok: refusals.length === 0,
    refusals,
    completeVideoPossible: true, // structural: all six kinds render natively at every tier (the engines are local)
  };
}

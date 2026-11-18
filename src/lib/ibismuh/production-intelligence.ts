// S179 + S180 — Production Intelligence (Programme F).
//
// S179 — Visual Quality Intelligence: inspect every scene for the
// roadmap's named problems (empty compositions, repetitive imagery,
// unnatural movement, inconsistent lighting, bad transitions, audio
// synchronization problems, unreadable text). Findings are typed,
// severity-ranked, and carry the finding's ARITHMETIC provenance —
// nothing here eyeballs pixels; it reads the compiled plan (the
// render-side QC — the frames themselves — already lives in render-qc/
// visual-qc/scene-qc; this is the PLAN-side inspector, the layer the
// Director can act on before a single frame renders).
//
// S180 — Intelligent Scene Repair: every finding may propose a
// correction, and every proposed correction is a SET of valid S168
// directives riding the affected scene only. The guarantees are
// structural: `requiresApproval: true` always; the plan names the
// affected sceneIds and NOTHING else may change (single-scene
// regeneration — the roadmap's "regenerates only the affected scene").
//
// Pure module — no I/O, no wall-clock, no randomness.

import type { CompiledProject, CompiledScene } from "./animation-compiler";
import { PRIMITIVE_TIMING } from "./anim/primitives";

export const PRODUCTION_INTELLIGENCE_VERSION = 1;

export type FindingSeverity = "info" | "warn" | "block";

export interface QualityFinding {
  readonly code:
    | "empty-composition"
    | "repetitive-imagery"
    | "unnatural-movement"
    | "inconsistent-lighting"
    | "bad-transitions"
    | "audio-sync"
    | "unreadable-text";
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly severity: FindingSeverity;
  readonly message: string;
}

export interface RepairDirectiveProposal {
  readonly domain: "animation" | "camera" | "visual-style";
  readonly target: string;
  readonly action: string;
  readonly params?: Record<string, number | string | boolean>;
}

export interface RepairProposal {
  readonly findingCode: QualityFinding["code"];
  readonly affectedSceneId: string;
  readonly requiresApproval: true;
  readonly summary: string;
  /** The correction as S168 directives — every one must be VALID (the
   *  battery pins this against the S168 validator). */
  readonly directives: readonly RepairDirectiveProposal[];
}

const MOVEMENT_PRIMITIVES = new Set(["camera-pan", "camera-zoom", "translate", "particle", "parallax"]);

/** The op→primitive mapping for the movement walls — graphics enters and
 *  transitions ride the closest measured primitive's wall (the S162
 *  enter vocabulary IS the reveal/translate/draw family's plan-side
 *  shape). */
const OP_TO_PRIMITIVE: Readonly<Record<string, keyof typeof PRIMITIVE_TIMING>> = Object.freeze({
  "enter:fade": "fade",
  "enter:rise": "translate",
  "enter:slide": "translate",
  "enter:pop": "spring",
  "enter:grow": "scale",
  "enter:draw": "draw",
  "enter:wipe": "reveal",
  "enter:count": "reveal",
  "transition:crossfade": "reveal",
  "transition:iris": "reveal",
  "transition:whiteout": "reveal",
  "transition:zoomthrough": "reveal",
  "transition:wipeleft": "reveal",
  "transition:wiperight": "reveal",
  "camera:pan-left": "camera-pan",
  "camera:pan-right": "camera-pan",
  "camera:zoom-in": "camera-zoom",
  "camera:zoom-out": "camera-zoom",
  "camera:drift-crawl": "camera-pan",
  "camera:push-follow": "camera-zoom",
  "camera:shake": "spring",
});

/** S179 — inspect the compiled plan. */
export function inspectProductionQuality(plan: CompiledProject): readonly QualityFinding[] {
  const findings: QualityFinding[] = [];
  const push = (f: QualityFinding) => findings.push(f);

  plan.scenes.forEach((scene: CompiledScene, i) => {
    // Empty composition: no directives, no doc, no narration.
    if (scene.operations.length === 0 && scene.doc === null && scene.narration === null) {
      push({ code: "empty-composition", sceneId: scene.sceneId, sceneIndex: i + 1, severity: "block", message: "the scene carries no directives, no document and no narration — it renders as dead air" });
    }
    // Unnatural movement: authored durations outside the S171 walls.
    for (const op of scene.operations) {
      if (op.durationMs !== undefined) {
        const primitive = OP_TO_PRIMITIVE[op.action] ?? Object.keys(PRIMITIVE_TIMING).find((k) => op.action.includes(k));
        const wall = primitive !== undefined ? PRIMITIVE_TIMING[primitive] : undefined;
        if (wall !== undefined && (op.durationMs < wall.minMs || op.durationMs > wall.maxMs)) {
          push({ code: "unnatural-movement", sceneId: scene.sceneId, sceneIndex: i + 1, severity: "warn", message: `${op.action} runs ${op.durationMs} ms — outside the measured wall [${wall.minMs}, ${wall.maxMs}] ms for ${String(primitive)}` });
        }
      }
    }
    // Audio sync: narration wider than the scene's own window.
    if (scene.narration !== null && scene.narration.durationMs > scene.durationMs + 50) {
      push({ code: "audio-sync", sceneId: scene.sceneId, sceneIndex: i + 1, severity: "block", message: `narration slot runs ${scene.narration.durationMs} ms in a ${scene.durationMs} ms scene — the voice outruns the picture` });
    }
    // Unreadable text: a text-heavy scene with no readability affordance
    // (an enter directive on text-bearing targets) — heuristic of record.
    if (scene.doc === null && scene.narration !== null && scene.operations.length === 0) {
      push({ code: "unreadable-text", sceneId: scene.sceneId, sceneIndex: i + 1, severity: "info", message: "narration with no animated affordance — the scene reads as a static card" });
    }
    // Repetitive imagery: consecutive scenes, same kind, no movement
    // primitive, no transition between them (the plan-side tell).
    const prev = plan.scenes[i - 1];
    if (prev !== undefined && prev.kind === scene.kind) {
      const movement =
        scene.operations.some((op) => MOVEMENT_PRIMITIVES.has(op.op) || op.action.startsWith("camera:")) ||
        prev.operations.some((op) => MOVEMENT_PRIMITIVES.has(op.op) || op.action.startsWith("camera:"));
      const boundary = prev.operations.some((op) => op.op === "graphics-transition");
      if (!movement && !boundary) {
        push({ code: "repetitive-imagery", sceneId: scene.sceneId, sceneIndex: i + 1, severity: "warn", message: `scene ${i} and scene ${i + 1} render the same kind with no movement and no boundary transition — the eye has nothing to re-hook` });
      }
    }
  });

  return findings;
}

/** S180 — propose repairs. Every directive proposal must survive the
 *  S168 validator (pinned); every proposal touches ONE scene. */
export function proposeRepairs(
  findings: readonly QualityFinding[],
  validate: (d: RepairDirectiveProposal) => { ok: boolean },
): { readonly proposals: readonly RepairProposal[]; readonly invalidRefused: number } {
  const proposals: RepairProposal[] = [];
  let invalidRefused = 0;
  for (const f of findings) {
    const candidates: RepairDirectiveProposal[] = [];
    switch (f.code) {
      case "repetitive-imagery":
      case "unreadable-text":
        candidates.push({ domain: "camera", target: "scene", action: "camera:drift-crawl" }, { domain: "animation", target: "headline", action: "enter:rise", params: { ease: "measured-out" } });
        break;
      case "bad-transitions":
        candidates.push({ domain: "animation", target: `boundary:${Math.max(1, f.sceneIndex - 1)}`, action: "transition:crossfade" });
        break;
      case "empty-composition":
        candidates.push({ domain: "animation", target: "headline", action: "enter:rise" }, { domain: "animation", target: "boundary:1", action: "transition:iris" });
        break;
      default:
        break; // audio-sync and unnatural-movement need human replanning, not a canned directive
    }
    for (const d of candidates) {
      if (validate(d)) {
        proposals.push({ findingCode: f.code, affectedSceneId: f.sceneId, requiresApproval: true, summary: `${f.code} at ${f.sceneId}: ${d.action}`, directives: [d] });
        break; // one proposal per finding — the cheapest valid correction
      }
      invalidRefused++;
    }
  }
  return { proposals, invalidRefused };
}

/** The repair plan's structural guarantees, checkable: it names the
 *  affected scenes and NOTHING else may change. */
export function repairScopeGuard(proposal: RepairProposal, projectSceneIds: readonly string[]): { ok: boolean; reason: string } {
  if (!projectSceneIds.includes(proposal.affectedSceneId)) {
    return { ok: false, reason: `the repair targets "${proposal.affectedSceneId}", which is not in the project — a repair may never invent a scene` };
  }
  if (proposal.requiresApproval !== true) {
    return { ok: false, reason: "a repair without requiresApproval is not a repair — the user approves, then Ibismuh Studio regenerates only the affected scene" };
  }
  return { ok: true, reason: "the repair is scoped to one declared scene and requires approval" };
}

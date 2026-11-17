// S170 — the Animation Compiler (Programme B).
//
// The roadmap's ask: "Translates Director instructions into native engine
// operations: identify the target, select an approved preset, calculate
// its timeline, apply easing, generate frame states, render through the
// native engine. The AI does not generate the animation."
//
// The acceptance test this module is BUILT around: "disconnect the AI
// provider after the project has been approved. TubeForge must still
// render the complete video." The compiler therefore:
//   - imports ZERO provider/AI modules (the import graph is pinned by a
//     source scan in the battery — the compile is data-in/data-out);
//   - re-runs the S169 validator (defense in depth — the gate is the
//     validator, not caller discipline);
//   - resolves timelines from the SCHEMA's own clocks (the boundary
//     atMs is arithmetic on scene durations — no clock invention);
//   - leaves engine-owned defaults UNRESOLVED on purpose: an op carries
//     durationMs/ease only when AUTHORED — absent fields mean the
//     engine's own defaults apply at render (one writer each — the
//     compiler never re-lists an engine's defaults).
//
// Frame states are NOT generated here: they are the engines' business
// (the native pipelines already generate them — that is what "native"
// means). The compiler stops at the compiled plan: typed operations,
// resolved timelines, the S87 projection, the narration slots, the asset
// manifest — data the render path consumes without any model in the loop.
//
// Determinism: pure module — no wall-clock, no randomness, no I/O, no
// network (the banned-token scan covers this file whole; keep it that
// way — even the comments stay clean).

import { DIRECTOR_EASES, type DirectorActionEntry } from "./director-vocabulary";
import {
  projectUniversalTimeline,
  validateUniversalProject,
  type UniversalSceneProject,
  type UniversalScene,
} from "./universal-scene";
import type { TimelineClip } from "./timeline";

export const ANIMATION_COMPILER_VERSION = 1;

/** One compiled operation — a Director instruction resolved into the
 *  engine-facing shape. `action` names the catalog entry; `timeline`
 *  carries only what was AUTHORED (the engine owns the rest). */
export interface CompiledOperation {
  readonly op:
    | "graphics-enter"
    | "graphics-transition"
    | "camera-move"
    | "slide-camera"
    | "slide-kinetic"
    | "3d-action"
    | "whiteboard-knob"
    | "gesture-intent"
    | "style-select";
  readonly lane: DirectorActionEntry["lane"];
  /** The catalog action name, verbatim (the audit trail is the plan). */
  readonly action: string;
  readonly target: string;
  /** Resolved timeline (ms on the composition clock). `atMs` present for
   *  boundary transitions (arithmetic) and scene-scoped ops (the scene's
   *  window); absent when the engine sequences it (element enters). */
  readonly atMs?: number;
  readonly durationMs?: number;
  /** The authored easing — must be in DIRECTOR_EASES (validated here). */
  readonly ease?: string;
  /** Remaining authored params (JSON-stable scalars), minus the ones the
   *  compiler consumed (atMs/durationMs/ease). */
  readonly params: Readonly<Record<string, number | string | boolean>>;
}

export interface CompiledNarrationSlot {
  readonly sceneId: string;
  readonly text: string;
  readonly voiceId?: string;
  readonly providerHint?: string;
  /** The scene's window on the composition clock (ms). */
  readonly atMs: number;
  readonly durationMs: number;
}

export interface CompiledScene {
  readonly sceneId: string;
  readonly kind: UniversalScene["kind"];
  readonly durationMs: number;
  readonly atMs: number;
  readonly operations: readonly CompiledOperation[];
  readonly narration: CompiledNarrationSlot | null;
  /** The scene's own asset ids (provenance-closed by the S169 validator). */
  readonly assetIds: readonly string[];
  /** The mode's own document, passed through untouched (the mode's
   *  validator owns it — the compiler never opens it). */
  readonly doc: Readonly<Record<string, unknown>> | null;
  /** The S87 projection (the composition's own shape). */
  readonly clip: TimelineClip;
}

export interface CompiledProject {
  readonly version: typeof ANIMATION_COMPILER_VERSION;
  readonly title: string;
  readonly mode: UniversalSceneProject["mode"];
  readonly totalMs: number;
  readonly scenes: readonly CompiledScene[];
  /** Non-animation suggestions (music/sound), verbatim — the asset lane
   *  disposes. */
  readonly suggestions: readonly { readonly domain: string; readonly action: string; readonly target: string; readonly params: Readonly<Record<string, number | string | boolean>> }[];
}

export interface CompilerError {
  readonly path: string;
  readonly message: string;
}

export type CompileVerdict =
  | { readonly ok: true; readonly plan: CompiledProject }
  | { readonly ok: false; readonly errors: readonly CompilerError[] };

const OP_BY_PREFIX: Readonly<Record<string, { op: CompiledOperation["op"]; lane: DirectorActionEntry["lane"] }>> = {
  "enter:": { op: "graphics-enter", lane: "graphics" },
  "transition:": { op: "graphics-transition", lane: "graphics" },
  "camera:": { op: "camera-move", lane: "classic" },
  "slide-camera:": { op: "slide-camera", lane: "slides" },
  "slide-kinetic-reveal": { op: "slide-kinetic", lane: "slides" },
  "3d:": { op: "3d-action", lane: "3d" },
  "whiteboard:": { op: "whiteboard-knob", lane: "whiteboard" },
  "gesture:": { op: "gesture-intent", lane: "character" },
  "style:": { op: "style-select", lane: "graphics" },
};

/** The compile — validate, resolve, project. Returns EVERY failure. */
export function compileUniversalProject(project: unknown): CompileVerdict {
  const checked = validateUniversalProject(project);
  if (!checked.ok) {
    return { ok: false, errors: checked.errors.map((e) => ({ path: e.path, message: `${e.code}: ${e.message}` })) };
  }

  const errors: CompilerError[] = [];
  const p = project as UniversalSceneProject;
  const clips = projectUniversalTimeline(p);
  const scenes: CompiledScene[] = [];
  const suggestions: { domain: string; action: string; target: string; params: Record<string, number | string | boolean> }[] = [];

  for (const [i, scene] of p.scenes.entries()) {
    const clip = clips[i];
    if (clip === undefined) {
      errors.push({ path: `$.scenes[${i}]`, message: "the timeline projection dropped a scene" });
      continue;
    }
    const atMs = Math.round(clip.startSec * 1000);
    const endMs = Math.round(clip.endSec * 1000);
    const operations: CompiledOperation[] = [];

    for (const [j, d] of scene.directives.entries()) {
      const at = `$.scenes[${i}].directives[${j}]`;

      // Non-animation domains: suggestions pass through verbatim.
      if (d.domain === "music" || d.domain === "sound") {
        suggestions.push({ domain: d.domain, action: d.action, target: d.target, params: { ...(d.params ?? {}) } });
        continue;
      }
      const prefix = Object.keys(OP_BY_PREFIX).find((k) => d.action === k.replace(/:$/, "") || d.action.startsWith(k));
      const mapped = prefix !== undefined ? OP_BY_PREFIX[prefix] : undefined;
      if (mapped === undefined) {
        // The S168 validator admitted this directive (it passed the batch
        // gate), so reaching here means a domain payload outside the op
        // namespaces (script text, duration, mode) — those are already
        // carried by the scene/project fields, not by ops.
        continue;
      }

      const params: Record<string, number | string | boolean> = { ...(d.params ?? {}) };
      const op: {
        op: CompiledOperation["op"];
        lane: DirectorActionEntry["lane"];
        action: string;
        target: string;
        atMs?: number;
        durationMs?: number;
        ease?: string;
        params: Record<string, number | string | boolean>;
      } = { op: mapped.op, lane: mapped.lane, action: d.action, target: d.target, params };

      // Easing: authored only, must ride the ONE curve table's names.
      if (typeof params.ease === "string") {
        if (!(DIRECTOR_EASES as readonly string[]).includes(params.ease)) {
          errors.push({ path: at, message: `ease "${params.ease}" is not in the measured curve table — the Director picks from DIRECTOR_EASES` });
          continue;
        }
        op.ease = params.ease;
        delete params.ease;
      }

      // Authored timing wins; the engine's own defaults fill the rest.
      if (typeof params.durationMs === "number" && Number.isFinite(params.durationMs) && params.durationMs > 0) {
        op.durationMs = Math.round(params.durationMs);
        delete params.durationMs;
      }
      if (typeof params.atMs === "number" && Number.isFinite(params.atMs) && params.atMs >= 0) {
        op.atMs = Math.round(params.atMs);
        delete params.atMs;
      } else if (d.action.startsWith("transition:")) {
        // Boundary arithmetic: boundary:N sits at scene N's end — the
        // schema's own clocks, no clock invention.
        const n = Number(d.target.slice("boundary:".length));
        const boundaryScene = p.scenes[n - 1];
        if (boundaryScene === undefined) {
          errors.push({ path: at, message: `boundary:${n} has no scene N to end at (the project has ${p.scenes.length} scenes)` });
          continue;
        }
        const boundaryClip = clips[n - 1];
        op.atMs = boundaryClip !== undefined ? Math.round(boundaryClip.endSec * 1000) : atMs;
      } else if (mapped.op !== "graphics-enter") {
        // Scene-scoped ops (camera, gestures, knobs, 3d, slides) ride the
        // scene's own window unless authored otherwise.
        op.atMs = atMs;
      }

      operations.push(op as CompiledOperation);
    }

    const narration =
      scene.narration !== undefined && scene.narration.text.trim().length > 0
        ? {
            sceneId: scene.sceneId,
            text: scene.narration.text,
            voiceId: scene.narration.voiceId,
            providerHint: scene.narration.providerHint,
            atMs,
            durationMs: endMs - atMs,
          }
        : null;

    scenes.push({
      sceneId: scene.sceneId,
      kind: scene.kind,
      durationMs: scene.durationMs,
      atMs,
      operations,
      narration,
      assetIds: scene.assets.map((a) => a.id),
      doc: scene.doc ?? null,
      clip,
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  const lastClip = clips[clips.length - 1];
  return {
    ok: true,
    plan: {
      version: ANIMATION_COMPILER_VERSION,
      title: p.title,
      mode: p.mode,
      totalMs: lastClip !== undefined ? Math.round(lastClip.endSec * 1000) : 0,
      scenes,
      suggestions,
    },
  };
}

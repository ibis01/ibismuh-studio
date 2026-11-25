// S181 + S182 — Creator Experience (Programme G).
//
// S181 — the Professional Timeline Editor's pure op layer: the closed
// edit-op set over the S169 project, each op returning a NEW project
// (immutable — undo is the previous project, because edits are data),
// every op re-validated by the S169 validator after application.
//
// S182 — the Creative Director Controls: the closed knob set that a
// BEGINNER can drive (one preset) and an ADVANCED user can drive (every
// knob), compiling into S168 directives and S174 profiles — never
// bypassing them.
//
// Pure module — no I/O, no wall-clock, no randomness.

import { validateUniversalProject, UNIVERSAL_SCENE_DURATION_MIN_MS, UNIVERSAL_SCENE_DURATION_MAX_MS, type UniversalScene, type UniversalSceneProject } from "./universal-scene";
import { validateDirectorDirective, type DirectorDirective } from "./director-vocabulary";

export const CREATOR_EXPERIENCE_VERSION = 1;

// ---------------------------------------------------------------------------
// S181 — the timeline edit ops.
// ---------------------------------------------------------------------------

export const TIMELINE_EDIT_OPS = [
  "resize-scene", // adjust animation duration (within the schema walls)
  "move-scene", // change placement (the atSec hint)
  "replace-background-asset", // change the image (provenance closure re-checked)
  "set-narration", // replace the voice's text
  "set-transition", // change the boundary transition (S168 vocabulary only)
  "delete-scene",
] as const;
export type TimelineEditOp = (typeof TIMELINE_EDIT_OPS)[number];

export type EditOpPayload =
  | { readonly op: "resize-scene"; readonly sceneId: string; readonly durationMs: number }
  | { readonly op: "move-scene"; readonly sceneId: string; readonly atSec: number }
  | { readonly op: "replace-background-asset"; readonly sceneId: string; readonly assetId: string }
  | { readonly op: "set-narration"; readonly sceneId: string; readonly text: string }
  | { readonly op: "set-transition"; readonly sceneIndex: number; readonly transition: string }
  | { readonly op: "delete-scene"; readonly sceneId: string };

export interface EditResult {
  readonly ok: boolean;
  readonly project?: UniversalSceneProject;
  readonly reason?: string;
}

function mapScene(scene: UniversalScene, sceneId: string, f: (s: UniversalScene) => UniversalScene): UniversalScene[] {
  return scene.sceneId === sceneId ? [f(scene)] : [scene];
}

/** Apply ONE edit op — returns a NEW project or a named refusal. */
export function applyTimelineEdit(project: UniversalSceneProject, payload: EditOpPayload): EditResult {
  if (!(TIMELINE_EDIT_OPS as readonly string[]).includes(payload.op)) {
    return { ok: false, reason: `"${String(payload.op)}" is not a timeline edit op (${TIMELINE_EDIT_OPS.join(", ")})` };
  }
  let next: UniversalSceneProject = project;
  if (payload.op === "set-transition") {
    const d: DirectorDirective = { domain: "animation", target: `boundary:${payload.sceneIndex}`, action: `transition:${payload.transition}` };
    const verdict = validateDirectorDirective(d);
    if (!verdict.ok) return { ok: false, reason: verdict.errors[0]?.message ?? "the transition is not valid vocabulary" };
    const scenes = next.scenes.map((s, i) => (i === payload.sceneIndex - 1 ? { ...s, directives: [...s.directives.filter((x) => !(x.action.startsWith("transition:") && x.target === `boundary:${payload.sceneIndex}`)), d] } : s));
    next = { ...next, scenes };
    const checkTransition = validateUniversalProject(next);
    const e0 = checkTransition.errors[0];
    if (!checkTransition.ok) return { ok: false, reason: `the edit breaks the schema: ${e0?.path ?? "$"} — ${e0?.message ?? "rejected"}` };
    return { ok: true, project: next };
  }
  if (payload.op === "delete-scene") {
    const scenes = project.scenes.filter((s) => s.sceneId === payload.sceneId);
    if (scenes.length === 0) return { ok: false, reason: `no scene "${payload.sceneId}" to delete` };
    const rest = project.scenes.filter((s) => s.sceneId !== payload.sceneId);
    if (rest.length === 0) return { ok: false, reason: "a project needs at least one scene" };
    next = { ...project, scenes: rest };
  } else {
    const sceneId: string = payload.sceneId;
    const scenes = project.scenes.flatMap((s) =>
      mapScene(s, sceneId, (scene) => {
        switch (payload.op) {
          case "resize-scene":
            return { ...scene, durationMs: Math.round(payload.durationMs) };
          case "move-scene":
            return { ...scene, atSec: payload.atSec };
          case "replace-background-asset":
            return { ...scene, background: { type: "image" as const, assetId: payload.assetId }, assets: scene.assets.some((a) => a.id === payload.assetId) ? scene.assets : [...scene.assets, { id: payload.assetId, kind: "image" as const, origin: "upload" as const }] };
          case "set-narration":
            return { ...scene, narration: { ...scene.narration, text: payload.text } };
          default:
            return scene;
        }
      }),
    );
    next = { ...project, scenes };
  }
  // THE law: every edit re-validates the whole project (the walls, the
  // provenance closure, the directive gate — nothing edits around them).
  const check = validateUniversalProject(next);
  const first = check.errors[0];
  if (!check.ok) {
    return { ok: false, reason: `the edit breaks the schema: ${first?.path ?? "$"} — ${first?.message ?? "rejected"}` };
  }
  return { ok: true, project: next };
}

/** The resize walls, exposed for the editor UI (engine clocks may be
 *  tighter, never looser). */
export const SCENE_DURATION_WALLS = { minMs: UNIVERSAL_SCENE_DURATION_MIN_MS, maxMs: UNIVERSAL_SCENE_DURATION_MAX_MS };

// ---------------------------------------------------------------------------
// S182 — the creative director controls.
// ---------------------------------------------------------------------------

export const CREATIVE_PRESETS = ["professional", "energetic", "calm"] as const;
export type CreativePreset = (typeof CREATIVE_PRESETS)[number];

export const CAMERA_STYLES = ["none", "gentle", "dynamic"] as const;
export type CameraStyle = (typeof CAMERA_STYLES)[number];

export interface CreativeControls {
  readonly preset: CreativePreset;
  /** 0..1 — scales the motion vocabulary's energy (intensity rides the
   *  S171 walls: higher = faster staggers, lower = calmer drifts). */
  readonly animationIntensity?: number;
  /** 0.75..1.33 — multiplies scene durations (pacing), inside the walls. */
  readonly pacing?: number;
  readonly cameraStyle?: CameraStyle;
  /** The S174 quality profile for narration. */
  readonly narrationProfile?: "nigerian-english" | "british-english" | "american-english" | "neutral-multilingual";
}

const PRESET_DEFAULTS: Readonly<Record<CreativePreset, Omit<CreativeControls, "preset">>> = Object.freeze({
  professional: { animationIntensity: 0.5, pacing: 1, cameraStyle: "gentle", narrationProfile: "neutral-multilingual" },
  energetic: { animationIntensity: 0.9, pacing: 0.85, cameraStyle: "dynamic", narrationProfile: "american-english" },
  calm: { animationIntensity: 0.25, pacing: 1.2, cameraStyle: "none", narrationProfile: "british-english" },
});

const CAMERA_STYLE_DIRECTIVES: Readonly<Record<CameraStyle, readonly DirectorDirective[]>> = Object.freeze({
  none: [],
  gentle: [{ domain: "camera", target: "scene", action: "camera:drift-crawl" }],
  dynamic: [{ domain: "camera", target: "scene", action: "camera:push-follow" }],
});

export interface ControlsVerdict {
  readonly ok: boolean;
  readonly reason?: string;
  /** The resolved controls (preset defaults under explicit overrides). */
  readonly controls?: Required<Omit<CreativeControls, "preset">> & { preset: CreativePreset };
  /** The directives the controls compile into (S168-valid, pinned). */
  readonly directives?: readonly DirectorDirective[];
}

/** Resolve the controls — a beginner passes a preset name and gets a
 *  professional result; an advanced user overrides any knob (still
 *  inside the walls). Every compiled directive must survive the S168
 *  validator (pinned by the battery). */
export function resolveCreativeControls(controls: CreativeControls): ControlsVerdict {
  if (!(CREATIVE_PRESETS as readonly string[]).includes(controls.preset)) {
    return { ok: false, reason: `"${String(controls.preset)}" is not a preset (${CREATIVE_PRESETS.join(", ")})` };
  }
  const base = PRESET_DEFAULTS[controls.preset];
  const intensity = controls.animationIntensity ?? base.animationIntensity;
  const pacing = controls.pacing ?? base.pacing;
  if (typeof intensity !== "number" || intensity < 0 || intensity > 1) {
    return { ok: false, reason: "animationIntensity must be in [0, 1]" };
  }
  if (typeof pacing !== "number" || pacing < 0.75 || pacing > 1.33) {
    return { ok: false, reason: "pacing must be in [0.75, 1.33] — the walls keep the video a video" };
  }
  const cameraStyleRaw = controls.cameraStyle ?? base.cameraStyle;
  if (typeof cameraStyleRaw !== "string" || !(CAMERA_STYLES as readonly string[]).includes(cameraStyleRaw)) {
    return { ok: false, reason: `"${String(cameraStyleRaw)}" is not a camera style (${CAMERA_STYLES.join(", ")})` };
  }
  const cameraStyle: CameraStyle = cameraStyleRaw as CameraStyle;
  const narrationProfile = (controls.narrationProfile ?? base.narrationProfile) as NonNullable<CreativeControls["narrationProfile"]>;
  const directives = [...CAMERA_STYLE_DIRECTIVES[cameraStyle]];
  for (const d of directives) {
    const v = validateDirectorDirective(d);
    if (!v.ok) return { ok: false, reason: v.errors[0]?.message ?? "a control directive refused" };
  }
  return {
    ok: true,
    controls: { preset: controls.preset, animationIntensity: intensity, pacing, cameraStyle, narrationProfile },
    directives,
  };
}

/** Apply pacing to a project's scene durations — inside the schema
 *  walls, always (the walls are the ceiling; the controls never
 *  bypass them). */
export function applyPacing(project: UniversalSceneProject, pacing: number): UniversalSceneProject {
  const scenes = project.scenes.map((s) => ({
    ...s,
    durationMs: Math.min(SCENE_DURATION_WALLS.maxMs, Math.max(SCENE_DURATION_WALLS.minMs, Math.round(s.durationMs * pacing))),
  }));
  return { ...project, scenes };
}

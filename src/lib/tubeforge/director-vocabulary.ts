// S168 — the Director's closed authority vocabulary (Programme B, the
// roadmap's "AI Director" ask).
//
// THE LAW: the Director NAMES supported commands, never INVENTS them. The
// commissioning report is explicit — the Director "must understand the
// capabilities of the six engines and must not invent unsupported
// animation commands". This module is that sentence as code: a CLOSED
// catalog of every decision the Director may author, where each entry
// resolves to a REAL native implementor in one of the six engines, plus
// the validator that rejects anything outside the catalog.
//
// Layering (one-writer law, never duplicated):
//   - THIS module enforces MEMBERSHIP — can the command be named at all?
//   - the engines' own sanitizers (already shipped: the graphics doc
//     validator's MOTION_KINDS_BY_ELEMENT compatibility table, the
//     transition spec sanitizer, the 3D tolerant parser, the rig
//     validators) enforce RANGES and per-target compatibility where the
//     command lands. The Director vocabulary never re-clamps a range it
//     does not own.
//
// Determinism: pure module — no Date, no Math.random, no I/O. The
// catalogs are frozen at module load; the validator is a pure function.
// The frame-truth scan's banned tokens stay absent by construction.

import { NATIVE_TRANSITION_TYPES } from "./graphics/transitions";
import { GRAPHICS_ELEMENT_KINDS, MOTION_KINDS_BY_ELEMENT } from "./graphics/types";
import { EASE_CURVES, type EaseName } from "./anim/easing";
import type { MoveKind } from "./motion";
import type { SlideCameraKind } from "./slides-kinetic";
import type { RoughKnobs } from "./whiteboard/roughen";

/** The Director spec's version — first field on any serialized plan. */
export const DIRECTOR_VERSION = 1;

// ---------------------------------------------------------------------------
// The decision domains — the closed set of WHAT the Director may decide.
// Verbatim responsibilities from the roadmap's S168 ask; anything outside
// this set is not the Director's to decide (the operator's or the
// engine's), and the validator says so.
// ---------------------------------------------------------------------------

export const DIRECTOR_DECISION_DOMAINS = [
  "script", // write the narration the engines will time against
  "storyboard", // per-scene content: visuals, order, grouping
  "scene-duration", // per-scene clock (within the walls the engines set)
  "visual-style", // which engine / style preset renders each scene
  "camera", // camera intentions per scene or shot
  "animation", // the motion requirements: enters, transitions, gestures
  "music", // SUGGEST the music bed (selection is the asset lane's)
  "sound", // SUGGEST the SFX cues (the mixer owns the actual lanes)
  "production-mode", // which of the three operating modes applies
] as const;

export type DirectorDecisionDomain = (typeof DIRECTOR_DECISION_DOMAINS)[number];

// ---------------------------------------------------------------------------
// The animation catalog — the closed set of HOW. Every action entry names
// the native implementor it compiles into (S170's compiler resolves
// through this field — if the implementor dies, typecheck/link fails and
// the catalog cannot silently rot).
// ---------------------------------------------------------------------------

/** The classic lane's camera vocabulary — typed against the REAL MoveKind
 *  union (motion.ts). If the engine's union ever changes shape, this list
 *  fails typecheck: the Director cannot name a move the engine does not
 *  have, and cannot MISS one the engine adds without this file knowing. */
export const DIRECTOR_CAMERA_MOVES: readonly MoveKind[] = [
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
  "tilt-up",
  "tilt-down",
  "diag-tl",
  "diag-br",
  "punch",
  "studio",
  "shake",
  "push-follow",
  "drift-crawl",
  "hold",
];

/** The slides lane's camera vocabulary — typed against SlideCameraKind. */
export const DIRECTOR_SLIDE_CAMERAS: readonly SlideCameraKind[] = ["push", "pull", "punch", "hold"];

/** The native transition vocabulary — DERIVED, not copied: this is the
 *  engine's own closed set imported verbatim (S163). */
export const DIRECTOR_TRANSITIONS = NATIVE_TRANSITION_TYPES;

/** The graphics enter vocabulary — DERIVED from the engine's own
 *  compatibility table (the union of what ANY element kind accepts; the
 *  per-kind compatibility is the doc validator's job, one writer). */
export const DIRECTOR_GRAPHICS_ENTERS: readonly string[] = Object.freeze(
  Array.from(new Set(Object.values(MOTION_KINDS_BY_ELEMENT).flat())),
);

/** The easing vocabulary — DERIVED from the ONE curve table (S162's
 *  opus-anchored set). The Director picks from measured curves only. */
export const DIRECTOR_EASES: readonly EaseName[] = Object.freeze(
  Object.keys(EASE_CURVES) as EaseName[],
);

/** The 3D lane's authorable actions (scene3d.ts grammar): objects and
 *  lights are additive, the camera is keyframed, and S167's finisher
 *  channels (push-in, shake) are first-class Director intentions. */
export const DIRECTOR_3D_ACTIONS = [
  "object-add",
  "light-add",
  "camera-keyframe",
  "push-in",
  "shake",
] as const;
export type Director3DAction = (typeof DIRECTOR_3D_ACTIONS)[number];

/** The whiteboard lane's hand-drawn knobs (S164) — the Director may ask
 *  for the FEEL (roughness, bowing) within the engine's own walls. */
export const DIRECTOR_WHITEBOARD_KNOBS: readonly (keyof RoughKnobs)[] = ["roughness", "bowing"];

/** The character lane's gesture INTENTS — the Director states purpose,
 *  never pose geometry: planRigTimeline's purpose classification (setup
 *  welcomes, action points, emphasis punctuates; rest is the floor) owns
 *  the actual pose selection. */
export const DIRECTOR_GESTURE_INTENTS = ["setup", "action", "emphasis", "rest"] as const;
export type DirectorGestureIntent = (typeof DIRECTOR_GESTURE_INTENTS)[number];

/** One entry of the animation catalog: an action the Director may author,
 *  the lane that executes it, and the native symbol that implements it. */
export interface DirectorActionEntry {
  /** The action name — the exact string a Director directive carries. */
  readonly action: string;
  /** The engine lane that will execute it. */
  readonly lane: "graphics" | "whiteboard" | "slides" | "classic" | "character" | "3d";
  /** The native implementor, named for provenance (S170 resolves here). */
  readonly implements: string;
  /** Extra constraint the validator applies beyond membership. */
  readonly targets?: readonly string[];
}

/** THE catalog — closed, frozen, derivable. Derived lists are spread in
 *  from the engine constants above; nothing here is hand-copied twice. */
export const DIRECTOR_ANIMATION_CATALOG: readonly DirectorActionEntry[] = Object.freeze([
  // graphics (the S162 measured vocabulary + S163 transitions)
  ...DIRECTOR_GRAPHICS_ENTERS.map((enter) => ({
    action: `enter:${enter}`,
    lane: "graphics" as const,
    implements: "graphics/render.ts renderGraphics (enter via MOTION_KINDS_BY_ELEMENT)",
  })),
  ...DIRECTOR_TRANSITIONS.map((t) => ({
    action: `transition:${t}`,
    lane: "graphics" as const,
    implements: "graphics/transitions.ts (the S163 native engine)",
  })),
  // camera (classic lane)
  ...DIRECTOR_CAMERA_MOVES.map((m) => ({
    action: `camera:${m}`,
    lane: "classic" as const,
    implements: "motion.ts (the MoveKind planner)",
  })),
  // slides
  ...DIRECTOR_SLIDE_CAMERAS.map((c) => ({
    action: `slide-camera:${c}`,
    lane: "slides" as const,
    implements: "slides-kinetic.ts (the kinetic page camera)",
  })),
  { action: "slide-kinetic-reveal", lane: "slides", implements: "slides-kinetic.ts (SLIDE_KINETIC_SEMANTICS)" },
  // 3D
  ...DIRECTOR_3D_ACTIONS.map((a) => ({
    action: `3d:${a}`,
    lane: "3d" as const,
    implements: "scene3d.ts (the 3D grammar + the S167 finisher channels)",
  })),
  // whiteboard
  ...DIRECTOR_WHITEBOARD_KNOBS.map((k) => ({
    action: `whiteboard:${k}`,
    lane: "whiteboard" as const,
    implements: "whiteboard/roughen.ts (the S164 hand-drawn geometry)",
  })),
  // character
  ...DIRECTOR_GESTURE_INTENTS.map((g) => ({
    action: `gesture:${g}`,
    lane: "character" as const,
    implements: "characters/rig-director.ts planRigTimeline (the gesture table)",
  })),
]);

/** Every action name, for membership checks. */
export const DIRECTOR_ANIMATION_ACTIONS: readonly string[] = Object.freeze(
  DIRECTOR_ANIMATION_CATALOG.map((e) => e.action),
);

// ---------------------------------------------------------------------------
// The directive shape + the validator.
// ---------------------------------------------------------------------------

/** One Director decision, as it rides from planning into compilation
 *  (S170). Everything here is JSON — the Director's output is DATA, and
 *  the plan survives provider loss because data needs no provider. */
export interface DirectorDirective {
  readonly domain: DirectorDecisionDomain;
  /** What the action binds to: an element id, a scene ref, a lane name —
   *  the per-action contract defines what a target means. */
  readonly target: string;
  /** The action (animation domain) or the decision payload (other
   *  domains — script text, style name, mode name). */
  readonly action: string;
  /** Optional parameters — numbers/strings/booleans only (JSON-stable). */
  readonly params?: Readonly<Record<string, number | string | boolean>>;
}

export interface DirectorVocabError {
  readonly code: "unknown-domain" | "unknown-action" | "target-rejected" | "param-rejected";
  readonly message: string;
}

export type DirectorVocabVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly DirectorVocabError[] };

/** The per-domain action namespaces. Non-animation domains carry their
 *  own closed payload namespaces (the style names and mode names are the
 *  lanes' own presets; junk is an error, never coerced). */
const DOMAIN_ACTION_PREFIXES: Readonly<Record<DirectorDecisionDomain, readonly string[]>> = {
  script: ["script:"],
  storyboard: ["storyboard:"],
  "scene-duration": ["duration:"],
  "visual-style": ["style:graphics", "style:whiteboard", "style:slides", "style:classic", "style:character", "style:3d"],
  camera: DIRECTOR_CAMERA_MOVES.map((m) => `camera:${m}`).concat(DIRECTOR_SLIDE_CAMERAS.map((c) => `slide-camera:${c}`)),
  animation: DIRECTOR_ANIMATION_ACTIONS.filter((a) => /^(enter:|transition:|3d:|whiteboard:|gesture:|slide-kinetic)/.test(a)),
  music: ["music:suggest"],
  sound: ["sound:suggest"],
  "production-mode": ["mode:free", "mode:standard", "mode:premium"],
};

// The animation domain's namespace — enters and transitions carry their
// own per-target contracts (checked below via the engine's table).

/** Validate ONE directive. Pure; returns EVERY failure, not just the
 *  first (batch review beats whack-a-mole). */
export function validateDirectorDirective(dir: DirectorDirective): DirectorVocabVerdict {
  const errors: DirectorVocabError[] = [];

  if (!(DIRECTOR_DECISION_DOMAINS as readonly string[]).includes(dir.domain)) {
    errors.push({
      code: "unknown-domain",
      message: `"${String(dir.domain)}" is not a Director decision domain — the closed set is ${DIRECTOR_DECISION_DOMAINS.join(", ")}`,
    });
    return { ok: false, errors };
  }

  const allowed = DOMAIN_ACTION_PREFIXES[dir.domain];
  const matched = allowed.find((p) => dir.action === p || dir.action.startsWith(p));
  if (!matched) {
    errors.push({
      code: "unknown-action",
      message: `"${dir.action}" is not an authorable action in domain "${dir.domain}" — the Director names supported commands, never invents them`,
    });
    return { ok: false, errors };
  }

  // Graphics actions bind through the engine's OWN compatibility table —
  // the validator reads MOTION_KINDS_BY_ELEMENT rather than re-listing
  // what is legal per kind (one writer). Enters bind to element kinds;
  // transitions bind ONLY to boundaries ("boundary:N", N indexing the
  // join between scene N and scene N+1).
  if (dir.action.startsWith("enter:")) {
    const motion = dir.action.slice("enter:".length);
    const legal = (MOTION_KINDS_BY_ELEMENT as Record<string, readonly string[]>)[dir.target];
    if (legal === undefined) {
      errors.push({
        code: "target-rejected",
        message: `enter target "${dir.target}" is not a graphics element kind (${GRAPHICS_ELEMENT_KINDS.join(", ")})`,
      });
    } else if (!legal.includes(motion)) {
      errors.push({
        code: "target-rejected",
        message: `enter "${motion}" is not legal on element "${dir.target}" — the engine's own compatibility table decides (MOTION_KINDS_BY_ELEMENT)`,
      });
    }
  }
  if (dir.action.startsWith("transition:") && !/^boundary:\d+$/.test(dir.target)) {
    errors.push({
      code: "target-rejected",
      message: `transition target "${dir.target}" must be a "boundary:N" ref (the S163 engine indexes transitions by boundary)`,
    });
  }

  // Gesture intents must not smuggle pose geometry into params — the
  // Director states purpose; the gesture table owns the poses.
  if (dir.action.startsWith("gesture:")) {
    for (const key of Object.keys(dir.params ?? {})) {
      if (/^(pose|angles|rotation|position)/i.test(key)) {
        errors.push({
          code: "param-rejected",
          message: `gesture directive param "${key}" smuggles pose geometry — the Director states intent (setup/action/emphasis/rest), the gesture table owns poses`,
        });
      }
    }
  }

  // Params (all domains): JSON-stable scalars only, finite numbers.
  for (const [key, value] of Object.entries(dir.params ?? {})) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      errors.push({ code: "param-rejected", message: `param "${key}" is not a finite number` });
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** Validate a whole directive batch (the plan's animation layer). Returns
 *  the rejections keyed by index — the S170 compiler refuses to compile
 *  a plan with ANY invented command (fail-closed, never skip-and-render). */
export function assertNoInventedCommands(
  directives: readonly DirectorDirective[],
): { ok: boolean; rejections: ReadonlyMap<number, readonly DirectorVocabError[]> } {
  const rejections = new Map<number, readonly DirectorVocabError[]>();
  directives.forEach((dir, i) => {
    const verdict = validateDirectorDirective(dir);
    if (!verdict.ok) rejections.set(i, verdict.errors);
  });
  return { ok: rejections.size === 0, rejections };
}

// ---------------------------------------------------------------------------
// The prohibitions — the never-list, as data (the spec doc's §3 in code
// form). These are LAWS, not configuration.
// ---------------------------------------------------------------------------

export const DIRECTOR_PROHIBITIONS: readonly string[] = Object.freeze([
  "no invented animation commands — every directive must resolve through DIRECTOR_ANIMATION_CATALOG",
  "no phoneme lip-sync claims — the character lane renders beat-sync mouth classes, labeled as such",
  "no new engine kinds or lanes — the six engines are the whole world",
  "no timeline override beyond scene duration — the universal timeline (S87) owns the clock",
  "no provider invention — voice/music providers come from the registry, never from a directive",
  "no cost-creating action outside the budget gate — spend safety rides spend.ts, not the Director",
  "no rendering decisions — the Director suggests, the human approves, the engines render deterministically without AI",
]);

// ---------------------------------------------------------------------------
// JSON-stable serialization (sorted keys, one shape) — the plan is data
// that must round-trip byte-stably like every other house document.
// ---------------------------------------------------------------------------

/** Serialize a directive with sorted keys (the house JSON-stability law). */
export function serializeDirectorDirective(dir: DirectorDirective): string {
  const ordered: Record<string, unknown> = {
    action: dir.action,
    domain: dir.domain,
    target: dir.target,
  };
  if (dir.params !== undefined) {
    const params: Record<string, number | string | boolean> = {};
    for (const key of Object.keys(dir.params).sort()) params[key] = dir.params[key];
    ordered.params = params;
  }
  return JSON.stringify(ordered);
}

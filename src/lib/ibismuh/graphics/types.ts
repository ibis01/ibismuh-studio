// G1.1 — the motion-graphics doc contract + validator (S120 §5 / the
// reconciliation roadmap §5). Drafted externally (Part F), landed here as
// the first code commit of G1.
//
// THE HOUSE DOC LAWS (S88's, verbatim — the Scene3D precedent):
// versioned (an unknown version reads as absent and is never
// overwritten), tolerant parse (null on unreadable — junk fields fall
// back honestly), strict write (exactly the declared fields, version
// first), byte-stable round-trip.
//
// The v1 element set is CLOSED (risk register row 5: grammar sprawl is
// G1's named risk — new element variants require a design-doc slice,
// never a drive-by union member). The motion/element compatibility table
// below is the grammar's enforcement surface — closed like the kind set.
//
// PURE — no fs, no DOM, no clock, no randomness (the S64 law
// generalizes); the composer (G1.3) and the render engine (G1.5) own the
// side effects. Leaf-module law: this file imports the anim/ substrate
// (Stage S) and two whiteboard siblings (svg, timing) — never the
// reverse.
//
// Validator split (the whiteboard's own shape — validate integrity once,
// schedule purely everywhere else):
//   errors   → structural nonsense: unreadable version shape, missing
//              scenes, id-law violations, named-wall violations, broken
//              payload shapes for a KNOWN kind, motion/element
//              incompatibility, group integrity. `doc` comes back null.
//   warnings → unknown-but-harmless extras a v1 reader drops on read:
//              unknown element kinds, unknown fields, v-next versions,
//              junk OPTIONAL fields (dropped — absent stays absent), a
//              payload absent for a kind that has one (the composer
//              falls back; parse never refuses — the Part F law).
//   clamps   → present-and-numeric values outside a named range are
//              clamped to it, with a warning (scene3d's clamp law, now
//              with a channel to say so).
import { countPathCommands, type Placement } from "../whiteboard/svg";
import { ANIM_FRAME_BUDGET } from "../anim/clock";
import { isEaseName, type EaseName } from "../anim/easing";
import { estimateNarrationMs } from "../whiteboard/timing";
// S163 Phase B — the native transition grammar rides the pure vocabulary
// module (a leaf BELOW the grammar: it imports only the anim substrate,
// never the reverse — no cycle).
import { sanitizeNativeTransitionSpec } from "./transitions";
import type { TransitionSpec } from "./transitions";
import { GRAPHICS_RECIPE_IDS } from "./recipe-ids";

// ---------------------------------------------------------------------------
// Version + id law
// ---------------------------------------------------------------------------

export const GRAPHICS_VERSION = 1;

/** Legal element/scene id — the whiteboard's id-charset law verbatim
 *  (WB_ID_RE + the separator ban, storyboard.ts): ids ride
 *  DOM-namespace-shaped keys; a `--` or `::` inside an id corrupts that
 *  seam (the storyboard defense-in-depth receipt applies to graphics ids
 *  as-is). */
export const GRAPHICS_ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;

export function validGraphicsId(id: string): boolean {
  return GRAPHICS_ID_RE.test(id) && !id.includes("--") && !id.includes("::");
}

// ---------------------------------------------------------------------------
// Stage-S aliases — ONE wall, TWO engines (the Part G.3 resolution)
// ---------------------------------------------------------------------------

/** The anim/easing.ts curve table (Stage S / commit G1.0) — re-exported
 *  under the graphics name so the grammar reads standalone; the TYPE is
 *  the same union, the runtime check delegates to `isEaseName` (one
 *  source of curve truth). */
export type GraphicsEase = EaseName;

/** THE shared frame-budget wall (anim/clock.ts, Stage S) — one wall, two
 *  engines. 25,920 frames = 18 min at 24 fps; the render pre-flight
 *  (G1.5) refuses over-budget docs BEFORE chromium launches. Re-exported
 *  (not re-declared) so a budget change lands once. */
export const GRAPHICS_FRAME_BUDGET = ANIM_FRAME_BUDGET;

// ---------------------------------------------------------------------------
// Motion grammar
// ---------------------------------------------------------------------------

export const GRAPHICS_MOTION_KINDS = [
  "fade", "rise", "slide", "pop", "wipe", "count", "grow", "draw",
] as const;
export type GraphicsMotionKind = (typeof GRAPHICS_MOTION_KINDS)[number];

export interface ElementMotion {
  kind: GraphicsMotionKind;
  /** > 0, validator-pinned. */
  durationMs: number;
  /** ≥ 0, validator-pinned. */
  delayMs: number;
  ease: GraphicsEase;
}

// ---------------------------------------------------------------------------
// S129 (PAE-1) — the element tween directive: keyframed per-channel motion.
//
// The 8 fixed motion kinds in their 3 fixed slots (enter/exit/emphasis)
// cover the house choreography vocabulary; the tween directive is the
// AUTHOR's channel-level extension — a window on the scene clock plus
// per-channel keyframe tracks, evaluated through the shared Stage-S
// substrate (anim/keyframe evalAt — the substrate finally reaches the doc
// level). It unlocks what the fixed kinds cannot express (rotation, custom
// paths, multi-phase sequences) WITHOUT a second clock, a new renderer, or
// a new dependency: every tween evaluates on the SCENE-LOCAL clock frameAt
// already resolves, folds through the existing channels, and renders
// through the existing applier.
//
// Semantics (the motion clamp law, tween form): each tween owns the window
// [delayMs, delayMs + durationMs]; a channel's value before its first key
// and after its last key HOLDS (clamped evalAt) — so channels stay
// continuous and finite for ALL t (the never-NaN pin), and the author
// controls both edge states by writing the first/last keys. Keys are
// WINDOW-RELATIVE (0..durationMs) and strictly ascending; the segment
// arriving at a key is eased by THAT key's ease (the destination-key
// convention every consumer shares — anim/keyframe.ts).
// ---------------------------------------------------------------------------

/** The closed tween channel set: the frame engine's modulatable channels.
 *  dx/dy are additive scene-unit offsets, scale a multiplicative factor,
 *  rotateDeg an ADDITIVE delta (S129 unlocks rotation — v1 motions never
 *  rotate), opacity/progress multiplicative factors — all composable with
 *  the enter/exit/emphasis layers. */
export const TWEEN_CHANNELS = [
  "dx", "dy", "scale", "rotateDeg", "opacity", "progress",
] as const;
export type TweenChannel = (typeof TWEEN_CHANNELS)[number];

/** One keyframe in a tween track: window-relative time, the value the
 *  channel holds there, the ease of the segment ARRIVING at it (absent ⇒
 *  linear — the destination-key convention). */
export interface TweenKeyframe {
  tMs: number;
  value: number;
  ease?: GraphicsEase;
}

/** One channel's keyframe track inside a tween. */
export interface TweenChannelTrack {
  channel: TweenChannel;
  keys: TweenKeyframe[];
}

/** The tween directive: a scene-clock window + per-channel keyframe
 *  tracks. Composition order stays FIXED (the G1.2 pin, tween form):
 *  enter → tweens (array order) → exit → emphasis — emphasis stays LAST
 *  so it still shapes the final state. */
export interface ElementTween {
  /** ≥ 0, validator-pinned against the scene clock. */
  delayMs: number;
  /** > 0, validator-pinned. */
  durationMs: number;
  channels: TweenChannelTrack[];
}

// ---------------------------------------------------------------------------
// S130 (PAE-2) — the scene camera directive: the ONE world→screen function.
//
// The 3D adapter has carried camera keyframes since S94 (Scene3DCameraKeyframe
// → cameraAt); the 2D composer had no camera at all — the gap the opuscar
// study named ("one world → screen function; never hand-type screen
// coordinates"). The graphics camera closes it with the SAME vocabulary:
// scene-local keyframes {tMs, zoom, tx, ty} evaluated by a clamped,
// destination-eased cameraAt — the anim substrate's laws, the S94 shape —
// and rendered through the EXISTING applier (one #gcam wrapper group, an
// additive seam: a camera-less scene composes byte-identically). zoom is
// pinned to [1, CAMERA_BOUNDS.zoomMax] — zooming OUT would reveal the void
// outside the board, so the world→screen law forbids it by construction.
// ---------------------------------------------------------------------------

/** One camera keyframe: scene-local time, the zoom factor and the pan
 *  offsets (scene units) the board holds there, the ease of the segment
 *  ARRIVING at it (absent ⇒ linear — the destination-key convention). */
export interface GraphicsCameraKeyframe {
  tMs: number;
  zoom: number;
  tx: number;
  ty: number;
  ease?: GraphicsEase;
}

/** S130 camera bounds — zoom ≥ 1 is the world→screen law (the board never
 *  shrinks into void); the cap keeps a frame from collapsing to a point.
 *  Names cited in drop reasons; values are receipts to tune. */
export const CAMERA_BOUNDS = {
  zoomMin: 1,
  zoomMax: 4,
} as const;

// ---------------------------------------------------------------------------
// S131 (PAE-3) — the scene event channel: cue facts on the scene clock.
//
// The opuscar study's EV idea, nativized: a scene may declare timed events
// ({tMs, kind, label}) — hit points, SFX cues, mixer cues — that the audio
// and QC consumers read through ONE pure projection (graphics/events.ts,
// graphicsEventList) onto the GLOBAL doc clock. Deliberately NOT a track
// kind: the timeline grammar carries composition truth (clips), and cues
// are not clips — bending the contract to smuggle them in would break the
// two-clock pin the tracks exist to hold. Events are decoration-class in
// parse (junk warn-drops) and error-class in time-sanity (an event past
// the scene clock is a planner bug, like every motion's).
// ---------------------------------------------------------------------------

/** The closed event vocabulary. "hit" = a visual/beat hit point (the
 *  cuecheck idea — 0 ms targets); "sfx" = a foley/cue slot the audio
 *  assembly may consume; "cue" = an advisory timing marker for the QC
 *  battery. The set is closed like every grammar set — a new kind is a
 *  design-doc slice. */
export const GRAPHICS_EVENT_KINDS = ["sfx", "hit", "cue"] as const;
export type GraphicsEventKind = (typeof GRAPHICS_EVENT_KINDS)[number];

/** One timed event on the scene-local clock. */
export interface GraphicsEvent {
  /** ≥ 0, validator-pinned against the scene clock. */
  tMs: number;
  kind: GraphicsEventKind;
  /** ≤ eventLabelMax chars — optional, decoration-class (junk drops, the
   *  event stays). */
  label?: string;
}

export const GRAPHICS_ELEMENT_KINDS = [
  "headline", "subhead", "bullet", "counter", "bar", "barChart",
  "icon", "callout", "shape", "group", "sprite",
] as const;
export type GraphicsElementKind = (typeof GRAPHICS_ELEMENT_KINDS)[number];

/** Which motions are legal per element kind — the compatibility table the
 *  validator enforces (a "count" on a headline is a doc bug, not a
 *  renderer branch; a "draw" on a text element has no stroke to draw).
 *  The table IS the grammar's enforcement surface — closed like the kind
 *  set. */
export const MOTION_KINDS_BY_ELEMENT: Readonly<
  Record<GraphicsElementKind, readonly GraphicsMotionKind[]>
> = {
  headline: ["fade", "rise", "slide", "pop"],
  subhead:  ["fade", "rise", "slide", "pop"],
  bullet:   ["fade", "rise", "slide", "pop"],
  counter:  ["fade", "rise", "slide", "pop", "count"],
  bar:      ["fade", "slide", "wipe", "grow"],
  barChart: ["fade", "slide", "wipe", "grow"],
  icon:     ["fade", "slide", "pop", "draw"],
  callout:  ["fade", "rise", "slide", "pop"],
  shape:    ["fade", "slide", "wipe", "grow", "draw"],
  group:    ["fade", "rise", "slide", "pop"],
  // S126 — the import lane's element: visual moves only (no draw/grow/count
  // semantics exist for raster frames — the compatibility table stays
  // closed; a new motion on a sprite is a design-doc slice).
  sprite:   ["fade", "slide", "pop"],
};

/** Runtime lookup with the closed-table guarantee restated (the Record is
 *  compile-total; the fallback exists only for the type checker's
 *  indexed access). */
export function legalMotions(kind: GraphicsElementKind): readonly GraphicsMotionKind[] {
  return MOTION_KINDS_BY_ELEMENT[kind] ?? GRAPHICS_MOTION_KINDS;
}

// ---------------------------------------------------------------------------
// Element payloads — one optional payload per kind (the Scene3D flat
// shape): the validator enforces payload-per-kind; tolerant parse never
// refuses on an absent payload for a kind that has one.
// ---------------------------------------------------------------------------

export interface TextPayload {
  text: string;
  /** default 48 at compose, clamped 12..288 by the validator. */
  sizePx?: number;
  /** 100..900, default 700 at compose; clamped by the validator. */
  weight?: number;
  /** #rrggbb. */
  color?: string;
  align?: "left" | "center" | "right";
}

export interface CounterPayload {
  /** finite; from < to enforced (the v1 count-up law — a count-down is a
   *  design-doc slice, not a drive-by sign flip). */
  from: number;
  /** finite. */
  to: number;
  /** "%", "×", "k" … rendered after the number. */
  unit?: string;
  decimals?: 0 | 1 | 2;
}

export interface BarDatum { label: string; value: number; } // value finite, ≥ 0

export interface BarPayload {
  /** 1..GRAPHICS_BUDGETS.barDataMax rows. */
  data: BarDatum[];
  unit?: string;
  /** scale ceiling; absent ⇒ max(data) at compose. */
  max?: number;
  /** default false. */
  horizontal?: boolean;
}

export interface IconPayload {
  /** SVG path `d` strings — parsed (command budget; countPathCommands is
   *  the unit of account) at validation; sanitized at compose time (G1.3,
   *  svg.ts#sanitizeSvg). */
  paths: string[];
  color?: string;
  strokeWidth?: number;
}

export interface CalloutPayload {
  text: string;
  /** scene units — the tail's target. */
  pointsAt?: { x: number; y: number };
}

export interface ShapePayload {
  kind: "rect" | "line" | "circle";
  w?: number;  // rect / line extent
  h?: number;  // rect
  r?: number;  // circle
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
}

export interface GroupPayload {
  /** Member element ids — must exist, must not reference the group itself
   *  or an ancestor (acyclic); v1: groups do not nest (the groupDepthMax
   *  wall — which also makes reference cycles unreachable by
   *  construction). */
  children: string[];
}

// S126 — the external import lane's payload (docs/design/s126-import-lane.md
// §1 — the ONE syntax minor extension). The asset is referenced by its
// import-row key (resolved through the import store at render/compose —
// never free text); fps rides the shared 24|30 timebase; the frame index is
// derived from the SCENE clock in frameAt (no second clock).
export interface SpritePayload {
  /** The import row's assetKey (GraphicsImport.importId). */
  assetKey: string;
  /** "sheet" = one image, the window moves; "sequence" = stacked frames,
   *  display-toggled. Matches the import row. */
  layout: "sheet" | "sequence";
  /** 1..GRAPHICS_BUDGETS.spriteFramesMax. */
  frames: number;
  /** The shared timebase (24 | 30 — the D3 law). */
  fps: 24 | 30;
  /** The frame's pixel size (1..4096 each) — the sheet window / the
   *  sequence's uniform frame size. */
  frameW: number;
  frameH: number;
}

export interface GraphicsElement {
  id: string;
  kind: GraphicsElementKind;
  /** S129 — keyframed tween directives (optional, decoration-class:
   *  junk-shaped tracks drop with warnings; time-sanity violations are
   *  errors like every motion's). Absence changes nothing (the
   *  byte-identity law). */
  tweens?: ElementTween[];
  /** Scene-space placement — the whiteboard's Placement (svg.ts): one
   *  placement shape across engines, never a second one. Junk/absent
   *  falls back honestly to the origin placement (the scene3d position
   *  law) with a warning. */
  at: Placement;
  /** The payload for `kind` (typed above); validator checks presence +
   *  shape per kind. */
  text?: TextPayload;
  counter?: CounterPayload;
  bar?: BarPayload;
  icon?: IconPayload;
  callout?: CalloutPayload;
  shape?: ShapePayload;
  group?: GroupPayload;
  sprite?: SpritePayload;
  /** Choreography: enter is REQUIRED (an element that cannot enter has
   *  no reason to exist in this grammar); exit/emphasis optional. The
   *  frame engine composes with fixed precedence emphasis > exit > enter
   *  (G1.2's pin). */
  enter: ElementMotion;
  exit?: ElementMotion;
  emphasis?: ElementMotion;
  /** base opacity 0..1, default 1 at compose; clamped by the validator. */
  opacity?: number;
}

// ---------------------------------------------------------------------------
// Advisory routing hints (decision D2) — graphics-local, Phase-R-free
// ---------------------------------------------------------------------------

/** The closed engine vocabulary an advisory hint may name — the same
 *  grammar Stage R speaks; declared HERE so graphics never imports
 *  director-plan.ts (the leaf-module law is the Phase-R firewall: the
 *  hints ride the doc, no routing LOGIC ever reads them). */
export const GRAPHICS_ROUTING_ENGINES = [
  "whiteboard", "graphics", "character", "cinematic", "mixed",
] as const;

export type GraphicsRoutingEngine = (typeof GRAPHICS_ROUTING_ENGINES)[number];

/** Advisory ONLY (decision D2). Stage R may map this structurally later;
 *  G1's render pipeline never reads it — frameAt, compose, tracks and
 *  render must not branch on it (the neutrality pin holds the
 *  byte-identity law). Absence changes nothing. */
export interface GraphicsRoutingHints {
  suggestedEngine?: GraphicsRoutingEngine;
  /** 0..1 — the validator clamps with a warning. */
  confidence?: number;
  /** ≤ GRAPHICS_ROUTING_REASON_MAX chars, advisory rationale. */
  reason?: string;
}

/** The advisory reason cap — a validator detail, not a grammar wall. */
export const GRAPHICS_ROUTING_REASON_MAX = 200;

// ---------------------------------------------------------------------------
// Scene + doc
// ---------------------------------------------------------------------------

export interface GraphicsScene {
  id: string;
  narration: string;
  /** Explicit clock override; absent ⇒ the house 2.6-wps estimate
   *  (whiteboard timing.ts estimateNarrationMs — ONE clock model, reused,
   *  not re-implemented). VO-measured duration rides the render call, not
   *  the doc (the anchors-are-inputs law, same as W4). */
  durationMs?: number;
  /** #rrggbb — a designed choice: junk is an ERROR, never silently
   *  substituted (unlike optional palette fields, which drop honestly). */
  background: string;
  /** (D2) Advisory routing hints — optional per-scene metadata; junk drops
   *  with a warning under the tolerant-parse law (never an error, never a
   *  default). The render pipeline never reads it. */
  routing?: GraphicsRoutingHints;
  /** S130 — the scene camera (optional, decoration-class parse,
   *  time-sanity error-class like every motion). Absent ⇒ the frame is the
   *  placed board, byte-identical to the pre-S130 compose. */
  camera?: GraphicsCameraKeyframe[];
  /** S131 — timed cue events on the scene-local clock (optional,
   *  decoration-class parse, time-sanity error-class). Projected globally
   *  by graphicsEventList — never a track kind (cues are not clips). */
  events?: GraphicsEvent[];
  /** THE RECIPE FIELD (the re-audit's step 4): this scene's recipe
   *  citation — the scene override in the doc → scene inheritance (the
   *  effective recipe is scene.recipe ?? doc.recipe ?? house-baseline).
   *  The validator refuses anything outside the closed vocabulary.
   *  ABSENT = inherit (byte-identical legacy shape). */
  recipe?: string;
  elements: GraphicsElement[];
}

export interface GraphicsDoc {
  /** GRAPHICS_VERSION — first field on write (strict write). */
  version: number;
  title: string;
  /** Output surface — one of the three house aspects' native sizes:
   *  1920×1080 (16:9), 1080×1920 (9:16), 1080×1080 (1:1). */
  width: number;
  height: number;
  fps: 24 | 30;
  scenes: GraphicsScene[];
  /** S163 Phase B — the native transition engine's opt-in: one spec per
   *  boundary, INDEXED BY BOUNDARY (entry b joins scene b and b+1; a
   *  shorter array leaves the later boundaries hard cuts). Absent ⇒ the
   *  byte-identical legacy path (concat hard cuts, unchanged clock) — the
   *  additive-seam law. Entry walls: ≤ scenes−1 (extras warn-drop), each
   *  spec through sanitizeNativeTransitionSpec (closed type set, the
   *  frames wall, junk decorations drop honestly). */
  nativeTransitions?: TransitionSpec[];
  /** THE RECIPE FIELD (the re-audit's step 4): the doc-wide recipe
   *  citation — the project-level choice every scene inherits unless it
   *  names its own. The validator refuses anything outside the closed
   *  vocabulary. ABSENT = the house baseline (byte-identical legacy). */
  recipe?: string;
}

// ---------------------------------------------------------------------------
// Named walls — the WB_BUDGETS shape (storyboard.ts): constants cited by
// the validator, the tests, and the design doc — ONE source. Values are
// the implementer's receipts to tune; the NAMES are the contract.
// ---------------------------------------------------------------------------

export const GRAPHICS_BUDGETS = {
  /** Max elements per scene (counted on the KEPT set — what the v1 reader
   *  will actually render; v-next drops land before the wall, so a v-next
   *  doc is never refused for elements its v1 reader cannot see). */
  elementsPerScene: 32,
  /** Max scenes per project (the whiteboard's number). */
  scenesPerProject: 24,
  /** Max EXPLICIT scene duration (estimates clamp lower — the timing
   *  law's 4s..30s band). */
  sceneDurationMsMax: 120_000,
  /** Max Σ explicit scene durations (VO-measured totals are bounded at
   *  the render pre-flight by GRAPHICS_FRAME_BUDGET instead). */
  projectExplicitDurationMsMax: 900_000,
  /** Max data rows per bar/barChart. */
  barDataMax: 8,
  /** v1: groups do not nest (which also makes reference cycles
   *  unreachable by construction). */
  groupDepthMax: 1,
  /** Parsed command budget per icon path — countPathCommands is the unit
   *  of account (the EXPANDED count: implicit repeats cost what the
   *  flattener and the rasterizer pay). The WB_PATH_COMMAND_BUDGET
   *  number. */
  iconPathCommandBudget: 512,
  /** S128 (the PR #24 review's F1) — max chars per FREE-FORM string: the
   *  doc title, scene narration, text/callout payloads, bar labels. The
   *  grammar's other walls bound STRUCTURE (elements per scene, path
   *  commands); nothing bounded the CHAR content of the strings riding
   *  inside it — a PUT could store a megabyte-scale "headline" that
   *  round-trips into the doc row and the chromium page verbatim. The
   *  wall refuses (required content is never silently truncated); the
   *  OPTIONAL decorations (counter/bar unit) warning-drop instead (the
   *  house tolerance law — decorations are droppable, content is not). */
  textCharsMax: 2_000,
  /** S128 (the review's F2) — max chars per icon path-data string. The
   *  iconPathCommandBudget counts COMMANDS, not characters: a single
   *  command's coordinate literal could carry an unbounded digit run
   *  under the command wall. 4,096 chars is generous for 512 commands
   *  and bounds the worst single-literal payload. */
  iconPathCharsMax: 4_096,
  /** S126 — max frames per sprite import (a sheet's grid cells or a
   *  sequence's file count). A longer animation is a design-doc slice. */
  spriteFramesMax: 48,
  /** S129 — max tween directives per element. More phases than this and
   *  the choreography belongs in the planner, not the doc (decorations
   *  beyond the wall warn-drop, the tolerance law). */
  tweensPerElementMax: 4,
  /** S129 — max keyframes per tween channel track. A longer curve is a
   *  design-doc slice (the easing table's law, mirrored). */
  tweenKeysPerChannelMax: 16,
  /** S130 — max keyframes per scene camera. A longer camera path is a
   *  design-doc slice. */
  cameraKeysMax: 16,
  /** S131 — max events per scene. More cues than this and the beat map
   *  belongs in the planner (decorations beyond the wall warn-drop). */
  eventsPerSceneMax: 16,
  /** S131 — max chars per event label (optional decoration; junk drops,
   *  the event stays). */
  eventLabelMax: 64,
} as const;

/** Borrowed readable-ink wall (the whiteboard's WB_STROKE_WIDTH_MAX
 *  number): a wider icon/shape stroke stops tracking the aesthetic.
 *  Module-private — a validator detail, not a grammar wall. */
const STROKE_WIDTH_MAX = 64;

// ---------------------------------------------------------------------------
// The result shape
// ---------------------------------------------------------------------------

export interface GraphicsValidationResult {
  doc: GraphicsDoc | null;
  /** Structural nonsense — the doc did not parse (doc is null). */
  errors: string[];
  /** Tolerant-read notes: unknown element kinds / unknown fields / unknown
   *  version / junk optional fields dropped / clamps applied — the doc
   *  still parses, the notes explain what was ignored (the additive-parse
   *  law: v-next docs load in v1 readers). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Parsing helpers (module-private, pure)
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

const isObj = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** The declared element keys — anything else on a known element is an
 *  unknown field (warning + dropped). */
const ELEMENT_KEYS = new Set([
  "id", "kind", "at", "text", "counter", "bar", "icon", "callout",
  "shape", "group", "sprite", "enter", "exit", "emphasis", "tweens",
  "opacity",
]);

const DOC_KEYS = new Set(["version", "title", "width", "height", "fps", "scenes", "nativeTransitions", "recipe"]);
const SCENE_KEYS = new Set(["id", "narration", "durationMs", "background", "routing", "camera", "events", "elements", "recipe"]);

/** THE RECIPE FIELD LAW (the re-audit's step 4): a persisted recipe choice
 *  is INTEGRITY, not decoration — a saved doc cites the id its motions
 *  were compiled from, so a typo must refuse, never silently render as
 *  the baseline (the whiteboard profile-stamp law, one house voice).
 *  Junk/absent-on-write handling: absent parses absent (byte-identical);
 *  anything outside the closed vocabulary is an ERROR. */
function parseRecipeField(raw: unknown, where: string, errors: string[]): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !(GRAPHICS_RECIPE_IDS as readonly string[]).includes(raw)) {
    errors.push(
      `${where}: recipe "${String(raw).slice(0, 40)}" is not one of the closed recipes (${GRAPHICS_RECIPE_IDS.join(", ")})`,
    );
    return undefined;
  }
  return raw;
}

const ROUTING_KEYS = new Set(["suggestedEngine", "confidence", "reason"]);

const TEXT_PAYLOAD_KEYS = new Set(["text", "sizePx", "weight", "color", "align"]);
const COUNTER_PAYLOAD_KEYS = new Set(["from", "to", "unit", "decimals"]);
const BAR_PAYLOAD_KEYS = new Set(["data", "unit", "max", "horizontal"]);
const ICON_PAYLOAD_KEYS = new Set(["paths", "color", "strokeWidth"]);
const CALLOUT_PAYLOAD_KEYS = new Set(["text", "pointsAt"]);
const SHAPE_PAYLOAD_KEYS = new Set(["kind", "w", "h", "r", "stroke", "fill", "strokeWidth"]);
const GROUP_PAYLOAD_KEYS = new Set(["children"]);
const SPRITE_PAYLOAD_KEYS = new Set(["assetKey", "layout", "frames", "fps", "frameW", "frameH"]);

/** The output-surface law: exactly the three house aspects' native sizes.
 *  EXPORTED (the G1.4 planner snaps caller geometry onto this ONE table —
 *  the validator and the planner share the law, never a second list). */
export const GRAPHICS_SURFACES: ReadonlyArray<readonly [number, number]> = [
  [1920, 1080], // 16:9
  [1080, 1920], // 9:16
  [1080, 1080], // 1:1
];

function warnUnknownKeys(raw: Rec, declared: ReadonlySet<string>, where: string, warnings: string[]): void {
  for (const key of Object.keys(raw)) {
    if (!declared.has(key)) warnings.push(`${where}: unknown field "${key}" ignored`);
  }
}

/** Optional color: junk drops honestly with a warning; well-formed hex
 *  lowers (the scene3d hex law). */
function parseColor(raw: unknown, where: string, field: string, warnings: string[]): string | undefined {
  const s = str(raw);
  if (s === null) {
    if (raw !== undefined) warnings.push(`${where}: ${field} dropped — not a string`);
    return undefined;
  }
  if (!HEX_RE.test(s)) {
    warnings.push(`${where}: ${field} dropped — not #rrggbb`);
    return undefined;
  }
  return s.toLowerCase();
}

function parseStrokeWidth(raw: unknown, where: string, warnings: string[]): number | undefined {
  const v = num(raw);
  if (v === null) {
    if (raw !== undefined) warnings.push(`${where}: strokeWidth dropped — not a finite number`);
    return undefined;
  }
  if (v <= 0) {
    warnings.push(`${where}: strokeWidth dropped — must be > 0`);
    return undefined;
  }
  if (v > STROKE_WIDTH_MAX) {
    warnings.push(`${where}: strokeWidth ${v} clamped to ${STROKE_WIDTH_MAX} (the readable-ink wall)`);
    return STROKE_WIDTH_MAX;
  }
  return v;
}

/** Placement — the whiteboard shape, four finite numbers. Absent/junk
 *  falls back honestly to the origin placement (the scene3d position
 *  law) with a warning; readable members are kept, the rest defaulted. */
function parsePlacement(raw: unknown, where: string, warnings: string[]): Placement {
  if (!isObj(raw)) {
    if (raw !== undefined) warnings.push(`${where}: "at" unreadable — origin placement assumed`);
    return { x: 0, y: 0, scale: 1, rotateDeg: 0 };
  }
  const x = num(raw.x);
  const y = num(raw.y);
  const scale = num(raw.scale);
  const rotateDeg = num(raw.rotateDeg);
  if (x === null || y === null || scale === null || rotateDeg === null) {
    warnings.push(`${where}: "at" has unreadable members — kept what reads, defaulted the rest`);
  }
  return {
    x: x ?? 0,
    y: y ?? 0,
    scale: scale !== null && scale > 0 ? scale : 1,
    rotateDeg: rotateDeg ?? 0,
  };
}

/** Motion parse. `required=true` is the enter slot (an unreadable enter is
 *  structural); optional slots (exit/emphasis) drop honestly with a
 *  warning. */
function parseMotion(
  raw: unknown,
  where: string,
  slot: string,
  warnings: string[],
  errors: string[],
  required: boolean,
): ElementMotion | null {
  if (raw === undefined) return null;
  const reject = (msg: string): null => {
    if (required) errors.push(`${where}: the ${slot} motion is unreadable — ${msg}`);
    else warnings.push(`${where}: ${slot} motion dropped — ${msg}`);
    return null;
  };
  if (!isObj(raw)) return reject("not an object");
  const kind = str(raw.kind);
  if (kind === null || !GRAPHICS_MOTION_KINDS.includes(kind as GraphicsMotionKind)) {
    return reject(`kind "${String(raw.kind)}" is not in the closed motion set`);
  }
  const durationMs = num(raw.durationMs);
  if (durationMs === null || durationMs <= 0) return reject("durationMs must be finite > 0");
  const delayMs = num(raw.delayMs);
  if (delayMs === null || delayMs < 0) return reject("delayMs must be finite ≥ 0");
  const ease = str(raw.ease);
  if (ease === null || !isEaseName(ease)) return reject(`ease "${String(raw.ease)}" is not a Stage-S curve`);
  warnUnknownKeys(raw, new Set(["kind", "durationMs", "delayMs", "ease"]), `${where} ${slot} motion`, warnings);
  return { kind: kind as GraphicsMotionKind, durationMs, delayMs, ease };
}

// ---------------------------------------------------------------------------
// S129 — the tween parser. Decoration-class: junk-shaped directives and
// tracks warn-drop (the optional-motion law — the element still renders);
// TIME-SANITY violations are ERRORS (the motions-loop law: a window past
// the scene clock is a planner bug, never tolerated junk); a progress
// track on a kind whose reveal channel it cannot drive is an ERROR (the
// compatibility-table law). Value bounds are named walls the drop reasons
// cite, so tests pin the names (the S128 convention).
// ---------------------------------------------------------------------------

/** S129 tween value bounds — the closed numeric domain per channel. The
 *  NAMES are the contract (cited in drop reasons); the values are
 *  receipts to tune. */
export const TWEEN_VALUE_BOUNDS = {
  /** |dx|/|dy| offset cap (scene units) — beyond ±2048 the element leaves
   *  every house surface. */
  offsetMax: 2048,
  /** the multiplicative scale factor's domain. */
  scaleMin: 0.05,
  scaleMax: 8,
  /** |rotateDeg| delta cap — four full spins; more is junk, not
   *  choreography. */
  rotateMax: 1440,
  /** opacity/progress factors — multipliers, never amplifiers. */
  factorMin: 0,
  factorMax: 1,
} as const;

/** The kinds whose reveal channel progress actually drives — DERIVED from
 *  the closed MOTION_KINDS_BY_ELEMENT table (the same kinds whose legal
 *  motions include the reveal mechanics wipe/grow/draw). On every other
 *  kind a progress tween would be a lie the composer never reads. */
const PROGRESS_TWEEN_KINDS: ReadonlySet<GraphicsElementKind> = new Set(
  GRAPHICS_ELEMENT_KINDS.filter((k) =>
    legalMotions(k).some((m) => m === "wipe" || m === "grow" || m === "draw"),
  ),
);

const TWEEN_KEYS = new Set(["delayMs", "durationMs", "channels"]);
const TWEEN_TRACK_KEYS = new Set(["channel", "keys"]);
const TWEEN_KEYFRAME_KEYS = new Set(["tMs", "value", "ease"]);

function tweenValueLegal(channel: TweenChannel, value: number): boolean {
  switch (channel) {
    case "dx":
    case "dy":
      return Math.abs(value) <= TWEEN_VALUE_BOUNDS.offsetMax;
    case "scale":
      return value >= TWEEN_VALUE_BOUNDS.scaleMin && value <= TWEEN_VALUE_BOUNDS.scaleMax;
    case "rotateDeg":
      return Math.abs(value) <= TWEEN_VALUE_BOUNDS.rotateMax;
    case "opacity":
    case "progress":
      return value >= TWEEN_VALUE_BOUNDS.factorMin && value <= TWEEN_VALUE_BOUNDS.factorMax;
  }
}

function parseTweenTrack(
  raw: unknown,
  where: string,
  warnings: string[],
): TweenChannelTrack | null {
  if (!isObj(raw)) {
    warnings.push(`${where}: tween track dropped — not an object`);
    return null;
  }
  warnUnknownKeys(raw, TWEEN_TRACK_KEYS, where, warnings);
  const channel = str(raw.channel);
  if (channel === null || !TWEEN_CHANNELS.includes(channel as TweenChannel)) {
    warnings.push(
      `${where}: tween track dropped — channel "${String(raw.channel)}" is not in the closed tween set (${TWEEN_CHANNELS.join(", ")})`,
    );
    return null;
  }
  const ch = channel as TweenChannel;
  const keysRawAll = raw.keys;
  if (!Array.isArray(keysRawAll) || keysRawAll.length === 0) {
    warnings.push(`${where}: the ${ch} tween track dropped — it carries no keys`);
    return null;
  }
  let keysRaw = keysRawAll;
  if (keysRaw.length > GRAPHICS_BUDGETS.tweenKeysPerChannelMax) {
    warnings.push(
      `${where}: the ${ch} tween track dropped ${keysRaw.length - GRAPHICS_BUDGETS.tweenKeysPerChannelMax} keys past the tweenKeysPerChannelMax wall (${GRAPHICS_BUDGETS.tweenKeysPerChannelMax})`,
    );
    keysRaw = keysRaw.slice(0, GRAPHICS_BUDGETS.tweenKeysPerChannelMax);
  }
  const keys: TweenKeyframe[] = [];
  let prev = -Infinity;
  for (const kRaw of keysRaw) {
    if (!isObj(kRaw)) {
      warnings.push(`${where}: the ${ch} tween track dropped — a key is unreadable (not an object)`);
      return null;
    }
    warnUnknownKeys(kRaw, TWEEN_KEYFRAME_KEYS, where, warnings);
    const tMs = num(kRaw.tMs);
    const value = num(kRaw.value);
    if (tMs === null || value === null) {
      warnings.push(`${where}: the ${ch} tween track dropped — a key carries a non-finite tMs or value`);
      return null;
    }
    if (tMs < 0 || tMs > 2_147_483_647) {
      warnings.push(`${where}: the ${ch} tween track dropped — a key time (${String(tMs)}ms) is outside the window-relative domain [0, 2^31)`);
      return null;
    }
    if (tMs <= prev) {
      warnings.push(
        `${where}: the ${ch} tween track dropped — keys must strictly ascend (${String(tMs)}ms after ${String(prev)}ms)`,
      );
      return null;
    }
    prev = tMs;
    let ease: GraphicsEase | undefined;
    if (kRaw.ease !== undefined) {
      const easeStr = str(kRaw.ease);
      if (easeStr === null || !isEaseName(easeStr)) {
        warnings.push(`${where}: the ${ch} tween track dropped — a key ease "${String(kRaw.ease)}" is not a Stage-S curve`);
        return null;
      }
      ease = easeStr;
    }
    if (!tweenValueLegal(ch, value)) {
      warnings.push(
        `${where}: the ${ch} tween track dropped — a key value (${String(value)}) leaves the ${ch} domain (bounds: |offset| ≤ ${TWEEN_VALUE_BOUNDS.offsetMax}, scale ∈ [${TWEEN_VALUE_BOUNDS.scaleMin}, ${TWEEN_VALUE_BOUNDS.scaleMax}], |rotate| ≤ ${TWEEN_VALUE_BOUNDS.rotateMax}, factors ∈ [${TWEEN_VALUE_BOUNDS.factorMin}, ${TWEEN_VALUE_BOUNDS.factorMax}])`,
      );
      return null;
    }
    keys.push(ease !== undefined ? { tMs, value, ease } : { tMs, value });
  }
  return { channel: ch, keys };
}

/** The element's tween directives — optional choreography. See the S129
 *  block comment for the class split (junk drops, time-sanity refuses). */
function parseTweens(
  raw: unknown,
  where: string,
  elKind: GraphicsElementKind,
  sceneMs: number,
  warnings: string[],
  errors: string[],
): ElementTween[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw) || raw.length === 0) {
    warnings.push(`${where}: tweens dropped — not a non-empty array`);
    return null;
  }
  let list = raw;
  if (list.length > GRAPHICS_BUDGETS.tweensPerElementMax) {
    warnings.push(
      `${where}: tweens dropped ${list.length - GRAPHICS_BUDGETS.tweensPerElementMax} directives past the tweensPerElementMax wall (${GRAPHICS_BUDGETS.tweensPerElementMax})`,
    );
    list = list.slice(0, GRAPHICS_BUDGETS.tweensPerElementMax);
  }
  const out: ElementTween[] = [];
  for (const tRaw of list) {
    if (!isObj(tRaw)) {
      warnings.push(`${where}: a tween directive dropped — not an object`);
      continue;
    }
    warnUnknownKeys(tRaw, TWEEN_KEYS, where, warnings);
    const delayMs = num(tRaw.delayMs);
    const durationMs = num(tRaw.durationMs);
    if (delayMs === null || delayMs < 0 || durationMs === null || durationMs <= 0) {
      warnings.push(
        `${where}: a tween directive dropped — delayMs/durationMs junk (need finite delayMs ≥ 0, durationMs > 0)`,
      );
      continue;
    }
    const spanEnd = delayMs + durationMs;
    if (spanEnd > sceneMs) {
      errors.push(
        `${where}: the tween window ends at ${spanEnd}ms, past the scene clock (${sceneMs}ms)`,
      );
      return null;
    }
    const channelsRaw = tRaw.channels;
    if (!Array.isArray(channelsRaw) || channelsRaw.length === 0) {
      warnings.push(`${where}: a tween directive dropped — it carries no channel tracks`);
      continue;
    }
    const trackWhere = `${where} tween [${delayMs}..${spanEnd}ms]`;
    const channels: TweenChannelTrack[] = [];
    const seen = new Set<string>();
    for (const cRaw of channelsRaw) {
      const track = parseTweenTrack(cRaw, trackWhere, warnings);
      if (track === null) continue; // decoration drop — sibling tracks may survive
      if (seen.has(track.channel)) {
        warnings.push(`${trackWhere}: the duplicate ${track.channel} track dropped (one track per channel per tween)`);
        continue;
      }
      if (track.channel === "progress" && !PROGRESS_TWEEN_KINDS.has(elKind)) {
        errors.push(
          `${trackWhere}: the ${track.channel} tween is not legal on a "${elKind}" (progress drives only the reveal kinds: ${[...PROGRESS_TWEEN_KINDS].join(", ")})`,
        );
        return null;
      }
      if (track.keys[track.keys.length - 1].tMs > durationMs) {
        warnings.push(
          `${trackWhere}: the ${track.channel} track dropped — a key sits past the tween window (${durationMs}ms)`,
        );
        continue;
      }
      seen.add(track.channel);
      channels.push(track);
    }
    if (channels.length === 0) {
      warnings.push(`${where}: a tween directive dropped — every channel track was junk`);
      continue;
    }
    out.push({ delayMs, durationMs, channels });
  }
  return out.length > 0 ? out : null;
}

// ---------------------------------------------------------------------------
// S130 — the scene camera parser. Same class split as the tweens: junk
// keys warn-drop (decoration), time-sanity refuses (planner bug). The pan
// domain rides the board the doc declares (|tx| ≤ width, |ty| ≤ height —
// the validator KNOWS the doc's surface, so a pan that leaves the board is
// dropped at admission, never at render).
// ---------------------------------------------------------------------------

const CAMERA_KEY_KEYS = new Set(["tMs", "zoom", "tx", "ty", "ease"]);

function parseCamera(
  raw: unknown,
  where: string,
  docWidth: number,
  docHeight: number,
  sceneMs: number,
  warnings: string[],
  errors: string[],
): GraphicsCameraKeyframe[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw) || raw.length === 0) {
    warnings.push(`${where}: camera dropped — not a non-empty keyframe array`);
    return null;
  }
  let list = raw;
  if (list.length > GRAPHICS_BUDGETS.cameraKeysMax) {
    warnings.push(
      `${where}: camera dropped ${list.length - GRAPHICS_BUDGETS.cameraKeysMax} keys past the cameraKeysMax wall (${GRAPHICS_BUDGETS.cameraKeysMax})`,
    );
    list = list.slice(0, GRAPHICS_BUDGETS.cameraKeysMax);
  }
  const keys: GraphicsCameraKeyframe[] = [];
  let prev = -Infinity;
  for (const kRaw of list) {
    if (!isObj(kRaw)) {
      warnings.push(`${where}: a camera keyframe dropped — not an object`);
      continue;
    }
    warnUnknownKeys(kRaw, CAMERA_KEY_KEYS, where, warnings);
    const tMs = num(kRaw.tMs);
    const zoom = num(kRaw.zoom);
    const tx = num(kRaw.tx);
    const ty = num(kRaw.ty);
    if (tMs === null || zoom === null || tx === null || ty === null) {
      warnings.push(`${where}: a camera keyframe dropped — a field is non-finite`);
      continue;
    }
    if (tMs > sceneMs) {
      errors.push(
        `${where}: a camera keyframe sits at ${String(tMs)}ms, past the scene clock (${sceneMs}ms)`,
      );
      return null;
    }
    if (tMs < 0 || tMs <= prev) {
      warnings.push(
        `${where}: a camera keyframe dropped — keys must be ≥ 0 and strictly ascend (${String(tMs)}ms after ${String(prev)}ms)`,
      );
      continue;
    }
    prev = tMs;
    if (zoom < CAMERA_BOUNDS.zoomMin || zoom > CAMERA_BOUNDS.zoomMax) {
      warnings.push(
        `${where}: a camera keyframe dropped — zoom ${String(zoom)} leaves the [${CAMERA_BOUNDS.zoomMin}, ${CAMERA_BOUNDS.zoomMax}] domain (zoom < 1 would reveal the void outside the board)`,
      );
      continue;
    }
    if (Math.abs(tx) > docWidth || Math.abs(ty) > docHeight) {
      warnings.push(
        `${where}: a camera keyframe dropped — pan (${String(tx)}, ${String(ty)}) leaves the ±${docWidth}/±${docHeight} board domain`,
      );
      continue;
    }
    let ease: GraphicsEase | undefined;
    if (kRaw.ease !== undefined) {
      const easeStr = str(kRaw.ease);
      if (easeStr === null || !isEaseName(easeStr)) {
        warnings.push(`${where}: a camera keyframe dropped — its ease "${String(kRaw.ease)}" is not a Stage-S curve`);
        continue;
      }
      ease = easeStr;
    }
    keys.push(ease !== undefined ? { tMs, zoom, tx, ty, ease } : { tMs, zoom, tx, ty });
  }
  return keys.length > 0 ? keys : null;
}

// ---------------------------------------------------------------------------
// S131 — the event parser. Decoration-class junk warn-drops; time-sanity
// refuses. An over-long label drops ITSELF (the event stays) — the label
// is decoration riding the cue, the cue is the fact.
// ---------------------------------------------------------------------------

const EVENT_KEYS = new Set(["tMs", "kind", "label"]);

function parseEvents(
  raw: unknown,
  where: string,
  sceneMs: number,
  warnings: string[],
  errors: string[],
): GraphicsEvent[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw) || raw.length === 0) {
    warnings.push(`${where}: events dropped — not a non-empty array`);
    return null;
  }
  let list = raw;
  if (list.length > GRAPHICS_BUDGETS.eventsPerSceneMax) {
    warnings.push(
      `${where}: events dropped ${list.length - GRAPHICS_BUDGETS.eventsPerSceneMax} cues past the eventsPerSceneMax wall (${GRAPHICS_BUDGETS.eventsPerSceneMax})`,
    );
    list = list.slice(0, GRAPHICS_BUDGETS.eventsPerSceneMax);
  }
  const out: GraphicsEvent[] = [];
  for (const eRaw of list) {
    if (!isObj(eRaw)) {
      warnings.push(`${where}: an event dropped — not an object`);
      continue;
    }
    warnUnknownKeys(eRaw, EVENT_KEYS, where, warnings);
    const tMs = num(eRaw.tMs);
    const kind = str(eRaw.kind);
    if (tMs === null || kind === null) {
      warnings.push(`${where}: an event dropped — tMs/kind junk`);
      continue;
    }
    if (!GRAPHICS_EVENT_KINDS.includes(kind as GraphicsEventKind)) {
      warnings.push(
        `${where}: the event at ${String(tMs)}ms dropped — kind "${kind}" is not in the closed event set (${GRAPHICS_EVENT_KINDS.join(", ")})`,
      );
      continue;
    }
    const evKind = kind as GraphicsEventKind;
    if (tMs > sceneMs) {
      errors.push(
        `${where}: an event sits at ${String(tMs)}ms, past the scene clock (${sceneMs}ms)`,
      );
      return null;
    }
    if (tMs < 0) {
      warnings.push(`${where}: the ${evKind} event dropped — tMs must be ≥ 0`);
      continue;
    }
    let label: string | undefined;
    if (eRaw.label !== undefined) {
      const labelStr = str(eRaw.label);
      if (labelStr === null || labelStr.length > GRAPHICS_BUDGETS.eventLabelMax) {
        warnings.push(
          `${where}: the ${evKind} event's label dropped (${labelStr === null ? "junk" : `${labelStr.length} chars`} — the eventLabelMax wall is ${GRAPHICS_BUDGETS.eventLabelMax}); the event stays`,
        );
      } else if (labelStr.length > 0) {
        label = labelStr;
      }
    }
    out.push(label !== undefined ? { tMs, kind: evKind, label } : { tMs, kind: evKind });
  }
  return out.length > 0 ? out : null;
}

// --- per-kind payload parsers: shape violations are ERRORS (a payload
// that CLAIMS to be the kind's payload but is broken is structural);
// optional junk fields drop honestly with warnings. -------------------------

function parseTextPayload(raw: unknown, where: string, warnings: string[], errors: string[]): TextPayload | null {
  if (raw === undefined) return null; // absent — the caller warns; tolerant parse never refuses
  if (!isObj(raw)) { errors.push(`${where}: text payload unreadable — not an object`); return null; }
  const text = str(raw.text);
  if (text === null || text.trim() === "") {
    errors.push(`${where}: text payload requires a non-empty "text" string`);
    return null;
  }
  if (text.length > GRAPHICS_BUDGETS.textCharsMax) {
    errors.push(
      `${where}: the text string (${text.length} chars) exceeds the textCharsMax wall (${GRAPHICS_BUDGETS.textCharsMax})`,
    );
    return null;
  }
  const out: TextPayload = { text };
  const sizePx = num(raw.sizePx);
  if (sizePx !== null) {
    if (sizePx < 12 || sizePx > 288) {
      warnings.push(`${where}: sizePx ${sizePx} clamped to 12..288`);
      out.sizePx = clamp(sizePx, 12, 288);
    } else out.sizePx = sizePx;
  } else if (raw.sizePx !== undefined) {
    warnings.push(`${where}: sizePx dropped — not a finite number`);
  }
  const weight = num(raw.weight);
  if (weight !== null) {
    if (weight < 100 || weight > 900) {
      warnings.push(`${where}: weight ${weight} clamped to 100..900`);
      out.weight = clamp(weight, 100, 900);
    } else out.weight = weight;
  } else if (raw.weight !== undefined) {
    warnings.push(`${where}: weight dropped — not a finite number`);
  }
  const color = parseColor(raw.color, where, "color", warnings);
  if (color !== undefined) out.color = color;
  const align = str(raw.align);
  if (align === "left" || align === "center" || align === "right") out.align = align;
  else if (raw.align !== undefined) warnings.push(`${where}: align dropped — not left|center|right`);
  warnUnknownKeys(raw, TEXT_PAYLOAD_KEYS, `${where} text payload`, warnings);
  return out;
}

function parseCounterPayload(raw: unknown, where: string, warnings: string[], errors: string[]): CounterPayload | null {
  if (raw === undefined) return null; // absent — the caller warns; tolerant parse never refuses
  if (!isObj(raw)) { errors.push(`${where}: counter payload unreadable — not an object`); return null; }
  const from = num(raw.from);
  const to = num(raw.to);
  if (from === null || to === null) {
    errors.push(`${where}: counter payload requires finite "from" and "to"`);
    return null;
  }
  if (from >= to) {
    errors.push(`${where}: counter from (${from}) must be < to (${to}) — the v1 count-up law`);
    return null;
  }
  const out: CounterPayload = { from, to };
  const unit = str(raw.unit);
  if (unit !== null && unit.length > GRAPHICS_BUDGETS.textCharsMax) {
    warnings.push(
      `${where}: unit dropped — ${unit.length} chars exceeds the textCharsMax wall (${GRAPHICS_BUDGETS.textCharsMax})`,
    );
  } else if (unit !== null) out.unit = unit;
  else if (raw.unit !== undefined) warnings.push(`${where}: unit dropped — not a string`);
  const decimals = num(raw.decimals);
  if (decimals === 0 || decimals === 1 || decimals === 2) out.decimals = decimals;
  else if (raw.decimals !== undefined) warnings.push(`${where}: decimals dropped — must be 0|1|2`);
  warnUnknownKeys(raw, COUNTER_PAYLOAD_KEYS, `${where} counter payload`, warnings);
  return out;
}

function parseBarPayload(raw: unknown, where: string, warnings: string[], errors: string[]): BarPayload | null {
  if (raw === undefined) return null; // absent — the caller warns; tolerant parse never refuses
  if (!isObj(raw)) { errors.push(`${where}: bar payload unreadable — not an object`); return null; }
  if (!Array.isArray(raw.data)) {
    errors.push(`${where}: bar payload requires a "data" array`);
    return null;
  }
  if (raw.data.length === 0) {
    errors.push(`${where}: bar payload requires 1..${GRAPHICS_BUDGETS.barDataMax} data rows`);
    return null;
  }
  if (raw.data.length > GRAPHICS_BUDGETS.barDataMax) {
    errors.push(
      `${where}: ${raw.data.length} bar rows exceeds the barDataMax wall (${GRAPHICS_BUDGETS.barDataMax})`,
    );
    return null;
  }
  const data: BarDatum[] = [];
  for (const row of raw.data) {
    if (!isObj(row)) { errors.push(`${where}: bar data row unreadable — not an object`); return null; }
    const label = str(row.label);
    const value = num(row.value);
    if (label === null || label.trim() === "" || value === null || value < 0) {
      errors.push(`${where}: bar data rows require a non-empty "label" and a finite "value" ≥ 0`);
      return null;
    }
    if (label.length > GRAPHICS_BUDGETS.textCharsMax) {
      errors.push(
        `${where}: bar label (${label.length} chars) exceeds the textCharsMax wall (${GRAPHICS_BUDGETS.textCharsMax})`,
      );
      return null;
    }
    data.push({ label, value });
  }
  const out: BarPayload = { data };
  const unit = str(raw.unit);
  if (unit !== null && unit.length > GRAPHICS_BUDGETS.textCharsMax) {
    warnings.push(
      `${where}: unit dropped — ${unit.length} chars exceeds the textCharsMax wall (${GRAPHICS_BUDGETS.textCharsMax})`,
    );
  } else if (unit !== null) out.unit = unit;
  else if (raw.unit !== undefined) warnings.push(`${where}: unit dropped — not a string`);
  const max = num(raw.max);
  if (max !== null && max > 0) out.max = max;
  else if (raw.max !== undefined) warnings.push(`${where}: max dropped — must be finite > 0`);
  if (typeof raw.horizontal === "boolean") out.horizontal = raw.horizontal;
  else if (raw.horizontal !== undefined) warnings.push(`${where}: horizontal dropped — not a boolean`);
  warnUnknownKeys(raw, BAR_PAYLOAD_KEYS, `${where} bar payload`, warnings);
  return out;
}

function parseIconPayload(raw: unknown, where: string, warnings: string[], errors: string[]): IconPayload | null {
  if (raw === undefined) return null; // absent — the caller warns; tolerant parse never refuses
  if (!isObj(raw)) { errors.push(`${where}: icon payload unreadable — not an object`); return null; }
  if (!Array.isArray(raw.paths) || raw.paths.length === 0) {
    errors.push(`${where}: icon payload requires a non-empty "paths" array`);
    return null;
  }
  const paths: string[] = [];
  for (const p of raw.paths) {
    const d = str(p);
    if (d === null || d.trim() === "") {
      errors.push(`${where}: icon paths must be non-empty path-data strings`);
      return null;
    }
    if (d.length > GRAPHICS_BUDGETS.iconPathCharsMax) {
      errors.push(
        `${where}: icon path (${d.length} chars) exceeds the iconPathCharsMax wall (${GRAPHICS_BUDGETS.iconPathCharsMax})`,
      );
      return null;
    }
    const commands = countPathCommands(d);
    if (commands === 0) {
      errors.push(`${where}: icon path does not parse — "${d.slice(0, 32)}"`);
      return null;
    }
    if (commands > GRAPHICS_BUDGETS.iconPathCommandBudget) {
      errors.push(
        `${where}: icon path with ${commands} commands exceeds the iconPathCommandBudget wall (${GRAPHICS_BUDGETS.iconPathCommandBudget})`,
      );
      return null;
    }
    paths.push(d);
  }
  const out: IconPayload = { paths };
  const color = parseColor(raw.color, where, "color", warnings);
  if (color !== undefined) out.color = color;
  const strokeWidth = parseStrokeWidth(raw.strokeWidth, where, warnings);
  if (strokeWidth !== undefined) out.strokeWidth = strokeWidth;
  warnUnknownKeys(raw, ICON_PAYLOAD_KEYS, `${where} icon payload`, warnings);
  return out;
}

function parseCalloutPayload(raw: unknown, where: string, warnings: string[], errors: string[]): CalloutPayload | null {
  if (raw === undefined) return null; // absent — the caller warns; tolerant parse never refuses
  if (!isObj(raw)) { errors.push(`${where}: callout payload unreadable — not an object`); return null; }
  const text = str(raw.text);
  if (text === null || text.trim() === "") {
    errors.push(`${where}: callout payload requires a non-empty "text" string`);
    return null;
  }
  if (text.length > GRAPHICS_BUDGETS.textCharsMax) {
    errors.push(
      `${where}: the callout string (${text.length} chars) exceeds the textCharsMax wall (${GRAPHICS_BUDGETS.textCharsMax})`,
    );
    return null;
  }
  const out: CalloutPayload = { text };
  if (raw.pointsAt !== undefined) {
    const px = isObj(raw.pointsAt) ? num(raw.pointsAt.x) : null;
    const py = isObj(raw.pointsAt) ? num(raw.pointsAt.y) : null;
    if (px !== null && py !== null) out.pointsAt = { x: px, y: py };
    else warnings.push(`${where}: pointsAt dropped — must be {x, y} finite`);
  }
  warnUnknownKeys(raw, CALLOUT_PAYLOAD_KEYS, `${where} callout payload`, warnings);
  return out;
}

function parseShapePayload(raw: unknown, where: string, warnings: string[], errors: string[]): ShapePayload | null {
  if (raw === undefined) return null; // absent — the caller warns; tolerant parse never refuses
  if (!isObj(raw)) { errors.push(`${where}: shape payload unreadable — not an object`); return null; }
  const kind = str(raw.kind);
  if (kind !== "rect" && kind !== "line" && kind !== "circle") {
    errors.push(`${where}: shape payload requires kind rect|line|circle — got "${String(raw.kind)}"`);
    return null;
  }
  const out: ShapePayload = { kind };
  for (const dim of ["w", "h", "r"] as const) {
    const v = num(raw[dim]);
    if (v !== null && v > 0) out[dim] = v;
    else if (raw[dim] !== undefined) warnings.push(`${where}: ${dim} dropped — must be finite > 0`);
  }
  const stroke = parseColor(raw.stroke, where, "stroke", warnings);
  if (stroke !== undefined) out.stroke = stroke;
  const fill = parseColor(raw.fill, where, "fill", warnings);
  if (fill !== undefined) out.fill = fill;
  const strokeWidth = parseStrokeWidth(raw.strokeWidth, where, warnings);
  if (strokeWidth !== undefined) out.strokeWidth = strokeWidth;
  warnUnknownKeys(raw, SHAPE_PAYLOAD_KEYS, `${where} shape payload`, warnings);
  return out;
}

function parseGroupPayload(raw: unknown, where: string, warnings: string[], errors: string[]): GroupPayload | null {
  if (raw === undefined) return null; // absent — the caller warns; tolerant parse never refuses
  if (!isObj(raw)) { errors.push(`${where}: group payload unreadable — not an object`); return null; }
  if (!Array.isArray(raw.children) || raw.children.length === 0) {
    errors.push(`${where}: group payload requires a non-empty "children" id array`);
    return null;
  }
  const children: string[] = [];
  for (const c of raw.children) {
    const id = str(c);
    if (id === null) {
      errors.push(`${where}: group children must be element ids (strings)`);
      return null;
    }
    children.push(id);
  }
  warnUnknownKeys(raw, GROUP_PAYLOAD_KEYS, `${where} group payload`, warnings);
  return { children };
}

/** S126 — the sprite payload: the import-row reference + the shared
 *  timebase facts. Strict (shape violations are errors — the payload
 *  drives the renderer's frame arithmetic). */
function parseSpritePayload(
  raw: unknown,
  where: string,
  warnings: string[],
  errors: string[],
): SpritePayload | null {
  if (raw === undefined) return null;
  if (!isObj(raw)) {
    errors.push(`${where}: sprite payload unreadable — not an object`);
    return null;
  }
  warnUnknownKeys(raw, SPRITE_PAYLOAD_KEYS, `${where} sprite payload`, warnings);
  const assetKey = str(raw.assetKey);
  if (assetKey === null || !validGraphicsId(assetKey)) {
    errors.push(`${where}: sprite assetKey violates the id law (${String(raw.assetKey)})`);
    return null;
  }
  const layout = str(raw.layout);
  if (layout !== "sheet" && layout !== "sequence") {
    errors.push(`${where}: sprite layout must be "sheet" or "sequence" — got ${String(raw.layout)}`);
    return null;
  }
  const frames = num(raw.frames);
  if (frames === null || frames < 1 || frames > GRAPHICS_BUDGETS.spriteFramesMax) {
    errors.push(`${where}: sprite frames must be 1..${GRAPHICS_BUDGETS.spriteFramesMax} — got ${String(raw.frames)}`);
    return null;
  }
  if (raw.fps !== 24 && raw.fps !== 30) {
    errors.push(`${where}: sprite fps must be 24 or 30 (the shared timebase) — got ${String(raw.fps)}`);
    return null;
  }
  const frameW = num(raw.frameW);
  const frameH = num(raw.frameH);
  const DIM_MAX = 4096;
  if (frameW === null || frameH === null || frameW < 1 || frameH < 1 || frameW > DIM_MAX || frameH > DIM_MAX) {
    errors.push(`${where}: sprite frameW/frameH must be finite 1..${DIM_MAX}`);
    return null;
  }
  return { assetKey, layout, frames, fps: raw.fps as 24 | 30, frameW, frameH };
}

/** The payload slot per kind — the closed mapping (compile-total). */
const PAYLOAD_SLOT: Readonly<Record<GraphicsElementKind, string>> = {
  headline: "text", subhead: "text", bullet: "text",
  counter: "counter", bar: "bar", barChart: "bar",
  icon: "icon", callout: "callout", shape: "shape", group: "group",
  sprite: "sprite",
};

const PAYLOAD_SLOTS = new Set(["text", "counter", "bar", "icon", "callout", "shape", "group", "sprite"]);

function parseElement(
  raw: unknown,
  sceneWhere: string,
  sceneMs: number,
  warnings: string[],
  errors: string[],
): GraphicsElement | null {
  if (!isObj(raw)) { errors.push(`${sceneWhere}: element unreadable — not an object`); return null; }
  const id = str(raw.id);
  if (id === null || !validGraphicsId(id)) {
    errors.push(`${sceneWhere}: element id violates the id law (${String(raw.id)})`);
    return null;
  }
  const where = `${sceneWhere} element "${id}"`;
  warnUnknownKeys(raw, ELEMENT_KEYS, where, warnings);
  const kind = str(raw.kind);
  if (kind === null || !GRAPHICS_ELEMENT_KINDS.includes(kind as GraphicsElementKind)) {
    warnings.push(`${where}: unknown element kind "${String(raw.kind)}" dropped (the v1 set is closed)`);
    return null;
  }
  const elKind = kind as GraphicsElementKind;

  // Choreography — enter is REQUIRED (an element that cannot enter has no
  // reason to exist in this grammar); exit/emphasis drop honestly when
  // absent/junk.
  if (raw.enter === undefined) {
    errors.push(`${where}: enter is required — an element that cannot enter has no reason to exist in this grammar`);
    return null;
  }
  const enter = parseMotion(raw.enter, where, "enter", warnings, errors, true);
  if (enter === null) return null;
  const exit = parseMotion(raw.exit, where, "exit", warnings, errors, false);
  const emphasis = parseMotion(raw.emphasis, where, "emphasis", warnings, errors, false);
  const motions: Array<{ slot: string; motion: ElementMotion }> = [
    { slot: "enter", motion: enter },
    ...(exit ? [{ slot: "exit", motion: exit }] : []),
    ...(emphasis ? [{ slot: "emphasis", motion: emphasis }] : []),
  ];

  // Motion/element compatibility + time sanity — enforced HERE, not at
  // render (the Part F law: a doc that reaches the frame engine is
  // guaranteed legal, so frameAt carries no defensive branches).
  const legal = legalMotions(elKind);
  for (const { slot, motion } of motions) {
    if (!legal.includes(motion.kind)) {
      errors.push(
        `${where}: the ${slot} motion "${motion.kind}" is not legal on a "${elKind}" (the compatibility table allows: ${legal.join(", ")})`,
      );
      return null;
    }
    const spanEnd = motion.delayMs + motion.durationMs;
    if (spanEnd > sceneMs) {
      errors.push(
        `${where}: the ${slot} motion ends at ${spanEnd}ms, past the scene clock (${sceneMs}ms)`,
      );
      return null;
    }
  }

  // S129 — the tween directives (decoration-class parse, error-class time
  // sanity — the class split is the parser's block comment).
  const tweens = parseTweens(raw.tweens, where, elKind, sceneMs, warnings, errors);
  if (errors.length > 0) return null;

  // Payload-per-kind: payloads parked under the WRONG slot are
  // unknown-field noise to a v1 reader (warning + ignored); the element's
  // own slot parses strictly (shape violations are errors); an absent
  // payload for a kind that has one warns but never refuses.
  const ownSlot = PAYLOAD_SLOT[elKind];
  for (const key of Object.keys(raw)) {
    if (PAYLOAD_SLOTS.has(key) && key !== ownSlot && raw[key] !== undefined) {
      warnings.push(`${where}: a "${key}" payload on a "${elKind}" is ignored (payload-per-kind)`);
    }
  }

  const el: GraphicsElement = {
    id,
    kind: elKind,
    at: parsePlacement(raw.at, where, warnings),
    enter,
  };
  if (tweens !== null) el.tweens = tweens;
  const ownRaw = raw[ownSlot];
  let ownParsed = false;
  switch (ownSlot) {
    case "text": {
      const p = parseTextPayload(ownRaw, where, warnings, errors);
      if (errors.length > 0) return null;
      if (p !== null) { el.text = p; ownParsed = true; }
      break;
    }
    case "counter": {
      const p = parseCounterPayload(ownRaw, where, warnings, errors);
      if (errors.length > 0) return null;
      if (p !== null) { el.counter = p; ownParsed = true; }
      break;
    }
    case "bar": {
      const p = parseBarPayload(ownRaw, where, warnings, errors);
      if (errors.length > 0) return null;
      if (p !== null) { el.bar = p; ownParsed = true; }
      break;
    }
    case "icon": {
      const p = parseIconPayload(ownRaw, where, warnings, errors);
      if (errors.length > 0) return null;
      if (p !== null) { el.icon = p; ownParsed = true; }
      break;
    }
    case "callout": {
      const p = parseCalloutPayload(ownRaw, where, warnings, errors);
      if (errors.length > 0) return null;
      if (p !== null) { el.callout = p; ownParsed = true; }
      break;
    }
    case "shape": {
      const p = parseShapePayload(ownRaw, where, warnings, errors);
      if (errors.length > 0) return null;
      if (p !== null) { el.shape = p; ownParsed = true; }
      break;
    }
    case "group": {
      const p = parseGroupPayload(ownRaw, where, warnings, errors);
      if (errors.length > 0) return null;
      if (p !== null) { el.group = p; ownParsed = true; }
      break;
    }
    case "sprite": {
      const p = parseSpritePayload(ownRaw, where, warnings, errors);
      if (errors.length > 0) return null;
      if (p !== null) { el.sprite = p; ownParsed = true; }
      break;
    }
  }
  if (!ownParsed) {
    warnings.push(
      `${where}: the "${ownSlot}" payload is absent — the composer falls back (tolerant parse never refuses)`,
    );
  }
  if (exit) el.exit = exit;
  if (emphasis) el.emphasis = emphasis;
  const opacity = num(raw.opacity);
  if (opacity !== null) {
    if (opacity < 0 || opacity > 1) {
      warnings.push(`${where}: opacity ${opacity} clamped to 0..1`);
      el.opacity = clamp(opacity, 0, 1);
    } else el.opacity = opacity;
  } else if (raw.opacity !== undefined) {
    warnings.push(`${where}: opacity dropped — not a finite number`);
  }
  return el;
}

function parseScene(
  raw: unknown,
  index: number,
  warnings: string[],
  errors: string[],
  docWidth: number,
  docHeight: number,
): GraphicsScene | null {
  const sceneNo = `scene #${index + 1}`;
  if (!isObj(raw)) { errors.push(`${sceneNo}: unreadable — not an object`); return null; }
  warnUnknownKeys(raw, SCENE_KEYS, sceneNo, warnings);
  const id = str(raw.id);
  if (id === null || !validGraphicsId(id)) {
    errors.push(`${sceneNo}: scene id violates the id law (${String(raw.id)})`);
    return null;
  }
  const where = `scene "${id}"`;
  const narration = str(raw.narration);
  if (narration === null) {
    errors.push(`${where}: narration must be a string (the clock model reads it)`);
    return null;
  }
  if (narration.length > GRAPHICS_BUDGETS.textCharsMax) {
    errors.push(
      `${where}: narration (${narration.length} chars) exceeds the textCharsMax wall (${GRAPHICS_BUDGETS.textCharsMax})`,
    );
    return null;
  }
  const background = str(raw.background);
  if (background === null || !HEX_RE.test(background)) {
    errors.push(`${where}: background must be #rrggbb — a junk background is refused, never substituted`);
    return null;
  }
  const explicitMs = num(raw.durationMs);
  if (raw.durationMs !== undefined && (explicitMs === null || explicitMs <= 0)) {
    errors.push(`${where}: durationMs must be finite > 0`);
    return null;
  }
  if (explicitMs !== null && explicitMs > GRAPHICS_BUDGETS.sceneDurationMsMax) {
    errors.push(
      `${where}: explicit durationMs ${explicitMs} exceeds the sceneDurationMsMax wall (${GRAPHICS_BUDGETS.sceneDurationMsMax})`,
    );
    return null;
  }
  if (!Array.isArray(raw.elements)) {
    errors.push(`${where}: elements must be an array`);
    return null;
  }
  // The scene clock: explicit > the house 2.6-wps estimate (ONE clock
  // model — timing.ts, never re-implemented).
  const sceneMs = explicitMs !== null && explicitMs > 0 ? explicitMs : estimateNarrationMs(narration);
  // S130 — the scene camera (decoration-class parse, error-class time
  // sanity — the class split is the parser's block comment).
  const camera = parseCamera(raw.camera, where, docWidth, docHeight, sceneMs, warnings, errors);
  if (errors.length > 0) return null;
  // S131 — the scene events (same class split).
  const events = parseEvents(raw.events, where, sceneMs, warnings, errors);
  if (errors.length > 0) return null;
  const elements: GraphicsElement[] = [];
  const ids = new Set<string>();
  for (const elRaw of raw.elements) {
    const el = parseElement(elRaw, where, sceneMs, warnings, errors);
    if (errors.length > 0) return null;
    if (el === null) continue; // dropped (unknown kind) — warned
    if (ids.has(el.id)) {
      errors.push(`${where}: duplicate element id "${el.id}" — ids are the group seam, they must be unique`);
      return null;
    }
    ids.add(el.id);
    elements.push(el);
  }
  // Second phase — group referential integrity (the first phase parsed
  // payloads; ids are now known). The groupDepthMax wall (groups do not
  // nest) makes reference cycles unreachable by construction.
  for (const el of elements) {
    if (el.kind !== "group" || el.group === undefined) continue;
    const seen = new Set<string>();
    const children: string[] = [];
    for (const child of el.group.children) {
      if (child === el.id) {
        errors.push(`${where}: group "${el.id}" references itself`);
        return null;
      }
      if (!ids.has(child)) {
        errors.push(`${where}: group "${el.id}" references missing element "${child}"`);
        return null;
      }
      const childEl = elements.find((c) => c.id === child);
      if (childEl !== undefined && childEl.kind === "group") {
        errors.push(
          `${where}: group "${el.id}" nests group "${child}" — the groupDepthMax wall (${GRAPHICS_BUDGETS.groupDepthMax}) forbids nested groups`,
        );
        return null;
      }
      if (seen.has(child)) {
        warnings.push(`${where}: group "${el.id}" lists "${child}" twice — deduplicated`);
        continue;
      }
      seen.add(child);
      children.push(child);
    }
    el.group = { children };
  }
  if (elements.length > GRAPHICS_BUDGETS.elementsPerScene) {
    errors.push(
      `${where}: ${elements.length} elements exceeds the elementsPerScene wall (${GRAPHICS_BUDGETS.elementsPerScene})`,
    );
    return null;
  }
  // (D2) Advisory routing — tolerant read: junk drops with a warning, never
  // an error, never a default (absent stays absent). The scene parses
  // identically with, without, or with junk routing — the neutrality pin.
  const routing = parseRoutingHints(raw.routing, where, warnings);
  // THE RECIPE FIELD (the re-audit's step 4): a persisted recipe citation —
  // ERROR-class (integrity, not decoration); absent stays absent.
  const sceneRecipe = parseRecipeField(raw.recipe, where, errors);
  if (errors.length > 0) return null;
  const scene: GraphicsScene = { id, narration, background, elements };
  if (explicitMs !== null && explicitMs > 0) scene.durationMs = explicitMs;
  if (routing !== null) scene.routing = routing;
  if (camera !== null) scene.camera = camera;
  if (events !== null) scene.events = events;
  if (sceneRecipe !== undefined) scene.recipe = sceneRecipe;
  return scene;
}

/** (D2) The advisory routing hints' tolerant read. Junk drops honestly
 *  with a warning — never an error, never defaulted (advisory metadata has
 *  no power over the render); a hints object that carries no surviving
 *  field stays absent (absent stays absent). PURE. */
function parseRoutingHints(raw: unknown, where: string, warnings: string[]): GraphicsRoutingHints | null {
  if (raw === undefined) return null;
  if (!isObj(raw)) {
    warnings.push(`${where}: routing dropped — not an object (advisory metadata never refuses the doc)`);
    return null;
  }
  warnUnknownKeys(raw, ROUTING_KEYS, `${where} routing hints`, warnings);
  const out: GraphicsRoutingHints = {};
  const engine = str(raw.suggestedEngine);
  if (engine !== null && (GRAPHICS_ROUTING_ENGINES as readonly string[]).includes(engine)) {
    out.suggestedEngine = engine as GraphicsRoutingEngine;
  } else if (raw.suggestedEngine !== undefined) {
    warnings.push(
      `${where}: routing.suggestedEngine dropped — not in the closed engine set (${GRAPHICS_ROUTING_ENGINES.join(", ")})`,
    );
  }
  const confidence = num(raw.confidence);
  if (confidence !== null) {
    if (confidence < 0 || confidence > 1) {
      warnings.push(`${where}: routing.confidence ${confidence} clamped to 0..1`);
      out.confidence = clamp(confidence, 0, 1);
    } else out.confidence = confidence;
  } else if (raw.confidence !== undefined) {
    warnings.push(`${where}: routing.confidence dropped — not a finite number`);
  }
  const reason = str(raw.reason);
  if (reason !== null) {
    if (reason.length > GRAPHICS_ROUTING_REASON_MAX) {
      warnings.push(`${where}: routing.reason truncated to ${GRAPHICS_ROUTING_REASON_MAX} chars`);
      out.reason = reason.slice(0, GRAPHICS_ROUTING_REASON_MAX);
    } else out.reason = reason;
  } else if (raw.reason !== undefined) {
    warnings.push(`${where}: routing.reason dropped — not a string`);
  }
  if (Object.keys(out).length === 0) {
    warnings.push(`${where}: routing carried no hints — dropped (absent stays absent)`);
    return null;
  }
  return out;
}

function parseDoc(raw: unknown, warnings: string[], errors: string[]): GraphicsDoc | null {
  if (!isObj(raw)) { errors.push("the doc must be a JSON object"); return null; }
  warnUnknownKeys(raw, DOC_KEYS, "doc", warnings);
  // Version check — the Scene3D law: an unknown version reads as absent
  // and is never overwritten. A HIGHER integer is the additive law (v-next
  // loads in v1 readers, warned); a junk/missing shape is unreadable.
  const version = num(raw.version);
  if (version === null || !Number.isInteger(version)) {
    errors.push(`doc version must be the integer ${GRAPHICS_VERSION} — got ${String(raw.version)}`);
    return null;
  }
  if (version > GRAPHICS_VERSION) {
    warnings.push(`doc version ${version} is newer than this reader (${GRAPHICS_VERSION}) — parsed as v1, unknown fields dropped`);
  } else if (version < GRAPHICS_VERSION) {
    errors.push(`doc version ${version} predates ${GRAPHICS_VERSION} — nothing to read`);
    return null;
  }
  const title = str(raw.title);
  if (title === null || title.trim() === "") {
    errors.push("doc title must be a non-empty string");
    return null;
  }
  if (title.length > GRAPHICS_BUDGETS.textCharsMax) {
    errors.push(
      `doc title (${title.length} chars) exceeds the textCharsMax wall (${GRAPHICS_BUDGETS.textCharsMax})`,
    );
    return null;
  }
  const width = num(raw.width);
  const height = num(raw.height);
  const onSurface = GRAPHICS_SURFACES.some(([w, h]) => width === w && height === h);
  if (width === null || height === null || !onSurface) {
    errors.push(
      `doc size ${String(raw.width)}×${String(raw.height)} is not a house surface (${GRAPHICS_SURFACES.map(([w, h]) => `${w}×${h}`).join(", ")})`,
    );
    return null;
  }
  const fps = num(raw.fps);
  if (fps !== 24 && fps !== 30) {
    errors.push(`doc fps must be 24 or 30 — got ${String(raw.fps)}`);
    return null;
  }
  if (!Array.isArray(raw.scenes)) {
    errors.push("doc scenes must be an array");
    return null;
  }
  if (raw.scenes.length === 0) {
    errors.push("doc scenes is empty — a doc with no scenes renders nothing");
    return null;
  }
  if (raw.scenes.length > GRAPHICS_BUDGETS.scenesPerProject) {
    errors.push(
      `${raw.scenes.length} scenes exceeds the scenesPerProject wall (${GRAPHICS_BUDGETS.scenesPerProject})`,
    );
    return null;
  }
  const scenes: GraphicsScene[] = [];
  const sceneIds = new Set<string>();
  let explicitTotalMs = 0;
  for (let i = 0; i < raw.scenes.length; i++) {
    const scene = parseScene(raw.scenes[i], i, warnings, errors, width, height);
    if (errors.length > 0) return null;
    if (scene === null) continue;
    if (sceneIds.has(scene.id)) {
      errors.push(`duplicate scene id "${scene.id}" — scene ids ride the S87 tracks, they must be unique`);
      return null;
    }
    sceneIds.add(scene.id);
    if (scene.durationMs !== undefined) explicitTotalMs += scene.durationMs;
    scenes.push(scene);
  }
  if (explicitTotalMs > GRAPHICS_BUDGETS.projectExplicitDurationMsMax) {
    errors.push(
      `Σ explicit scene durations (${explicitTotalMs}ms) exceeds the projectExplicitDurationMsMax wall (${GRAPHICS_BUDGETS.projectExplicitDurationMsMax})`,
    );
    return null;
  }
  // S163 Phase B — the native transition opt-in (a DOC-level decoration,
  // tolerant like every optional field): each entry through the sanitizer,
  // extras beyond the boundary count warn-drop, an array with no
  // surviving spec stays absent (absent stays absent).
  let nativeTransitions: TransitionSpec[] | undefined;
  if (raw.nativeTransitions !== undefined) {
    if (!Array.isArray(raw.nativeTransitions)) {
      warnings.push("doc nativeTransitions dropped — not an array");
    } else {
      const maxSpecs = Math.max(0, scenes.length - 1);
      const specs: TransitionSpec[] = [];
      for (let i = 0; i < raw.nativeTransitions.length; i++) {
        const where = `doc nativeTransitions[${i}]`;
        if (specs.length >= maxSpecs) {
          warnings.push(`${where} dropped — only ${maxSpecs} boundaries exist for ${scenes.length} scenes`);
          continue;
        }
        const spec = sanitizeNativeTransitionSpec(raw.nativeTransitions[i], where, warnings);
        if (spec !== null) specs.push(spec);
      }
      if (specs.length > 0) nativeTransitions = specs;
      else warnings.push("doc nativeTransitions carried no surviving specs — dropped (absent stays absent)");
    }
  }
  // THE RECIPE FIELD at the doc level (the re-audit's step 4): the
  // project-wide recipe citation — ERROR-class; absent stays absent.
  const docRecipe = parseRecipeField(raw.recipe, "doc", errors);
  return {
    version: GRAPHICS_VERSION,
    title,
    width,
    height,
    fps: fps as 24 | 30,
    scenes,
    ...(docRecipe !== undefined ? { recipe: docRecipe } : {}),
    ...(nativeTransitions !== undefined ? { nativeTransitions } : {}),
  };
}

// ---------------------------------------------------------------------------
// Validation entries
// ---------------------------------------------------------------------------

/** Full validation: version check, id law on every id, walls, per-kind
 *  payload shapes, motion/element compatibility (MOTION_KINDS_BY_ELEMENT),
 *  group referential integrity + depth, time sanity (durationMs > 0,
 *  delayMs ≥ 0, enter required, motion spans within the scene clock), icon
 *  path parse under the command budget, color/#rrggbb shape, fps ∈ {24,
 *  30}, surface ∈ the three house sizes. PURE — same input, same result. */
export function validateGraphicsDoc(raw: unknown): GraphicsValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const doc = parseDoc(raw, warnings, errors);
  if (errors.length > 0) return { doc: null, errors, warnings };
  return { doc, errors, warnings };
}

/** Tolerant entry (the parseScene3D shape): null on unreadable — junk
 *  JSON, wrong version shape, structural nonsense. */
export function parseGraphicsDoc(json: string | null | undefined): GraphicsDoc | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  return validateGraphicsDoc(raw).doc;
}

// ---------------------------------------------------------------------------
// Strict write — exactly the declared fields, version first, key order
// stable. Byte-stable round-trip is the pin:
// writeGraphicsDoc(parseGraphicsDoc(writeGraphicsDoc(doc))) ≡ the string.
// ---------------------------------------------------------------------------

function serializeMotion(m: ElementMotion): Rec {
  return { kind: m.kind, durationMs: m.durationMs, delayMs: m.delayMs, ease: m.ease };
}

/** S129 — strict tween write: exactly the declared fields, declared
 *  order — the tween block round-trips byte-stable like everything else
 *  on the element. */
function serializeTweenKeyframe(k: TweenKeyframe): Rec {
  const out: Rec = { tMs: k.tMs, value: k.value };
  if (k.ease !== undefined) out.ease = k.ease;
  return out;
}

function serializeTweens(tweens: ElementTween[]): Rec[] {
  return tweens.map((t) => ({
    delayMs: t.delayMs,
    durationMs: t.durationMs,
    channels: t.channels.map((c) => ({
      channel: c.channel,
      keys: c.keys.map(serializeTweenKeyframe),
    })),
  }));
}

/** S130 — strict camera write: exactly the declared fields, declared
 *  order — the camera block round-trips byte-stable like everything else
 *  on the scene. */
function serializeCameraKey(k: GraphicsCameraKeyframe): Rec {
  const out: Rec = { tMs: k.tMs, zoom: k.zoom, tx: k.tx, ty: k.ty };
  if (k.ease !== undefined) out.ease = k.ease;
  return out;
}

/** S131 — strict event write: exactly the declared fields, declared
 *  order — the event block round-trips byte-stable like everything else
 *  on the scene. */
function serializeEvent(e: GraphicsEvent): Rec {
  const out: Rec = { tMs: e.tMs, kind: e.kind };
  if (e.label !== undefined) out.label = e.label;
  return out;
}

/** Strict advisory write (D2): exactly the declared hint fields, declared
 *  order — the routing block round-trips byte-stable like everything else
 *  on the scene. */
function serializeRouting(r: GraphicsRoutingHints): Rec {
  const out: Rec = {};
  if (r.suggestedEngine !== undefined) out.suggestedEngine = r.suggestedEngine;
  if (r.confidence !== undefined) out.confidence = r.confidence;
  if (r.reason !== undefined) out.reason = r.reason;
  return out;
}

function serializePayload(kind: GraphicsElementKind, el: GraphicsElement): Rec | null {
  switch (kind) {
    case "headline":
    case "subhead":
    case "bullet": {
      if (el.text === undefined) return null;
      const p = el.text;
      const out: Rec = { text: p.text };
      if (p.sizePx !== undefined) out.sizePx = p.sizePx;
      if (p.weight !== undefined) out.weight = p.weight;
      if (p.color !== undefined) out.color = p.color;
      if (p.align !== undefined) out.align = p.align;
      return out;
    }
    case "counter": {
      if (el.counter === undefined) return null;
      const p = el.counter;
      const out: Rec = { from: p.from, to: p.to };
      if (p.unit !== undefined) out.unit = p.unit;
      if (p.decimals !== undefined) out.decimals = p.decimals;
      return out;
    }
    case "bar":
    case "barChart": {
      if (el.bar === undefined) return null;
      const p = el.bar;
      const out: Rec = {
        data: p.data.map((d) => ({ label: d.label, value: d.value })),
      };
      if (p.unit !== undefined) out.unit = p.unit;
      if (p.max !== undefined) out.max = p.max;
      if (p.horizontal !== undefined) out.horizontal = p.horizontal;
      return out;
    }
    case "icon": {
      if (el.icon === undefined) return null;
      const p = el.icon;
      const out: Rec = { paths: [...p.paths] };
      if (p.color !== undefined) out.color = p.color;
      if (p.strokeWidth !== undefined) out.strokeWidth = p.strokeWidth;
      return out;
    }
    case "callout": {
      if (el.callout === undefined) return null;
      const p = el.callout;
      const out: Rec = { text: p.text };
      if (p.pointsAt !== undefined) out.pointsAt = { x: p.pointsAt.x, y: p.pointsAt.y };
      return out;
    }
    case "shape": {
      if (el.shape === undefined) return null;
      const p = el.shape;
      const out: Rec = { kind: p.kind };
      if (p.w !== undefined) out.w = p.w;
      if (p.h !== undefined) out.h = p.h;
      if (p.r !== undefined) out.r = p.r;
      if (p.stroke !== undefined) out.stroke = p.stroke;
      if (p.fill !== undefined) out.fill = p.fill;
      if (p.strokeWidth !== undefined) out.strokeWidth = p.strokeWidth;
      return out;
    }
    case "group": {
      if (el.group === undefined) return null;
      return { children: [...el.group.children] };
    }
    case "sprite": {
      if (el.sprite === undefined) return null;
      return {
        assetKey: el.sprite.assetKey,
        layout: el.sprite.layout,
        frames: el.sprite.frames,
        fps: el.sprite.fps,
        frameW: el.sprite.frameW,
        frameH: el.sprite.frameH,
      };
    }
  }
}

function serializeElement(el: GraphicsElement): Rec {
  const out: Rec = {
    id: el.id,
    kind: el.kind,
    at: { x: el.at.x, y: el.at.y, scale: el.at.scale, rotateDeg: el.at.rotateDeg },
  };
  const payload = serializePayload(el.kind, el);
  if (payload !== null) out[PAYLOAD_SLOT[el.kind]] = payload;
  out.enter = serializeMotion(el.enter);
  if (el.exit !== undefined) out.exit = serializeMotion(el.exit);
  if (el.emphasis !== undefined) out.emphasis = serializeMotion(el.emphasis);
  if (el.tweens !== undefined) out.tweens = serializeTweens(el.tweens);
  if (el.opacity !== undefined) out.opacity = el.opacity;
  return out;
}

/** S163 Phase B — strict native-transition write: exactly the declared
 *  fields, declared order (type, frames, angle, color, bands, seed) — the
 *  spec block round-trips byte-stable like everything else on the doc.
 *  ABSENT on a legacy doc → the key never appears (byte-identity). */
function serializeNativeTransitionSpec(s: TransitionSpec): Rec {
  const out: Rec = { type: s.type, frames: s.frames };
  if (s.angle !== undefined) out.angle = s.angle;
  if (s.color !== undefined) out.color = s.color;
  if (s.bands !== undefined) out.bands = s.bands;
  if (s.seed !== undefined) out.seed = s.seed;
  return out;
}

/** Strict write: exactly the declared fields, version first, key order
 *  stable — byte-stable round-trip is the pin. */
export function writeGraphicsDoc(doc: GraphicsDoc): string {
  return JSON.stringify({
    version: doc.version,
    title: doc.title,
    width: doc.width,
    height: doc.height,
    fps: doc.fps,
    scenes: doc.scenes.map((s) => {
      const out: Rec = { id: s.id, narration: s.narration };
      if (s.durationMs !== undefined) out.durationMs = s.durationMs;
      out.background = s.background;
      // S130 — the camera sits with the scene-level design fields, before
      // the advisory routing block — declared order, byte-stable.
      if (s.camera !== undefined) out.camera = s.camera.map(serializeCameraKey);
      // S131 — the events ride with the PAE directive block — declared
      // order, byte-stable.
      if (s.events !== undefined) out.events = s.events.map(serializeEvent);
      // (D2) advisory block sits between the scene-level design fields and
      // the element list — declared order, byte-stable like the rest.
      if (s.routing !== undefined) out.routing = serializeRouting(s.routing);
      out.elements = s.elements.map(serializeElement);
      return out;
    }),
    // S163 Phase B — the native transition block rides AFTER the scenes
    // (declared order, byte-stable; absent on a legacy doc → byte-identity).
    ...(doc.nativeTransitions !== undefined
      ? { nativeTransitions: doc.nativeTransitions.map(serializeNativeTransitionSpec) }
      : {}),
  });
}

// ---------------------------------------------------------------------------
// The storage envelope — the whiteboard doc's {rev, project} shape,
// mirrored (the route family's advisory-concurrency contract). The envelope
// is a STORAGE detail, not grammar: the doc inside is validated on every
// read (errors → null = the honest "no project" state; warnings are the
// additive-read law's own notes and never fail the read). A bare doc with
// no envelope (a pre-envelope write) still loads — rev 0, the additive-read
// posture the grammar itself applies to v-next docs.
// ---------------------------------------------------------------------------

export interface GraphicsProjectEnvelope {
  /** ≥ 1 on a save; 0 only for a bare pre-envelope doc. Advisory UX, never
   *  a guarantee (the whiteboard rev law — LWW stays the final truth). */
  rev: number;
  doc: GraphicsDoc;
}

/** Tolerant read — corrupt/foreign JSON, a failed validation or a junk rev
 *  reads null ("no project"), never a guess. */
export function parseGraphicsProject(raw: string | null | undefined): GraphicsProjectEnvelope | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(parsed)) return null;
  // The envelope shape first; a bare validated doc falls back to rev 0.
  const body: unknown = "doc" in parsed ? parsed.doc : parsed;
  const { doc, errors } = validateGraphicsDoc(body);
  if (!doc || errors.length > 0) return null;
  let rev = 0;
  if ("doc" in parsed) {
    const r = num(parsed.rev);
    if (r === null || r < 1 || !Number.isInteger(r)) return null;
    rev = r;
  }
  return { rev, doc };
}

/** Strict write: the envelope's two keys in declared order, the doc through
 *  the strict write (writeGraphicsDoc — version first, stable key order), so
 *  a save round-trips byte-identically. The doc must already be validated —
 *  every writer does (the scaffold, the PUT route, the planner). */
export function serializeGraphicsProject(env: GraphicsProjectEnvelope): string {
  return `{"rev":${env.rev},"doc":${writeGraphicsDoc(env.doc)}}`;
}

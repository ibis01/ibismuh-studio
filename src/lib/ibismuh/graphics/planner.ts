// G1.4 — the motion-graphics native scaffold planner (S120 §5 / Part B).
//
// The ZERO-AI starter, the whiteboard-planner's shape applied to the
// GraphicsDoc grammar: builds a valid GraphicsDoc from the video's story
// scenes — narration copied per scene, element structure from a
// deterministic keyword→archetype rule table (stat / chart / list /
// headline scenes), placements from a per-archetype grid, and motions
// from the PER-KIND defaults below (every enter kind drawn from the
// MOTION_KINDS_BY_ELEMENT compatibility table — a planner never proposes
// an illegal motion; the validator would refuse the doc at write).
//
// All on-screen TEXT is extracted from the story (title / narration /
// topic) — the scaffold invents no facts; it only LAYS OUT what the story
// says. The user edits from there.
//
// The graphics module stays a leaf: this planner imports the grammar
// (types.ts), the whiteboard sentence splitter (beat-plan — ONE sentence
// model, never a second) and the whiteboard timing estimator (timing.ts —
// ONE clock model, never a second) — nothing else. Pure and
// deterministic: same input → the same doc, byte for byte (the
// determinism law extends to the planner). $0 work — no AI call anywhere
// (design law 5).
import { splitSentences } from "../whiteboard/beat-plan";
import { estimateNarrationMs } from "../whiteboard/timing";
import type { Placement } from "../whiteboard/svg";
import { GRAPHICS_MOTION_SEMANTICS } from "./frame";
import {
  GRAPHICS_BUDGETS,
  GRAPHICS_SURFACES,
  GRAPHICS_VERSION,
  type BarDatum,
  type ElementMotion,
  type GraphicsCameraKeyframe,
  type GraphicsDoc,
  type GraphicsElement,
  type GraphicsElementKind,
  type GraphicsScene,
} from "./types";

/** The minimal story-scene shape the planner consumes (the whiteboard
 *  scaffold's input, structurally identical — one call site feeds both
 *  engines). */
export interface GraphicsSceneInput {
  index: number;
  title: string;
  narration: string;
}

// ---------------------------------------------------------------------------
// The icon library — the native scaffold's whole concept vocabulary. Tiny
// 24-unit-grid stroke paths (2–4 commands each, far under the
// iconPathCommandBudget wall); the composer scales them via `at.scale`.
// The LLM planner's catalog is exactly these ids (llm-planner.ts) — ONE
// icon source, never a second table.
// ---------------------------------------------------------------------------

export const GRAPHICS_ICON_LIBRARY: Readonly<Record<string, { paths: string[]; tags: string[] }>> = {
  check: { paths: ["M 3 13 L 9 19 L 21 5"], tags: ["check", "verify", "done", "proven"] },
  "arrow-up": { paths: ["M 12 21 L 12 5", "M 5 12 L 12 5 L 19 12"], tags: ["growth", "rise", "trend", "more"] },
  bolt: { paths: ["M 13 2 L 5 14 L 11 14 L 10 22 L 19 9 L 13 9 Z"], tags: ["fast", "energy", "power", "instant"] },
  xmark: { paths: ["M 5 5 L 19 19", "M 19 5 L 5 19"], tags: ["no", "wrong", "avoid", "myth"] },
};

/** The no-cue fallback cycle (deterministic by scene position). */
const FALLBACK_ICON_CYCLE = ["check", "arrow-up", "bolt", "xmark"] as const;

// ---------------------------------------------------------------------------
// The rule tables — deterministic keyword → archetype matching
// ---------------------------------------------------------------------------

/** Enumeration cues → the bullet-list archetype. */
const ENUM_RE =
  /\b(first|second|third|next|then|finally|step|steps|reasons|ways|tips|rules|principles|one|two|three)\b/i;

/** Data cues + ≥2 numbers → the chart archetype (the bar grammar is
 *  data-driven; a chart without numbers in the story would be an
 *  invention). */
const DATA_CUE_RE =
  /\b(chart|graph|data|compare|comparison|comparing|versus|vs\.?|than|rank|ranking|leaderboard|market share|share|percentages?)\b/i;

/** Numbers (with their raw text and an optional unit) — the stat/chart
 *  detector's unit of account. Commas inside values are out of scope v1
 *  (a "1,200" reads as two numbers — an honest scaffold limitation the
 *  user edits from). */
const NUMBER_RE = /(\d+(?:\.\d+)?)\s*(%|percent|percentage|×|x)?/gi;

interface NumberMatch {
  raw: string;
  value: number;
  decimals: number;
  unit?: string;
}

function scanNumbers(text: string): NumberMatch[] {
  const out: NumberMatch[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const raw = (m[0] ?? "").trim();
    if (raw === "") continue;
    const value = Number.parseFloat(m[1] ?? "");
    if (!Number.isFinite(value)) continue;
    const frac = (m[1] ?? "").split(".")[1] ?? "";
    const unitRaw = (m[2] ?? "").toLowerCase();
    const unit = unitRaw === "%" || unitRaw === "percent" || unitRaw === "percentage"
      ? "%"
      : unitRaw === "x" || unitRaw === "×"
        ? "×"
        : undefined;
    out.push({ raw, value, decimals: Math.min(frac.length, 2), unit });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Text helpers — extraction only, no invention (each output is
// deterministic whitespace-collapsed truncation of a story string)
// ---------------------------------------------------------------------------

function capLine(s: string, max = 90): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > 40 ? cut.slice(0, at) : cut).trimEnd() + "…";
}

// ---------------------------------------------------------------------------
// Per-kind defaults — placements (16:9 reference) and enter motions. The
// LLM planner degrades to THESE defaults (llm-planner.ts) — one default
// table, two consumers.
// ---------------------------------------------------------------------------

/** Per-kind default placements in 1920×1080 scene-space (text is anchored
 *  at its center; the chart box is 50% of the surface centered on `at`;
 *  icons are 24-unit paths scaled by `at.scale`). */
const DEFAULT_PLACEMENT_169: Readonly<Record<GraphicsElementKind, Placement>> = {
  headline: { x: 960, y: 480, scale: 1, rotateDeg: 0 },
  subhead: { x: 960, y: 620, scale: 1, rotateDeg: 0 },
  bullet: { x: 960, y: 590, scale: 1, rotateDeg: 0 },
  counter: { x: 960, y: 470, scale: 2.5, rotateDeg: 0 },
  bar: { x: 960, y: 620, scale: 1, rotateDeg: 0 },
  barChart: { x: 960, y: 620, scale: 1, rotateDeg: 0 },
  icon: { x: 960, y: 300, scale: 4, rotateDeg: 0 },
  callout: { x: 960, y: 300, scale: 1, rotateDeg: 0 },
  shape: { x: 960, y: 540, scale: 1, rotateDeg: 0 },
  group: { x: 0, y: 0, scale: 1, rotateDeg: 0 },
  // S126 — the import lane's element: the scaffold never proposes one
  // (imports arrive through the lane, not the planner); the default only
  // satisfies the closed table.
  sprite: { x: 960, y: 540, scale: 1, rotateDeg: 0 },
};

/** Default text sizes per kind (within the validator's 12..288 band). */
const DEFAULT_SIZE_PX: Readonly<Partial<Record<GraphicsElementKind, number>>> = {
  headline: 64,
  subhead: 40,
  bullet: 36,
  callout: 28,
};

/** Remap a 16:9 scene-space placement onto a real house surface — the
 *  whiteboard's S68 law verbatim: positions scale by axis, ink size
 *  follows the WIDTH ratio (a 9:16 board at 1080 wide draws the same ink
 *  size it would at 1080 wide in 16:9). */
function remapPlacement(pl: Placement, width: number, height: number): Placement {
  const fx = width / 1920;
  const fy = height / 1080;
  return { x: Math.round(pl.x * fx), y: Math.round(pl.y * fy), scale: pl.scale * fx, rotateDeg: pl.rotateDeg };
}

/** The default enter motion per kind — every kind drawn from the
 *  compatibility table (a planner never proposes an illegal motion).
 *  `order` staggers repeated kinds (bullets) so the scaffold reads in
 *  sequence — S162: the stagger rides GRAPHICS_MOTION_SEMANTICS
 *  .kineticStaggerMs (the opus overlap schedule — the next row starts
 *  WITHOUT waiting for the previous to finish; the cascade is one
 *  motion). Every span stays far inside the minimum scene clock
 *  (estimateNarrationMs clamps at 4000ms; the widest default span is
 *  1500ms).
 *
 *  S162 — the table rides the MEASURED vocabulary (the six-engine audit
 *  Part 3.1, the opus ease.ts constants): entrances settle on
 *  "measured-out" (0.16,1,0.3,1 — the measured default entrance, the
 *  long-tail settle), counters and bar growth land on "expo-out"
 *  (0.19,1,0.22,1 — violent start, decelerating tail: the number/bars
 *  READ as landing, and the counter's landing pulse completes the
 *  breath), the icon's stroke draw stays "linear" (constant-speed ink is
 *  the honest hand). The pre-S162 names remain in the table — authored
 *  docs evaluate byte-identically (the additive-seam law). */
export function nativeEnterFor(kind: GraphicsElementKind, order: number): ElementMotion {
  switch (kind) {
    case "headline":
      return { kind: "rise", durationMs: 600, delayMs: 0, ease: "measured-out" };
    case "subhead":
      return { kind: "fade", durationMs: 500, delayMs: 250, ease: "measured-out" };
    case "bullet":
      return { kind: "slide", durationMs: 400, delayMs: 400 + GRAPHICS_MOTION_SEMANTICS.kineticStaggerMs * Math.max(0, order), ease: "measured-out" };
    case "counter":
      return { kind: "count", durationMs: 1200, delayMs: 300, ease: "expo-out" };
    case "bar":
    case "barChart":
      return { kind: "grow", durationMs: 900, delayMs: 300, ease: "expo-out" };
    case "icon":
      return { kind: "draw", durationMs: 700, delayMs: 350, ease: "linear" };
    case "callout":
      return { kind: "rise", durationMs: 400, delayMs: 500, ease: "measured-out" };
    case "shape":
      return { kind: "grow", durationMs: 500, delayMs: 350, ease: "measured-out" };
    case "group":
      return { kind: "fade", durationMs: 400, delayMs: 0, ease: "measured-out" };
    // S126 — the scaffold never proposes a sprite (imports arrive through
    // the lane); the default only satisfies the closed table.
    case "sprite":
      return { kind: "fade", durationMs: 400, delayMs: 0, ease: "measured-out" };
  }
}

// ---------------------------------------------------------------------------
// S162 part 2 — the measured EXIT + the camera breathe. The craft the
// round-1 blind tie asked for: the delta must READ, and an element that
// never leaves (a board that never moves) does not read. Both tables are
// TAIL-ANCHORED on the ONE clock: the caller supplies the scene clock
// (estimateNarrationMs — the same model the frame engine resolves), so
// with no VO the plan IS the delivered clock; a VO-extended scene holds
// the plan's pushed state past the last camera key (the motion clamp
// law — the documented estimate anchor). Pure: same inputs → the same
// windows, byte for byte (the determinism law).
// ---------------------------------------------------------------------------

/** The exit cascade's stagger — one bullet leaves this many ms after the
 *  previous (a fraction of the enter stagger: the clearing reads calmer
 *  than the build). */
export const GRAPHICS_EXIT_STAGGER_MS = 90;

/** The camera breathe's push magnitude — zoom 1 → 1.05 across the scene
 *  (the S130 bounds keep zoom ≥ 1, the board never shrinks into void;
 *  1.05 reads as presence, never as a zoom effect). */
export const GRAPHICS_CAMERA_PUSH_ZOOM = 1.05;

/**
 * The default exit motion per kind — endings as deliberate as the
 * entrances. Every window completes at or before `sceneMs − 60`, so the
 * scene's final frames hold the CLEARED board (the breath before the
 * next scene's transition). The choreography arc: the bullet list is
 * consumed FIRST (one bullet every GRAPHICS_EXIT_STAGGER_MS in entrance
 * order — the list leaves the way it was told), then the furniture
 * (kicker / context / icon), and the headline (with the stat's counter)
 * leaves LAST — the scene's identity holds while everything else clears.
 * Chart bars UN-REVEAL (a wipe exit drains reveal progress 1→0 — the
 * grow's mirror, continuity in both directions). Every span fits the
 * validator's time-sanity law (delayMs + durationMs ≤ sceneMs) for any
 * sceneMs ≥ 4000 — the estimator's own floor. Every kind rides its
 * MOTION_KINDS_BY_ELEMENT row (a planner never proposes an illegal
 * motion).
 *
 * `order`/`count` carry the element's index and total among its kind —
 * the same order semantics nativeEnterFor staggers by.
 */
export function nativeExitFor(
  kind: GraphicsElementKind,
  order: number,
  sceneMs: number,
  count: number,
): ElementMotion {
  // The fade helper: completes `endBefore` ms ahead of the scene tail.
  const fadeAt = (endBefore: number, durationMs: number): ElementMotion => ({
    kind: "fade",
    durationMs,
    delayMs: Math.max(0, sceneMs - endBefore - durationMs),
    ease: "measured-in-out",
  });
  switch (kind) {
    case "headline":
    case "counter":
      // The title (and the stat it carries) leaves last.
      return fadeAt(420, 360);
    case "subhead":
    case "callout":
      return fadeAt(500, 380);
    case "bullet": {
      // Entrance order = exit order; the first bullet's fade completes
      // first and the last bullet's completes at the 640 anchor — the
      // list is the first wave out (the cascade overlaps, the house
      // kinetic law; the arc still reads: list, furniture, title).
      const remaining = Math.max(0, count - 1 - order);
      const durationMs = 260;
      return {
        kind: "fade",
        durationMs,
        delayMs: Math.max(0, sceneMs - 640 - remaining * GRAPHICS_EXIT_STAGGER_MS - durationMs),
        ease: "measured-in-out",
      };
    }
    case "bar":
    case "barChart":
      // The un-reveal: progress drains 1→0 (the grow's mirror).
      return {
        kind: "wipe",
        durationMs: 420,
        delayMs: Math.max(0, sceneMs - 500 - 420),
        ease: "measured-in-out",
      };
    case "icon":
      return fadeAt(460, 300);
    case "shape":
      return fadeAt(420, 300);
    case "group":
    case "sprite":
      return fadeAt(460, 320);
  }
}

/**
 * The camera breathe: the house default push-in (the VQ1 P4 camera
 * choreography, riding the S130 camera seam — no new grammar, no new
 * renderer). Two keys: the board holds at zoom 1 while the entrances
 * play, then the +5% push completes AT the scene tail — "measured-in-out"
 * (the slow start never fights the entrances; the settle lands with the
 * exits). The last key sits exactly at the scene clock (the validator's
 * time-sanity law: a key past the clock is an error — at the clock is
 * the edge the planner owns).
 */
export function nativeCameraFor(sceneMs: number): GraphicsCameraKeyframe[] {
  return [
    { tMs: 0, zoom: 1, tx: 0, ty: 0 },
    { tMs: sceneMs, zoom: GRAPHICS_CAMERA_PUSH_ZOOM, tx: 0, ty: 0, ease: "measured-in-out" },
  ];
}

/** The kind-generic default placement, remapped onto the real surface —
 *  the LLM planner's degradation target for absent/junk placements. */
export function nativePlacementFor(kind: GraphicsElementKind, width: number, height: number): Placement {
  return remapPlacement(DEFAULT_PLACEMENT_169[kind], width, height);
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

/** Snap caller geometry onto the house surface table (the validator only
 *  accepts the three native sizes) — nearest by aspect-ratio distance,
 *  ties break toward the earlier (wider) surface. Junk/absent → 16:9. */
function snapSurface(width?: number, height?: number): readonly [number, number] {
  if (
    typeof width !== "number" || !Number.isFinite(width) || width <= 0 ||
    typeof height !== "number" || !Number.isFinite(height) || height <= 0
  ) {
    return GRAPHICS_SURFACES[0] ?? [1920, 1080];
  }
  const ratio = width / height;
  let best: readonly [number, number] = GRAPHICS_SURFACES[0] ?? [1920, 1080];
  let bestD = Number.POSITIVE_INFINITY;
  for (const s of GRAPHICS_SURFACES) {
    const d = Math.abs(Math.log(ratio) - Math.log(s[0] / s[1]));
    if (d < bestD - 1e-9) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function element(
  id: string,
  kind: GraphicsElementKind,
  at: Placement,
  order: number,
  extra: Partial<GraphicsElement>,
): GraphicsElement {
  return { id, kind, at, enter: nativeEnterFor(kind, order), ...extra };
}

/** The text payload for an extracted line — the default palette rides
 *  compose (GRAPHICS_COMPOSE_DEFAULTS); the planner sets only what the
 *  story determined. */
function textPayload(kind: GraphicsElementKind, text: string): { text: string; sizePx: number } {
  return { text, sizePx: DEFAULT_SIZE_PX[kind] ?? 48 };
}

function iconForScene(text: string, position: number): string {
  if (/\b(grow|growth|increase|rise|trend|boost|scale|higher|more)\b/i.test(text)) return "arrow-up";
  if (/\b(check|verify|correct|right|proven|safe|quality|benefit|advantage)\b/i.test(text)) return "check";
  if (/\b(fast|quick|instant|energy|power|speed|faster)\b/i.test(text)) return "bolt";
  if (/\b(myth|wrong|never|avoid|stop|mistake)\b/i.test(text)) return "xmark";
  return FALLBACK_ICON_CYCLE[position % FALLBACK_ICON_CYCLE.length] ?? "check";
}

function bulletElements(narration: string, maxBullets: number, width: number, height: number): GraphicsElement[] {
  const sentences = splitSentences(narration).filter((s) => s.trim() !== "");
  const out: GraphicsElement[] = [];
  for (let i = 0; i < Math.min(sentences.length, maxBullets); i++) {
    const s = sentences[i];
    if (s === undefined) continue;
    out.push(
      element(
        `bullet-${i + 1}`,
        "bullet",
        remapPlacement({ x: 960, y: 590 + 150 * i, scale: 1, rotateDeg: 0 }, width, height),
        i,
        { text: textPayload("bullet", capLine(s)) },
      ),
    );
  }
  return out;
}

function headlineAt(width: number, height: number, text: string, y: number, sizePx: number): GraphicsElement {
  return element("headline", "headline", remapPlacement({ x: 960, y, scale: 1, rotateDeg: 0 }, width, height), 0, {
    text: { text, sizePx },
  });
}

/**
 * Build the starter GraphicsDoc. PURE and DETERMINISTIC: same scenes →
 * the same doc JSON byte-for-byte. The caller has already enforced the
 * scene-count wall — this function refuses beyond it rather than
 * silently truncating, and refuses an empty story (a doc without scenes
 * is not an empty state, it is a bug).
 *
 * Geometry is OPTIONAL and snaps onto the house surface table (the
 * validator accepts exactly the three native sizes — the planner never
 * produces a doc the validator would refuse on surface grounds).
 */
export function scaffoldGraphicsDoc(input: {
  scenes: GraphicsSceneInput[];
  topic: string;
  width?: number;
  height?: number;
  fps?: number;
}): GraphicsDoc {
  if (input.scenes.length === 0) {
    throw new Error("graphics scaffold needs at least one story scene");
  }
  if (input.scenes.length > GRAPHICS_BUDGETS.scenesPerProject) {
    throw new Error(
      `graphics scaffold: ${input.scenes.length} scenes exceeds the ${GRAPHICS_BUDGETS.scenesPerProject}-scene project budget — trim the story first`,
    );
  }

  const [width, height] = snapSurface(input.width, input.height);
  const fps = input.fps === 30 ? 30 : 24;
  const topic = capLine(input.topic, 120);

  const draft: GraphicsScene[] = input.scenes.map((s, i) => {
    const isFirst = i === 0;
    const isLast = i === input.scenes.length - 1 && input.scenes.length > 1;
    const narrationText = `${s.title} ${s.narration}`;
    const numbers = scanNumbers(s.narration);
    const elements: GraphicsElement[] = [];

    if (isFirst || isLast) {
      // The opener / closer: the structural cards — title + topic kicker,
      // the opener with a keyword-picked icon accent.
      elements.push(
        element("title", "headline", remapPlacement({ x: 960, y: isFirst ? 480 : 460, scale: 1, rotateDeg: 0 }, width, height), 0, {
          text: { ...textPayload("headline", capLine(s.title || s.narration, 80)), ...(isLast ? { sizePx: 72 } : { sizePx: 76 }) },
        }),
      );
      elements.push(
        element("kicker", "subhead", remapPlacement({ x: 960, y: isFirst ? 620 : 610, scale: 1, rotateDeg: 0 }, width, height), 0, {
          text: textPayload("subhead", topic),
        }),
      );
      if (isFirst) {
        const iconId = iconForScene(narrationText, i);
        const icon = GRAPHICS_ICON_LIBRARY[iconId];
        if (icon !== undefined) {
          elements.push(
            element("accent", "icon", remapPlacement(DEFAULT_PLACEMENT_169.icon, width, height), 0, {
              icon: { paths: [...icon.paths] },
            }),
          );
        }
      }
      return { id: `scene-${s.index}`, narration: s.narration, background: "#ffffff", elements };
    }

    // The chart archetype: a data cue + ≥2 numbers → the numbers BECOME
    // the chart (label = the number's own rendered form — honest until
    // the user renames; all-zero data degrades to the default scene).
    const chartRows: BarDatum[] = numbers
      .slice(0, GRAPHICS_BUDGETS.barDataMax)
      .map((n) => ({ label: n.raw, value: n.value }));
    if (DATA_CUE_RE.test(s.narration) && numbers.length >= 2 && chartRows.some((r) => r.value > 0)) {
      elements.push(headlineAt(width, height, capLine(s.title || s.narration, 80), 200, 64));
      elements.push(
        element("chart", "barChart", remapPlacement(DEFAULT_PLACEMENT_169.barChart, width, height), 0, {
          bar: { data: chartRows },
        }),
      );
      return { id: `scene-${s.index}`, narration: s.narration, background: "#ffffff", elements };
    }

    // The stat archetype: exactly one number → a counter counting UP to
    // it (the v1 count-up law: from 0 < to; a non-positive or degenerate
    // number degrades to the default scene).
    if (numbers.length === 1 && numbers[0] !== undefined) {
      const n = numbers[0];
      if (n.value > 0) {
        elements.push(
          element("stat", "counter", remapPlacement(DEFAULT_PLACEMENT_169.counter, width, height), 0, {
            counter: { from: 0, to: n.value, ...(n.unit !== undefined ? { unit: n.unit } : {}), ...(n.decimals > 0 ? { decimals: n.decimals as 0 | 1 | 2 } : {}) },
          }),
        );
        const context = splitSentences(s.narration)[0] ?? s.title;
        elements.push(
          element("context", "subhead", remapPlacement(DEFAULT_PLACEMENT_169.subhead, width, height), 0, {
            text: textPayload("subhead", capLine(context, 120)),
          }),
        );
        return { id: `scene-${s.index}`, narration: s.narration, background: "#ffffff", elements };
      }
    }

    // The list archetype: enumeration cues or a sentence-rich scene →
    // headline + up to three bullets.
    if (ENUM_RE.test(s.narration) || splitSentences(s.narration).length >= 3) {
      elements.push(headlineAt(width, height, capLine(s.title || s.narration, 80), 230, 64));
      elements.push(...bulletElements(s.narration, 3, width, height));
      return { id: `scene-${s.index}`, narration: s.narration, background: "#ffffff", elements };
    }

    // The default archetype: kinetic headline + up to two bullets.
    elements.push(headlineAt(width, height, capLine(s.title || s.narration, 80), 400, 64));
    elements.push(...bulletElements(s.narration, 2, width, height));
    return { id: `scene-${s.index}`, narration: s.narration, background: "#ffffff", elements };
  });

  // S162 part 2 — the staged exit + the camera breathe. Every element
  // leaves as deliberately as it entered (nativeExitFor), and every scene
  // carries the push (nativeCameraFor). ONE clock per scene:
  // estimateNarrationMs of the SAME narration the frame engine resolves —
  // with no VO the plan IS the delivered clock (the exit windows land on
  // the real tail). The additive-seam law holds both ways: a doc WITHOUT
  // these fields renders byte-identically (the appliers no-op); THIS
  // scaffold now emits them, which is the deliberate visual change the
  // golden harness re-baselines on purpose.
  const staged: GraphicsScene[] = draft.map((scene) => {
    const sceneMs = estimateNarrationMs(scene.narration);
    const counts = new Map<string, number>();
    for (const el of scene.elements) counts.set(el.kind, (counts.get(el.kind) ?? 0) + 1);
    const seen = new Map<string, number>();
    const elements = scene.elements.map((el) => {
      const order = seen.get(el.kind) ?? 0;
      seen.set(el.kind, order + 1);
      const count = counts.get(el.kind) ?? 1;
      return { ...el, exit: nativeExitFor(el.kind, order, sceneMs, count) };
    });
    return { ...scene, elements, camera: nativeCameraFor(sceneMs) };
  });

  return {
    version: GRAPHICS_VERSION,
    title: input.topic ? `Graphics — ${topic}`.slice(0, 120) : "Graphics",
    width,
    height,
    fps,
    scenes: staged,
  };
}

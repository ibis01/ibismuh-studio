// recipes.ts — the GRAPHICS ANIMATION RECIPE REGISTRY (Phase C of the
// catalog route's design system: "semantic components, animation recipes").
//
// The audit's insight: the planner's choreography knowledge (which motion
// per kind, which delay per order, which ease per role) is a DESIGN SYSTEM
// — naming the variants turns the hand-tuned defaults into a REGISTRY a
// seat (the C2 picker, a future lane-plan field) can offer, without any
// grammar growth: a recipe compiles into the EXISTING ElementMotion
// directives at PLANNING time; the doc never carries a recipe id (the doc
// grammar stays closed — recipes are planner-side vocabulary, the preset
// registry's shape applied at the scene scale).
//
// THE ONE-SOURCE LAW: the per-kind baseline IS the native default table
// (native-defaults.ts) — a recipe may only OVERRIDE per kind, and every
// override rides the same MOTION_KINDS_BY_ELEMENT compatibility row the
// validator enforces (a recipe never proposes an illegal motion — the
// planner's own law, pinned mechanically below). The `house-baseline`
// recipe carries ZERO overrides by LAW (the identity recipe): delegating
// to nativeEnterFor/nativeExitFor is its whole definition, so adopting
// the registry cannot drift the scaffold's pinned outputs.
//
// Fail-closed: an unknown recipe id throws a NAMED error at the planner
// seam (a planner bug, like every closed-table violation — never a silent
// default), and the registry self-check (assertRecipeRegistry, run at
// module load) rejects any structural defect by name.
//
// Pure and deterministic: same (kind, order, recipe) → the same motion,
// byte for byte. No fs, no clock, no randomness.
import { isEaseName, type EaseName } from "../anim/easing";
import {
  GRAPHICS_EXIT_STAGGER_MS,
  nativeEnterFor,
  nativeExitFor,
} from "./native-defaults";
import {
  GRAPHICS_MOTION_KINDS,
  GRAPHICS_ELEMENT_KINDS,
  legalMotions,
  type ElementMotion,
  type GraphicsElementKind,
  type GraphicsMotionKind,
} from "./types";

// ---------------------------------------------------------------------------
// The closed recipe vocabulary
// ---------------------------------------------------------------------------

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

/** One recipe motion override: the motion shape (kind, durationMs, ease)
 *  plus the delay policy — a base delay and a per-order step (the stagger
 *  law: delay = delayMs + step × max(0, order)). Every field rides the
 *  validator's own walls (delay ≥ 0, duration > 0, closed kind/ease
 *  tables). */
export interface RecipeMotionSpec {
  kind: GraphicsMotionKind;
  durationMs: number;
  delayMs: number;
  delayStepMs?: number;
  ease: string;
}

/** One recipe: per-kind OVERRIDE maps. A kind absent from `enter` (or
 *  `exit`) falls through to the NATIVE default — a recipe is a delta on
 *  the house baseline, never a second complete table (the one-source
 *  law; the baseline IS the native table). */
export interface GraphicsRecipe {
  id: GraphicsRecipeId;
  /** One line — the seat picker's label. */
  label: string;
  /** The designed intent (what reading the recipe produces and when to
   *  reach for it). */
  intent: string;
  enter: Readonly<Partial<Record<GraphicsElementKind, RecipeMotionSpec>>>;
  exit: Readonly<Partial<Record<GraphicsElementKind, RecipeMotionSpec>>>;
}

/** Exit overrides are TAIL-ANCHORED like the native table: the spec's
 *  `delayMs` names the END-BEFORE anchor (ms ahead of the scene tail the
 *  window completes at) — the exit function converts (sceneMs − anchor −
 *  durationMs), exactly nativeExitFor's fadeAt shape. Enter overrides use
 *  the delay directly. `RecipeMotionSpec.delayMs` is therefore POLARITY-
 *  SENSITIVE: enter = delay from scene start; exit = end-before anchor.
 *  The registry documents this on the field; the battery pins both
 *  readings. */

// ---------------------------------------------------------------------------
// The registry — five named recipes (the audit's starter set). Delays and
// eases ride the MEASURED vocabulary (S162): entrances settle on
// "measured-out", the stat/chart landings on "expo-out", clears on
// "measured-in-out" — no curve outside the closed table.
// ---------------------------------------------------------------------------

export const GRAPHICS_RECIPES: Readonly<Record<GraphicsRecipeId, GraphicsRecipe>> = {
  // The identity recipe: ZERO overrides BY LAW — the scaffold's pinned
  // outputs are this recipe compiled. An override here would silently
  // fork the native table; assertRecipeRegistry refuses it.
  "house-baseline": {
    id: "house-baseline",
    label: "House baseline",
    intent:
      "The planner's tuned defaults verbatim — headline rises, bullets slide on the kinetic stagger, counters and bars land on expo-out, the icon draws. The recipe a doc gets when nobody chooses.",
    enter: {},
    exit: {},
  },

  // The stat moment: the number lands FIRST and alone, the context line
  // follows once the count has begun to read. The counter keeps the
  // native count/expo-out (the landing pulse); the subhead arrives late
  // on a slide (the explanation chases the number).
  "count-up-spotlight": {
    id: "count-up-spotlight",
    label: "Count-up spotlight",
    intent:
      "The one-number moment: the counter owns the stage — the context line waits until the count reads, then slides in beneath it. For scenes whose payload is a single figure.",
    enter: {
      subhead: { kind: "slide", durationMs: 450, delayMs: 900, ease: "measured-out" },
      icon: { kind: "pop", durationMs: 500, delayMs: 100, ease: "measured-out" },
    },
    exit: {
      // The furniture clears before the number (the number leaves last,
      // mirroring the native arc with a wider gap).
      subhead: { kind: "fade", durationMs: 320, delayMs: 760, ease: "measured-in-out" },
    },
  },

  // The list: the cascade is THE recipe — the headline rises first, the
  // bullets rise (not slide) on the SAME kinetic stagger the native table
  // rides, the icon pops with the headline. Exits stay native (the list
  // leaves first, the title last).
  "cascade-list": {
    id: "cascade-list",
    label: "Cascade list",
    intent:
      "Enumeration scenes: each bullet rises onto the kinetic stagger while the headline holds — the build reads as one motion. The default list reading, with a stronger entrance.",
    enter: {
      bullet: { kind: "rise", durationMs: 420, delayMs: 400, delayStepMs: 150, ease: "measured-out" },
      icon: { kind: "pop", durationMs: 450, delayMs: 150, ease: "measured-out" },
    },
    exit: {},
  },

  // The chart: bars grow in SEQUENCE (order × 220ms — each bar starts as
  // the previous lands), the headline rises first. Exits stay native (the
  // un-reveal wipes 1→0).
  "chart-grow": {
    id: "chart-grow",
    label: "Chart grow",
    intent:
      "Data scenes: the bars grow one after another — each row starts as the previous lands — while the headline names the comparison. The honest leaderboard read.",
    enter: {
      bar: { kind: "grow", durationMs: 700, delayMs: 300, delayStepMs: 220, ease: "expo-out" },
      barChart: { kind: "grow", durationMs: 900, delayMs: 300, delayStepMs: 220, ease: "expo-out" },
    },
    exit: {},
  },

  // The calm deck: everything fades — no slides, no pops — and the
  // cascade tightens (120ms steps). The reading-room look for dense or
  // serious boards.
  "quiet-card": {
    id: "quiet-card",
    label: "Quiet card",
    intent:
      "The calm deck: every entrance is a fade on a tight 120ms cascade — no slides, no pops, no grow. For dense or serious boards where motion must whisper.",
    enter: {
      headline: { kind: "fade", durationMs: 500, delayMs: 0, ease: "measured-out" },
      subhead: { kind: "fade", durationMs: 450, delayMs: 120, ease: "measured-out" },
      bullet: { kind: "fade", durationMs: 420, delayMs: 240, delayStepMs: 120, ease: "measured-out" },
      callout: { kind: "fade", durationMs: 450, delayMs: 120, ease: "measured-out" },
      icon: { kind: "fade", durationMs: 500, delayMs: 120, ease: "measured-out" },
      counter: { kind: "fade", durationMs: 500, delayMs: 150, ease: "measured-out" },
    },
    exit: {
      bullet: { kind: "fade", durationMs: 260, delayMs: 640, ease: "measured-in-out" },
    },
  },

  // WS8 growth — the six recipes the plan's §11 names. Every override
  // rides its compatibility row + the closed ease table (the compile
  // gate verifies at EVERY use; the self-check verifies at load).
  "comparison-bars": {
    id: "comparison-bars",
    label: "Comparison bars",
    intent:
      "The versus moment: the two bars grow side by side on a wide stagger — each row starts as the previous lands — while the topic holds above.",
    enter: {
      bar: { kind: "grow", durationMs: 700, delayMs: 350, delayStepMs: 260, ease: "expo-out" },
      barChart: { kind: "grow", durationMs: 900, delayMs: 350, delayStepMs: 260, ease: "expo-out" },
      subhead: { kind: "slide", durationMs: 450, delayMs: 900, ease: "measured-out" },
    },
    exit: {},
  },
  "timeline-steps": {
    id: "timeline-steps",
    label: "Timeline steps",
    intent:
      "The history moment: the milestones rise on a WIDE stagger (260ms steps — each era gets its own breath) while the era line holds.",
    enter: {
      bullet: { kind: "rise", durationMs: 460, delayMs: 350, delayStepMs: 260, ease: "measured-out" },
      icon: { kind: "pop", durationMs: 450, delayMs: 150, ease: "measured-out" },
    },
    exit: {},
  },
  "process-steps": {
    id: "process-steps",
    label: "Process steps",
    intent:
      "The how-it-works moment: the steps slide on an even 200ms cadence — the procedure reads as one motion, no single step starring.",
    enter: {
      bullet: { kind: "slide", durationMs: 420, delayMs: 400, delayStepMs: 200, ease: "measured-out" },
      headline: { kind: "rise", durationMs: 500, delayMs: 0, ease: "measured-out" },
    },
    exit: {},
  },
  "icon-group-entrance": {
    id: "icon-group-entrance",
    label: "Icon group entrance",
    intent:
      "The ensemble moment: the icons pop on a tight cascade (140ms steps — the group assembles as one gesture), the captions follow on the same stagger.",
    enter: {
      icon: { kind: "pop", durationMs: 480, delayMs: 100, delayStepMs: 140, ease: "measured-out" },
      callout: { kind: "fade", durationMs: 420, delayMs: 500, delayStepMs: 140, ease: "measured-out" },
    },
    exit: {},
  },
  "final-summary": {
    id: "final-summary",
    label: "Final summary",
    intent:
      "The take-home moment: the summary rises first, the reinforcement fades beneath, and EVERYTHING clears early on a tail-anchored fade — the board bows out, it never lingers.",
    enter: {
      headline: { kind: "rise", durationMs: 520, delayMs: 0, ease: "measured-out" },
      subhead: { kind: "fade", durationMs: 450, delayMs: 320, ease: "measured-out" },
      bullet: { kind: "fade", durationMs: 420, delayMs: 460, delayStepMs: 140, ease: "measured-out" },
    },
    exit: {
      headline: { kind: "fade", durationMs: 340, delayMs: 700, ease: "measured-in-out" },
      subhead: { kind: "fade", durationMs: 300, delayMs: 780, ease: "measured-in-out" },
      bullet: { kind: "fade", durationMs: 280, delayMs: 860, ease: "measured-in-out" },
    },
  },
  "problem-solution": {
    id: "problem-solution",
    label: "Problem / solution",
    intent:
      "The tension-and-release moment: the problem callout pops first, the solution line slides in beneath it, the headline rises over both.",
    enter: {
      callout: { kind: "pop", durationMs: 520, delayMs: 0, ease: "measured-out" },
      subhead: { kind: "slide", durationMs: 480, delayMs: 650, ease: "measured-out" },
      headline: { kind: "rise", durationMs: 500, delayMs: 300, ease: "measured-out" },
    },
    exit: {},
  },
};

/** The registry's member list in declaration order — the seat picker's
 *  data source (the presetNames() pattern). */
export function recipeNames(): readonly GraphicsRecipeId[] {
  return GRAPHICS_RECIPE_IDS;
}

/** Resolve a recipe by id — unknown → null (the tolerant READ; the
 *  planner seam itself fails closed below). */
export function resolveRecipe(id: string): GraphicsRecipe | null {
  if ((GRAPHICS_RECIPE_IDS as readonly string[]).includes(id)) {
    return GRAPHICS_RECIPES[id as GraphicsRecipeId];
  }
  return null;
}

// ---------------------------------------------------------------------------
// The compile seam — recipe → the existing ElementMotion directives
// ---------------------------------------------------------------------------

/** Build the ENTER motion for `kind` at `order` under `recipeId`: the
 *  recipe's override for the kind when it declares one (delay = base +
 *  step × order — the stagger law), else the native default. Unknown
 *  recipe id THROWS (a planner bug — the catalog gates ids first); an
 *  override whose ease/junk slipped past the self-check throws too (the
 *  registry is compiled, not trusted). */
export function recipeEnterFor(kind: GraphicsElementKind, order: number, recipeId: GraphicsRecipeId): ElementMotion {
  const recipe = GRAPHICS_RECIPES[recipeId];
  if (recipe === undefined) {
    throw new Error(`recipes: unknown recipe id "${recipeId}" — a planner may only name the registry's recipes (${GRAPHICS_RECIPE_IDS.join(", ")})`);
  }
  const override = recipe.enter[kind];
  if (override === undefined) return nativeEnterFor(kind, order);
  assertOverrideLegal("enter", recipeId, kind, override);
  return {
    kind: override.kind,
    durationMs: override.durationMs,
    delayMs: override.delayMs + (override.delayStepMs ?? 0) * Math.max(0, order),
    ease: override.ease as EaseName,
  };
}

/** Build the EXIT motion for `kind` at `order`/`count` under `recipeId`:
 *  the recipe's override when it declares one (TAIL-ANCHORED — delayMs is
 *  the end-before anchor, converted exactly like nativeExitFor's fadeAt),
 *  else the native default. Unknown recipe id THROWS. */
export function recipeExitFor(
  kind: GraphicsElementKind,
  order: number,
  sceneMs: number,
  count: number,
  recipeId: GraphicsRecipeId,
): ElementMotion {
  const recipe = GRAPHICS_RECIPES[recipeId];
  if (recipe === undefined) {
    throw new Error(`recipes: unknown recipe id "${recipeId}" — a planner may only name the registry's recipes (${GRAPHICS_RECIPE_IDS.join(", ")})`);
  }
  const override = recipe.exit[kind];
  if (override === undefined) return nativeExitFor(kind, order, sceneMs, count);
  assertOverrideLegal("exit", recipeId, kind, override);
  return {
    kind: override.kind,
    durationMs: override.durationMs,
    delayMs: Math.max(0, sceneMs - override.delayMs - override.durationMs),
    ease: override.ease as EaseName,
  };
}

/** The override legality gate (fail-closed, called on EVERY compile): the
 *  motion kind rides the element kind's compatibility row, the ease rides
 *  the closed table (isEaseName through the validator's own check — a
 *  string here, so the registry literal is honest data), the spans are
 *  positive. A defect is an engine bug — named, never silent. */
function assertOverrideLegal(
  slot: "enter" | "exit",
  recipeId: string,
  kind: GraphicsElementKind,
  spec: RecipeMotionSpec,
): void {
  const legal = legalMotions(kind);
  if (!legal.includes(spec.kind)) {
    throw new Error(
      `recipes: ${recipeId} ${slot} override for ${kind} proposes "${spec.kind}" — outside the compatibility row [${legal.join(", ")}]`,
    );
  }
  if (!GRAPHICS_MOTION_KINDS.includes(spec.kind)) {
    throw new Error(`recipes: ${recipeId} ${slot} override for ${kind} names an unknown motion kind "${spec.kind}"`);
  }
  if (typeof spec.ease !== "string" || !isEaseName(spec.ease)) {
    throw new Error(
      `recipes: ${recipeId} ${slot} override for ${kind} carries an ease outside the closed table ("${String(spec.ease)}")`,
    );
  }
  if (!(spec.durationMs > 0)) {
    throw new Error(`recipes: ${recipeId} ${slot} override for ${kind} carries a non-positive duration`);
  }
  if (!(spec.delayMs >= 0)) {
    throw new Error(`recipes: ${recipeId} ${slot} override for ${kind} carries a negative delay`);
  }
  if (spec.delayStepMs !== undefined && !(spec.delayStepMs >= 0)) {
    throw new Error(`recipes: ${recipeId} ${slot} override for ${kind} carries a negative stagger step`);
  }
}

// ---------------------------------------------------------------------------
// The registry self-check — fail-closed at load (the compounds pattern:
// a defect is refused BY NAME, never repaired silently)
// ---------------------------------------------------------------------------

/** Structural defects the self-check rejects: unknown recipe keys, the
 *  baseline carrying overrides (the identity law), overrides outside the
 *  compatibility rows or the closed ease table, negative/zero spans.
 *  Takes the registry entries INJECTABLY (the defect tests feed
 *  synthetic rows; production feeds the shipped registry). */
export function assertRecipeRegistry(entries?: readonly GraphicsRecipe[]): void {
  const list = entries ?? GRAPHICS_RECIPE_IDS.map((id) => {
    const r = GRAPHICS_RECIPES[id];
    if (r === undefined) throw new Error(`recipes: the registry is missing the declared recipe "${id}"`);
    return r;
  });
  const declared = new Set<string>(GRAPHICS_RECIPE_IDS);
  for (const recipe of list) {
    if (!declared.has(recipe.id)) {
      throw new Error(`recipes: the recipe "${recipe.id}" is outside the closed vocabulary (${GRAPHICS_RECIPE_IDS.join(", ")})`);
    }
    if (recipe.id === "house-baseline" && (Object.keys(recipe.enter).length > 0 || Object.keys(recipe.exit).length > 0)) {
      throw new Error("recipes: the house-baseline recipe must carry ZERO overrides — it IS the native table (the identity law)");
    }
    for (const slot of ["enter", "exit"] as const) {
      const map = recipe[slot];
      for (const kind of Object.keys(map) as GraphicsElementKind[]) {
        if (!GRAPHICS_ELEMENT_KINDS.includes(kind)) {
          throw new Error(`recipes: ${recipe.id} ${slot} names an unknown element kind "${kind}"`);
        }
        const spec = map[kind];
        if (spec === undefined) continue;
        assertOverrideLegal(slot, recipe.id, kind, spec);
        // The ease must ride the closed table — checked through the same
        // runtime the validator uses (isEaseName, one source of curve
        // truth): compile the override once here so a bad ease dies at
        // load, not at first use.
        const compiled = slot === "enter"
          ? recipeEnterFor(kind, 0, recipe.id)
          : recipeExitFor(kind, 0, 4000, 1, recipe.id);
        if (!Number.isFinite(compiled.delayMs) || !(compiled.durationMs > 0)) {
          throw new Error(`recipes: ${recipe.id} ${slot} override for ${kind} compiled to a non-finite motion`);
        }
      }
    }
  }
}

// The self-check runs at load: a registry defect refuses the MODULE (the
// compounds pattern — assertCompoundRegistry rides the manifest build).
assertRecipeRegistry();

// The exit-stagger constant rides here for the seat documentation surface
// (the recipes may name it in intents; the value stays ONE source in
// native-defaults.ts — re-exported for the battery's pins).
export { GRAPHICS_EXIT_STAGGER_MS };

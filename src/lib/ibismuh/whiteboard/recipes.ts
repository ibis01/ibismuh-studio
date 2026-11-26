// recipes.ts — the WHITEBOARD RECIPE REGISTRY (the engineering master
// plan's WS6: "animation recipe compiler — reusable choreography for both
// lanes").
//
// The whiteboard lane's choreography already EXISTS — the beat-plan
// (W2) aligns every stroke to the narration's sentences, the fill law
// schedules the cast in draw order, the compound lane assembles systems.
// What the lane LACKED is the plan's ask: NAMED, REACHABLE choreography —
// the ten recipes a designer reaches for (the symbol reveal, the process
// flow, the growth chart, the warning alert...) with a deterministic
// classifier a receipt can show ("this board is a process-flow").
//
// THE HONEST CONTRACT (the D1 receipts' law): this registry NAMES and
// CLASSIFIES the choreography — it is the semantic layer ABOVE the one
// scheduling engine, not a second one. The compile seam stays the
// beat-plan's (one choreography engine); a recipe declares which
// narrative shape it choreographs and the classifier maps narration →
// recipe deterministically. The lane planner's beat receipts (plannerMeta
// .beats) carry the name — the editor's QC panel can show and repair it.
//
// Laws (pinned by scripts/test-whiteboard-recipes.mts):
//   · CLOSED VOCABULARY — ten recipes, declared ids, charset-legal.
//   · FIRST HIT WINS — the cue tables run in priority order; the same
//     narration → the same recipe, byte for byte.
//   · THE FALLBACK CYCLE — a cue-less board still NAMES its shape: the
//     cycle rotates by scene position (the FALLBACK_CYCLE pattern), never
//     silent, never invented.
//   · THE DEAD-END LAW — every cue rule must fire for a registered
//     recipe (mechanically pinned; a rule naming a ghost recipe fails
//     the battery).
//   · PURE — no fs, no clock, no randomness; client-safe (no node:).

// ---------------------------------------------------------------------------
// The closed recipe vocabulary (the plan's §11 whiteboard list, verbatim)
// ---------------------------------------------------------------------------

export const WHITEBOARD_RECIPE_IDS = [
  "symbol-reveal",
  "object-annotation",
  "process-flow",
  "growth-chart",
  "person-prop",
  "warning-alert",
  "compare-states",
  "compound-assembly",
  "handwriting-title",
  "board-conclusion",
] as const;
export type WhiteboardRecipeId = (typeof WHITEBOARD_RECIPE_IDS)[number];

export interface WhiteboardRecipeSpec {
  id: WhiteboardRecipeId;
  /** One line — the receipt surface's label. */
  label: string;
  /** The choreography this recipe names (what the board DOES). */
  intent: string;
  /** The cue vocabulary, priority-ordered — the classifier's first hit. */
  cues: readonly RegExp[];
}

// ---------------------------------------------------------------------------
// The registry — priority order IS the classifier's order. Cues ride
// word-boundary regexes (the KEYWORD_PICKS discipline); every rule names a
// registered recipe (the dead-end law, pinned mechanically below).
// ---------------------------------------------------------------------------

export const WHITEBOARD_RECIPES: Readonly<Record<WhiteboardRecipeId, WhiteboardRecipeSpec>> = {
  "handwriting-title": {
    id: "handwriting-title",
    label: "Handwriting title",
    intent:
      "The board opens by WRITING: the title underlines itself, the concept lands beneath — a lesson's first breath.",
    cues: [/\b(introduc\w*|today we|let'?s (learn|see|start)|a lesson|how (to|does|do)|the basics)\b/i],
  },
  "process-flow": {
    id: "process-flow",
    label: "Process flow",
    intent:
      "The procedure draws in reading order: step follows step, each one landing as the narrator names it — the how-it-works board.",
    cues: [/\b(process|steps?|workflow|procedure|first .* then|how (it|the) works|stage by stage)\b/i],
  },
  "growth-chart": {
    id: "growth-chart",
    label: "Growth chart",
    intent:
      "The rise is the subject: the chart draws upward while the numbers compound — the growth board.",
    cues: [/\b(grow\w*|increas\w*|rising|compound\w*|interest|yield|revenue climb\w*)\b/i],
  },
  "compare-states": {
    id: "compare-states",
    label: "Compare states",
    intent:
      "The two sides board together: before against after, this against that — the comparison board.",
    cues: [/\b(compare\w*|versus|vs\.?|before and after|difference\w*|whereas|instead)\b/i],
  },
  "warning-alert": {
    id: "warning-alert",
    label: "Warning alert",
    intent:
      "The alert draws FIRST and LARGE: the hazard lands before the explanation — the warning board.",
    cues: [/\b(warning|warn\w*|danger\w*|risk\w*|alert\w*|caution|hazard\w*|careful)\b/i],
  },
  "compound-assembly": {
    id: "compound-assembly",
    label: "Compound assembly",
    intent:
      "The system assembles: part joins part until the whole stands — the ecosystem/system board (the compound lane's choreography).",
    cues: [/\b(system|assembl\w*|ecosystem|cycle|whole|all together|the full (setup|picture))\b/i],
  },
  "person-prop": {
    id: "person-prop",
    label: "Person plus prop",
    intent:
      "The character carries the lesson: the figure draws with the tool of their trade — the practitioner board.",
    cues: [/\b(farmer|teacher|doctor|nurse|engineer|worker|student|someone|a person|the man|the woman)\b/i],
  },
  "object-annotation": {
    id: "object-annotation",
    label: "Object plus annotation",
    intent:
      "The object lands, the annotation explains it: the mark first, the label chasing — the annotated board.",
    cues: [/\b(annotat\w*|label\w*|note that|callout|highlight\w*|meaning)\b/i],
  },
  "symbol-reveal": {
    id: "symbol-reveal",
    label: "Symbol reveal",
    intent:
      "The mark IS the message: one symbol draws large and alone — the emblem board.",
    cues: [/\b(symbol|icon|mark|sign|emblem|represents|stands for)\b/i],
  },
  "board-conclusion": {
    id: "board-conclusion",
    label: "Board conclusion",
    intent:
      "The board closes: the take-home line underlines itself, the recap lands beneath — the last board.",
    cues: [/\b(in conclusion|conclusion|to summariz\w*|in summary|finally|to wrap up|remember this|the takeaway)\b/i],
  },
};

/** The cue-less cycle: a board with no cue still NAMES its shape (never
 *  silent) — the rotation is deterministic by scene position. */
const FALLBACK_RECIPE_CYCLE: readonly WhiteboardRecipeId[] = [
  "symbol-reveal",
  "object-annotation",
  "process-flow",
  "handwriting-title",
];

/** The registry's member list in declaration order. */
export function whiteboardRecipeNames(): readonly WhiteboardRecipeId[] {
  return WHITEBOARD_RECIPE_IDS;
}

/** Resolve a recipe by id — unknown → null (the tolerant READ). */
export function resolveWhiteboardRecipe(id: string): WhiteboardRecipeSpec | null {
  if ((WHITEBOARD_RECIPE_IDS as readonly string[]).includes(id)) {
    return WHITEBOARD_RECIPES[id as WhiteboardRecipeId];
  }
  return null;
}

// ---------------------------------------------------------------------------
// The classifier — narration (+ position) → recipe, deterministic
// ---------------------------------------------------------------------------

/** Classify one board's choreography: the cue tables run in PRIORITY
 *  order (declaration order — first hit wins), else the fallback cycle
 *  rotates by position. PURE: same narration + position → the same
 *  recipe, byte for byte. */
export function classifyWhiteboardRecipe(narration: string, position: number): WhiteboardRecipeId {
  for (const spec of WHITEBOARD_RECIPE_IDS) {
    const recipe = WHITEBOARD_RECIPES[spec];
    if (recipe.cues.some((re) => re.test(narration))) return spec;
  }
  return FALLBACK_RECIPE_CYCLE[position % FALLBACK_RECIPE_CYCLE.length] ?? "symbol-reveal";
}

// ---------------------------------------------------------------------------
// The registry self-check — fail-closed at load (the compounds pattern)
// ---------------------------------------------------------------------------

/** Structural defects the self-check rejects: unknown ids, key/id
 *  mismatches, empty cue sets (a recipe no classifier can reach), an
 *  empty fallback cycle. Takes the entries INJECTABLY (the defect tests
 *  feed synthetic rows; production feeds the shipped registry). */
export function assertWhiteboardRecipeRegistry(entries?: readonly WhiteboardRecipeSpec[]): void {
  const list = entries ?? WHITEBOARD_RECIPE_IDS.map((id) => {
    const r = WHITEBOARD_RECIPES[id];
    if (r === undefined) throw new Error(`whiteboard recipes: the registry is missing the declared recipe "${id}"`);
    return r;
  });
  const declared = new Set<string>(WHITEBOARD_RECIPE_IDS);
  for (const spec of list) {
    if (!declared.has(spec.id)) {
      throw new Error(`whiteboard recipes: the recipe "${spec.id}" is outside the closed vocabulary (${WHITEBOARD_RECIPE_IDS.join(", ")})`);
    }
    if (spec.cues.length === 0) {
      throw new Error(`whiteboard recipes: ${spec.id} declares no cues — a recipe the classifier cannot reach is dead weight`);
    }
    if (spec.label.trim() === "" || spec.intent.trim() === "") {
      throw new Error(`whiteboard recipes: ${spec.id} must carry its label and intent`);
    }
  }
  if (FALLBACK_RECIPE_CYCLE.length === 0) {
    throw new Error("whiteboard recipes: the fallback cycle is empty — a cue-less board would be silent");
  }
  for (const id of FALLBACK_RECIPE_CYCLE) {
    if (!declared.has(id)) {
      throw new Error(`whiteboard recipes: the fallback cycle names the unregistered recipe "${id}"`);
    }
  }
}

// The self-check runs at load: a registry defect refuses the MODULE.
assertWhiteboardRecipeRegistry();

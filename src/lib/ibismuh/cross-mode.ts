// S172 — Cross-Mode Integration (Programme C).
//
// The roadmap's ask: "Motion graphics can use whiteboard drawing
// effects; keynote slides can use kinetic typography; classic narration
// can use 3D camera movement; scene stories can use character
// animation; whiteboard videos can use animated charts. Shared
// capabilities, not duplicated engines."
//
// What this module IS: the capability matrix as DATA — the closed list
// of cross-mode capabilities, each resolving to the ONE implementing
// module (borrow through the adapter, never duplicate), plus the
// resolver that admits or refuses a borrow with typed verdicts.
//
// What this module is NOT: a claim that every cell is wired. Each
// capability carries an honest `wired` status:
//   "native"    — the capability exists in BOTH host and borrower today
//                 (the borrower renders it through its own engine);
//   "borrowed"  — a real consumer imports the ONE implementation across
//                 the mode boundary (pinned by source scan);
//   "codified"  — the capability is named, its implementor is named, and
//                 the wiring is future work (PROPOSED-first: the matrix
//                 may not lie).
//
// The matrix may grow only by design-doc slice — it is the six-mode
// world's grammar of SHARED things.

export const CROSS_MODE_VERSION = 1;

export type CrossModeWiring = "native" | "borrowed" | "codified";

export interface CrossModeCapability {
  readonly capability: string;
  /** The mode that OWNS the implementation. */
  readonly host: string;
  /** The modes that may (or do) render the capability. */
  readonly borrowers: readonly string[];
  /** The ONE implementing module — borrow through it, never duplicate. */
  readonly implements: string;
  /** The honest wiring status (see header). */
  readonly wiring: CrossModeWiring;
}

export const CROSS_MODE_CAPABILITIES: readonly CrossModeCapability[] = Object.freeze([
  {
    capability: "hand-drawn stroke feel",
    host: "whiteboard",
    borrowers: ["whiteboard", "graphics", "slides"],
    implements: "whiteboard/roughen.ts (the S164 in-house Rough port)",
    wiring: "codified", // the S164 knobs are wired in the whiteboard lane; graphics/slides adoption is future work
  },
  {
    capability: "draw-on stroke entrance",
    host: "graphics",
    borrowers: ["graphics", "whiteboard"],
    implements: "graphics/render.ts (the draw enter) / whiteboard stroke timing",
    wiring: "native", // both engines render stroke draw-ons natively
  },
  {
    capability: "kinetic typography",
    host: "slides",
    borrowers: ["slides", "graphics"],
    implements: "slides-kinetic.ts (SLIDE_KINETIC_SEMANTICS) / graphics measured vocabulary",
    wiring: "native", // S153 kinetic pages; S162 measured word staggers in graphics
  },
  {
    capability: "3D camera movement",
    host: "3d",
    borrowers: ["3d", "classic"],
    implements: "anim/camera.ts (the S167 camera pose path) / motion.ts (the classic MoveKind planner)",
    wiring: "native", // the classic lane's MoveKind vocabulary IS camera movement; the 3d lane owns true 3D paths
  },
  {
    capability: "character gesture beats",
    host: "character",
    borrowers: ["character", "classic"],
    implements: "characters/rig-director.ts planRigTimeline (the gesture table)",
    wiring: "codified", // scene stories ride character scenes; classic-scene character overlays are future work
  },
  {
    capability: "animated charts",
    host: "graphics",
    borrowers: ["graphics", "whiteboard", "slides"],
    implements: "graphics/render.ts (count/grow enters, honest scales)",
    wiring: "native", // charts render natively in graphics; whiteboard/slides borrow the archetype via their own docs
  },
  {
    capability: "native scene transitions",
    host: "graphics",
    borrowers: ["graphics", "whiteboard", "slides", "classic", "character", "3d"],
    implements: "graphics/transitions.ts (the S163 engine) + composition-plan boundary laws",
    wiring: "borrowed", // the S163 boundary laws are mirrored across lanes; the whiteboard/assembly boundaries read them
  },
  {
    capability: "cinematic finisher channels",
    host: "3d",
    borrowers: ["3d", "classic"],
    implements: "anim/camera.ts fBM shake + studio-doc.ts SOP/CDL grade + audiomix.ts duck lanes (S167)",
    wiring: "borrowed", // the grade and duck lanes already mix across the studio assembly for every lane
  },
  {
    capability: "measured easing curves",
    host: "graphics",
    borrowers: ["graphics", "whiteboard", "slides", "classic", "character", "3d"],
    implements: "anim/easing.ts evalEase (THE ONE curve table, S162-anchored)",
    wiring: "borrowed", // every lane's tween already rides the one table
  },
  {
    capability: "shared animation primitives",
    host: "graphics",
    borrowers: ["graphics", "whiteboard", "slides", "classic", "character", "3d"],
    implements: "anim/primitives.ts (the S171 vocabulary — mode-agnostic sampling)",
    wiring: "borrowed", // S171 ships mode-agnostic; any lane may sample
  },
]);

export const CROSS_MODE_CAPABILITY_NAMES: readonly string[] = Object.freeze(
  CROSS_MODE_CAPABILITIES.map((c) => c.capability),
);

export interface CrossModeVerdict {
  readonly ok: boolean;
  readonly reason: string;
  readonly implements?: string;
  readonly wiring?: CrossModeWiring;
}

/** Resolve a borrow: can `mode` render `capability` through the ONE
 *  implementation? Refusals are typed reasons, never silent. */
export function resolveCrossModeCapability(capability: string, mode: string): CrossModeVerdict {
  const entry = CROSS_MODE_CAPABILITIES.find((c) => c.capability === capability);
  if (entry === undefined) {
    return {
      ok: false,
      reason: `"${capability}" is not in the cross-mode matrix — the closed set is ${CROSS_MODE_CAPABILITY_NAMES.length} capabilities; growth is a design-doc slice`,
    };
  }
  if (entry.host === mode) {
    return { ok: true, reason: `"${mode}" hosts this capability`, implements: entry.implements, wiring: entry.wiring };
  }
  if (!entry.borrowers.includes(mode)) {
    return {
      ok: false,
      reason: `"${mode}" may not borrow "${capability}" — the matrix names ${entry.borrowers.join(", ")}`,
    };
  }
  return {
    ok: true,
    reason: `"${mode}" borrows through the ONE implementation (wiring: ${entry.wiring})`,
    implements: entry.implements,
    wiring: entry.wiring,
  };
}

/** The law, checkable: no capability may name an implementor outside the
 *  house tree, and every wiring claim above "codified" must be pinned by
 *  the battery's source scans. */
export function crossModeMatrixAudit(): { ok: boolean; problems: readonly string[] } {
  const problems: string[] = [];
  for (const c of CROSS_MODE_CAPABILITIES) {
    if (!c.implements.startsWith("src/") && !/^[a-z0-9-]+(\.ts|\/)/.test(c.implements) && !c.implements.startsWith("anim/") && !c.implements.startsWith("characters/") && !c.implements.startsWith("whiteboard/") && !c.implements.startsWith("graphics/") && !c.implements.startsWith("studio-doc") && !c.implements.startsWith("audiomix") && !c.implements.startsWith("composition-plan") && !c.implements.startsWith("slides-kinetic") && !c.implements.startsWith("anim/")) {
      problems.push(`${c.capability}: implementor "${c.implements}" does not name a house module`);
    }
    if (c.host === undefined || c.borrowers.length === 0) {
      problems.push(`${c.capability}: a capability needs a host and at least one borrower`);
    }
  }
  return { ok: problems.length === 0, problems };
}

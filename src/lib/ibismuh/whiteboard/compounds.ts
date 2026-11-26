// compounds.ts — the COMPOUND ASSET GRAPH registry (the re-audit's Phase B
// third slice). A compound is a NAMED COMPOSITION of registered library
// primitives: "smart-farm-system" = barn + tractor + corn + sprout + sun,
// each part at a declared offset. The audit's point: composition multiplies
// the library — a handful of primitives yields dozens of teachable boards
// without drawing new art.
//
// THE ONE-SYNTAX LAW: a compound never reaches the doc. The engine's
// WhiteboardProject syntax carries primitive placements only (one geometry,
// one validator law); a compound pick EXPANDS at the planner seam into its
// parts — each part a first-class placement under placement identity, with
// a derived, human-readable placementId (`smart-farm-system-barn`). Every
// downstream law (per-instance scheduling, per-instance beats, the
// ambiguity law, the carry plan) applies to the parts for free, because
// they ARE placements. A doc that somehow names a compound id is already
// refused by the validator's library-membership law (fail-closed by
// construction).
//
// Pure module: no fs, no clock, no network, no randomness. The registry
// self-check (assertCompoundRegistry) is exported, never run at import —
// the catalog build, the planners' consumers, and the battery call it.
// CLIENT-SAFE: no value import of the asset library (the palette's browser
// imports THIS module for placement; the library rides the engine bundle
// separately) — the self-check takes the registered ids as a parameter.
import { validWhiteboardId } from "./storyboard";

/** One part of a composition: a registered primitive at a declared offset
 *  (scene-space units at the compound's scale 1 — the offsets grow with the
 *  placement's scale, so a compound's footprint follows its size). */
export interface WhiteboardCompoundPart {
  /** A registered whiteboard library asset id. */
  assetId: string;
  /** Offset from the compound's origin, x (scene-space, right positive). */
  dx: number;
  /** Offset from the compound's origin, y (scene-space, down positive). */
  dy: number;
  /** The part's own scale factor (multiplied by the compound's scale). */
  scale?: number;
}

/** A named composition of library primitives. */
export interface WhiteboardCompoundSpec {
  /** The compound's pick id (validWhiteboardId charset — it rides catalog
   *  rows, planner catalogs, and the derived part placementIds). */
  id: string;
  /** The parts, in DRAW ORDER (the expansion's order sequence). */
  parts: WhiteboardCompoundPart[];
  /** Match vocabulary (catalog concepts + the planner's tags). */
  tags: string[];
  /** Alternative match names (search + catalog aliases). */
  aliases: string[];
  /** Accessibility description (the catalog row's a11y). */
  a11y: string;
  /** The declared footprint at scale 1 (the planner catalog's box for the
   *  model and the palette — declared, not derived: the honest number). */
  footprint: { w: number; h: number };
}

// ---------------------------------------------------------------------------
// The INSTANCE NAMESPACE (the re-audit's P0: repeated compound placement).
//
// The P0 defect: the expansion names every part `<compoundId>-<partAssetId>`,
// so placing the SAME compound twice in one scene derived COLLIDING part
// identities — the second copy was unreachable (ambiguous keys, colliding
// DOM ids, events that could not address it). The fix is the instance
// namespace, ONE naming law:
//
//   instance id    = <compoundId>            (the FIRST instance — legacy
//                                             byte-identical) or
//                  = <compoundId>-2, -3, …  (repeats — the derive law,
//                                             deriveCompoundInstanceId)
//   part placement = <instanceId>-<partAssetId>
//   group identity = the instance id itself (every part carries
//                                             `groupId: instanceId` — the
//                                             durable member list IS the
//                                             placements; no registry to
//                                             drift)
//
// The charset law keeps this safe: compound ids forbid `--`/`::`, and the
// registry self-check now REFUSES a compound id that equals another
// compound id + `-<digits>` (the collision law — instance 2 of "a" must
// never parse as the compound "a-2").
// ---------------------------------------------------------------------------

/** Resolve which compound a group id rides, against an INJECTED index —
 *  the one strip-ordinal algorithm (the validator judges the LIBRARY's
 *  registry; the editor/planner judge the shipped one). Exact id first,
 *  else strip trailing `-<digits>` ordinals one at a time. Deterministic;
 *  unknown → null (the caller refuses — the group law is fail-closed). */
export function resolveInCompoundIndex(
  groupId: string,
  index: ReadonlyMap<string, { id: string; parts: readonly { assetId: string }[] }>
): { id: string; parts: readonly { assetId: string }[] } | null {
  let candidate: string = groupId;
  for (;;) {
    const spec = index.get(candidate);
    if (spec !== undefined) return spec;
    const stripped = candidate.replace(/-\d+$/, "");
    if (stripped === candidate || stripped === "") return null;
    candidate = stripped;
  }
}

/** Resolve which compound a group id rides: the exact id first, else strip
 *  trailing `-<digits>` ordinals one at a time. Deterministic; unknown →
 *  null (the caller refuses — the group law is fail-closed). */
export function resolveCompoundGroupId(
  groupId: string
): { id: string; parts: readonly { assetId: string }[] } | null {
  return resolveInCompoundIndex(groupId, WB_COMPOUND_INDEX);
}

// ---------------------------------------------------------------------------
// The registry — the seed compositions (parts are registered ASSETS ids)
// ---------------------------------------------------------------------------

export const WB_COMPOUNDS: readonly WhiteboardCompoundSpec[] = [
  {
    id: "smart-farm-system",
    parts: [
      { assetId: "barn", dx: -200, dy: -160 },
      { assetId: "sun-nature", dx: 240, dy: -300, scale: 0.8 },
      { assetId: "tractor-wb", dx: -340, dy: 160, scale: 0.9 },
      { assetId: "corn-cob", dx: 60, dy: 60, scale: 0.9 },
      { assetId: "sprout", dx: 340, dy: 160, scale: 0.8 },
    ],
    tags: ["composition", "farm", "agriculture", "system"],
    aliases: ["smart farm", "farm system", "whole farm"],
    a11y: "A whole smart-farm composition: the barn, the sun, the tractor, the corn and the sprout drawn together as one working system.",
    footprint: { w: 900, h: 520 },
  },
  {
    id: "money-growth-cycle",
    parts: [
      { assetId: "coin", dx: -220, dy: 40 },
      { assetId: "arrow-growth", dx: 20, dy: -120 },
      { assetId: "bar-chart", dx: 240, dy: 60, scale: 0.9 },
      { assetId: "piggy-bank-wb", dx: 20, dy: 200, scale: 0.9 },
    ],
    tags: ["composition", "money", "finance", "growth"],
    aliases: ["money cycle", "money flow", "growth cycle"],
    a11y: "The money-growth composition: the coin, the growth arrow, the chart and the piggy bank as one savings story.",
    footprint: { w: 640, h: 420 },
  },
  {
    id: "online-classroom",
    parts: [
      { assetId: "blackboard-wb", dx: -40, dy: -170, scale: 0.9 },
      { assetId: "computer-screen", dx: 0, dy: 120 },
      { assetId: "lightbulb", dx: -320, dy: 60, scale: 0.8 },
      { assetId: "wifi-waves", dx: 320, dy: -60, scale: 0.8 },
    ],
    tags: ["composition", "education", "online", "learning"],
    aliases: ["online class", "virtual classroom", "e-learning"],
    a11y: "The online-classroom composition: the blackboard, the computer, the idea and the signal as one connected lesson.",
    footprint: { w: 800, h: 420 },
  },
  {
    id: "water-harvest-cycle",
    parts: [
      { assetId: "sun-nature", dx: 0, dy: -240, scale: 0.8 },
      { assetId: "droplet", dx: -140, dy: 40, scale: 0.8 },
      { assetId: "water-can", dx: 160, dy: 120, scale: 0.9 },
      { assetId: "sprout", dx: 20, dy: 240, scale: 0.9 },
    ],
    tags: ["composition", "water", "nature", "cycle"],
    aliases: ["water cycle", "rain harvest"],
    a11y: "The water-cycle composition: the sun, the droplet, the watering can and the sprout as one growth loop.",
    footprint: { w: 560, h: 560 },
  },
];

/** The compound id → spec index (the consumers' one lookup). */
export const WB_COMPOUND_INDEX: ReadonlyMap<string, WhiteboardCompoundSpec> = new Map(
  WB_COMPOUNDS.map((spec) => [spec.id, spec])
);

// ---------------------------------------------------------------------------
// The registry self-check (fail-closed; called by the catalog build, the
// planners' wiring, and the battery — never at import)
// ---------------------------------------------------------------------------

/** Every defect the registry can carry, refused with its name: duplicate
 *  compound ids, an id or a derived part id violating the charset law,
 *  empty/duplicate parts, non-finite offsets, a non-positive scale, and the
 *  dead-end law (every part names a REGISTERED library row). The registered
 *  ids are a REQUIRED parameter — this module stays client-safe (no value
 *  import of the asset library); the catalog build passes ASSETS' ids. */
export function assertCompoundRegistry(
  specs: readonly WhiteboardCompoundSpec[] = WB_COMPOUNDS,
  assetIds: ReadonlySet<string>
): void {
  const seen = new Set<string>();
  for (const spec of specs) {
    if (!validWhiteboardId(spec.id)) {
      throw new Error(`compound registry: id "${spec.id}" violates the id charset (namespace separators --/:: are forbidden)`);
    }
    if (seen.has(spec.id)) throw new Error(`compound registry: duplicate compound id "${spec.id}"`);
    // The INSTANCE-NAMESPACE collision law: an id that equals another
    // compound id + `-<digits>` makes instance 2 of the first compound
    // indistinguishable from the first instance of the second — the
    // group resolver could never tell them apart. Refused by name.
    for (const prior of seen) {
      const rest = spec.id.startsWith(`${prior}-`) ? spec.id.slice(prior.length + 1) : null;
      if (rest !== null && /^\d+$/.test(rest)) {
        throw new Error(`compound registry: id "${spec.id}" collides with the instance namespace of "${prior}" (an id must not be another id + "-<digits>")`);
      }
    }
    seen.add(spec.id);
    if (spec.parts.length === 0) {
      throw new Error(`compound registry: "${spec.id}" composes nothing (at least one part)`);
    }
    const partSeen = new Set<string>();
    for (const part of spec.parts) {
      if (!part.assetId || !assetIds.has(part.assetId)) {
        throw new Error(`compound registry: "${spec.id}" part "${part.assetId}" is not a registered library asset (the dead-end law)`);
      }
      if (partSeen.has(part.assetId)) {
        throw new Error(`compound registry: "${spec.id}" places "${part.assetId}" twice — a composition lists each part once`);
      }
      partSeen.add(part.assetId);
      if (!Number.isFinite(part.dx) || !Number.isFinite(part.dy)) {
        throw new Error(`compound registry: "${spec.id}" part "${part.assetId}" carries a non-finite offset`);
      }
      if (part.scale !== undefined && (!Number.isFinite(part.scale) || part.scale <= 0)) {
        throw new Error(`compound registry: "${spec.id}" part "${part.assetId}" carries a non-positive scale`);
      }
      const derived = `${spec.id}-${part.assetId}`;
      if (!validWhiteboardId(derived)) {
        throw new Error(`compound registry: the derived placement id "${derived}" violates the id charset`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Expansion — the planner seam's one constructor
// ---------------------------------------------------------------------------

/** A scene-space placement (the planner's Placement shape, restated here to
 *  keep this module leaf-pure). */
export interface CompoundOrigin {
  x: number;
  y: number;
  scale: number;
  rotateDeg: number;
}

/** The expansion output: plain engine placements (the doc's own syntax).
 *  `groupId` rides ONLY instance expansions (the durable group member
 *  mark); the legacy absent-instance shape omits it (byte-identical). */
export interface ExpandedPart {
  assetId: string;
  placementId: string;
  placement: { x: number; y: number; scale: number; rotateDeg: number };
  order: number;
  /** The compound INSTANCE this part belongs to (present only when the
   *  expansion named an instance — the group law's member mark). */
  groupId?: string;
}

/**
 * Expand a compound into its parts at `origin` — THE planner-seam
 * constructor. Each part lands at origin + offset × scale (the footprint
 * follows the compound's size), carries the compound's scale × its own
 * factor, and is NAMED: `${instanceId}-${part.assetId}` — the placement
 * identity the editor, the scheduler, and the ambiguity law all speak.
 *
 * THE INSTANCE NAMESPACE (the P0 fix): pass `instanceId` (the derive law's
 * output) and the parts are named off THAT instance, each carrying
 * `groupId: instanceId` — two instances of one compound derive distinct
 * part identities and two honest groups. ABSENT instanceId = the legacy
 * shape: parts named off the compound id itself, NO groupId — byte-
 * identical to every stored expansion (the additive-parse law).
 *
 * Deterministic and pure: same spec, same origin, same order base, same
 * instance → the same placements.
 */
export function expandCompound(
  spec: { id: string; parts: readonly { assetId: string; dx?: number; dy?: number; scale?: number }[] },
  origin: CompoundOrigin,
  baseOrder: number,
  instanceId?: string
): ExpandedPart[] {
  const stem = typeof instanceId === "string" && instanceId ? instanceId : spec.id;
  const instanced = typeof instanceId === "string" && instanceId !== "";
  return spec.parts.map((part, i) => ({
    assetId: part.assetId,
    placementId: `${stem}-${part.assetId}`,
    placement: {
      x: Math.round(origin.x + (part.dx ?? 0) * origin.scale),
      y: Math.round(origin.y + (part.dy ?? 0) * origin.scale),
      scale: Math.round(origin.scale * (part.scale ?? 1) * 100) / 100,
      rotateDeg: origin.rotateDeg,
    },
    order: baseOrder + i,
    ...(instanced ? { groupId: stem } : {}),
  }));
}

// ---------------------------------------------------------------------------
// The derive law — repeated placement's one id mint
// ---------------------------------------------------------------------------

/**
 * Derive the next free INSTANCE id for a fresh placement of `spec` in
 * `scene` — the compound twin of derivePlacementId. The FIRST instance
 * keeps the legacy-compatible id (the bare compoundId — its parts derive
 * exactly the pre-instance names); repeats mint `<compoundId>-2`, `-3`, …
 * first free. A candidate is free only when the id AND every derived part
 * key (`<candidate>-<partAssetId>`) miss every placement key and group id
 * already in the scene — a collision would silently fuse two compounds.
 * PURE + deterministic (the studio's add-compound law). Charset-safe: the
 * registry's ids pass validWhiteboardId and the numeric suffix cannot
 * introduce `--`/`::`.
 */
export function deriveCompoundInstanceId(
  scene: { placements: readonly { placementId?: string; assetId: string; groupId?: string }[] },
  spec: { id: string; parts: readonly { assetId: string }[] }
): string {
  const used = new Set<string>();
  for (const pl of scene.placements) {
    used.add(pl.placementId ?? pl.assetId);
    if (pl.groupId !== undefined) used.add(pl.groupId);
  }
  const collides = (candidate: string): boolean =>
    used.has(candidate) || spec.parts.some((p) => used.has(`${candidate}-${p.assetId}`));
  if (!collides(spec.id)) return spec.id;
  for (let n = 2; ; n++) {
    const cand = `${spec.id}-${n}`;
    if (!collides(cand)) return cand;
  }
}

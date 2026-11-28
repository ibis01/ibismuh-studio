// S64 — the Whiteboard Engine: the storyboard schema.
//
// The engine's data model, adapted to house conventions (the plan's §5:
// "adapted to Ibismuh Studio's existing type conventions rather than introduced
// as conflicting parallel definitions"). Hand-rolled validation with the
// parsePlan discipline: null on invalid, never throw on untrusted JSON.
//
// The scene is EDITABLE and REPRODUCIBLE by design: every visual change is
// an event with an identity, a start and a duration — the timeline editor
// (later phase) edits exactly these.
import type { Placement } from "./svg";
import { cameraPolicies } from "./camera-director";
import { WHITEBOARD_PROFILE_IDS, type WhiteboardProfileId } from "./profiles";
import { resolveInCompoundIndex } from "./compounds";
import { COMPOUND_CHOREOGRAPHY_IDS, normalizeChoreographyGroupReceipt } from "./choreography";

export type HandStyle = "marker" | "pencil" | "chalk";
/** W7 — which hand holds the tool (additive; absent = right, today). */
export type HandSide = "left" | "right";

/** Where an asset lives in the scene. */
export interface WhiteboardAssetPlacement {
  /** The asset-library id. */
  assetId: string;
  /** Phase B — the PLACEMENT-INSTANCE identity. Two placements of the SAME
   *  asset in one scene are distinct instances only when they carry distinct
   *  placementIds; every frame key, DOM id, and animation address is derived
   *  from this identity (placementKey). ABSENT = the legacy shape: the
   *  instance identity IS the assetId — byte-identical keys, wire format,
   *  and rendered output for every stored doc (the additive-parse law).
   *  Charset = validWhiteboardId (it becomes part of DOM ids and frame keys
   *  through the same `${key}--${pathId}` / `${key}::${pathId}` seams). */
  placementId?: string;
  /** The compound INSTANCE this placement belongs to (the re-audit's P0:
   *  the group member mark). Present ONLY on compound-expanded parts — the
   *  group id names the instance (the compound id, or the compound id +
   *  `-<digits>` for repeats); the durable member list IS the placements
   *  carrying the mark, so there is no registry to drift. The validator
   *  judges a group against the compound registry: the members must be
   *  EXACTLY the spec's parts in the spec's draw order (fail-closed).
   *  ABSENT = a plain placement (byte-identical legacy shape). */
  groupId?: string;
  placement: Placement;
  /** Draw order across placements (lower first). Defaults to array order. */
  order?: number;
}

/** THE one placement-identity derivation (Phase B): the explicit
 *  placementId when authored, else the assetId (the legacy shape — and the
 *  validator guarantees the derived set is unique per scene, so the key is
 *  always a per-scene instance address). Every consumer — the scheduler's
 *  claimed keys, the frame maps, the page applier's DOM ids, the editor's
 *  drag addressing, the carry plan — reads identity THROUGH this function;
 *  a second derivation would be a second implementation to drift. */
export function placementKey(pl: { placementId?: string; assetId: string }): string {
  return pl.placementId ?? pl.assetId;
}

/** The placement-identity an animation event addresses: its explicit
 *  placementId when authored, else the assetId (the legacy address — every
 *  stored doc's events keep byte-identical meaning). An event without an
 *  explicit placementId in a scene that places its asset more than once is
 *  AMBIGUOUS — the validator refuses it (fail-closed, never silently
 *  first-instance). */
export function eventPlacementKey(e: { placementId?: string; assetId: string }): string {
  return e.placementId ?? e.assetId;
}

/** Derive the next free placementId for a fresh placement of `assetId`:
 *  the bare assetId when no placement uses it yet (the legacy-compatible
 *  single placement — JSON stays byte-identical), else `${assetId}-2`,
 *  `-3`, … first free. Charset-safe: asset ids pass validWhiteboardId, and
 *  the numeric suffix cannot introduce `--` or `::`. PURE + deterministic
 *  (the studio's add-placement law). */
export function derivePlacementId(
  scene: { placements: { placementId?: string; assetId: string }[] },
  assetId: string
): string | undefined {
  const used = new Set(scene.placements.map(placementKey));
  if (!used.has(assetId)) return undefined; // legacy-compatible single placement
  for (let n = 2; ; n++) {
    const cand = `${assetId}-${n}`;
    if (!used.has(cand)) return cand;
  }
}

/** One drawing/motion instruction. The engine's atomic unit. Phase B: the
 *  optional `placementId` addresses a SPECIFIC placement instance (required
 *  by the validator whenever the scene places the same asset more than
 *  once — the ambiguity law); absent = the legacy address (the assetId). */
export type AnimationEvent =
  | {
      type: "draw_path";
      assetId: string;
      /** Phase B — the addressed placement instance (absent = the assetId). */
      placementId?: string;
      pathId: string;
      startMs: number;
      durationMs: number;
    }
  | {
      type: "write_text";
      assetId: string;
      /** Phase B — the addressed placement instance (absent = the assetId). */
      placementId?: string;
      /** The <text> element id inside the asset. */
      textId: string;
      startMs: number;
      durationMs: number;
    }
  | {
      type: "reveal_color";
      assetId: string;
      /** Phase B — the addressed placement instance (absent = the assetId). */
      placementId?: string;
      /** Which path gains its fill (omit = the asset's colorable group). */
      pathId?: string;
      startMs: number;
      durationMs: number;
    }
  | {
      type: "move_object";
      assetId: string;
      /** Phase B — the addressed placement instance (absent = the assetId). */
      placementId?: string;
      startMs: number;
      durationMs: number;
      /** The placement to animate TO (from wherever the scene placed it). */
      to: Placement;
    };

/** A camera keyframe: viewport center (scene units) + zoom. */
export interface CameraEvent {
  startMs: number;
  /** Time to reach this state from the previous keyframe (0 = jump). */
  durationMs: number;
  cx: number;
  cy: number;
  scale: number;
}

export interface WhiteboardScene {
  id: string;
  narration: string;
  /** Narration WAV path (scratch-relative) when a real voiceover exists —
   *  the timing engine consumes its measured duration. */
  voFile?: string;
  /** Fallback duration when no VO: the timing engine derives from narration
   *  (2.6 wps, clamped) unless this is set. */
  durationMs?: number;
  background: "#ffffff" | "#f8f5ee";
  placements: WhiteboardAssetPlacement[];
  animations: AnimationEvent[];
  camera: CameraEvent[];
  /** W6 (S120 §3) — the board policy: how this scene relates to the board
   *  the previous scene drew. ABSENT = a clean scene (today's hard wipe,
   *  byte-for-byte — the additive-parse law). */
  board?: BoardPolicy;
  /** The compound choreography receipt (the re-audit's step 3): the named
   *  preset whose compile produced this scene's group draw events. The
   *  validator refuses anything outside the closed preset vocabulary, and
   *  a scene with NO compound group may not carry one (a receipt without
   *  its event set is a lie). ABSENT = the fill law's own schedule. */
  choreography?: string;
  /** The LOCKED compound groups (the group-editing slice): a locked group
   *  refuses member mutations in the editor (drag, delete, duplicate,
   *  recompose) until unlocked. Additive; absent = nothing locked. Every
   *  name must pass the id charset AND name a group THIS scene actually
   *  places (fail-closed — a lock on a ghost group is dead data). */
  groupLocks?: string[];
  /** Master plan Phase 4 — the CANONICAL GROUP TRANSFORM RECORD: the
   *  accumulated similarity (translate + uniform scale + rotate about the
   *  recorded anchor) each compound group carries on top of the registry's
   *  declared layout. Written ONLY by groups.transformCompoundGroup (the
   *  one canonical op); recomposeCompoundGroup re-applies it after the
   *  declared re-expansion, so a recompose can no longer silently destroy
   *  the user's group-level intent. Keys are placed groupIds; scale > 0;
   *  all numbers finite (the validator refuses ghost keys and junk
   *  numbers). Per-member free drags are NOT this record — they remain
   *  placement-level edits that recompose resets (the documented repair
   *  boundary). ABSENT = every group rides the declared layout. */
  groupTransforms?: Record<string, GroupTransformRecord>;
  /** Master plan Phase 4 — the GROUP-KEYED choreography receipts: one
   *  named preset PER compound group (a two-group scene can now carry two
   *  assemblies). Phase 5 — the receipt is RICH (ChoreographyGroupReceipt:
   *  preset, one scene clock, event-set fingerprint, member roster,
   *  monotonic version). The legacy whole-scene `choreography` scalar
   *  stays for back-compat (it mirrors the most recent compile); the
   *  validator accepts BOTH receipt shapes (the Phase 4 bare preset
   *  string upgrades on parse — the backward-compatibility law) and
   *  every map key must name a group THIS scene actually places. ABSENT
   *  = no per-group receipt. */
  choreographyGroups?: Record<string, ChoreographyGroupReceipt>;
}

/** Master plan Phase 5 — the RICH choreography receipt: the record one
 *  compile stamps per compound group (see choreography.ts for the
 *  builders). The scene's assembly carries its own evidence:
 *  presetId — the closed-vocabulary preset that was compiled;
 *  timingSource — "scene-clock", THE one clock (the compile retimes
 *    onto the scene's single timeline; never a second scheduler);
 *  eventFingerprint — the deterministic digest (8 lowercase hex, FNV-1a)
 *    over the SORTED event identities the compile addressed — a change
 *    of membership, stroke, or window moves it;
 *  affectedMembers — the group's member placement keys at receipt time
 *    (sorted; must BE the group's placed members — a receipt naming
 *    strangers is a lie, and the validator refuses one);
 *  version — monotonic per group: the receipt continues itself
 *    (previous + 1) at every re-compile. The producer (the choreography
 *    route) owns the bump; the validator pins the shape.
 *
 *  BACKWARD COMPATIBILITY: Phase 4 docs carry the bare preset STRING in
 *  this map's slot. The reader (normalizeChoreographyGroupReceipt)
 *  accepts both shapes and upgrades the legacy string on parse — version
 *  1, roster and fingerprint derived from the members and events the
 *  receipt rides at parse time. A rich receipt is validated, never
 *  recomputed: it records the compile-time state, not the live timeline
 *  (later event edits do not invalidate it). */
export interface ChoreographyGroupReceipt {
  presetId: string;
  timingSource: "scene-clock";
  eventFingerprint: string;
  affectedMembers: string[];
  version: number;
}

/** One accumulated group transform (see WhiteboardScene.groupTransforms):
 *  the declared layout expanded at its origin (anchorX, anchorY — the
 *  expansion origin the record was born from), then scaled by `scale`,
 *  rotated by `rotateDeg` (degrees, clockwise on the y-down board), and
 *  translated by (dx, dy). */
export interface GroupTransformRecord {
  anchorX: number;
  anchorY: number;
  dx: number;
  dy: number;
  scale: number;
  rotateDeg: number;
}

// ---------------------------------------------------------------------------
// W6 — the board policy: scenes can CARRY the board (keep/fade/erase/
// pan-away) instead of four hard board-wipes per video (the continuity
// row the W1 baseline scored 1/5). The carried ink is DATA resolved from
// the previous scene's placements at the render seam — never page residue
// (per-scene chromium recycling stays untouched; the S75 OOM receipt is
// the reason).
// ---------------------------------------------------------------------------

export type BoardMode = "clean" | "continuous";
export type BoardExit = "keep" | "fade" | "erase" | "pan-away";

export interface BoardPolicy {
  /** "clean" = the hard wipe (default); "continuous" = inherit the
   *  previous scene's ink at frame 0. */
  mode: BoardMode;
  /** Which of the PREVIOUS scene's placements carry forward — named by
   *  placement identity (Phase B: a placementId, or a legacy assetId; a
   *  name matches a placement KEY first, else any placement of that
   *  assetId). Absent/empty = every placement carries. */
  carryPlacements?: string[];
  /** How the carried ink leaves this scene's stage. Default "keep". */
  exit?: BoardExit;
  /** The exit transition's duration (ms). Default
   *  BOARD_EXIT_DEFAULT_MS, bounded by BOARD_TRANSITION_MS_MAX. */
  transitionMs?: number;
}

export const BOARD_EXITS: readonly BoardExit[] = ["keep", "fade", "erase", "pan-away"];
export const BOARD_EXIT_DEFAULT_MS = 600;
export const BOARD_TRANSITION_MS_MAX = 5000;

function isBoardPolicy(v: unknown): v is BoardPolicy {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  if (b.mode !== "clean" && b.mode !== "continuous") return false;
  if (b.exit !== undefined && !BOARD_EXITS.includes(b.exit as BoardExit)) return false;
  if (b.transitionMs !== undefined && (typeof b.transitionMs !== "number" || !(b.transitionMs > 0) || b.transitionMs > BOARD_TRANSITION_MS_MAX)) return false;
  if (b.carryPlacements !== undefined && (!Array.isArray(b.carryPlacements) || b.carryPlacements.some((c) => typeof c !== "string"))) return false;
  return true;
}

export interface WhiteboardProject {
  title: string;
  width: number;
  height: number;
  fps: number;
  hand: { style: HandStyle; scale: number; /** W7 — absent = right. */ side?: HandSide };
  /** W7 — optional whiteboard SFX (pen strokes, page turns). OFF by
   *  default (decision §10.4); audio-only, frames never depend on it. */
  sfxOn?: boolean;
  /** P5 — the production profile the project rides (the recipe STAMP —
   *  the recipe itself is baked into the per-project knobs by
   *  applyWhiteboardProfile; this field records which one). Absent = the
   *  classic house shape (the additive-parse law). */
  profile?: string;
  scenes: WhiteboardScene[];
}

// ---------------------------------------------------------------------------
// Validation — tolerant of field order, strict about integrity.
// ---------------------------------------------------------------------------

export interface ValidationResult {
  project: WhiteboardProject | null;
  errors: string[];
}

// -------------------------------------------------------------------------
// S65 (E1) — the id-charset law + the resource budgets.
//
// The renderer namespaces DOM ids as `${assetId}--${pathId}` and frame-plan
// keys as `assetId::pathId` (render.ts composeScene / the applier's id
// maps). An id carrying either separator — or characters outside this
// charset — corrupts that seam. The law applies at BOTH layers: the
// library loader excludes violating ids from the drawable index, and the
// project validator rejects them here (defense in depth: a hand-edited
// project JSON is untrusted input like any other).
// -------------------------------------------------------------------------

/** Legal whiteboard id: starts alnum/underscore, then alnum/_.- , ≤ 64
 *  chars, and never contains the namespace separators `--` / `::`. */
export const WB_ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;

export function validWhiteboardId(id: string): boolean {
  return WB_ID_RE.test(id) && !id.includes("--") && !id.includes("::");
}

/** E1 resource budgets — the E0 audit §6 risks 2 + 4, pinned as constants
 *  so the validator, the tests, and WHITEBOARD_ENGINE_DESIGN.md §6 cite
 *  ONE source. Per-path command + per-asset totals live in assets.ts
 *  (extraction-time); the frame budget lives in timing.ts (render
 *  pre-flight). */
export const WB_BUDGETS = {
  /** Max scenes per project. */
  scenesPerProject: 24,
  /** Max asset placements per scene. */
  placementsPerScene: 64,
  /** Max animation events per scene. */
  animationsPerScene: 256,
  /** Max camera keyframes per scene. */
  cameraKeysPerScene: 32,
  /** Max EXPLICIT scene duration (narration estimates clamp lower). */
  sceneDurationMsMax: 120_000,
  /** Max Σ explicit scene durations (VO-measured totals are bounded at
   *  render pre-flight by the frame budget instead). */
  projectExplicitDurationMsMax: 900_000,
} as const;

function isPlacement(v: unknown): v is Placement {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.x === "number" && Number.isFinite(p.x) &&
    typeof p.y === "number" && Number.isFinite(p.y) &&
    typeof p.scale === "number" && p.scale > 0 && Number.isFinite(p.scale) &&
    typeof p.rotateDeg === "number" && Number.isFinite(p.rotateDeg)
  );
}

function validEventTimes(e: { startMs?: unknown; durationMs?: unknown }): boolean {
  return (
    typeof e.startMs === "number" && e.startMs >= 0 &&
    typeof e.durationMs === "number" && e.durationMs > 0
  );
}

/** Phase B — the raw-row identity triple: the derived placement KEY, the
 *  assetId, and the raw group mark for one raw placement row (the carry-
 *  integrity reader works on the raw JSON before placements parse). A row
 *  without a usable assetId contributes nothing. */
function rawPlacementIdentity(
  e: Record<string, unknown>
): { key: string; assetId: string; groupId?: string } | null {
  if (typeof e.assetId !== "string" || !e.assetId) return null;
  const key = typeof e.placementId === "string" && e.placementId ? e.placementId : e.assetId;
  const groupId = typeof e.groupId === "string" && e.groupId ? e.groupId : undefined;
  return { key, assetId: e.assetId, ...(groupId ? { groupId } : {}) };
}

/** The previous scene's carry context, read from the RAW rows: placement
 *  identities, the key/assetId name sets, and the compound-group member
 *  map (groupId → member keys, in row order). One reader for the name
 *  checks and the carried-set derivation — never a second parse. */
function carryContext(
  prevRaw: Record<string, unknown> | undefined
): {
  identities: { key: string; assetId: string; groupId?: string }[];
  keys: Set<string>;
  assetIds: Set<string>;
  groups: Map<string, string[]>;
} {
  const identities = (
    Array.isArray(prevRaw?.placements) ? (prevRaw.placements as Record<string, unknown>[]) : []
  )
    .map(rawPlacementIdentity)
    .filter((x): x is { key: string; assetId: string; groupId?: string } => x !== null);
  const groups = new Map<string, string[]>();
  for (const x of identities) {
    if (x.groupId === undefined) continue;
    const members = groups.get(x.groupId) ?? [];
    members.push(x.key);
    groups.set(x.groupId, members);
  }
  return {
    identities,
    keys: new Set(identities.map((x) => x.key)),
    assetIds: new Set(identities.map((x) => x.assetId)),
    groups,
  };
}

/**
 * Validate a parsed project JSON. `assetIds`/`pathIdsByAsset`/`textIdsByAsset`
 * come from the loaded library — events may only reference what exists.
 * `compoundIndex` (the library's compound registry) judges compound GROUPS:
 * when a placement carries a groupId the registry is REQUIRED — the group
 * law resolves the instance and demands the exact spec member set.
 */
export function validateWhiteboardProject(
  raw: unknown,
  library: {
    assetIds: Set<string>;
    pathIdsByAsset: Map<string, Set<string>>;
    textIdsByAsset: Map<string, Set<string>>;
    /** The compound registry (compounds.ts WB_COMPOUNDS through loadLibrary).
     *  REQUIRED once any placement carries a groupId — fail-closed. */
    compoundIndex?: ReadonlyMap<string, { id: string; parts: readonly { assetId: string }[] }>;
  }
): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) return { project: null, errors: ["not an object"] };
  const p = raw as Record<string, unknown>;

  // S68 — the project dimensions parsed ONCE here (same clamp as the tail):
  // the default camera key inserted below must center on the dimensions the
  // project will actually carry, or a 9:16 board starts with its viewport
  // pinned to a 16:9 center (960, 540 — off the right edge of a 1080-wide
  // canvas).
  const projW = typeof p.width === "number" && p.width >= 320 && p.width <= 3840 ? Math.round(p.width) : 1920;
  const projH = typeof p.height === "number" && p.height >= 320 && p.height <= 3840 ? Math.round(p.height) : 1080;

  const scenes: WhiteboardScene[] = [];
  if (!Array.isArray(p.scenes) || p.scenes.length === 0) {
    return { project: null, errors: ["scenes must be a non-empty array"] };
  }
  if (p.scenes.length > WB_BUDGETS.scenesPerProject) {
    return {
      project: null,
      errors: [`scenes: ${p.scenes.length} exceeds the ${WB_BUDGETS.scenesPerProject}-scene project budget`],
    };
  }
  let explicitDurationTotalMs = 0;
  for (let i = 0; i < p.scenes.length; i++) {
    const s = p.scenes[i] as Record<string, unknown>;
    const id = typeof s.id === "string" && s.id ? s.id : `scene-${i + 1}`;
    // S65: an EXPLICIT id must respect the namespace charset (a missing id
    // still gets the safe default). `--`/`::` would corrupt the renderer's
    // id seam; stray characters would break DOM addressing.
    if (typeof s.id === "string" && s.id && !validWhiteboardId(s.id)) {
      errors.push(`scene ${i + 1}: id "${s.id.slice(0, 40)}" violates the id charset (namespace separators --/:: and exotic characters are forbidden)`);
      continue;
    }
    if (typeof s.narration !== "string" || !s.narration.trim()) {
      errors.push(`scene ${i + 1}: narration missing`);
      continue;
    }
    if (
      typeof s.durationMs === "number" &&
      (s.durationMs > WB_BUDGETS.sceneDurationMsMax || s.durationMs <= 0)
    ) {
      errors.push(`scene ${i + 1}: durationMs ${s.durationMs} is outside the (0, ${WB_BUDGETS.sceneDurationMsMax}] budget`);
      continue;
    }
    if (typeof s.durationMs === "number" && s.durationMs > 0) {
      explicitDurationTotalMs += s.durationMs;
    }
    const background = s.background === "#f8f5ee" ? "#f8f5ee" : "#ffffff";
    // W6 — the board policy, parsed BEFORE the placements so the carry
    // integrity checks (below) can gate them. Tolerant-read law: a doc with
    // no `board` field parses as a clean scene — everything else about the
    // scene is unchanged.
    let board: BoardPolicy | undefined;
    if (s.board !== undefined) {
      if (!isBoardPolicy(s.board)) {
        errors.push(
          `scene ${i + 1}: board must be { mode: "clean" | "continuous", carryPlacements?: string[], exit?: ${BOARD_EXITS.join("|")}, transitionMs?: (0, ${BOARD_TRANSITION_MS_MAX}] }`
        );
        continue;
      }
      const b = s.board as BoardPolicy;
      if (b.mode === "clean") {
        if (b.carryPlacements !== undefined || b.exit !== undefined || b.transitionMs !== undefined) {
          errors.push(`scene ${i + 1}: a clean board takes no carry/exit fields — those belong to mode "continuous"`);
          continue;
        }
      } else {
        // continuous: the FIRST scene has no board to inherit.
        if (i === 0) {
          errors.push(`scene ${i + 1}: the first scene has no board to carry (mode "continuous" needs a previous scene)`);
          continue;
        }
        if (b.exit !== undefined && b.transitionMs !== undefined && b.exit === "keep") {
          errors.push(`scene ${i + 1}: a "keep" exit takes no transitionMs (nothing transitions)`);
          continue;
        }
        // The carry's integrity against the PREVIOUS RAW scene: the named
        // placements must exist there, and a carried placement may not be
        // re-placed here (duplicate ink + ambiguous ids at the page seam).
        // Phase B — names are PLACEMENT IDENTITY: a name matches a derived
        // placement KEY of the previous scene first, else any placement of
        // that assetId (the legacy grammar — stored docs keep their meaning).
        // Group names ride too: naming a compound GROUP carries all its
        // members (the atomic carry — one name, one compound).
        const prevCtx = carryContext(p.scenes[i - 1] as Record<string, unknown> | undefined);
        const carryNames = Array.isArray(b.carryPlacements) ? (b.carryPlacements as string[]) : [];
        if (new Set(carryNames).size !== carryNames.length) {
          errors.push(`scene ${i + 1}: carryPlacements names an asset twice`);
          continue;
        }
        let carryOk = true;
        for (const name of carryNames) {
          if (prevCtx.groups.has(name)) continue; // the atomic group carry
          if (!prevCtx.keys.has(name) && !prevCtx.assetIds.has(name)) {
            errors.push(`scene ${i + 1}: carryPlacements names "${name.slice(0, 40)}", which the previous scene does not place`);
            carryOk = false;
          }
        }
        if (!carryOk) continue;
        // The carried set (named subset, or ALL of the previous scene's
        // placements) must not reappear in this scene's own placements —
        // checked after placements parse, below.
        board = { ...b };
      }
    }
    // W6/Phase B — the carried KEYS: the placement identities this scene
    // inherits at frame 0. Named carryPlacements resolve through the
    // previous scene's raw rows (key match first, assetId fallback); an
    // empty list carries every placement.
    const carriedKeys: Set<string> | null =
      board?.mode === "continuous"
        ? (() => {
            const prevCtx = carryContext(p.scenes[i - 1] as Record<string, unknown> | undefined);
            const names = board?.carryPlacements ?? [];
            const wanted =
              names.length > 0
                ? prevCtx.identities
                    .filter(
                      (x) =>
                        names.includes(x.key) ||
                        names.includes(x.assetId) ||
                        (x.groupId !== undefined && names.includes(x.groupId))
                    )
                    .map((x) => x.key)
                : prevCtx.identities.map((x) => x.key);
            // The ATOMIC-CARRY law (the group-editing slice): a compound
            // group cannot split across a board — if some (but not all)
            // members of a group are carried, the doc is refused. Name the
            // GROUP (one name, all members) or carry none of it.
            const carried = new Set(wanted);
            for (const [gid, memberKeys] of prevCtx.groups) {
              const carriedMembers = memberKeys.filter((k) => carried.has(k));
              if (carriedMembers.length > 0 && carriedMembers.length < memberKeys.length) {
                errors.push(
                  `scene ${i + 1}: carryPlacements splits the compound group "${gid}" — carried ink moves as one compound (name the group "${gid}", or carry none of it)`
                );
                return null;
              }
            }
            return carried;
          })()
        : null;
    const placements: WhiteboardAssetPlacement[] = [];
    const seenKeys = new Set<string>();
    const assetPlacementCounts = new Map<string, number>();
    const rawPlacements = Array.isArray(s.placements) ? s.placements : [];
    if (rawPlacements.length > WB_BUDGETS.placementsPerScene) {
      errors.push(`scene ${i + 1}: ${rawPlacements.length} placements exceed the ${WB_BUDGETS.placementsPerScene}/scene budget`);
      continue;
    }
    for (const pl of rawPlacements) {
      const e = pl as Record<string, unknown>;
      if (typeof e.assetId !== "string" || !library.assetIds.has(e.assetId)) {
        errors.push(`scene ${i + 1}: unknown asset "${String(e.assetId)}"`);
        continue;
      }
      // Phase B — the placement-identity law. An explicit placementId must
      // pass the namespace charset (it becomes part of DOM ids and frame
      // keys); the DERIVED key set must be unique per scene. The legacy
      // shape (no placementId anywhere) derives key = assetId and the law
      // reduces to the old one-placement-per-asset rule — same defect, same
      // pinned message; the difference is that distinct placementIds now
      // FORGIVE the repeat (two coins on one board are two instances).
      if (e.placementId !== undefined) {
        if (typeof e.placementId !== "string" || !validWhiteboardId(e.placementId)) {
          errors.push(`scene ${i + 1}: placementId "${String(e.placementId).slice(0, 40)}" violates the id charset (namespace separators --/:: and exotic characters are forbidden)`);
          continue;
        }
      }
      // The group member mark (the re-audit's P0): an explicit groupId must
      // pass the namespace charset — it rides the same DOM-id/frame-key
      // seams through the group's member keys. Membership integrity is
      // judged after the placements parse (the group law, below).
      if (e.groupId !== undefined) {
        if (typeof e.groupId !== "string" || !validWhiteboardId(e.groupId)) {
          errors.push(`scene ${i + 1}: groupId "${String(e.groupId).slice(0, 40)}" violates the id charset (namespace separators --/:: and exotic characters are forbidden)`);
          continue;
        }
      }
      const key = typeof e.placementId === "string" && e.placementId ? e.placementId : e.assetId;
      if (seenKeys.has(key)) {
        if (typeof e.placementId === "string" && e.placementId) {
          errors.push(`scene ${i + 1}: placementId "${e.placementId}" is already used in this scene`);
        } else {
          errors.push(`scene ${i + 1}: asset "${e.assetId}" placed twice (distinct placementIds make them separate instances, or move_object instead)`);
        }
        continue;
      }
      seenKeys.add(key);
      assetPlacementCounts.set(e.assetId, (assetPlacementCounts.get(e.assetId) ?? 0) + 1);
      if (!isPlacement(e.placement)) {
        errors.push(`scene ${i + 1}: asset "${e.assetId}" has an invalid placement`);
        continue;
      }
      placements.push({
        assetId: e.assetId,
        placement: e.placement,
        ...(typeof e.placementId === "string" && e.placementId ? { placementId: e.placementId } : {}),
        ...(typeof e.groupId === "string" && e.groupId ? { groupId: e.groupId } : {}),
        order: typeof e.order === "number" ? e.order : undefined,
      });
    }
    // W6/Phase B — a carried KEY may not be re-placed in the scene that
    // carries it (duplicate ink on the board, and the page's namespaced
    // element ids would collide). Re-placing the same ASSET under a DIFFERENT
    // placementId is fine — that is a fresh instance, the whole Phase B win.
    if (carriedKeys) {
      for (const pl of placements) {
        const key = placementKey(pl);
        if (carriedKeys.has(key)) {
          errors.push(`scene ${i + 1}: asset "${pl.assetId}" (placement "${key}") is carried AND re-placed — carried ink must not be placed again (drop the placement or narrow carryPlacements)`);
        }
      }
    }
    // THE GROUP LAW (the re-audit's P0 closure): every compound GROUP in
    // this scene must resolve to a registered compound and carry EXACTLY
    // that spec's parts in the spec's draw order — the durable member list
    // is the placements themselves, judged fail-closed:
    //   · a group without the registry is unjudgeable (refused);
    //   · a group id that strips to no compound is a ghost (refused);
    //   · members must match the spec's assetId SEQUENCE (a missing,
    //     extra, duplicated, or reordered part is refused);
    //   · two instances of one compound coexist (distinct instance ids,
    //     each judged alone) — the repeated-placement win.
    const sceneGroups = new Map<string, string[]>();
    const sceneMemberKeys = new Map<string, string[]>();
    for (const pl of placements) {
      if (pl.groupId === undefined) continue;
      const members = sceneGroups.get(pl.groupId) ?? [];
      members.push(pl.assetId);
      sceneGroups.set(pl.groupId, members);
      const keys = sceneMemberKeys.get(pl.groupId) ?? [];
      keys.push(pl.placementId ?? pl.assetId);
      sceneMemberKeys.set(pl.groupId, keys);
    }
    let groupsOk = true;
    for (const [gid, memberAssetIds] of sceneGroups) {
      if (library.compoundIndex === undefined) {
        errors.push(`scene ${i + 1}: group "${gid}" carries no compound registry — the library must load WB_COMPOUNDS to judge groups`);
        groupsOk = false;
        continue;
      }
      const spec = resolveInCompoundIndex(gid, library.compoundIndex);
      if (spec === null) {
        errors.push(`scene ${i + 1}: group "${gid}" does not name a registered compound instance (the group law)`);
        groupsOk = false;
        continue;
      }
      const specIds = spec.parts.map((p) => p.assetId);
      if (memberAssetIds.length !== specIds.length || memberAssetIds.some((a, j) => a !== specIds[j])) {
        errors.push(`scene ${i + 1}: group "${gid}" members [${memberAssetIds.join(", ")}] do not match the compound "${spec.id}" parts [${specIds.join(", ")}] in draw order (the group law: a compound carries exactly its spec)`);
        groupsOk = false;
      }
    }
    // The LOCKED groups: every name must pass the charset (a locked ghost
    // is dead data) and name a group THIS scene actually places.
    let groupLocks: string[] | undefined;
    if (s.groupLocks !== undefined) {
      if (!Array.isArray(s.groupLocks) || s.groupLocks.some((g) => typeof g !== "string")) {
        errors.push(`scene ${i + 1}: groupLocks must be a list of group ids`);
        continue;
      }
      let locksOk = true;
      for (const g of s.groupLocks as string[]) {
        if (!validWhiteboardId(g)) {
          errors.push(`scene ${i + 1}: groupLocks name "${g.slice(0, 40)}" violates the id charset`);
          locksOk = false;
        } else if (!sceneGroups.has(g)) {
          errors.push(`scene ${i + 1}: groupLocks name "${g}", which this scene does not place (a lock rides a real group)`);
          locksOk = false;
        }
      }
      if (!locksOk) continue;
      if (s.groupLocks.length > 0) groupLocks = s.groupLocks as string[];
    }
    // The choreography receipt: the closed preset vocabulary, and a scene
    // with no compound group may not claim one (a receipt without its
    // event set is a lie).
    let choreography: string | undefined;
    if (s.choreography !== undefined) {
      if (typeof s.choreography !== "string" || !(COMPOUND_CHOREOGRAPHY_IDS as readonly string[]).includes(s.choreography)) {
        errors.push(`scene ${i + 1}: choreography "${String(s.choreography).slice(0, 40)}" is not one of the compound presets (${COMPOUND_CHOREOGRAPHY_IDS.join(", ")})`);
        continue;
      }
      if (sceneGroups.size === 0) {
        errors.push(`scene ${i + 1}: choreography "${s.choreography}" names a preset but the scene places no compound group (a receipt without its group is a lie)`);
        continue;
      }
      choreography = s.choreography;
    }
    // Phase 5 — the GROUP-KEYED receipts, the RICH shape: one receipt per
    // placed compound group (a receipt without its group is still a lie;
    // a ghost key is dead data). BACKWARD COMPATIBILITY: the Phase 4 bare
    // preset string is the legacy shape — the tolerant reader upgrades it
    // on parse (version 1, roster + fingerprint derived from what the
    // receipt rides HERE); a rich record is validated, never recomputed
    // (it records the compile-time state, not the live timeline).
    let choreographyGroups: Record<string, ChoreographyGroupReceipt> | undefined;
    if (s.choreographyGroups !== undefined) {
      const raw = s.choreographyGroups as Record<string, unknown> | null;
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push(
          `scene ${i + 1}: choreographyGroups must map placed group ids to compound preset ids or receipt records (${COMPOUND_CHOREOGRAPHY_IDS.join(", ")})`
        );
        continue;
      }
      const ghost = Object.keys(raw).find((g) => !sceneGroups.has(g) || !validWhiteboardId(g));
      if (ghost !== undefined) {
        errors.push(`scene ${i + 1}: choreographyGroups key "${ghost.slice(0, 40)}" does not name a compound group this scene places (a receipt rides a real group)`);
        continue;
      }
      const rawRows = Array.isArray(s.animations) ? (s.animations as unknown[]) : [];
      const normalized: Record<string, ChoreographyGroupReceipt> = {};
      let receiptsOk = true;
      for (const [gid, value] of Object.entries(raw)) {
        const receipt = normalizeChoreographyGroupReceipt({
          raw: value,
          memberKeys: sceneMemberKeys.get(gid) ?? [],
          events: rawRows,
        });
        if (receipt === null) {
          errors.push(
            `scene ${i + 1}: choreographyGroups["${gid.slice(0, 40)}"] is not a compound choreography receipt (a bare preset id from ${COMPOUND_CHOREOGRAPHY_IDS.join(", ")}, or a {presetId, timingSource "scene-clock", eventFingerprint, affectedMembers, version} record naming this group's members)`
          );
          receiptsOk = false;
          continue;
        }
        normalized[gid] = receipt;
      }
      if (!receiptsOk) continue;
      choreographyGroups = normalized;
    }
    // Phase 4 — the canonical group transform records: every key names a
    // placed group; every number is finite; scale stays positive (a
    // mirror/zero/negative scale is not a similarity this board speaks).
    let groupTransforms: Record<string, GroupTransformRecord> | undefined;
    if (s.groupTransforms !== undefined) {
      const raw = s.groupTransforms as Record<string, unknown> | null;
      const shapeOk =
        raw !== null &&
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        Object.values(raw).every((v) => {
          const r = v as Record<string, unknown> | null;
          return (
            r !== null &&
            typeof r === "object" &&
            Number.isFinite(r.anchorX) &&
            Number.isFinite(r.anchorY) &&
            Number.isFinite(r.dx) &&
            Number.isFinite(r.dy) &&
            Number.isFinite(r.scale) &&
            Number.isFinite(r.rotateDeg) &&
            (r.scale as number) > 0
          );
        });
      if (!shapeOk) {
        errors.push(`scene ${i + 1}: groupTransforms must map placed group ids to finite {anchorX, anchorY, dx, dy, scale, rotateDeg} records with scale > 0`);
        continue;
      }
      const ghost = Object.keys(raw).find((g) => !sceneGroups.has(g) || !validWhiteboardId(g));
      if (ghost !== undefined) {
        errors.push(`scene ${i + 1}: groupTransforms key "${ghost.slice(0, 40)}" does not name a compound group this scene places (a transform rides a real group)`);
        continue;
      }
      groupTransforms = raw as Record<string, GroupTransformRecord>;
    }
    if (!groupsOk) continue;
    const animations: AnimationEvent[] = [];
    const rawAnimations = Array.isArray(s.animations) ? s.animations : [];
    if (rawAnimations.length > WB_BUDGETS.animationsPerScene) {
      errors.push(`scene ${i + 1}: ${rawAnimations.length} animation events exceed the ${WB_BUDGETS.animationsPerScene}/scene budget`);
      continue;
    }
    for (const a of rawAnimations) {
      const e = a as Record<string, unknown>;
      const type = String(e.type);
      const assetOk = typeof e.assetId === "string" && library.assetIds.has(e.assetId);
      if (!assetOk) {
        errors.push(`scene ${i + 1}: animation references unknown asset "${String(e.assetId)}"`);
        continue;
      }
      if (!validEventTimes(e)) {
        errors.push(`scene ${i + 1}: ${type} needs startMs ≥ 0 and durationMs > 0`);
        continue;
      }
      // Phase B — the addressed instance. An explicit placementId must name
      // a placement in THIS scene; an event without one is AMBIGUOUS when
      // its asset is placed more than once — the validator refuses it
      // (fail-closed, never a silent first-instance pick).
      const explicitPid = typeof e.placementId === "string" && e.placementId ? e.placementId : null;
      if (explicitPid !== null && !seenKeys.has(explicitPid)) {
        errors.push(`scene ${i + 1}: animation references unknown placement "${explicitPid.slice(0, 40)}"`);
        continue;
      }
      const count = assetPlacementCounts.get(String(e.assetId)) ?? 0;
      if (explicitPid === null && count > 1) {
        errors.push(`scene ${i + 1}: animation targets asset "${String(e.assetId)}", which is placed ${count}× — name the placementId`);
        continue;
      }
      // W6 — animations may not target a carried placement: the carried
      // layer owns those elements' transforms and reveal state for the
      // whole scene, so a draw/write/reveal/move would fight the carry
      // plan. (Phase B: keyed — the legacy address reduces to the assetId.)
      if (carriedKeys?.has(explicitPid ?? String(e.assetId))) {
        errors.push(`scene ${i + 1}: animation targets carried asset "${String(explicitPid ?? e.assetId)}" — carried ink is fully drawn at frame 0 and owned by the carry plan`);
        continue;
      }
      const pid = explicitPid === null ? {} : { placementId: explicitPid };
      if (type === "draw_path") {
        const paths = library.pathIdsByAsset.get(String(e.assetId)) ?? new Set<string>();
        if (typeof e.pathId !== "string" || !paths.has(e.pathId)) {
          errors.push(`scene ${i + 1}: draw_path references unknown path "${String(e.pathId)}"`);
          continue;
        }
        animations.push({ type, assetId: String(e.assetId), ...pid, pathId: String(e.pathId), startMs: e.startMs as number, durationMs: e.durationMs as number });
      } else if (type === "write_text") {
        const texts = library.textIdsByAsset.get(String(e.assetId)) ?? new Set<string>();
        if (typeof e.textId !== "string" || !texts.has(e.textId)) {
          errors.push(`scene ${i + 1}: write_text references unknown text "${String(e.textId)}"`);
          continue;
        }
        animations.push({ type, assetId: String(e.assetId), ...pid, textId: String(e.textId), startMs: e.startMs as number, durationMs: e.durationMs as number });
      } else if (type === "reveal_color") {
        if (e.pathId !== undefined) {
          const paths = library.pathIdsByAsset.get(String(e.assetId)) ?? new Set<string>();
          if (typeof e.pathId !== "string" || !paths.has(e.pathId)) {
            errors.push(`scene ${i + 1}: reveal_color references unknown path "${String(e.pathId)}"`);
            continue;
          }
        }
        animations.push({ type, assetId: String(e.assetId), ...pid, pathId: e.pathId as string | undefined, startMs: e.startMs as number, durationMs: e.durationMs as number });
      } else if (type === "move_object") {
        if (!isPlacement(e.to)) {
          errors.push(`scene ${i + 1}: move_object needs a valid target placement`);
          continue;
        }
        animations.push({ type, assetId: String(e.assetId), ...pid, startMs: e.startMs as number, durationMs: e.durationMs as number, to: e.to });
      } else {
        errors.push(`scene ${i + 1}: unknown animation type "${type}"`);
      }
    }
    const camera: CameraEvent[] = [];
    const rawCamera = Array.isArray(s.camera) ? s.camera : [];
    if (rawCamera.length > WB_BUDGETS.cameraKeysPerScene) {
      errors.push(`scene ${i + 1}: ${rawCamera.length} camera keyframes exceed the ${WB_BUDGETS.cameraKeysPerScene}/scene budget`);
      continue;
    }
    for (const c of rawCamera) {
      const e = c as Record<string, unknown>;
      if (
        typeof e.cx !== "number" || !Number.isFinite(e.cx) ||
        typeof e.cy !== "number" || !Number.isFinite(e.cy) ||
        typeof e.scale !== "number" || !(e.scale > 0) ||
        typeof e.startMs !== "number" || e.startMs < 0 ||
        typeof e.durationMs !== "number" || e.durationMs < 0
      ) {
        errors.push(`scene ${i + 1}: malformed camera keyframe`);
        continue;
      }
      camera.push({ cx: e.cx, cy: e.cy, scale: e.scale, startMs: e.startMs, durationMs: e.durationMs });
    }
    // W5: a cameraless scene stays EMPTY — the drift fallback (the
    // no-camera-keys law, timing.ts cameraAt) owns the motion. The old
    // dimension-aware center key insertion is gone: it would silently
    // DEMOTE the drift (an inserted key counts as authored work) and
    // freeze the W1 baseline's calibrated motion. The render-time
    // fallback centers on the project's own dimensions anyway — the
    // same numbers, one source.
    camera.sort((a, b) => a.startMs - b.startMs);
    // W5 — the camera policies: authored keys are CHECKED, never silently
    // clamped (the spec: an invalid CameraEvent[] is a validation error).
    // A cameraless scene has nothing to check; the drift fallback's
    // motion is the scheduler's own calibrated behavior.
    if (camera.length > 0) {
      for (const v of cameraPolicies(camera, animations, projW, projH)) {
        errors.push(`scene ${i + 1}: ${v.reason}`);
      }
    }
    scenes.push({
      id,
      narration: s.narration,
      voFile: typeof s.voFile === "string" ? s.voFile : undefined,
      durationMs: typeof s.durationMs === "number" && s.durationMs > 0 ? s.durationMs : undefined,
      background,
      placements,
      animations,
      camera,
      board,
      ...(choreography !== undefined ? { choreography } : {}),
      ...(choreographyGroups !== undefined ? { choreographyGroups } : {}),
      ...(groupTransforms !== undefined ? { groupTransforms } : {}),
      ...(groupLocks !== undefined ? { groupLocks } : {}),
    });
  }
  if (errors.length > 0 || scenes.length === 0) return { project: null, errors };
  if (explicitDurationTotalMs > WB_BUDGETS.projectExplicitDurationMsMax) {
    errors.push(`Σ explicit scene durations ${Math.round(explicitDurationTotalMs / 1000)}s exceeds the ${WB_BUDGETS.projectExplicitDurationMsMax / 1000}s project budget`);
    return { project: null, errors };
  }

  const handScale = typeof p.hand === "object" && p.hand !== null && typeof (p.hand as Record<string, unknown>).scale === "number"
    ? Math.max(0.2, Math.min(4, (p.hand as Record<string, unknown>).scale as number))
    : 1;
  const handStyle: HandStyle =
    typeof p.hand === "object" && p.hand !== null && (p.hand as Record<string, unknown>).style === "pencil"
      ? "pencil"
      : (p.hand as Record<string, unknown>)?.style === "chalk" ? "chalk" : "marker";
  const handSide: HandSide | undefined =
    typeof p.hand === "object" && p.hand !== null && (p.hand as Record<string, unknown>).side === "left"
      ? "left"
      : undefined;

  // P5 — the profile stamp (parsed BEFORE the tail return so a bad id is
  // a validation error, same law as the camera policies).
  let profileId: string | undefined;
  if (p.profile !== undefined) {
    if (typeof p.profile !== "string" || !WHITEBOARD_PROFILE_IDS.includes(p.profile as WhiteboardProfileId)) {
      errors.push(
        `profile: "${String(p.profile).slice(0, 40)}" is not one of the production profiles (${WHITEBOARD_PROFILE_IDS.join(", ")})`
      );
      return { project: null, errors };
    }
    profileId = p.profile;
  }

  return {
    project: {
      title: typeof p.title === "string" && p.title ? p.title : "Untitled whiteboard",
      width: projW,
      height: projH,
      fps: typeof p.fps === "number" && p.fps >= 12 && p.fps <= 60 ? Math.round(p.fps) : 24,
      hand: { style: handStyle, scale: handScale, ...(handSide ? { side: handSide } : {}) },
      // Strict boolean write: absent/false reads off; anything else is not on.
      ...(p.sfxOn === true ? { sfxOn: true } : {}),
      // P5 — the profile stamp: an id outside the frozen roster is a
      // validation ERROR (saved docs cite these ids; a typo must not
      // silently render as classic). Absent = absent (byte-identical).
      ...(p.profile !== undefined ? { profile: profileId } : {}),
      scenes,
    },
    errors: [],
  };
}

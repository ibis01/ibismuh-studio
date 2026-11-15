// S125 (K1) — the 2D character rig contract: CharacterRigDoc, the parts
// library, the standard slot vocabulary, and the validator (roadmap §6).
//
// THE OBJECTIVE (§6 verbatim): characters that actually move — poses,
// gestures, mouth shapes on narration — deterministically and natively,
// consistent with the S93 honesty law. The rig doc is the grammar of record;
// the pose evaluation (rig-frame.ts), the compose seam (rig-compose.ts), the
// planner (rig-director.ts) and the renderer (rig-render.ts) consume ONLY
// validated docs — the grammar gate runs at admission and frameAt-style
// functions carry no defensive branches (the graphics frame.ts law).
//
// THE GRAMMAR: a puppet rig is a PARTS SCENE GRAPH (art references + FK
// kinematics: parent chains, pivots, rest placements) plus a POSE SHEET
// (named joint states). Part art lives in the character's parts library
// (Character.parts — RigPartArt rows, stage-coordinate SVG fragments); the
// rig's parts reference art by id (referential integrity is a validator
// ERROR, never a substitute).
//
// THE STANDARD SLOTS (§6 verbatim): "standard slot names so pose sheets map:
// mouth set (closed|open|wide|oh|smile — 5 shapes is enough for honest
// narration-sync at explainer quality), brow, arm-l/arm-r 3-way
// (rest/raise/point)". The mouth set is an ART SWAP (five part variants — no
// honest "oh" exists as a rotation of "closed"), so it is validated as a
// part-variant set: a rig with any mouth part carries the complete five
// (partial = ERROR — the speaking beats would visibly break); a mouthless rig
// validates with a warning and renders closed-mouth (the rig will not fake
// speech). The brow and arm states are POSES on single parts (FK rotations
// cover explainer poses — the §6 non-goals); missing standard poses are a
// warning and the planner degrades to rest — quality loss, never breakage.
//
// PURE — no fs, no clock, no randomness (the S64 law generalizes). Same
// inputs, byte-identical results.
import { isEaseName } from "../anim/easing";
import type { Placement } from "../whiteboard/svg";

// ---------------------------------------------------------------------------
// Version + the named walls (design record §7)
// ---------------------------------------------------------------------------

export const RIG_VERSION = 1;

export const RIG_STAGE_MIN = 240;
export const RIG_STAGE_MAX = 2160;

/** The named walls — a puppet needs a dozen-ish parts and a sheet of poses,
 *  not an atlas. Grammar sprawl is K1's named risk; new slots/variants are a
 *  design-doc slice, never a drive-by union member (the G1 grammar law). */
export const RIG_BUDGETS = {
  parts: 24,
  poses: 24,
  jointsPerPose: 16,
  timelineRows: 64,
  svgCharsPerPart: 24_000,
} as const;

/** The joint bands — the never-NaN floor's input side: the validator bounds
 *  every joint so the FK composition cannot produce NaN/Infinity (the pin:
 *  rig part transforms never NaN). rotateDeg is a delta from rest; scale is
 *  a multiplier; x/y are stage-px offsets. */
export const RIG_JOINT_BANDS = {
  rotateDegMax: 360,
  scaleMin: 0.2,
  scaleMax: 3,
  offsetFactorMax: 1.5,
} as const;

// ---------------------------------------------------------------------------
// The slot vocabulary
// ---------------------------------------------------------------------------

/** The mouth set — five shapes, an art swap (part variants), enough for
 *  honest beat-sync at explainer quality (the §6 wording; the scope claim is
 *  BEAT-SYNC, never phoneme lip-sync, in every doc/UI string). */
export const RIG_MOUTH_SLOTS = ["closed", "open", "wide", "oh", "smile"] as const;
export type RigMouthSlot = (typeof RIG_MOUTH_SLOTS)[number];

export function isMouthSlot(v: string): v is RigMouthSlot {
  return (RIG_MOUTH_SLOTS as readonly string[]).includes(v);
}

/** The part slots — the closed slot vocabulary. `prop` is the escape hatch
 *  for held objects (free-form, planner-optional). */
export const RIG_PART_SLOTS = [
  "head",
  "torso",
  "brow",
  "eye",
  "arm-l",
  "arm-r",
  "forearm-l",
  "forearm-r",
  "hand-l",
  "hand-r",
  "leg-l",
  "leg-r",
  "mouth",
  "prop",
] as const;
export type RigPartSlot = (typeof RIG_PART_SLOTS)[number];

export function isPartSlot(v: string): v is RigPartSlot {
  return (RIG_PART_SLOTS as readonly string[]).includes(v);
}

/** The standard pose-sheet names the planner may gesture with (the §6
 *  "arm-l/arm-r 3-way (rest/raise/point)" + the brow pair). Missing entries
 *  are warnings — gestures degrade to rest honestly. */
export const RIG_ARM_STATES = ["rest", "raise", "point"] as const;
export const RIG_BROW_STATES = ["rest", "raise"] as const;

export function standardPoseIds(rig: { parts: RigPart[] }): string[] {
  const ids: string[] = [];
  const has = (slot: RigPartSlot) => rig.parts.some((p) => p.slot === slot);
  if (has("arm-l")) for (const s of RIG_ARM_STATES) ids.push(`arm-l-${s}`);
  if (has("arm-r")) for (const s of RIG_ARM_STATES) ids.push(`arm-r-${s}`);
  if (has("brow")) for (const s of RIG_BROW_STATES) ids.push(`brow-${s}`);
  return ids;
}

// ---------------------------------------------------------------------------
// The contracts
// ---------------------------------------------------------------------------

/** One part-art row in the character's parts library (Character.parts). The
 *  svg fragment is drawn in the rig STAGE's coordinates at REST (identity) —
 *  the placement math composes deltas on top, never re-baselines the art. */
export interface RigPartArt {
  id: string;
  slot: RigPartSlot;
  /** The mouth slot's variant (which of the five shapes this art draws). */
  variant?: RigMouthSlot;
  /** The part's SVG markup in stage coordinates (rest = identity). */
  svg: string;
}

/** One rig part — a node in the FK scene graph. */
export interface RigPart {
  id: string;
  slot: RigPartSlot;
  /** Mouth parts carry WHICH shape they draw (must match the art row). */
  variant?: RigMouthSlot;
  /** The parts-library art id this node draws. */
  svgRef: string;
  /** Draw order (z-ascending). Ties are a warning, resolved stably by id. */
  z: number;
  /** The FK pivot in stage coordinates — finite, inside the stage band. */
  pivot: { x: number; y: number };
  /** The FK parent (part id) — acyclic by validator law. */
  parent?: string;
  /** The rest placement — the whiteboard svg.ts Placement shape (the graphics `at:` law). */
  rest: Placement;
}

/** One joint state — a delta from rest. rotateDeg is required (the FK verb);
 *  the rest are optional refinements. All values validator-bounded. */
export interface RigJointState {
  rotateDeg: number;
  x?: number;
  y?: number;
  scale?: number;
}

/** One pose — a named joint state over the rig's parts. `joints` keys are
 *  part ids (referential integrity = validator ERROR). The standard sheet
 *  (`arm-l-raise` …) uses the slot-state naming above. */
export interface RigPose {
  id: string;
  name: string;
  joints: Record<string, RigJointState>;
}

/** The versioned rig doc — the grammar of record for one character. */
export interface CharacterRigDoc {
  version: number;
  /** The rig STAGE (art space): parts are drawn in these coordinates. */
  width: number;
  height: number;
  /** The editor/preview clock (24 | 30 — the shared timebase pin). The
   *  per-video render hook renders at the VIDEO's fps; the doc fps never
   *  forks the video clock (design record §3). */
  fps: 24 | 30;
  /** Background fill, "#rrggbb" — junk is an ERROR (the graphics law). */
  background: string;
  parts: RigPart[];
  poses: RigPose[];
}

export interface RigValidationResult {
  doc: CharacterRigDoc | null; // null on structural nonsense
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Small pure readers
// ---------------------------------------------------------------------------

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function placement(v: unknown, where: string, errors: string[]): Placement | null {
  const r = asRecord(v);
  if (!r) {
    errors.push(`${where}: rest placement missing`);
    return null;
  }
  const x = num(r.x);
  const y = num(r.y);
  const scale = num(r.scale);
  const rotateDeg = num(r.rotateDeg);
  if (x === null || y === null || scale === null || rotateDeg === null) {
    errors.push(`${where}: rest placement must be finite {x, y, scale, rotateDeg}`);
    return null;
  }
  return { x, y, scale, rotateDeg };
}

function idLike(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const t = s.trim();
  return t.length > 0 && t.length <= 64 && /^[\w:.-]+$/.test(t) ? t : null;
}

// ---------------------------------------------------------------------------
// The parts library validator
// ---------------------------------------------------------------------------

export interface RigPartsValidationResult {
  parts: RigPartArt[] | null; // null on structural nonsense
  errors: string[];
  warnings: string[];
}

/** Validate the character's parts library (Character.parts rows). The svg
 *  fragment is checked for shape + budget here; sanitization runs at compose
 *  time through the shared sanitizeSvg (one sanitizer, two consumers). */
export function validateRigParts(raw: unknown): RigPartsValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(raw)) {
    errors.push("parts must be an array of part rows");
    return { parts: null, errors, warnings };
  }
  if (raw.length > RIG_BUDGETS.parts) {
    errors.push(`parts: ${raw.length} rows exceeds the wall (${RIG_BUDGETS.parts})`);
    return { parts: null, errors, warnings };
  }
  const seen = new Set<string>();
  const out: RigPartArt[] = [];
  for (let i = 0; i < raw.length; i++) {
    const where = `part #${i + 1}`;
    const r = asRecord(raw[i]);
    if (!r) {
      errors.push(`${where}: not an object`);
      continue;
    }
    const id = idLike(r.id);
    if (!id) {
      errors.push(`${where}: id must be a short identifier`);
      continue;
    }
    const w = `part "${id}"`;
    if (seen.has(id)) {
      errors.push(`${w}: duplicate id`);
      continue;
    }
    seen.add(id);
    const slot = str(r.slot);
    if (!slot || !isPartSlot(slot)) {
      errors.push(`${w}: slot must be one of ${RIG_PART_SLOTS.join(", ")}`);
      continue;
    }
    const art: RigPartArt = { id, slot, svg: "" };
    if (slot === "mouth") {
      const variant = str(r.variant);
      if (!variant || !isMouthSlot(variant)) {
        errors.push(`${w}: a mouth part must carry variant ∈ ${RIG_MOUTH_SLOTS.join(", ")}`);
        continue;
      }
      art.variant = variant;
    } else if (r.variant !== undefined) {
      warnings.push(`${w}: variant dropped — only mouth parts carry variants`);
    }
    const svg = str(r.svg);
    if (!svg || svg.trim().length === 0) {
      errors.push(`${w}: svg missing — an empty part renders nothing and lies about it`);
      continue;
    }
    if (svg.length > RIG_BUDGETS.svgCharsPerPart) {
      errors.push(
        `${w}: svg is ${svg.length} chars — over the ${RIG_BUDGETS.svgCharsPerPart} wall (a part is a limb, not a poster)`
      );
      continue;
    }
    art.svg = svg;
    out.push(art);
  }
  if (errors.length > 0) return { parts: null, errors, warnings };
  // Mouth-set completeness across the LIBRARY rows (the doc validator checks
  // the RIG's references against this set).
  const mouths = out.filter((p) => p.slot === "mouth").map((p) => p.variant as RigMouthSlot);
  const dupMouth = mouths.filter((m, i) => mouths.indexOf(m) !== i);
  if (dupMouth.length > 0) {
    errors.push(`parts: duplicate mouth variants — ${[...new Set(dupMouth)].join(", ")}`);
    return { parts: null, errors, warnings };
  }
  return { parts: out, errors, warnings };
}

/** Tolerant entry: null on unreadable. */
export function parseRigParts(json: string | null | undefined): RigPartArt[] | null {
  if (!json) return null;
  try {
    return validateRigParts(JSON.parse(json)).parts;
  } catch {
    return null;
  }
}

/** Strict write: declared fields, declared order — byte-stable round-trip. */
export function writeRigParts(parts: RigPartArt[]): string {
  return JSON.stringify(
    parts.map((p) => {
      const out: Record<string, unknown> = { id: p.id, slot: p.slot };
      if (p.variant !== undefined) out.variant = p.variant;
      out.svg = p.svg;
      return out;
    })
  );
}

// ---------------------------------------------------------------------------
// The rig doc validator
// ---------------------------------------------------------------------------

function parsePose(raw: unknown, partIds: Set<string>, errors: string[], stageMax: number): RigPose | null {
  const r = asRecord(raw);
  if (!r) {
    errors.push("a pose is not an object");
    return null;
  }
  const id = idLike(r.id);
  const name = str(r.name);
  if (!id) {
    errors.push("a pose is missing an id");
    return null;
  }
  const where = `pose "${id}"`;
  if (!name || !name.trim()) {
    errors.push(`${where}: name missing`);
    return null;
  }
  const jointsRaw = asRecord(r.joints);
  if (!jointsRaw) {
    errors.push(`${where}: joints missing`);
    return null;
  }
  const keys = Object.keys(jointsRaw);
  if (keys.length > RIG_BUDGETS.jointsPerPose) {
    errors.push(`${where}: ${keys.length} joints exceeds the wall (${RIG_BUDGETS.jointsPerPose})`);
    return null;
  }
  const joints: Record<string, RigJointState> = {};
  for (const partId of keys) {
    const j = asRecord(jointsRaw[partId]);
    if (!j) {
      errors.push(`${where}: joint "${partId}" is not an object`);
      return null;
    }
    const rotateDeg = num(j.rotateDeg);
    if (rotateDeg === null) {
      errors.push(`${where}: joint "${partId}" rotateDeg must be a finite number`);
      return null;
    }
    if (Math.abs(rotateDeg) > RIG_JOINT_BANDS.rotateDegMax) {
      errors.push(
        `${where}: joint "${partId}" rotateDeg ${rotateDeg} outside the band (±${RIG_JOINT_BANDS.rotateDegMax})`
      );
      return null;
    }
    const state: RigJointState = { rotateDeg };
    const x = num(j.x);
    const y = num(j.y);
    const scale = num(j.scale);
    if (j.x !== undefined && x === null) {
      errors.push(`${where}: joint "${partId}" x must be a finite number`);
      return null;
    }
    if (j.y !== undefined && y === null) {
      errors.push(`${where}: joint "${partId}" y must be a finite number`);
      return null;
    }
    if (j.scale !== undefined && scale === null) {
      errors.push(`${where}: joint "${partId}" scale must be a finite number`);
      return null;
    }
    if (x !== null) {
      if (Math.abs(x as number) > stageMax) {
        errors.push(`${where}: joint "${partId}" x ${x} outside the stage band (±${Math.round(stageMax)}px)`);
        return null;
      }
      state.x = x as number;
    }
    if (y !== null) {
      if (Math.abs(y as number) > stageMax) {
        errors.push(`${where}: joint "${partId}" y ${y} outside the stage band (±${Math.round(stageMax)}px)`);
        return null;
      }
      state.y = y as number;
    }
    if (scale !== null) {
      if ((scale as number) < RIG_JOINT_BANDS.scaleMin || (scale as number) > RIG_JOINT_BANDS.scaleMax) {
        errors.push(
          `${where}: joint "${partId}" scale ${scale} outside the band (${RIG_JOINT_BANDS.scaleMin}..${RIG_JOINT_BANDS.scaleMax})`
        );
        return null;
      }
      state.scale = scale as number;
    }
    joints[partId] = state;
  }
  for (const partId of keys) {
    if (!partIds.has(partId)) {
      errors.push(`${where}: joint "${partId}" references no rig part (referential integrity)`);
      return null;
    }
  }
  return { id, name: name.trim().slice(0, 80), joints };
}

/** Validate a rig doc against its parts library. `parts` is the ALREADY
 *  validated library (validateRigParts) — the caller resolves it first so
 *  the two gates cannot disagree. PURE. */
export function validateRigDoc(raw: unknown, parts: RigPartArt[] | null): RigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const root = asRecord(raw);
  if (!root) {
    errors.push("rig doc must be an object");
    return { doc: null, errors, warnings };
  }
  if (root.version !== RIG_VERSION) {
    errors.push(`rig version must be ${RIG_VERSION} — got ${String(root.version)}`);
    return { doc: null, errors, warnings };
  }
  const width = num(root.width);
  const height = num(root.height);
  if (width === null || height === null) {
    errors.push("rig width/height must be finite numbers");
    return { doc: null, errors, warnings };
  }
  if (
    width < RIG_STAGE_MIN || width > RIG_STAGE_MAX ||
    height < RIG_STAGE_MIN || height > RIG_STAGE_MAX
  ) {
    errors.push(
      `rig stage ${width}x${height} outside the walls (${RIG_STAGE_MIN}..${RIG_STAGE_MAX} each)`
    );
    return { doc: null, errors, warnings };
  }
  if (root.fps !== 24 && root.fps !== 30) {
    errors.push(`rig fps must be 24 or 30 — got ${String(root.fps)} (the shared timebase)`);
    return { doc: null, errors, warnings };
  }
  const background = str(root.background);
  if (!background || !HEX_RE.test(background)) {
    errors.push("rig background must be #rrggbb — junk is refused, never substituted");
    return { doc: null, errors, warnings };
  }
  if (!Array.isArray(root.parts) || root.parts.length === 0) {
    errors.push("rig parts missing — a rig without parts draws nothing");
    return { doc: null, errors, warnings };
  }
  if (root.parts.length > RIG_BUDGETS.parts) {
    errors.push(`rig parts: ${root.parts.length} exceeds the wall (${RIG_BUDGETS.parts})`);
    return { doc: null, errors, warnings };
  }
  const artIds = new Set((parts ?? []).map((p) => p.id));
  if (artIds.size === 0) {
    errors.push("parts library empty — every rig part must reference resolved art");
    return { doc: null, errors, warnings };
  }

  // Parts pass 1 — shapes, ids, art references.
  const seen = new Set<string>();
  const partRaw: {
    id: string;
    slot: RigPartSlot;
    variant?: RigMouthSlot;
    svgRef: string;
    z: number;
    pivot: { x: number; y: number };
    parent?: string;
    rest: Placement;
  }[] = [];
  for (let i = 0; i < root.parts.length; i++) {
    const r = asRecord(root.parts[i]);
    if (!r) {
      errors.push(`rig part #${i + 1}: not an object`);
      continue;
    }
    const id = idLike(r.id);
    if (!id) {
      errors.push(`rig part #${i + 1}: id must be a short identifier`);
      continue;
    }
    const where = `rig part "${id}"`;
    if (seen.has(id)) {
      errors.push(`${where}: duplicate id`);
      continue;
    }
    seen.add(id);
    const slot = str(r.slot);
    if (!slot || !isPartSlot(slot)) {
      errors.push(`${where}: slot must be one of ${RIG_PART_SLOTS.join(", ")}`);
      continue;
    }
    const svgRef = idLike(r.svgRef);
    if (!svgRef) {
      errors.push(`${where}: svgRef must be a short identifier`);
      continue;
    }
    if (!artIds.has(svgRef)) {
      errors.push(`${where}: svgRef "${svgRef}" resolves to no parts-library row (referential integrity)`);
      continue;
    }
    const z = num(r.z);
    if (z === null) {
      errors.push(`${where}: z must be a finite number`);
      continue;
    }
    const pivotRec = asRecord(r.pivot);
    const px = pivotRec ? num(pivotRec.x) : null;
    const py = pivotRec ? num(pivotRec.y) : null;
    if (px === null || py === null) {
      errors.push(`${where}: pivot must be finite {x, y} in stage coordinates (pivot sanity)`);
      continue;
    }
    const offMax = Math.max(width, height) * RIG_JOINT_BANDS.offsetFactorMax;
    if (Math.abs(px) > offMax || Math.abs(py) > offMax) {
      errors.push(`${where}: pivot (${px}, ${py}) outside the stage band (±${Math.round(offMax)}px — pivot sanity)`);
      continue;
    }
    const rest = placement(r.rest, where, errors);
    if (!rest) continue;
    const part: (typeof partRaw)[number] = { id, slot, svgRef, z, pivot: { x: px, y: py }, rest };
    if (slot === "mouth") {
      const variant = str(r.variant);
      if (!variant || !isMouthSlot(variant)) {
        errors.push(`${where}: a mouth part must carry variant ∈ ${RIG_MOUTH_SLOTS.join(", ")}`);
        continue;
      }
      // The rig's variant must match its art row's variant — a mismatch is
      // the exact silent lie a swap-swap rig must never ship.
      const artRow = (parts ?? []).find((a) => a.id === svgRef);
      if (artRow && artRow.slot === "mouth" && artRow.variant !== variant) {
        errors.push(`${where}: variant "${variant}" disagrees with art row "${svgRef}" (${artRow.variant})`);
        continue;
      }
      part.variant = variant;
    } else if (r.variant !== undefined) {
      warnings.push(`${where}: variant dropped — only mouth parts carry variants`);
    }
    const parent = r.parent === undefined || r.parent === null ? undefined : idLike(r.parent);
    if (r.parent !== undefined && r.parent !== null && !parent) {
      errors.push(`${where}: parent must be a part id`);
      continue;
    }
    if (parent) part.parent = parent;
    partRaw.push(part);
  }
  if (errors.length > 0) return { doc: null, errors, warnings };

  const partIds = new Set(partRaw.map((p) => p.id));

  // Parent resolution — referential integrity + acyclicity (the FK chain law).
  for (const p of partRaw) {
    if (!p.parent) continue;
    if (!partIds.has(p.parent)) {
      errors.push(`rig part "${p.id}": parent "${p.parent}" resolves to no rig part (referential integrity)`);
    }
  }
  if (errors.length > 0) return { doc: null, errors, warnings };
  const depthOf = new Map<string, number>();
  const chain = (id: string, seenChain: Set<string>): number | null => {
    if (depthOf.has(id)) return depthOf.get(id) as number;
    if (seenChain.has(id)) return null; // cycle
    const me = partRaw.find((p) => p.id === id);
    if (!me?.parent) {
      depthOf.set(id, 0);
      return 0;
    }
    seenChain.add(id);
    const up = chain(me.parent, seenChain);
    seenChain.delete(id);
    if (up === null) return null;
    depthOf.set(id, up + 1);
    return up + 1;
  };
  let maxDepth = 0;
  for (const p of partRaw) {
    const d = chain(p.id, new Set());
    if (d === null) {
      errors.push(`rig part "${p.id}": parent chain is cyclic — FK requires a forest`);
      break;
    }
    maxDepth = Math.max(maxDepth, d);
  }
  if (errors.length > 0) return { doc: null, errors, warnings };
  if (maxDepth > 6) {
    warnings.push(`rig depth ${maxDepth} — beyond 6 FK links, pose authoring gets confusing (kept, warned)`);
  }

  // Mouth-set completeness over the RIG's mouth parts (the speaking contract).
  const rigMouths = partRaw.filter((p) => p.slot === "mouth").map((p) => p.variant as RigMouthSlot);
  if (rigMouths.length === 0) {
    warnings.push("rig has no mouth parts — the speaking schedule renders closed-mouth (the rig will not fake speech)");
  } else {
    const missing = RIG_MOUTH_SLOTS.filter((s) => !rigMouths.includes(s));
    if (missing.length > 0) {
      errors.push(`rig mouth set incomplete — missing ${missing.join(", ")} (a partial set visibly breaks the speaking beats)`);
      return { doc: null, errors, warnings };
    }
    const dupMouth = rigMouths.filter((m, i) => rigMouths.indexOf(m) !== i);
    if (dupMouth.length > 0) {
      errors.push(`rig mouth set duplicates — ${[...new Set(dupMouth)].join(", ")}`);
      return { doc: null, errors, warnings };
    }
  }

  // Poses.
  if (!Array.isArray(root.poses)) {
    errors.push("rig poses missing (an empty sheet is valid; a missing sheet is junk)");
    return { doc: null, errors, warnings };
  }
  if (root.poses.length > RIG_BUDGETS.poses) {
    errors.push(`rig poses: ${root.poses.length} exceeds the wall (${RIG_BUDGETS.poses})`);
    return { doc: null, errors, warnings };
  }
  const poseSeen = new Set<string>();
  const poses: RigPose[] = [];
  const stageMax = Math.max(width, height) * RIG_JOINT_BANDS.offsetFactorMax;
  for (const rawPose of root.poses) {
    const pose = parsePose(rawPose, partIds, errors, stageMax);
    if (!pose) continue;
    if (poseSeen.has(pose.id)) {
      errors.push(`pose "${pose.id}": duplicate id`);
      continue;
    }
    poseSeen.add(pose.id);
    poses.push(pose);
  }
  if (errors.length > 0) return { doc: null, errors, warnings };

  // The standard sheet — missing entries warn, gestures degrade to rest.
  for (const pid of standardPoseIds({ parts: partRaw })) {
    if (!poseSeen.has(pid)) {
      warnings.push(`standard pose "${pid}" missing — the planner will not gesture with it (degrades to rest)`);
    }
  }
  // z ties resolve stably (id order) but are told to the author.
  const zSeen = new Map<number, number>();
  for (const p of partRaw) zSeen.set(p.z, (zSeen.get(p.z) ?? 0) + 1);
  for (const [z, n] of zSeen) {
    if (n > 1) warnings.push(`z ${z} shared by ${n} parts — draw order falls back to id order (stable, but say it with z)`);
  }

  const doc: CharacterRigDoc = {
    version: RIG_VERSION,
    width,
    height,
    fps: root.fps === 24 ? 24 : 30,
    background,
    parts: partRaw.map((p) => ({
      id: p.id,
      slot: p.slot,
      ...(p.variant !== undefined ? { variant: p.variant } : {}),
      svgRef: p.svgRef,
      z: p.z,
      pivot: { x: p.pivot.x, y: p.pivot.y },
      ...(p.parent ? { parent: p.parent } : {}),
      rest: { x: p.rest.x, y: p.rest.y, scale: p.rest.scale, rotateDeg: p.rest.rotateDeg },
    })),
    poses,
  };
  return { doc, errors, warnings };
}

/** Tolerant entry (the parseScene3D shape): null on unreadable. */
export function parseRigDoc(
  json: string | null | undefined,
  partsJson: string | null | undefined
): CharacterRigDoc | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  let parts: RigPartArt[] | null = null;
  if (partsJson) {
    try {
      parts = validateRigParts(JSON.parse(partsJson)).parts;
    } catch {
      parts = null;
    }
  }
  return validateRigDoc(raw, parts).doc;
}

// ---------------------------------------------------------------------------
// Strict write — exactly the declared fields, version first, key order
// stable. Byte-stable round-trip is the pin:
// writeRigDoc(validateRigDoc(JSON.parse(writeRigDoc(doc)), parts).doc) ≡ string
// ---------------------------------------------------------------------------

function serializeJoint(j: RigJointState): Record<string, unknown> {
  const out: Record<string, unknown> = { rotateDeg: j.rotateDeg };
  if (j.x !== undefined) out.x = j.x;
  if (j.y !== undefined) out.y = j.y;
  if (j.scale !== undefined) out.scale = j.scale;
  return out;
}

function serializePose(p: RigPose): Record<string, unknown> {
  const out: Record<string, unknown> = { id: p.id, name: p.name, joints: {} };
  const jointsRec = out.joints as Record<string, unknown>;
  for (const k of Object.keys(p.joints)) jointsRec[k] = serializeJoint(p.joints[k]);
  return out;
}

/** Strict write: exactly the declared fields, version first, key order
 *  stable — byte-stable round-trip is the pin. */
export function writeRigDoc(doc: CharacterRigDoc): string {
  return JSON.stringify({
    version: doc.version,
    width: doc.width,
    height: doc.height,
    fps: doc.fps,
    background: doc.background,
    parts: [...doc.parts]
      .sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((p) => {
        const out: Record<string, unknown> = { id: p.id, slot: p.slot };
        if (p.variant !== undefined) out.variant = p.variant;
        out.svgRef = p.svgRef;
        out.z = p.z;
        out.pivot = { x: p.pivot.x, y: p.pivot.y };
        if (p.parent !== undefined) out.parent = p.parent;
        out.rest = { x: p.rest.x, y: p.rest.y, scale: p.rest.scale, rotateDeg: p.rest.rotateDeg };
        return out;
      }),
    poses: doc.poses.map(serializePose),
  });
}

// ---------------------------------------------------------------------------
// The scaffold — the deterministic starter doc (the rig/auto planner's
// native half; the LLM pass fills expressive states on top)
// ---------------------------------------------------------------------------

export interface RigPartSeed {
  id: string;
  slot: RigPartSlot;
  variant?: RigMouthSlot;
  svgRef: string;
  z: number;
  pivot: { x: number; y: number };
  parent?: string;
}

/** Build a minimal VALID rig doc from part seeds + art rows: every seeded
 *  part references the art library, the rest placements are identity in
 *  stage space (the art IS the rest), and the pose sheet starts empty (the
 *  standard poses arrive from the parts pass / the author — the validator's
 *  warnings name them). Junk seeds are REFUSED, never substituted (the
 *  honesty law — a scaffold that silently rewrites inputs would lie). */
export function scaffoldRigDoc(input: {
  width?: number;
  height?: number;
  fps?: 24 | 30;
  background?: string;
  parts: RigPartSeed[];
  art: RigPartArt[];
}): RigValidationResult {
  const warnings: string[] = [];
  const width = input.width ?? 1080;
  const height = input.height ?? 1080;
  const fps = input.fps === 24 ? 24 : 30;
  const background = input.background ?? "#1c1424";
  const doc = {
    version: RIG_VERSION,
    width,
    height,
    fps,
    background,
    parts: input.parts.map((p) => ({
      id: p.id,
      slot: p.slot,
      ...(p.variant !== undefined ? { variant: p.variant } : {}),
      svgRef: p.svgRef,
      z: p.z,
      pivot: { x: p.pivot.x, y: p.pivot.y },
      ...(p.parent ? { parent: p.parent } : {}),
      rest: { x: 0, y: 0, scale: 1, rotateDeg: 0 },
    })),
    poses: [] as RigPose[],
  };
  const artCheck = validateRigParts(input.art);
  if (!artCheck.parts) {
    return { doc: null, errors: artCheck.errors, warnings };
  }
  const result = validateRigDoc(doc, artCheck.parts);
  return { doc: result.doc, errors: result.errors, warnings: [...warnings, ...result.warnings] };
}

// ---------------------------------------------------------------------------
// The ease reader shared with the timeline grammar (rig-frame.ts) — the doc
// itself carries no timelines in v1 (the compile-only law, design record §1);
// this reader exists so both grammars share ONE ease check.
// ---------------------------------------------------------------------------

/** Shared ease reader for the timeline grammar — "linear" is the fallback
 *  (motion is honest before it is pretty). */
export function readEase(v: unknown): string {
  return typeof v === "string" && isEaseName(v) ? v : "linear";
}

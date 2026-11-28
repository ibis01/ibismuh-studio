// groups.ts — the COMPOUND GROUP OPERATIONS (the re-audit's step 2: group
// editing "as first-class"). Every operation is a PURE, IMMUTABLE scene
// transform over the group member mark (`groupId` on placements — the
// durable member list IS the placements; there is no registry to drift):
//
//   members      — the group's placements in array (draw) order
//   duplicate    — a fresh instance off the derive law, spliced after the
//                  last member, orders renumbered (the repeated-placement
//                  win, editor-side)
//   delete       — the members AND their events leave together (atomic),
//                  orders renumbered, the lock and the choreography receipt
//                  leave with the group
//   ungroup      — the mark strips, the identities stay (the parts become
//                  independent placements; events keep addressing them)
//   recompose    — the safe repair: the registry's declared layout re-applied
//                  at the members' centroid, same instance id, same array
//                  slots (events keep their addresses) — and, Phase 4, the
//                  group's canonical transform RECORD re-applied on top, so
//                  a recompose no longer silently destroys the user's
//                  group-level scale/rotate/move intent
//   transform    — the CANONICAL group transform (Phase 4): translate +
//                  uniform scale + rotate about the group's current
//                  centroid, composed into the scene's groupTransforms
//                  record; nudge delegates to it
//   lock/unlock  — the scene's groupLocks roster (the editor refuses
//                  member mutations on a locked group)
//
// Laws (pinned by scripts/test-whiteboard-compounds.mts):
//   · PURE — no fs, no clock, no randomness; never mutates its input.
//   · CHARSET — every new identity rides the derive law (deriveCompound-
//     InstanceId); a duplicate never collides with any existing key.
//   · ATOMIC — a group op touches ONLY its members (plus the roster/-
//     receipt fields that name the group); the rest of the scene is
//     byte-identical.
//   · FAIL-CLOSED — an unknown group, an unresolvable compound, or a
//     locked-group mutation returns null (the caller refuses with a
//     notice; nothing is silently half-applied).
// Client-safe: no fs, no clock, no randomness, no node: imports.
import {
  deriveCompoundInstanceId,
  expandCompound,
  resolveCompoundGroupId,
  type CompoundOrigin,
} from "./compounds";
import {
  eventPlacementKey,
  placementKey,
  type GroupTransformRecord,
  type WhiteboardAssetPlacement,
  type WhiteboardScene,
} from "./storyboard";

/** The group's members in array order — the draw order the spec declares. */
export function groupMembers(
  scene: Pick<WhiteboardScene, "placements">,
  groupId: string
): WhiteboardAssetPlacement[] {
  return scene.placements.filter((pl) => pl.groupId === groupId);
}

/** Every compound group this scene places, keyed by instance id, members
 *  in array order. */
export function compoundGroups(
  scene: Pick<WhiteboardScene, "placements">
): Map<string, WhiteboardAssetPlacement[]> {
  const map = new Map<string, WhiteboardAssetPlacement[]>();
  for (const pl of scene.placements) {
    if (pl.groupId === undefined) continue;
    const members = map.get(pl.groupId) ?? [];
    members.push(pl);
    map.set(pl.groupId, members);
  }
  return map;
}

/** Is the group locked in this scene? */
export function isGroupLocked(
  scene: Pick<WhiteboardScene, "groupLocks">,
  groupId: string
): boolean {
  return scene.groupLocks?.includes(groupId) ?? false;
}

/** Lock or unlock a group: the scene's groupLocks roster, immutable.
 *  Locking a group the scene does not place is a no-op (the validator
 *  would refuse the doc — the editor never offers it). */
export function setGroupLock(
  scene: WhiteboardScene,
  groupId: string,
  locked: boolean
): WhiteboardScene {
  const current = scene.groupLocks ?? [];
  const next = locked
    ? current.includes(groupId)
      ? current
      : [...current, groupId]
    : current.filter((g) => g !== groupId);
  return { ...scene, ...(next.length > 0 ? { groupLocks: next } : { groupLocks: undefined }) };
}

/** The members' centroid (scene units) — the duplicate/recompose anchor. */
export function groupCentroid(
  scene: Pick<WhiteboardScene, "placements">,
  groupId: string
): { x: number; y: number } | null {
  const members = groupMembers(scene, groupId);
  if (members.length === 0) return null;
  return {
    x: Math.round(members.reduce((a, m) => a + m.placement.x, 0) / members.length),
    y: Math.round(members.reduce((a, m) => a + m.placement.y, 0) / members.length),
  };
}

function renumber(placements: WhiteboardAssetPlacement[]): WhiteboardAssetPlacement[] {
  return placements.map((pl, i) => ({ ...pl, order: i }));
}

/** The member events leave with their group — an event for an unplaced
 *  part is invisible ink (composeScene only emits placed assets). */
function dropMemberEvents(
  scene: Pick<WhiteboardScene, "animations">,
  memberKeys: Set<string>
): WhiteboardScene["animations"] {
  return scene.animations.filter((e) => !memberKeys.has(eventPlacementKey(e)));
}

/**
 * DUPLICATE a compound group: derive the next free instance id (the derive
 * law), expand the compound's spec at `origin`, splice the parts after the
 * last member, renumber the draw order. Returns the new scene, the new
 * instance id, and the first part's key (the selection hand-back). NULL
 * when the group is unknown, locked, or its compound cannot resolve.
 */
export function duplicateCompoundGroup(
  scene: WhiteboardScene,
  groupId: string,
  origin: CompoundOrigin
): { scene: WhiteboardScene; instanceId: string; firstKey: string } | null {
  if (isGroupLocked(scene, groupId)) return null;
  const spec = resolveCompoundGroupId(groupId);
  if (spec === null) return null;
  const members = groupMembers(scene, groupId);
  if (members.length === 0) return null;
  const instanceId = deriveCompoundInstanceId(scene, spec);
  const parts = expandCompound(spec, origin, 0, instanceId);
  const lastIdx = scene.placements.reduce(
    (acc, pl, i) => (pl.groupId === groupId ? i : acc),
    -1
  );
  const inserted = parts.map((p) => ({
    assetId: p.assetId,
    placementId: p.placementId,
    groupId: p.groupId,
    placement: p.placement,
    order: p.order,
  }));
  const placements = [...scene.placements];
  placements.splice(lastIdx + 1, 0, ...inserted);
  return {
    scene: { ...scene, placements: renumber(placements) },
    instanceId,
    firstKey: parts[0]?.placementId ?? instanceId,
  };
}

/**
 * DELETE a compound group: the members AND their events leave together
 * (an event for an unplaced part is invisible ink), orders renumber, the
 * group's lock and the scene's choreography receipt leave with it (a
 * receipt without its group is a lie — the validator refuses one).
 * Returns null when the group is unknown or locked.
 */
export function deleteCompoundGroup(scene: WhiteboardScene, groupId: string): WhiteboardScene | null {
  if (isGroupLocked(scene, groupId)) return null;
  const members = groupMembers(scene, groupId);
  if (members.length === 0) return null;
  const memberKeys = new Set(members.map(placementKey));
  const placements = renumber(
    scene.placements.filter((pl) => pl.groupId !== groupId)
  );
  // Phase 4: the whole-scene scalar receipt dies with ANY group (it
  // receipts a whole-scene compile), but the GROUP-KEYED map and the
  // transform record lose only THIS group's entries — the other groups
  // keep their assemblies and their canonical transforms.
  const choreographyGroups = dropMapKey(scene.choreographyGroups, groupId);
  const groupTransforms = dropMapKey(scene.groupTransforms, groupId);
  // Explicit field handling — a conditional spread of {} can never DELETE
  // a field carried by the scene spread above.
  const next: WhiteboardScene = {
    ...scene,
    placements,
    animations: dropMemberEvents(scene, memberKeys),
    groupLocks: scene.groupLocks?.filter((g) => g !== groupId),
    choreography: undefined,
  };
  if (choreographyGroups === undefined) delete next.choreographyGroups;
  else next.choreographyGroups = choreographyGroups;
  if (groupTransforms === undefined) delete next.groupTransforms;
  else next.groupTransforms = groupTransforms;
  return next;
}

/** Drop one key from a scene map record; ABSENT when the result is empty
 *  (an empty record is dead data — the field leaves the scene). */
function dropMapKey<K extends string, V>(
  map: Record<string, V> | undefined,
  key: K
): Record<string, V> | undefined {
  if (map === undefined || !(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * UNGROUP: the member mark strips, the placementIds STAY (the parts remain
 * distinct, addressable instances — no identity is lost), the scene's
 * choreography receipt clears with the group. Returns null when the group
 * is unknown.
 */
export function ungroupCompoundGroup(scene: WhiteboardScene, groupId: string): WhiteboardScene | null {
  const members = groupMembers(scene, groupId);
  if (members.length === 0) return null;
  const placements = scene.placements.map((pl) => {
    if (pl.groupId !== groupId) return pl;
    const { groupId: _drop, ...rest } = pl;
    return rest;
  });
  // Phase 4: the group's identity leaves, so its keyed receipts and its
  // transform record leave with it (the other groups keep theirs; the
  // whole-scene scalar still dies with any group).
  const choreographyGroups = dropMapKey(scene.choreographyGroups, groupId);
  const groupTransforms = dropMapKey(scene.groupTransforms, groupId);
  const next: WhiteboardScene = {
    ...scene,
    placements,
    groupLocks: scene.groupLocks?.filter((g) => g !== groupId),
    choreography: undefined,
  };
  if (choreographyGroups === undefined) delete next.choreographyGroups;
  else next.choreographyGroups = choreographyGroups;
  if (groupTransforms === undefined) delete next.groupTransforms;
  else next.groupTransforms = groupTransforms;
  return next;
}

/**
 * RECOMPOSE (the safe repair): re-apply the compound's declared layout —
 * under the SAME instance id, replacing the member rows in place; events
 * keep addressing the same placement keys (the spec sequence preserves
 * them). Phase 4 override law: when the scene carries a canonical
 * transform RECORD for this group, the declared layout is expanded at the
 * RECORD's anchor (not the live centroid) and the record's similarity is
 * re-applied on top — so the group's accumulated scale / rotation /
 * translation SURVIVES the recompose. Without a record the behavior is
 * byte-identical to the original law (declared layout at the live
 * centroid, scale 1, rotation 0). Member-level free drags are not the
 * record's business — they reset, as documented. Returns null when the
 * group is unknown, locked, or its compound cannot resolve.
 */
export function recomposeCompoundGroup(
  scene: WhiteboardScene,
  groupId: string
): WhiteboardScene | null {
  if (isGroupLocked(scene, groupId)) return null;
  const spec = resolveCompoundGroupId(groupId);
  if (spec === null) return null;
  const members = groupMembers(scene, groupId);
  if (members.length === 0) return null;
  const record = scene.groupTransforms?.[groupId];
  // With a record the expansion anchors where the transform was born —
  // re-applying the record then lands the members exactly where the user
  // put them. Without one, the live centroid (the original law).
  const centroid = record
    ? { x: record.anchorX, y: record.anchorY }
    : groupCentroid(scene, groupId);
  if (centroid === null) return null;
  const parts = expandCompound(
    spec,
    { x: centroid.x, y: centroid.y, scale: 1, rotateDeg: 0 },
    0,
    groupId
  );
  let partCursor = 0;
  const placements = scene.placements.map((pl) => {
    if (pl.groupId !== groupId) return pl;
    const part = parts[partCursor++];
    if (part === undefined) return pl;
    if (!record) return { ...pl, placement: part.placement, order: pl.order };
    // The declared part placement, then the record's FULL similarity on
    // top: rotate + scale about the anchor, translate, and the member's
    // own scale/rotation accumulate.
    const rad = (record.rotateDeg * Math.PI) / 180;
    const rCos = Math.cos(rad);
    const rSin = Math.sin(rad);
    const ox = part.placement.x - record.anchorX;
    const oy = part.placement.y - record.anchorY;
    return {
      ...pl,
      placement: {
        x: Math.round(record.anchorX + record.scale * (ox * rCos - oy * rSin) + record.dx),
        y: Math.round(record.anchorY + record.scale * (ox * rSin + oy * rCos) + record.dy),
        scale: part.placement.scale * record.scale,
        rotateDeg: part.placement.rotateDeg + record.rotateDeg,
      },
      order: pl.order,
    };
  });
  return { ...scene, placements };
}

/**
 * THE CANONICAL GROUP TRANSFORM (Phase 4): translate + uniform scale +
 * rotate about the group's CURRENT centroid — the compound moves as one
 * rigid-ish body, and the accumulated similarity is composed into the
 * scene's `groupTransforms[groupId]` record so a later recompose
 * reproduces it (the override-preservation law). The record's anchor is
 * the centroid at the record's birth; every later op composes exactly in
 * that anchor frame:
 *
 *   current visual state  V(p) = A + s·Rot(p − A) + d
 *   the new op            T:   p → C + s₂·Rot₂(p − C) + d₂   (C = live centroid)
 *   composed              V'(p) = C + s·s₂·Rot₂Rot(p − A)
 *                               + s₂·Rot₂(A + d − C) + d₂
 *
 * so s' = s·s₂, Rot' = Rot₂∘Rot, d' = (C − A) + s₂·Rot₂(A + d − C) + d₂ —
 * exact for any op sequence, no drift (the (C − A) term moves the frame
 * origin back to the anchor). Returns null when the group is unknown,
 * locked, empty, or the transform is not a similarity this board speaks
 * (non-finite numbers, scale ≤ 0).
 */
export interface GroupTransformInput {
  dx: number;
  dy: number;
  scale: number;
  rotateDeg: number;
}

export function transformCompoundGroup(
  scene: WhiteboardScene,
  groupId: string,
  t: GroupTransformInput
): WhiteboardScene | null {
  if (isGroupLocked(scene, groupId)) return null;
  const members = groupMembers(scene, groupId);
  if (members.length === 0) return null;
  if (
    !Number.isFinite(t.dx) ||
    !Number.isFinite(t.dy) ||
    !Number.isFinite(t.scale) ||
    !Number.isFinite(t.rotateDeg) ||
    t.scale <= 0
  )
    return null;
  // The live centroid in EXACT arithmetic (composition stays drift-free
  // around it). The RECORD's frame, though, anchors at the declared
  // layout's EXPANSION ORIGIN — derived at record birth from the spec's
  // own offsets (first member position − first declared offset) — so a
  // later recompose can re-expand the declared layout AT THE ANCHOR and
  // reproduce the birth positions byte-for-byte before re-applying the
  // similarity. A group the compound registry cannot resolve refuses at
  // record birth (fail-closed — the same gate duplicate/recompose ride).
  const cx = members.reduce((a, m) => a + m.placement.x, 0) / members.length;
  const cy = members.reduce((a, m) => a + m.placement.y, 0) / members.length;
  const record = scene.groupTransforms?.[groupId];
  let anchor: { x: number; y: number };
  if (record) {
    anchor = { x: record.anchorX, y: record.anchorY };
  } else {
    const spec = resolveCompoundGroupId(groupId);
    if (spec === null) return null;
    const firstPart = spec.parts[0] as { dx?: number; dy?: number } | undefined;
    anchor = {
      x: members[0].placement.x - (firstPart?.dx ?? 0),
      y: members[0].placement.y - (firstPart?.dy ?? 0),
    };
  }
  const prev = record ?? { anchorX: anchor.x, anchorY: anchor.y, dx: 0, dy: 0, scale: 1, rotateDeg: 0 };
  const rad = (t.rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // d' = s₂·Rot₂(A + d − C) + d₂ (the composition law above).
  const wx = prev.anchorX + prev.dx - cx;
  const wy = prev.anchorY + prev.dy - cy;
  const nextRecord: GroupTransformRecord = {
    anchorX: prev.anchorX,
    anchorY: prev.anchorY,
    dx: cx - prev.anchorX + t.scale * (wx * cos - wy * sin) + t.dx,
    dy: cy - prev.anchorY + t.scale * (wx * sin + wy * cos) + t.dy,
    scale: prev.scale * t.scale,
    rotateDeg: prev.rotateDeg + t.rotateDeg,
  };
  // Every member's placement rides the OP ITSELF (about the live
  // centroid) — the same math the visual state receives.
  const memberKeys = new Set(members.map(placementKey));
  const placements = scene.placements.map((pl) => {
    if (!memberKeys.has(placementKey(pl))) return pl;
    const p = pl.placement;
    const ox = p.x - cx;
    const oy = p.y - cy;
    return {
      ...pl,
      placement: {
        x: Math.round(cx + t.scale * (ox * cos - oy * sin) + t.dx),
        y: Math.round(cy + t.scale * (ox * sin + oy * cos) + t.dy),
        scale: p.scale * t.scale,
        rotateDeg: p.rotateDeg + t.rotateDeg,
      },
    };
  });
  const groupTransforms = {
    ...scene.groupTransforms,
    [groupId]: nextRecord,
  };
  return { ...scene, placements, groupTransforms };
}

/**
 * NUDGE: one delta, every member — the compound moves as one body.
 * Phase 4: this DELEGATES to the canonical transform (a pure translation
 * about the centroid is the identity rotation/scale), so nudges compose
 * into the transform record too and a recompose preserves them. Returns
 * null when the group is unknown or locked.
 */
export function nudgeCompoundGroup(
  scene: WhiteboardScene,
  groupId: string,
  dx: number,
  dy: number
): WhiteboardScene | null {
  return transformCompoundGroup(scene, groupId, { dx, dy, scale: 1, rotateDeg: 0 });
}

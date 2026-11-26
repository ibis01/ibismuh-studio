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
//                  slots (events keep their addresses)
//   nudge        — the group transform: one delta, every member
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
  return {
    ...scene,
    placements,
    animations: dropMemberEvents(scene, memberKeys),
    groupLocks: scene.groupLocks?.filter((g) => g !== groupId),
    choreography: undefined,
  };
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
  return {
    ...scene,
    placements,
    groupLocks: scene.groupLocks?.filter((g) => g !== groupId),
    choreography: undefined,
  };
}

/**
 * RECOMPOSE (the safe repair): re-apply the compound's declared layout at
 * the members' centroid — scale 1, rotation 0, the registry's offsets —
 * under the SAME instance id, replacing the member rows in place. Events
 * keep addressing the same placement keys (the spec sequence preserves
 * them). Returns null when the group is unknown, locked, or its compound
 * cannot resolve.
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
  const centroid = groupCentroid(scene, groupId);
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
    return {
      ...pl,
      placement: part.placement,
      order: pl.order,
    };
  });
  return { ...scene, placements };
}

/**
 * NUDGE (the group transform): one delta, every member — the compound
 * moves as one body. Returns null when the group is unknown or locked.
 */
export function nudgeCompoundGroup(
  scene: WhiteboardScene,
  groupId: string,
  dx: number,
  dy: number
): WhiteboardScene | null {
  if (isGroupLocked(scene, groupId)) return null;
  const members = groupMembers(scene, groupId);
  if (members.length === 0) return null;
  const memberKeys = new Set(members.map(placementKey));
  const placements = scene.placements.map((pl) =>
    memberKeys.has(placementKey(pl))
      ? {
          ...pl,
          placement: {
            ...pl.placement,
            x: Math.round(pl.placement.x + dx),
            y: Math.round(pl.placement.y + dy),
          },
        }
      : pl
  );
  return { ...scene, placements };
}

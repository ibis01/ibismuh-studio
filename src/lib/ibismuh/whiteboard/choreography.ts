// choreography.ts — the COMPOUND CHOREOGRAPHY COMPILER (the re-audit's
// step 3: "compile named presets into existing placement events and add
// visual receipts").
//
// The whiteboard recipe registry (recipes.ts) NAMES and CLASSIFIES the
// choreography — it never changed a stroke. This module is the compile
// seam the recipes' honest contract pointed at: a NAMED PRESET compiled
// into the placement-scoped draw events the engine already speaks. No new
// grammar, no second scheduling engine — the compiler takes the fill
// law's own schedule (timing.ts scheduleScene output) and RETIMES the
// compound group's pen events into the preset's assembly order:
//
//   assembly-cascade   — parts assemble in their declared draw order,
//                        back-to-back (the spec sequence IS the story).
//   assembly-center-out— parts assemble nearest-the-centroid first (ties
//                        break to draw order) — the system grows outward.
//   assembly-edge-in   — parts assemble outermost-first — the frame
//                        builds inward around its core.
//
// Master plan Phase 4 — six more named orders, every one still just an
// ORDER over the same member set (the pen law keeps the one clock):
//
//   assembly-clockwise       — angle from the centroid ascending: the
//                              sweep starts at 3 o'clock and turns screen-
//                              clockwise (the y-down board makes ascending
//                              atan2 the clockwise sweep).
//   assembly-counterclockwise— the same sweep, the other way round.
//   assembly-top-down        — by placed y ascending: the board reads top
//                              to bottom (ties break to draw order).
//   assembly-left-right      — by placed x ascending: reading order.
//   assembly-alternate       — the weave: first, last, second,
//                              second-last … of the declared draw order —
//                              the two ends grow toward the middle.
//   assembly-spiral          — 30-degree angle buckets from the centroid,
//                              each bucket swept innermost-first — the
//                              pen circles inward in wedges (clockwise
//                              buckets ascending, ties to draw order).
//
// THE PEN LAW: the hand follows ONE active stroke (timing.ts handAt), so
// a preset never overlaps strokes — each event keeps its own durationMs
// and the events pack SEQUENTIALLY with the fill law's own inter-stroke
// gap. Two presets differ only in the part ORDER, never in speeds or
// durations (the timing engine stays the one clock).
//
// THE RECEIPT: applying a preset stamps `scene.choreography` with the
// preset id (the validator refuses anything outside this closed set) —
// the doc carries its own assembly name, the QC panel reads it, and the
// next render's fill law leaves the group's strokes alone (explicit
// events are senior).
//
// Master plan Phase 5 — the receipt grows RICH and GROUP-KEYED. The map
// `scene.choreographyGroups[groupId]` now carries the compile's own
// record: { presetId, timingSource, eventFingerprint, affectedMembers,
// version } — the timing source (the ONE scene clock), the event set the
// compile addressed (a deterministic fingerprint over the sorted event
// addresses), the member roster at receipt time, and a monotonic per-
// group counter (the receipt continues itself: previous version + 1).
// BACKWARD COMPATIBILITY: Phase 4 docs carry the bare preset STRING —
// the tolerant reader (normalizeChoreographyGroupReceipt) accepts both
// shapes and upgrades the legacy string on parse (version 1, the roster
// and fingerprint derived from what the receipt rides HERE). A rich
// receipt is validated, never recomputed: it records the compile-time
// state, not the live timeline.
//
// THE EVENT-SET LAW (Phase 5's choreography pin): one scene clock. The
// group's pen events ride ONE window on the scene's single timeline —
// the compile packs them back-to-back — so the compiler REFUSES:
//   · an empty/missing event set (no member carries a stroke) — there
//     is nothing honest to order;
//   · two member strokes claiming the same clock window — the one-hand
//     law is already broken in the input; retiming cannot heal an
//     overlap, so the refusal names the offending pair (fail-visible;
//     the route surfaces it verbatim as a 400).
//
// The fingerprint rides the repo's pure FNV-1a 32-bit primitive (the
// planners' stableHash family — scene3d.ts hash32, planners/index.ts
// stableHash). The sha256 helpers (canonical.ts, lane-contracts.ts)
// live behind node:crypto and this compile seam must stay client-clean
// (the battery pins choreography.ts free of node: imports), so the
// receipt uses the house's other deterministic digest — 8 lowercase hex
// chars, order-independent (the event set sorts before hashing).
//
// Pure and deterministic: same members, same events, same preset → the
// same retimed events, byte for byte. Client-safe: no fs, no clock, no
// randomness, no node: imports.
import type { AnimationEvent, ChoreographyGroupReceipt } from "./storyboard";

// ---------------------------------------------------------------------------
// The closed preset vocabulary
// ---------------------------------------------------------------------------

export const COMPOUND_CHOREOGRAPHY_IDS = [
  "assembly-cascade",
  "assembly-center-out",
  "assembly-edge-in",
  "assembly-clockwise",
  "assembly-counterclockwise",
  "assembly-top-down",
  "assembly-left-right",
  "assembly-alternate",
  "assembly-spiral",
] as const;
export type CompoundChoreographyId = (typeof COMPOUND_CHOREOGRAPHY_IDS)[number];

/** Resolve a preset id — unknown → null (the tolerant READ; the route and
 *  the validator fail closed against the vocabulary itself). */
export function resolveCompoundChoreography(id: string): CompoundChoreographyId | null {
  return (COMPOUND_CHOREOGRAPHY_IDS as readonly string[]).includes(id)
    ? (id as CompoundChoreographyId)
    : null;
}

/** The default inter-stroke gap between the retimed events (the fill
 *  law's tight cadence — timing.ts PATH_GAP_MS, restated here so the
 *  compiler stays leaf-pure; the battery pins the two constants equal). */
const COMPILE_GAP_MS = 130;

// ---------------------------------------------------------------------------
// The compiler
// ---------------------------------------------------------------------------

/** One group member the compiler addresses: the placement key (the
 *  event address), the draw position, and the compound-relative offset
 *  seed for the distance presets. */
export interface ChoreographyMember {
  /** The placement identity the member's events address. */
  key: string;
  /** The member's placed x (scene units) — the distance presets' input. */
  x: number;
  /** The member's placed y (scene units). */
  y: number;
}

/**
 * Retime the member placements' pen events into the preset's assembly
 * order. Input is the SCENE'S FULL SCHEDULE (the fill law's own output —
 * explicit events stay senior inside it, so an already-authored group
 * event keeps its claim and its retiming). Output: the member pen events
 * in their new order with new startMs — the caller swaps them into
 * `scene.animations` and stamps the receipt. Non-member events pass
 * nothing back (the caller never touches them). Deterministic and pure.
 *
 * THROWS (the event-set law, fail-visible): an empty member event set,
 * or two member strokes claiming one clock window (the refusal names the
 * offending pair) — the compile never reshapes a schedule that already
 * breaks the one scene clock.
 */
export function compileCompoundChoreography(input: {
  preset: CompoundChoreographyId;
  /** The group's members in their DRAW ORDER (the spec sequence). */
  members: readonly ChoreographyMember[];
  /** The scene's full schedule (explicit + fill) the member events ride. */
  events: readonly AnimationEvent[];
  /** The inter-stroke gap (default: the fill law's 130ms cadence). */
  gapMs?: number;
}): AnimationEvent[] {
  const gapMs = typeof input.gapMs === "number" && input.gapMs >= 0 ? input.gapMs : COMPILE_GAP_MS;
  const memberKeys = new Set(input.members.map((m) => m.key));
  // The member pen events, grouped by member, IN MEMBER (draw) ORDER, each
  // keeping its internal relative order (the fill law's per-asset stroke
  // sequence — geometry draw order).
  const byMember = new Map<string, AnimationEvent[]>();
  for (const key of memberKeys) byMember.set(key, []);
  for (const ev of input.events) {
    if (ev.type !== "draw_path" && ev.type !== "write_text") continue;
    const key = ev.placementId ?? ev.assetId;
    const bucket = byMember.get(key);
    if (bucket !== undefined) bucket.push(ev);
  }
  // THE EVENT-SET LAW (Phase 5): one scene clock — fail-visible refusals,
  // never a silent reshape. An empty set has nothing honest to order; an
  // overlap means the input already claims two strokes at one moment and
  // the refusal names the offending pair.
  const memberEvents: AnimationEvent[] = [];
  for (const bucket of byMember.values()) memberEvents.push(...bucket);
  if (memberEvents.length === 0) {
    throw new Error(
      "choreography law: the group carries no drawable strokes — an empty event set cannot ride the one scene clock"
    );
  }
  const byStart = [...memberEvents].sort(
    (a, b) => a.startMs - b.startMs || choreographyEventAddress(a).localeCompare(choreographyEventAddress(b))
  );
  for (let i = 1; i < byStart.length; i++) {
    const prev = byStart[i - 1] as AnimationEvent;
    const cur = byStart[i] as AnimationEvent;
    if (cur.startMs < prev.startMs + prev.durationMs) {
      throw new Error(
        `choreography law: the group's pen events overlap on the one scene clock — "${choreographyEventAddress(prev)}" ${prev.startMs}-${prev.startMs + prev.durationMs}ms vs "${choreographyEventAddress(cur)}" ${cur.startMs}-${cur.startMs + cur.durationMs}ms — one hand draws one stroke; retiming cannot heal an overlap`
      );
    }
  }
  const present = input.members.filter((m) => (byMember.get(m.key)?.length ?? 0) > 0);
  if (present.length === 0) {
    // Unreachable past the empty-set refusal above (present members and
    // member events are the same condition) — kept as the compiler's
    // total-function belt.
    return [];
  }

  // The preset's part order — every preset is a deterministic ORDER over
  // the same member set; ties ALWAYS break to the declared draw order (a
  // stable sort over the member index, so equal geometry never flips).
  const centroidX = present.reduce((a, m) => a + m.x, 0) / present.length;
  const centroidY = present.reduce((a, m) => a + m.y, 0) / present.length;
  const rows = present.map((m, i) => ({
    m,
    i,
    d: Math.hypot(m.x - centroidX, m.y - centroidY),
    // Screen-clockwise angle from the centroid (y-down board: ascending
    // atan2 sweeps 3 o'clock → 6 → 12 → 9 — the visual clockwise order).
    a: Math.atan2(m.y - centroidY, m.x - centroidX),
  }));
  const alternate = (() => {
    // The weave over the declared draw order: first, last, second,
    // second-last … (the two ends grow toward the middle).
    const weave: typeof present = [];
    let lo = 0;
    let hi = present.length - 1;
    let takeLow = true;
    while (lo <= hi) {
      weave.push(takeLow ? present[lo] : present[hi]);
      if (takeLow) lo += 1;
      else hi -= 1;
      takeLow = !takeLow;
    }
    return weave;
  })();
  const ordered =
    input.preset === "assembly-cascade"
      ? present
      : input.preset === "assembly-alternate"
        ? alternate
      : [...rows]
          .sort((a, b) => {
            switch (input.preset) {
              case "assembly-center-out":
                return a.d - b.d || a.i - b.i;
              case "assembly-edge-in":
                return b.d - a.d || a.i - b.i;
              case "assembly-clockwise":
                return a.a - b.a || a.i - b.i;
              case "assembly-counterclockwise":
                return b.a - a.a || a.i - b.i;
              case "assembly-top-down":
                return a.m.y - b.m.y || a.i - b.i;
              case "assembly-left-right":
                return a.m.x - b.m.x || a.i - b.i;
              case "assembly-spiral": {
                // 30-degree clockwise buckets ascending; inside a bucket
                // the pen sweeps innermost-first (the wedge fills outward
                // from its own core).
                const bucketA = Math.floor(((a.a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 6));
                const bucketB = Math.floor(((b.a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 6));
                return bucketA - bucketB || a.d - b.d || a.i - b.i;
              }
              default:
                return a.i - b.i;
            }
          })
          .map((row) => row.m);

  // Sequential packing: the band starts at the group's earliest scheduled
  // stroke (the fill law's own lead-in), each event keeps its duration,
  // the gap rides between events. Pen-safe by construction — no overlap.
  const firstStart = Math.min(
    ...ordered.flatMap((m) => (byMember.get(m.key) ?? []).map((e) => e.startMs))
  );
  const out: AnimationEvent[] = [];
  let t = firstStart;
  for (const m of ordered) {
    for (const ev of byMember.get(m.key) ?? []) {
      out.push({ ...ev, startMs: Math.round(t) });
      t += ev.durationMs + gapMs;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phase 5 — the receipt builders (the rich, group-keyed compile record)
// ---------------------------------------------------------------------------

/** The event address the laws name: the placement identity plus the
 *  stroke identity (path or text) — the offending pair's honest label. */
function choreographyEventAddress(ev: {
  placementId?: string;
  assetId: string;
  pathId?: string;
  textId?: string;
}): string {
  return `${ev.placementId ?? ev.assetId}#${ev.pathId ?? ev.textId ?? ""}`;
}

/** The ONE event-identity composer for the receipt fingerprint — the
 *  same string whether the row is a parsed AnimationEvent or a raw doc
 *  row (the validator normalizes legacy receipts before the events
 *  parse, so both shapes must reduce to one identity). */
export function choreographyEventKey(ev: {
  type: unknown;
  assetId: unknown;
  placementId?: unknown;
  pathId?: unknown;
  textId?: unknown;
  startMs: unknown;
  durationMs: unknown;
}): string {
  const address =
    typeof ev.placementId === "string" && ev.placementId
      ? ev.placementId
      : typeof ev.assetId === "string"
        ? ev.assetId
        : "";
  const detail =
    typeof ev.pathId === "string" ? ev.pathId : typeof ev.textId === "string" ? ev.textId : "";
  return `${String(ev.type ?? "")}#${address}#${detail}#${String(ev.startMs ?? "")}#${String(ev.durationMs ?? "")}`;
}

/** The event-set fingerprint: FNV-1a 32-bit over the SORTED event
 *  identities, 8 lowercase hex chars. Order-independent (a set, hashed
 *  as one); any membership, address, path, or window change moves it. */
export function choreographyEventSetFingerprint(eventKeys: readonly string[]): string {
  let h = 0x811c9dc5;
  const joined = [...eventKeys].sort().join("\n");
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The member-addressed pen events' identity keys (the compile's own
 *  filter: draw_path / write_text addressed to one of the member keys). */
function memberEventKeys(events: readonly unknown[], memberKeys: readonly string[]): string[] {
  const members = new Set(memberKeys);
  const keys: string[] = [];
  for (const row of events) {
    const e = row as Record<string, unknown>;
    if (e.type !== "draw_path" && e.type !== "write_text") continue;
    const address =
      typeof e.placementId === "string" && e.placementId
        ? e.placementId
        : typeof e.assetId === "string"
          ? e.assetId
          : "";
    if (!address || !members.has(address)) continue;
    keys.push(choreographyEventKey(e as Parameters<typeof choreographyEventKey>[0]));
  }
  return keys;
}

/**
 * THE RECEIPT one compile stamps (Phase 5): the preset, the one scene
 * clock, the event-set fingerprint, the member roster at receipt time
 * (sorted — a set, deterministic), and the monotonic version (the
 * receipt continues ITSELF: previous + 1; absent previous = the first
 * receipt shape, version 1). Pure — no clock, no randomness.
 */
export function buildChoreographyGroupReceipt(input: {
  presetId: CompoundChoreographyId;
  /** The group's member placement keys at receipt time. */
  memberKeys: readonly string[];
  /** The scene's event set the compile addressed (the schedule). */
  events: readonly AnimationEvent[];
  /** The receipt this compile replaces (absent = first compile). */
  previousVersion?: number;
}): ChoreographyGroupReceipt {
  return {
    presetId: input.presetId,
    timingSource: "scene-clock",
    eventFingerprint: choreographyEventSetFingerprint(memberEventKeys(input.events, input.memberKeys)),
    affectedMembers: [...input.memberKeys].sort(),
    version: (typeof input.previousVersion === "number" && Number.isInteger(input.previousVersion) && input.previousVersion >= 0
      ? input.previousVersion
      : 0) + 1,
  };
}

/**
 * The TOLERANT READ (the backward-compatibility law): a receipt value
 * from the wire may be the Phase 4 bare preset STRING (legacy) or the
 * Phase 5 rich record. Returns the normalized rich receipt, or NULL on
 * anything that is not honestly one of the two:
 *   · a legacy string upgrades to the full shape with the roster and
 *     fingerprint derived from the members and events it rides HERE,
 *     version 1 (the legacy shape carries no counter);
 *   · a rich record is validated and passed through — never recomputed
 *     (it records the compile-time state) — with its member roster
 *     judged against the group's placed members (a receipt naming
 *     strangers is a lie).
 */
export function normalizeChoreographyGroupReceipt(input: {
  raw: unknown;
  /** The group's placed member keys (the roster a receipt must name). */
  memberKeys: readonly string[];
  /** The scene's event set (legacy derivation rides what is HERE). */
  events: readonly unknown[];
}): ChoreographyGroupReceipt | null {
  if (typeof input.raw === "string") {
    const presetId = resolveCompoundChoreography(input.raw);
    if (presetId === null) return null;
    return buildChoreographyGroupReceipt({
      presetId,
      memberKeys: input.memberKeys,
      events: input.events as readonly AnimationEvent[],
    });
  }
  if (typeof input.raw !== "object" || input.raw === null || Array.isArray(input.raw)) return null;
  const r = input.raw as Record<string, unknown>;
  const presetId = typeof r.presetId === "string" ? resolveCompoundChoreography(r.presetId) : null;
  const roster = Array.isArray(r.affectedMembers) ? (r.affectedMembers as unknown[]) : null;
  const rosterOk =
    roster !== null &&
    roster.length === input.memberKeys.length &&
    roster.every((m) => typeof m === "string") &&
    [...(roster as string[])].sort().join("\n") === [...input.memberKeys].sort().join("\n");
  return presetId !== null &&
    r.timingSource === "scene-clock" &&
    typeof r.eventFingerprint === "string" &&
    /^[0-9a-f]{8}$/.test(r.eventFingerprint) &&
    rosterOk &&
    typeof r.version === "number" &&
    Number.isInteger(r.version) &&
    r.version >= 1
    ? {
        presetId,
        timingSource: "scene-clock",
        eventFingerprint: r.eventFingerprint,
        affectedMembers: [...(roster as string[])].sort(),
        version: r.version,
      }
    : null;
}

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
// Pure and deterministic: same members, same events, same preset → the
// same retimed events, byte for byte. Client-safe: no fs, no clock, no
// randomness, no node: imports.
import type { AnimationEvent } from "./storyboard";

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
  const present = input.members.filter((m) => (byMember.get(m.key)?.length ?? 0) > 0);
  if (present.length === 0) return [];

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

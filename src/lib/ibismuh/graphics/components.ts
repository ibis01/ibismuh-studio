// components.ts — the GRAPHICS SEMANTIC COMPONENT REGISTRY (Phase C of the
// catalog route's design system: "semantic components, animation recipes").
//
// A component is a NAMED, PARAMETERIZED, PRE-COMPOSED arrangement of
// primitive elements — the stat card (icon + counter + label), the quote
// card (quote + attribution), the CTA banner — the building blocks a
// motion-graphics designer reaches for before any single element. The
// registry gives the planner lanes a professional vocabulary that compiles
// into the EXISTING GraphicsElement grammar.
//
// THE SINGLE-SYNTAX LAW (the whiteboard compounds' law, verbatim in
// spirit): a component NEVER enters the doc. `expandComponent` is the ONE
// seam constructor — it expands the component into primitive elements
// with DERIVED ids (`<componentId>-<partId>`), placements offset from the
// component's anchor, payloads from the caller's story-derived content,
// and enter motions from the native default table (motion legality by
// construction — the same MOTION_KINDS_BY_ELEMENT rows the validator
// enforces). A doc that somehow carries a component-shaped element is
// invalid BY CONSTRUCTION here: components are planner-side vocabulary,
// like recipes.
//
// THE CONTENT LAW (the scaffold's own law): the expansion INVENTS NO
// FACTS. Text rides the caller's strings (capped, whitespace-collapsed —
// the ONE capLine law); the counter rides the caller's number; the icon
// rides a REGISTERED library id (resolved through GRAPHICS_ICON_LIBRARY —
// never free-form paths). A required slot without content is a NAMED
// refusal, never a placeholder.
//
// Fail-closed: unknown component ids throw; required-content misses
// throw; the registry self-check (assertComponentRegistry, run at load)
// rejects duplicate ids, charset-illegal derived ids, unknown part kinds,
// non-finite offsets, anchors off the 16:9 frame — every defect BY NAME.
//
// Pure and deterministic: same (id, content, surface) → the same elements,
// byte for byte.
import { GRAPHICS_ICON_LIBRARY } from "./icons";
import {
  capLine,
  nativeEnterFor,
  remapPlacement,
  textPayload,
} from "./native-defaults";
import {
  GRAPHICS_ELEMENT_KINDS,
  validGraphicsId,
  type CounterPayload,
  type GraphicsElement,
  type GraphicsElementKind,
  type IconPayload,
} from "./types";

// ---------------------------------------------------------------------------
// The closed component vocabulary
// ---------------------------------------------------------------------------

export const GRAPHICS_COMPONENT_IDS = [
  "stat-card",
  "kicker-card",
  "big-quote",
  "cta-banner",
  "icon-caption",
  "comparison",
  "before-after",
  "process-steps",
  "timeline-card",
  "checklist",
  "ranking",
  "title-opener",
  "closing-summary",
] as const;
export type GraphicsComponentId = (typeof GRAPHICS_COMPONENT_IDS)[number];

/** The lane-plan component family each card expresses (planner-types'
 *  GraphicComponentKind vocabulary — the declarative seam's names; a
 *  string here keeps the graphics module leaf-clean of the lane-plan
 *  types, and the battery pins the correspondence). WS8 growth: the
 *  comparison and timeline families join the closed set — both names
 *  ALREADY exist in planner-types' GraphicComponentKind (the declarative
 *  lane renders them), so the vocabulary grows without grammar growth. */
export type ComponentPlanKind =
  | "statistic"
  | "headline"
  | "quote"
  | "cta"
  | "icon-group"
  | "comparison"
  | "timeline";

/** One part of a component: the primitive element kind it expands to and
 *  its offset (16:9 scene units) from the component's anchor — the anchor
 *  is the component's visual CENTER, offsets place each part around it.
 *  `optional` parts expand ONLY when their content slot arrives (the ids
 *  of present parts stay stable — an absent part never shifts another's
 *  derived id). */
export interface ComponentPartSpec {
  id: string;
  kind: GraphicsElementKind;
  dx: number;
  dy: number;
  scale?: number;
  /** The slot this part reads: "text" | "sub" | "counter" | "icon" | "items".
   *  `required` slots refuse the expansion without content; optional
   *  slots omit the part. An "items" part reads `content.items[
   *  itemIndex]` and omits when that index is absent — the ids of
   *  present parts stay stable (an absent item never shifts another's
   *  derived id). */
  slot: "text" | "sub" | "counter" | "icon" | "items";
  /** For "items"-slotted parts: the index into the caller's items array. */
  itemIndex?: number;
  /** For text-slotted parts: the payload size override (the validator's
   *  12..288 band); absent ⇒ the DEFAULT_SIZE_PX for the kind. */
  sizePx?: number;
  /** Optional parts omit themselves when their slot carries no content
   *  (stat-card's icon accent). An optional part with INVALID content
   *  (an unregistered iconId) still refuses — the caller asked for
   *  something that does not exist, and that is worth naming. */
  optional?: boolean;
}

export interface ComponentSpec {
  id: GraphicsComponentId;
  /** One line — the seat picker's label. */
  label: string;
  /** The designed intent. */
  intent: string;
  /** The lane-plan family (see ComponentPlanKind). */
  planKind: ComponentPlanKind;
  /** The 16:9 reference anchor (the component's center). */
  anchor: { x: number; y: number };
  parts: readonly ComponentPartSpec[];
}

// ---------------------------------------------------------------------------
// The registry — five semantic components (the audit's starter set). All
// anchors center on the 1920×1080 reference; part offsets are designed so
// the default sizes never overlap (the layout law — pinned in the
// battery).
// ---------------------------------------------------------------------------

export const GRAPHICS_COMPONENTS: Readonly<Record<GraphicsComponentId, ComponentSpec>> = {
  "stat-card": {
    id: "stat-card",
    label: "Stat card",
    intent:
      "The one-number moment: an optional icon accent above, the counter landing on expo-out, the context line beneath. The scaffold's stat archetype, named and addressable.",
    planKind: "statistic",
    anchor: { x: 960, y: 470 },
    parts: [
      { id: "accent", kind: "icon", dx: 0, dy: -230, scale: 4, slot: "icon", optional: true },
      { id: "value", kind: "counter", dx: 0, dy: 0, scale: 2.5, slot: "counter" },
      { id: "label", kind: "subhead", dx: 0, dy: 150, slot: "sub" },
    ],
  },
  "kicker-card": {
    id: "kicker-card",
    label: "Kicker card",
    intent:
      "The section moment: a small callout names the section, the headline lands beneath it. For scene titles that deserve their own beat.",
    planKind: "headline",
    anchor: { x: 960, y: 460 },
    parts: [
      { id: "kicker", kind: "callout", dx: 0, dy: -150, slot: "sub" },
      { id: "title", kind: "headline", dx: 0, dy: 20, slot: "text" },
    ],
  },
  "big-quote": {
    id: "big-quote",
    label: "Big quote",
    intent:
      "The testimony moment: the quoted line large on a callout, the attribution beneath. The scaffold's quote archetype, named and addressable.",
    planKind: "quote",
    anchor: { x: 960, y: 520 },
    parts: [
      { id: "quote", kind: "callout", dx: 0, dy: -60, slot: "text", sizePx: 44 },
      { id: "attribution", kind: "subhead", dx: 0, dy: 140, slot: "sub" },
    ],
  },
  "cta-banner": {
    id: "cta-banner",
    label: "CTA banner",
    intent:
      "The action moment: the call-to-action line large, an optional supporting line beneath. The board's last word.",
    planKind: "cta",
    anchor: { x: 960, y: 520 },
    parts: [
      { id: "line", kind: "headline", dx: 0, dy: -50, slot: "text" },
      { id: "support", kind: "subhead", dx: 0, dy: 110, slot: "sub" },
    ],
  },
  "icon-caption": {
    id: "icon-caption",
    label: "Icon caption",
    intent:
      "The explainer moment: a drawn icon above its caption line. One idea, one mark.",
    planKind: "icon-group",
    anchor: { x: 960, y: 500 },
    parts: [
      { id: "mark", kind: "icon", dx: 0, dy: -100, scale: 4, slot: "icon" },
      { id: "caption", kind: "bullet", dx: 0, dy: 110, slot: "sub" },
    ],
  },

  // WS8 growth — the comparison family. The slots stay the caller's
  // extraction: the headline names the topic, the items carry the two
  // compared sides (items[0] left, items[1] right). No invented literals.
  comparison: {
    id: "comparison",
    label: "Comparison",
    intent:
      "The two-sides moment: the topic names the comparison, the two terms land left and right of center. For versus narrations.",
    planKind: "comparison",
    anchor: { x: 960, y: 500 },
    parts: [
      { id: "topic", kind: "headline", dx: 0, dy: -180, slot: "text" },
      { id: "left", kind: "subhead", dx: -320, dy: 80, slot: "items", itemIndex: 0 },
      { id: "right", kind: "subhead", dx: 320, dy: 80, slot: "items", itemIndex: 1 },
    ],
  },
  "before-after": {
    id: "before-after",
    label: "Before / after",
    intent:
      "The transformation moment: the change names the card, the before state and the after state stack beneath it — before first, after last.",
    planKind: "comparison",
    anchor: { x: 960, y: 500 },
    parts: [
      { id: "change", kind: "headline", dx: 0, dy: -200, slot: "text" },
      { id: "before", kind: "subhead", dx: 0, dy: -20, slot: "items", itemIndex: 0 },
      { id: "after", kind: "subhead", dx: 0, dy: 150, slot: "items", itemIndex: 1 },
    ],
  },
  "process-steps": {
    id: "process-steps",
    label: "Process steps",
    intent:
      "The how-it-works moment: the process names the card, up to three steps descend beneath it in reading order.",
    planKind: "timeline",
    anchor: { x: 960, y: 480 },
    parts: [
      { id: "name", kind: "headline", dx: 0, dy: -220, slot: "text" },
      { id: "step-1", kind: "bullet", dx: 0, dy: -40, slot: "items", itemIndex: 0 },
      { id: "step-2", kind: "bullet", dx: 0, dy: 110, slot: "items", itemIndex: 1 },
      { id: "step-3", kind: "bullet", dx: 0, dy: 260, slot: "items", itemIndex: 2 },
    ],
  },
  "timeline-card": {
    id: "timeline-card",
    label: "Timeline",
    intent:
      "The history moment: the era names the card, the milestones descend in order — earliest first.",
    planKind: "timeline",
    anchor: { x: 960, y: 480 },
    parts: [
      { id: "era", kind: "headline", dx: 0, dy: -220, slot: "text" },
      { id: "milestone-1", kind: "bullet", dx: 0, dy: -40, slot: "items", itemIndex: 0 },
      { id: "milestone-2", kind: "bullet", dx: 0, dy: 110, slot: "items", itemIndex: 1 },
      { id: "milestone-3", kind: "bullet", dx: 0, dy: 260, slot: "items", itemIndex: 2 },
    ],
  },
  checklist: {
    id: "checklist",
    label: "Checklist",
    intent:
      "The readiness moment: the goal names the card, the requirements descend beneath it — each one a line the viewer can tick.",
    planKind: "icon-group",
    anchor: { x: 960, y: 480 },
    parts: [
      { id: "goal", kind: "headline", dx: 0, dy: -220, slot: "text" },
      { id: "req-1", kind: "bullet", dx: 0, dy: -40, slot: "items", itemIndex: 0 },
      { id: "req-2", kind: "bullet", dx: 0, dy: 110, slot: "items", itemIndex: 1 },
      { id: "req-3", kind: "bullet", dx: 0, dy: 260, slot: "items", itemIndex: 2 },
    ],
  },
  ranking: {
    id: "ranking",
    label: "Ranking",
    intent:
      "The leaderboard moment: the category names the card, the ranked rows descend — best first.",
    planKind: "timeline",
    anchor: { x: 960, y: 480 },
    parts: [
      { id: "category", kind: "headline", dx: 0, dy: -220, slot: "text" },
      { id: "first", kind: "bullet", dx: 0, dy: -40, slot: "items", itemIndex: 0 },
      { id: "second", kind: "bullet", dx: 0, dy: 110, slot: "items", itemIndex: 1 },
      { id: "third", kind: "bullet", dx: 0, dy: 260, slot: "items", itemIndex: 2 },
    ],
  },
  "title-opener": {
    id: "title-opener",
    label: "Title opener",
    intent:
      "The opening moment: the title lands large with an optional supporting line — the card the video opens on.",
    planKind: "headline",
    anchor: { x: 960, y: 500 },
    parts: [
      { id: "title", kind: "headline", dx: 0, dy: -60, slot: "text", sizePx: 88 },
      { id: "support", kind: "subhead", dx: 0, dy: 140, slot: "sub" },
    ],
  },
  "closing-summary": {
    id: "closing-summary",
    label: "Closing summary",
    intent:
      "The take-home moment: the summary line large, an optional reinforcement line beneath — the card the video ends on.",
    planKind: "headline",
    anchor: { x: 960, y: 500 },
    parts: [
      { id: "summary", kind: "headline", dx: 0, dy: -60, slot: "text", sizePx: 72 },
      { id: "reinforce", kind: "subhead", dx: 0, dy: 140, slot: "sub" },
    ],
  },
};

/** The registry's member list in declaration order — the seat picker's
 *  data source. */
export function componentNames(): readonly GraphicsComponentId[] {
  return GRAPHICS_COMPONENT_IDS;
}

/** Resolve a component by id — unknown → null (the tolerant READ). */
export function resolveComponent(id: string): ComponentSpec | null {
  if ((GRAPHICS_COMPONENT_IDS as readonly string[]).includes(id)) {
    return GRAPHICS_COMPONENTS[id as GraphicsComponentId];
  }
  return null;
}

// ---------------------------------------------------------------------------
// The expansion seam — component → primitive elements
// ---------------------------------------------------------------------------

/** The story-derived content a component expansion consumes. Every field
 *  is the caller's extraction — the expansion invents nothing. */
export interface ComponentContent {
  /** The primary text (the quote, the CTA line, the section title). */
  text?: string;
  /** The secondary text (the attribution, the context line, the
   *  supporting line). */
  sub?: string;
  /** The counter slot (stat-card requires it). */
  counter?: { from: number; to: number; unit?: string; decimals?: 0 | 1 | 2 };
  /** A REGISTERED icon id (resolved through GRAPHICS_ICON_LIBRARY — an
   *  unregistered id is a named refusal, never free-form paths). */
  iconId?: string;
  /** The list slot (WS8 growth): the compared sides, the steps, the
   *  milestones, the ranked rows. Each item rides capLine at 60 chars;
   *  an items part omits when its index is absent; a PRESENT-but-junk
   *  item (empty/whitespace) refuses — the caller asked for something
   *  that cannot read. */
  items?: readonly string[];
}

export interface ExpandComponentOpts {
  /** The real house surface the placement remaps onto (the S68 law —
   *  absent/junk → 16:9, the planner's snapping law is the caller's).
   *  Non-finite/non-positive values fall to 16:9 here too (fail-safe,
   *  named in the battery). */
  width?: number;
  height?: number;
}

/** Expand a component into primitive elements. THE ONE SEAM CONSTRUCTOR:
 *  unknown id throws; a required slot without content throws; an icon
 *  slot without a registered id throws (the content law). Optional slots
 *  with no content simply omit their part. Enter motions ride
 *  nativeEnterFor(kind, order) with `order` = the part's index AMONG ITS
 *  KIND (the same staggering the scaffold's staged pass recomputes).
 *  Exits are NOT set here — the scaffold's staged pass owns exits for
 *  every archetype (one exit law, one writer). */
export function expandComponent(
  id: string,
  content: ComponentContent,
  opts: ExpandComponentOpts = {},
): GraphicsElement[] {
  const spec = resolveComponent(id);
  if (spec === null) {
    throw new Error(`components: unknown component id "${id}" — a planner may only name the registry's components (${GRAPHICS_COMPONENT_IDS.join(", ")})`);
  }

  const width = typeof opts.width === "number" && Number.isFinite(opts.width) && opts.width > 0 ? opts.width : 1920;
  const height = typeof opts.height === "number" && Number.isFinite(opts.height) && opts.height > 0 ? opts.height : 1080;

  const text = typeof content.text === "string" ? capLine(content.text, 120) : undefined;
  const sub = typeof content.sub === "string" ? capLine(content.sub, 160) : undefined;
  const counter = content.counter;
  const iconSpec = typeof content.iconId === "string" ? GRAPHICS_ICON_LIBRARY[content.iconId] : undefined;
  // The items slot: each present item rides the ONE capLine law (60 — a
  // list row is shorter than a supporting line). Present-but-junk refuses;
  // absent indexes omit (the stable-id law).
  const items = Array.isArray(content.items)
    ? content.items.map((raw, i) => {
        if (typeof raw !== "string" || raw.trim() === "") {
          throw new Error(`components: ${id} carries a non-readable item at index ${i} — list items must be non-empty strings`);
        }
        return capLine(raw, 60);
      })
    : undefined;

  const orders = new Map<GraphicsElementKind, number>();
  const out: GraphicsElement[] = [];
  for (const part of spec.parts) {
    // The slot law: a required slot without content refuses BY NAME; an
    // optional slot without content omits the part (the ids of present
    // parts stay stable). INVALID content (an unregistered iconId)
    // refuses for BOTH — the caller asked for something that does not
    // exist, and the refusal is named either way.
    switch (part.slot) {
      case "text":
        if (text === undefined) {
          throw new Error(`components: ${id} requires text content for its "${part.id}" part`);
        }
        break;
      case "sub":
        if (sub === undefined) continue; // optional by design
        break;
      case "items": {
        // An items part omits when its index is absent (the stable-id
        // law); a junk item already refused above (present-but-non-
        // readable is a named refusal, never a placeholder).
        const idx = part.itemIndex;
        if (idx === undefined || items === undefined || items[idx] === undefined) continue;
        break;
      }
      case "counter":
        if (counter === undefined) {
          throw new Error(`components: ${id} requires a positive counter for its "${part.id}" part`);
        }
        if (!Number.isFinite(counter.to) || !(counter.to > 0)) {
          throw new Error(`components: ${id} requires a positive counter for its "${part.id}" part`);
        }
        break;
      case "icon":
        if (iconSpec === undefined) {
          if (content.iconId !== undefined) {
            // Invalid content refuses even for an optional part — named.
            throw new Error(
              `components: ${id} requires a registered icon id for its "${part.id}" part ("${content.iconId}" is not in the graphics icon library)`,
            );
          }
          if (part.optional === true) continue; // the accent omits itself
          throw new Error(`components: ${id} requires a registered icon id for its "${part.id}" part`);
        }
        break;
    }

    const order = orders.get(part.kind) ?? 0;
    orders.set(part.kind, order + 1);

    const at = remapPlacement(
      {
        x: spec.anchor.x + part.dx,
        y: spec.anchor.y + part.dy,
        scale: part.scale ?? 1,
        rotateDeg: 0,
      },
      width,
      height,
    );

    const elementId = `${id}-${part.id}`;
    if (!validGraphicsId(elementId)) {
      // Unreachable for the shipped registry (the self-check pins the
      // charset) — the load-bearing check for FUTURE components.
      throw new Error(`components: ${id} derives the charset-illegal element id "${elementId}"`);
    }

    // The enter rides the native default table — motion legality by
    // construction (the same rows the validator enforces).
    const el: GraphicsElement = { id: elementId, kind: part.kind, at, enter: nativeEnterFor(part.kind, order) };

    switch (part.slot) {
      case "text":
        el.text = { ...textPayload(part.kind, text as string), ...(part.sizePx !== undefined ? { sizePx: part.sizePx } : {}) };
        break;
      case "sub":
        el.text = { ...textPayload(part.kind, sub as string), ...(part.sizePx !== undefined ? { sizePx: part.sizePx } : {}) };
        break;
      case "items": {
        const idx = part.itemIndex as number;
        el.text = { ...textPayload(part.kind, (items as string[])[idx]), ...(part.sizePx !== undefined ? { sizePx: part.sizePx } : {}) };
        break;
      }
      case "counter": {
        const c = counter as { from: number; to: number; unit?: string; decimals?: 0 | 1 | 2 };
        const payload: CounterPayload = { from: c.from, to: c.to };
        if (c.unit !== undefined) payload.unit = c.unit;
        if (c.decimals !== undefined) payload.decimals = c.decimals;
        el.counter = payload;
        break;
      }
      case "icon": {
        const icon = iconSpec as { paths: string[] };
        const payload: IconPayload = { paths: [...icon.paths] };
        el.icon = payload;
        break;
      }
    }

    out.push(el);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The registry self-check — fail-closed at load (the compounds pattern)
// ---------------------------------------------------------------------------

/** Structural defects the self-check rejects: unknown component ids,
 *  key/id mismatches, duplicate part ids, unknown part kinds, non-finite
 *  offsets, anchors off the 16:9 frame, charset-illegal derived ids, an
 *  empty parts list. Takes the specs INJECTABLY (the defect tests feed
 *  synthetic rows; production feeds the shipped registry). */
export function assertComponentRegistry(entries?: readonly ComponentSpec[]): void {
  const list = entries ?? GRAPHICS_COMPONENT_IDS.map((id) => {
    const s = GRAPHICS_COMPONENTS[id];
    if (s === undefined) throw new Error(`components: the registry is missing the declared component "${id}"`);
    return s;
  });
  const declared = new Set<string>(GRAPHICS_COMPONENT_IDS);
  for (const spec of list) {
    if (!declared.has(spec.id)) {
      throw new Error(`components: the component "${spec.id}" is outside the closed vocabulary (${GRAPHICS_COMPONENT_IDS.join(", ")})`);
    }
    if (spec.parts.length === 0) {
      throw new Error(`components: ${spec.id} declares no parts — an empty component is a defect, not a default`);
    }
    if (!Number.isFinite(spec.anchor.x) || !Number.isFinite(spec.anchor.y) || spec.anchor.x < 0 || spec.anchor.x > 1920 || spec.anchor.y < 0 || spec.anchor.y > 1080) {
      throw new Error(`components: ${spec.id} anchor (${spec.anchor.x}, ${spec.anchor.y}) sits off the 16:9 reference frame`);
    }
    const seen = new Set<string>();
    for (const part of spec.parts) {
      if (seen.has(part.id)) {
        throw new Error(`components: ${spec.id} declares the part id "${part.id}" twice`);
      }
      seen.add(part.id);
      if (!GRAPHICS_ELEMENT_KINDS.includes(part.kind)) {
        throw new Error(`components: ${spec.id} part "${part.id}" names an unknown element kind "${part.kind}"`);
      }
      if (!Number.isFinite(part.dx) || !Number.isFinite(part.dy)) {
        throw new Error(`components: ${spec.id} part "${part.id}" carries a non-finite offset`);
      }
      const elementId = `${spec.id}-${part.id}`;
      if (!validGraphicsId(elementId)) {
        throw new Error(`components: ${spec.id} derives the charset-illegal element id "${elementId}"`);
      }
    }
  }
}

// The self-check runs at load: a registry defect refuses the MODULE (the
// compounds pattern — assertCompoundRegistry rides the manifest build).
assertComponentRegistry();

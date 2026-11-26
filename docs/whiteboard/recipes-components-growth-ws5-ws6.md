# Recipes + components growth — the WS5/WS6 menu fills out

Date: 2026-11-26
Scope: the engineering master plan's WS5 ("Motion Graphics semantic
catalog") and WS6 ("animation recipe compiler — reusable choreography for
both lanes") growth: the graphics component registry 5 → 13, the graphics
recipe registry 5 → 11, and the whiteboard choreography registry (the
plan's ten recipes, named and classified). Status: IMPLEMENTED —
design-system battery green (39 laws), whiteboard-recipes battery green
(10 laws), unit suite green (1064/0, byte-stable), catalog green,
visual-beats green, typecheck clean, lint clean.

## The graphics components — 5 → 13

Eight new semantic cards through the EXISTING expansion machinery
(expandComponent is still the ONE seam constructor; the doc still
carries primitives only): comparison and before-after (the comparison
family — the planKind name ALREADY exists in planner-types'
GraphicComponentKind, so the vocabulary grows without grammar growth),
process-steps / timeline-card / ranking (the timeline family), checklist
(icon-group), title-opener and closing-summary (headline). The part-slot
model grows ONE slot honestly: `items` — a list part reads
`content.items[itemIndex]`, omits when the index is absent (the
stable-id law), and a PRESENT-but-junk item refuses BY NAME (never a
placeholder). List rows ride the capLine law at 60 chars.

## The graphics recipes — 5 → 11

Six new named choreographies, all as per-kind OVERRIDE deltas on the
native table (the one-source law; every override rides its
compatibility row + the closed ease table, gated at EVERY compile):
comparison-bars, timeline-steps, process-steps, icon-group-entrance,
final-summary, problem-solution — the plan's §11 graphics list, through
the registry that already compiles into the existing ElementMotion
directives (no grammar growth).

## The whiteboard recipes — the plan's ten, named honestly

`whiteboard/recipes.ts`: the ten choreography shapes (symbol-reveal,
object-annotation, process-flow, growth-chart, person-prop,
warning-alert, compare-states, compound-assembly, handwriting-title,
board-conclusion) with a deterministic classifier (cue tables in
priority order, first hit wins; the fallback cycle rotates by position —
a cue-less board still NAMES its shape, never silent) and the
fail-closed self-check.

THE HONEST CONTRACT: this is the naming/classification layer ABOVE the
one scheduling engine — the compile seam stays the beat-plan's (one
choreography engine; the registry invents no second compile). The
adoption rides D1's receipt rows: the whiteboard lane planner's
plannerMeta.beats carry the recipe name in the reason
("rule: the process-flow recipe boards the deterministic cast — …").
The editor's QC surface can show and repair it; a future slice can let
a picker override pacing.

## The battery growth

- design-system 33 → 39: the band pins (13 components / 11 recipes),
  the items-slot laws (stable-id omission, the junk refusal, the capLine
  law), the planKind correspondence for all 13, the doc-level validator
  gate for the new cards, the compile gate across kinds/orders for the
  new recipes.
- whiteboard-recipes (new, 10 laws): the closed vocabulary, the
  classifier's priority laws, the fallback cycle, the dead-end law, the
  adoption pins, the stroke-IR byte pin.

## Deliberately not here

- The whiteboard recipe's compile-time pacing override — the beat-plan's
  scheduling arithmetic is pinned byte-stable; letting a recipe reshape
  stroke pacing is a design-doc slice with its own parity battery, not a
  registry side effect.
- The lane-plan renderer's new GraphicComponentKind values — comparison
  and timeline ALREADY exist in the declarative vocabulary (the lane
  renders them); no renderer growth was needed.

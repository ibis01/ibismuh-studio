# Responsive layout gates — the WS8 solver lands

Date: 2026-11-26
Scope: the engineering master plan's WS8 ("responsive layout solver") —
per-aspect deliberate layout policies with constraint gates over the
graphics lane, wired into the pre-render QC matrix. Status: IMPLEMENTED —
responsive-layout battery green (14 laws, six suites), unit suite green
(1064/0), qc-gates green (32/32), design-system green, typecheck clean,
lint clean.

## The deficiency this slice removes

The remap law (native-defaults.ts) scales positions by axis and ink by
the width ratio — geometric truth, but not a DELIBERATE layout: a 9:16
board with six simultaneous elements and 12px type is remapped, not
recomposed. The master plan's WS8 asks for constraint-based
recomposition: each supported aspect with a deliberate layout, layout
decisions deterministic, warnings naming the exact component and
constraint, and preview/final selecting the same variant.

## The design: named policies, honest gate classes

**The vocabulary** (`graphics/layout.ts`): the closed aspect set rides
the house surfaces table (1920×1080 / 1080×1920 / 1080×1080) — a
non-house surface refuses BY NAME, never a silent nearest-snap (the QC
row must judge the surface it renders).

**The policies** (the plan's §13, named variants):

- `16:9 → wide-stage`: margins 6%, cap 6 simultaneous, type floor 12px —
  side-by-side relationships and wider timelines.
- `9:16 → portrait-stack`: margins 8%, cap 4, floor 15px — vertical
  stacking, fewer elements, larger type, portrait-safe focal bands.
- `1:1 → centered-square`: margins 7%, cap 5, floor 14px — centered
  hierarchy, simplified diagrams.

**The gate classes, honestly split** — the safe-area gate (element
center outside the aspect's safe rect) and the min-size gate (drawn text
below the aspect floor) FAIL the QC row (unreadable or out-of-band
content is content the viewer cannot get — the readcheck class); the
collision and density ESTIMATES ride the detail as notes (estimates
never block a render — the conservative overlap model is declared, not
measured).

**The teeth live where the validator's clamp stops**: the graphics
validator clamps sizePx to 12..288, so on 16:9 the min-size gate is
belt-and-suspenders — but the 9:16/1:1 floors (15/14) sit ABOVE the
clamp, so a legal 12px text fails there. The battery pins exactly this
relationship.

## The wiring — evidence, not opinion

`graphicsQcMatrix` gains the `G1-LAY-1` row: the solve runs pure over
the validated doc, the row names the aspect and variant, and violations
name scene/element/constraint. Preview and final judge the SAME solve —
the parity ask by construction (the solver is pure; the battery pins
byte-identical reports across runs).

**The scaffold is deliberate, not lucky**: the battery proves the
graphics scaffold's own docs pass the gates on ALL THREE surfaces — the
house placements were already designed for the aspect family.

## The battery (14 laws, six suites)

VOCABULARY / POLICIES / GATES / NOTES / MATRIX / PARITY+DETERMINISM.

## Deliberately not here

- True recomposition (proposing new positions/line-breaks) — the solver
  JUDGES and names constraints; the editor's element tools move
  elements. A repair proposal engine is the plan's follow-up once the
  collision estimator is measured against real frames.
- Whiteboard-lane layout gates — the board's cast is drawn at authored
  board coordinates with its own camera director; the graphics lane is
  where aspect surfaces vary today.

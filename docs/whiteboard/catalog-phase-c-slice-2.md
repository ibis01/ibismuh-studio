# Catalog Phase C, slice 2 — the graphics icon vocabulary rides the band (150 → 200)

**Status:** LANDED (this closes Phase C's second half; the MG design system
core landed as slice 1).
**Audit basis:** the catalog route's Phase C — "the MG design system
(semantic components, animation recipes), the icon vocabulary's own growth"
(worklog PhaseC-S1 stage summary; the audit's graphics band, icons 100-200).
**Receipt battery:** the design-system battery's VOCABULARY suite (5 laws,
`scripts/test-graphics-design-system.mts` suite 6) + the catalog suite
(25/25, its graphics floor law bumped with the wave).

## 1. The question this slice answers

Phase A/B mass-produced the WHITEBOARD library (95 → 145 primitives, 299
catalog rows). The GRAPHICS vocabulary held at 150 — mid-band with room
exactly to the audit's 200 top. This wave lifts it there on the SAME
one-source law, with zero rule theft and zero byte drift: every established
narration's icon pick is identical (unit 1064/0), every new rule claims only
words no earlier rule claims (mechanically pinned), and the catalog rides
349 rows — still inside the audit's 250-400 band.

## 2. What landed

- **50 new icons** (`graphics/icons.ts`, the ONE table — the same frozen
  literal): weather (snowflake, fog, storm-cloud, moon, rainbow, umbrella),
  food and the kitchen (bread, apple, cheese, cup, bowl, bottle, plate,
  cutlery), animals (cat, dog, bird, fish, butterfly), sports (soccer-ball,
  basketball, medal, trophy), music (music-note, drum, guitar), money
  (credit-card, money-bag, coins-stack), tools (saw, shovel, wheelbarrow,
  ladder), time (stopwatch, alarm-clock), nature (flower, mushroom, cactus),
  communication (paper-plane), safety (life-ring, helmet, first-aid-kit),
  the everyday room (chair, bed, door, stairs) and tech (keyboard,
  satellite, antenna, windmill). The authoring discipline held throughout:
  every path ONE stroke (exactly one M, no mid-path teleports — pinned
  mechanically for the WHOLE library), coordinates on the 24 grid, tags
  declaring the teachable concepts for the mechanical catalog derivation.
- **49 mention rules** appended AFTER the established table (first-hit-wins
  keeps every existing pick identical). Every word was mechanically audited
  against all 136 established rules before landing: "rain" belongs to the
  rain-cloud, "music" to the headphones, "first aid"/"emergency" to the
  hospital-cross, "flower" to the plant, "climb" to the mountain, "award"
  to the diploma, "payment" to the money rule, "note" to the notebook, so
  the new rules claim thunder/lightning, melody/song, lifesaver/rescue,
  bloom/tulip, sleep/nap, typing, and so on. Two icons ride WITHOUT a
  mention rule (first-aid-kit: every natural phrase collides with the
  hospital-cross's established claims; the icons remain reachable through
  the catalog search and the LLM planner's prompt — the dead-end law only
  requires rules to name registered icons, never that every icon has a
  rule). The battery pins the theft-scan as a LAW: any future tail rule
  claiming an earlier rule's word fails the suite by name.
- **`iconForScene` exported** — the ONE selection function becomes
  testable where it lives (the battery pins three established narrations'
  picks byte-identically; a drift is named, never silent).
- **The catalog floor law bumps** with the wave (graphics icons ≥ 180 —
  headroom under the 200, so a silent removal cannot pass); the catalog's
  250-400 band law holds at 349 rows (145 whiteboard primitives + 4
  compositions + 200 graphics icons).

## 3. What deliberately did NOT land

- **Pack 3 and beyond** — 349 rows sit upper-mid-band; the band's top is
  reachable (400) without touching any law if boards ask for more.
- **Graphics-lane rules for colliding words** — the theft-scan law is the
  point: a rule that can never fire is a defect, not a feature.
- **A graphics palette seat** — the components/recipes/icons are registry
  vocabulary; the picker UI is the C2 follow-up documented in slice 1.

## 4. Verification receipts (this slice)

- The design-system battery — 33/33 (28 slice-1 laws + the 5 VOCABULARY
  laws; the suite caught two of my own defects before CI: the paths-band
  law I drafted was stricter than the shipped library's reality (existing
  icons run up to 14 paths — the law now pins the shipped band), and the
  ladder rule claimed "climb" (the mountain rule established it — the
  mechanical theft-scan caught it, exactly as designed).
- `npm run test:catalog` — 25/25 (the floor law bumped with the wave).
- `npm run test` — 1064/0 (every pinned planner narration byte-stable).
- placement 27/0 · multipick 16/0 · compounds 15/0 · trace ALL CHECKS
  PASS · profiles ALL CHECKS PASS · typecheck clean · eslint clean ·
  HEALTH 0.

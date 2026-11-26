# Phase B slice 5 — the mass-production wave: S-PAK-2

Date: 2026-11-25
Scope: the audit's mass-production pass — the catalog rides the 250-400
band. Status: IMPLEMENTED — 50 new hand-authored whiteboard assets (the
library 95 → 145 primitives), 50 new mention-matcher rules, the catalog
total 249 → 299 rows, every gate green with zero validator warnings.

## What landed

### The second production pack (`library-pack-2.ts`)

50 stroke-authored assets across the domains the first pack left open:
weather (umbrella, snowflake, lightning-bolt, rainbow, cloud-rain,
thermometer), travel (airplane, sailboat, train-engine, suitcase-travel,
map-scroll, passport-book, hot-air-balloon, road-sign), food (coffee-cup,
bread-loaf, carrot, birthday-cake, fish-catch, ice-cream), sports
(soccer-ball, medal-prize, dumbbell-weights, whistle-coach, bicycle), music
(guitar, drum, music-note, piano-keys, microphone-stage), science
(microscope, telescope, test-tubes, planet-orbit), finance tools
(wallet-purse, credit-card, safe-vault, receipt-paper, calculator),
communication (megaphone-shout, chat-bubbles, pushpin-mark), and everyday
objects (gift-box, puzzle-piece, crown-royal, anchor-steady, brush-paint,
camera-photo, glasses-read, ladder-up).

THE SAME seven authoring laws as the first pack, enforced by the W3
validator at registration (a failing built-in THROWS — there is no second
quality bar): one stroke per path (no mid-path teleport), no self-crossing
paths, stroke width 3-7 round caps in the house palette, closed shapes with
real area, stroke-only art (fill-after-outline trivially satisfied), every
path carries an id, charset-legal ids. The registration receipt: 145
assets, zero duplicates, zero charset violations, loadLibrary warnings
NONE.

The authoring helpers (`P`, `circlePath`, `st`, the house palette) are now
EXPORTED from `library-pack.ts` — one set of tools, both packs.

### The mention matcher

50 new `KEYWORD_PICKS` rules appended AFTER the starter + first-pack rules:
first-hit-wins keeps every existing narration's pick identical (the pinned
S67/S137 unit narrations resolve exactly as before — the unit suite's 1064
laws prove it), and the new rules' words were audited against every earlier
rule so they claim nothing already claimed ("rain" belongs to the droplet
rule, so the cloud-rain rule claims "downpour|drizzle|pouring"; "ship"
belongs to the launch rule, so the sailboat claims "sail|boat|voyage"; the
one narration scan hit — a benchmark's "wall street" — resolves to the
earlier piggy-bank rule on "savings" exactly as before).

### The catalog band

`whiteboardCatalogRows` derives the new rows mechanically (the coverage law
needed no change); the compound and graphics rows ride as before. The
catalog total is now 299 rows (145 primitives + 4 compositions + 150
icons) — inside the audit's 250-400 production band, which the catalog
suite now PINS as a law (`total >= 250 && total <= 400`). The vocabulary
floor rose with the library (>= 130 whiteboard assets).

## What deliberately did NOT land

- **Pack 3 and beyond** — 299 rows sit mid-band; the next wave (if boards
  ask for it) can lift the library toward the band's top without touching
  any law.
- **Per-asset `role` metadata** — the pack is stroke-only outline art; the
  fill/label/arrow roles stay for assets that earn them.
- **Graphics-lane growth** — the icon vocabulary holds its 150; Phase C's
  MG design system (semantic components, animation recipes) is its own
  slice.

## Verification receipts (this slice)

- Registration: 145 primitives · 0 duplicates · 0 charset violations ·
  loadLibrary warnings NONE (the W3 validator, sanitize, sketch pass and
  extraction all pass on every new asset).
- `npm run test:catalog` — 25/25 (the 250-400 band law added).
- `npm run test` — 1064/0 (every pinned planner narration byte-stable).
- placement 27/0 · multipick 16/0 · compounds 15/0 · trace 25/0 · profiles
  22/0 · the full check chain green · drill RTO 481ms · HEALTH 0.
- `npx tsc --noEmit` clean; eslint clean on every touched file.

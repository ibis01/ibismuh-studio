// S-PAK-2 — the Whiteboard production library pack, second wave (Phase B's
// mass-production slice): 50 hand-authored stroke assets across weather,
// travel, food, sports, music, science, finance tools, and communication —
// the domains the first pack left open. The W2 mention matcher
// (whiteboard-planner.ts KEYWORD_PICKS) reads the same ids, so narration can
// call them by concept; the catalog manifest derives one row per asset.
//
// Authoring laws — THE SAME seven the first pack pinned (the W3 validator
// gates every one of these at load; a failing built-in throws):
//   · every <path> is ONE stroke: a single M, no mid-path teleport;
//   · no path crosses itself (separate paths per stroke — crossings
//     BETWEEN paths are legal and common);
//   · stroke width 3–7, round caps, the house palette;
//   · closed shapes close with real area (no degenerate retraces);
//   · stroke-only art: no pure fills, so the fill-after-outline law is
//     trivially satisfied and every stroke rides the hand scheduler;
//   · every path carries an id (the scheduler, events, and repairs
//     address elements by id — an anonymous path is invisible to them);
//   · ids are lowercase + hyphens, charset-legal (no -- or ::).
//
// Coordinates are asset-space (each viewBox); scenes place assets via
// Placement with remapPlacement. The sketch pass retraces these strokes
// at registration like every built-in (tags carry no "traced").

import { P, circlePath, INK, BLUE, RED, TEAL, GOLD, GREEN, st } from "./library-pack";
import type { WhiteboardAsset } from "./assets";

// The second pack's own palette entry (the first pack's house palette
// needed an orange for the carrot; the house carries it once, here).
const ORANGE = "#e76f51";

export const LIBRARY_PACK_2: WhiteboardAsset[] = [
  // ------------------------------------------------------------------
  // weather
  // ------------------------------------------------------------------
  P("umbrella", { w: 120, h: 120 }, ["weather", "rain", "umbrella", "shelter"], `
    <path id="um-canopy" d="M 10 62 Q 60 -8 110 62" ${st(RED, 5)}/>
    <path id="um-rib-l" d="M 10 62 Q 34 54 60 62" ${st(INK, 3)}/>
    <path id="um-rib-r" d="M 110 62 Q 86 54 60 62" ${st(INK, 3)}/>
    <path id="um-pole" d="M 60 12 L 60 104 Q 60 116 48 116 L 44 116" ${st(INK, 4)}/>
  `, { a11y: "An open umbrella with a curved canopy and a hooked handle." }),
  P("snowflake", { w: 120, h: 120 }, ["weather", "snow", "winter", "cold"], `
    <path id="sf-v" d="M 60 15 L 60 105" ${st(BLUE, 4)}/>
    <path id="sf-a" d="M 22 37 L 98 83" ${st(BLUE, 4)}/>
    <path id="sf-b" d="M 98 37 L 22 83" ${st(BLUE, 4)}/>
    <path id="sf-t1" d="M 60 25 L 50 33" ${st(BLUE, 3)}/>
    <path id="sf-t2" d="M 60 25 L 70 33" ${st(BLUE, 3)}/>
    <path id="sf-t3" d="M 60 95 L 50 87" ${st(BLUE, 3)}/>
    <path id="sf-t4" d="M 60 95 L 70 87" ${st(BLUE, 3)}/>
  `, { a11y: "A six-armed snowflake with ticked arms." }),
  P("lightning-bolt", { w: 120, h: 110 }, ["weather", "storm", "lightning", "energy"], `
    <path id="lb-bolt" d="M 68 8 L 40 55 L 58 55 L 46 100 L 84 45 L 62 45 Z" ${st(GOLD, 4)}/>
  `, { a11y: "A jagged lightning bolt, closed and filled by the pen's outline stroke." }),
  P("rainbow", { w: 120, h: 100 }, ["weather", "rainbow", "hope", "color"], `
    <path id="rb-outer" d="M 10 90 A 50 50 0 0 1 110 90" ${st(RED, 5)}/>
    <path id="rb-mid" d="M 22 90 A 38 38 0 0 1 98 90" ${st(GOLD, 5)}/>
    <path id="rb-inner" d="M 34 90 A 26 26 0 0 1 86 90" ${st(TEAL, 5)}/>
  `, { a11y: "Three nested rainbow arcs in red, gold and teal." }),
  P("cloud-rain", { w: 120, h: 100 }, ["weather", "rain", "cloud", "downpour"], `
    <path id="cr-cloud" d="M 15 55 A 14 14 0 0 1 30 33 A 16 16 0 0 1 62 25 A 18 18 0 0 1 95 40 A 12 12 0 0 1 95 55 Z" ${st(INK, 4)}/>
    <path id="cr-d1" d="M 35 68 L 28 88" ${st(BLUE, 3)}/>
    <path id="cr-d2" d="M 55 68 L 48 88" ${st(BLUE, 3)}/>
    <path id="cr-d3" d="M 75 68 L 68 88" ${st(BLUE, 3)}/>
  `, { a11y: "A bumpy rain cloud shedding three drops." }),
  P("thermometer", { w: 120, h: 110 }, ["weather", "temperature", "measure", "heat"], `
    <path id="th-tube" d="M 48 14 L 48 70 A 12 12 0 0 0 72 70 L 72 14" ${st(INK, 4)}/>
    <path id="th-bulb" d="${circlePath(60, 84, 14)}" ${st(RED, 4)}/>
    <path id="th-mercury" d="M 60 32 L 60 84" ${st(RED, 4)}/>
    <path id="th-tk1" d="M 78 26 L 86 26" ${st(INK, 3)}/>
    <path id="th-tk2" d="M 78 42 L 86 42" ${st(INK, 3)}/>
    <path id="th-tk3" d="M 78 58 L 86 58" ${st(INK, 3)}/>
  `, { a11y: "A thermometer with a red mercury column and scale ticks." }),

  // ------------------------------------------------------------------
  // travel
  // ------------------------------------------------------------------
  P("airplane", { w: 120, h: 110 }, ["travel", "airplane", "flight", "fly"], `
    <path id="ap-body" d="M 60 8 C 66 20 66 30 64 42 L 64 88 C 64 96 62 100 60 102 C 58 100 56 96 56 88 L 56 42 C 54 30 54 20 60 8 Z" ${st(INK, 4)}/>
    <path id="ap-wing-r" d="M 62 50 L 104 64" ${st(BLUE, 4)}/>
    <path id="ap-wing-l" d="M 58 50 L 16 64" ${st(BLUE, 4)}/>
    <path id="ap-tail-r" d="M 62 84 L 88 94" ${st(BLUE, 4)}/>
    <path id="ap-tail-l" d="M 58 84 L 32 94" ${st(BLUE, 4)}/>
  `, { a11y: "A top-down airplane with swept wings and tail fins." }),
  P("sailboat", { w: 120, h: 110 }, ["travel", "boat", "sail", "voyage"], `
    <path id="sb-hull" d="M 15 72 L 105 72 L 92 92 L 28 92 Z" ${st(INK, 4)}/>
    <path id="sb-mast" d="M 60 70 L 60 12" ${st(INK, 4)}/>
    <path id="sb-sail-r" d="M 62 14 Q 92 30 88 66 L 62 66" ${st(RED, 4)}/>
    <path id="sb-sail-l" d="M 58 18 Q 34 34 38 66 L 58 66" ${st(BLUE, 4)}/>
  `, { a11y: "A sailboat with two curved sails on one mast." }),
  P("train-engine", { w: 120, h: 110 }, ["travel", "train", "railway", "steam"], `
    <path id="te-body" d="M 15 40 L 85 40 L 85 80 L 15 80 Z" ${st(INK, 4)}/>
    <path id="te-cab" d="M 62 18 L 84 18 L 84 40 L 62 40 Z" ${st(INK, 4)}/>
    <path id="te-chimney" d="M 28 40 L 28 26 L 40 26 L 40 40" ${st(INK, 4)}/>
    <path id="te-w1" d="${circlePath(30, 88, 10)}" ${st(RED, 4)}/>
    <path id="te-w2" d="${circlePath(70, 88, 10)}" ${st(RED, 4)}/>
    <path id="te-rail" d="M 8 100 L 112 100" ${st(BLUE, 3)}/>
  `, { a11y: "A steam engine with a cab, chimney and two driving wheels on a rail." }),
  P("suitcase-travel", { w: 120, h: 105 }, ["travel", "suitcase", "trip", "packing"], `
    <path id="sc-case" d="M 15 40 L 105 40 L 105 90 L 15 90 Z" ${st(INK, 4)}/>
    <path id="sc-handle" d="M 42 40 L 42 28 Q 42 22 48 22 L 72 22 Q 78 22 78 28 L 78 40" ${st(INK, 4)}/>
    <path id="sc-strap-l" d="M 35 40 L 35 90" ${st(RED, 3)}/>
    <path id="sc-strap-r" d="M 85 40 L 85 90" ${st(RED, 3)}/>
  `, { a11y: "A suitcase with a curved handle and two red straps." }),
  P("map-scroll", { w: 130, h: 110 }, ["travel", "map", "route", "directions"], `
    <path id="ms-edge" d="M 10 25 L 45 15 L 80 25 L 115 15 L 115 85 L 80 95 L 45 85 L 10 95 Z" ${st(INK, 4)}/>
    <path id="ms-fold-l" d="M 45 15 L 45 85" ${st(BLUE, 3)}/>
    <path id="ms-fold-r" d="M 80 25 L 80 95" ${st(BLUE, 3)}/>
    <path id="ms-route" d="M 25 70 Q 60 45 95 60" ${st(RED, 3)}/>
    <path id="ms-dot1" d="${circlePath(25, 70, 4)}" ${st(RED, 3)}/>
    <path id="ms-dot2" d="${circlePath(95, 60, 4)}" ${st(RED, 3)}/>
  `, { a11y: "A folded map with a red route between two dots." }),
  P("passport-book", { w: 120, h: 110 }, ["travel", "passport", "visa", "border"], `
    <path id="pb-cover" d="M 30 12 L 92 12 Q 100 12 100 20 L 100 88 Q 100 96 92 96 L 30 96 Q 22 96 22 88 L 22 20 Q 22 12 30 12 Z" ${st(INK, 4)}/>
    <path id="pb-globe" d="${circlePath(61, 54, 18)}" ${st(BLUE, 3)}/>
    <path id="pb-meridian" d="M 61 36 L 61 72" ${st(BLUE, 3)}/>
    <path id="pb-equator" d="M 43 54 L 79 54" ${st(BLUE, 3)}/>
  `, { a11y: "A passport book with a globe emblem on the cover." }),
  P("hot-air-balloon", { w: 120, h: 115 }, ["travel", "balloon", "float", "sky"], `
    <path id="hb-envelope" d="${circlePath(60, 42, 33)}" ${st(RED, 5)}/>
    <path id="hb-rope-l" d="M 44 72 L 48 86" ${st(INK, 3)}/>
    <path id="hb-rope-r" d="M 76 72 L 72 86" ${st(INK, 3)}/>
    <path id="hb-basket" d="M 48 86 L 72 86 L 70 100 L 50 100 Z" ${st(GOLD, 4)}/>
  `, { a11y: "A hot-air balloon: a round envelope, two ropes, a woven basket." }),
  P("road-sign", { w: 120, h: 115 }, ["travel", "road", "sign", "milestone"], `
    <path id="rs-post" d="M 60 55 L 60 108" ${st(INK, 4)}/>
    <path id="rs-board" d="M 25 10 L 95 10 L 95 55 L 25 55 Z" ${st(GREEN, 5)}/>
    <path id="rs-arrow" d="M 38 32 L 74 32" ${st(INK, 4)}/>
    <path id="rs-head" d="M 66 24 L 78 32 L 66 40" ${st(INK, 4)}/>
  `, { a11y: "A green road sign on a post, arrow pointing right." }),

  // ------------------------------------------------------------------
  // food
  // ------------------------------------------------------------------
  P("coffee-cup", { w: 120, h: 100 }, ["food", "coffee", "cafe", "break"], `
    <path id="cc-body" d="M 28 42 L 34 86 L 76 86 L 82 42 Z" ${st(INK, 4)}/>
    <path id="cc-handle" d="M 82 52 Q 100 52 100 64 Q 100 76 82 74" ${st(INK, 4)}/>
    <path id="cc-steam1" d="M 45 30 Q 42 22 46 14" ${st(BLUE, 3)}/>
    <path id="cc-steam2" d="M 62 30 Q 59 22 63 14" ${st(BLUE, 3)}/>
  `, { a11y: "A coffee cup with a looped handle and two steam curls." }),
  P("bread-loaf", { w: 120, h: 95 }, ["food", "bread", "bakery", "bake"], `
    <path id="bl-loaf" d="M 15 60 Q 15 38 40 38 L 95 38 Q 108 38 108 55 L 108 75 L 15 75 Z" ${st(GOLD, 5)}/>
    <path id="bl-sl1" d="M 45 52 L 60 44" ${st(INK, 3)}/>
    <path id="bl-sl2" d="M 65 54 L 80 46" ${st(INK, 3)}/>
    <path id="bl-sl3" d="M 85 56 L 98 48" ${st(INK, 3)}/>
  `, { a11y: "A bread loaf with three diagonal scoring slashes." }),
  P("carrot", { w: 120, h: 110 }, ["food", "carrot", "vegetable", "healthy"], `
    <path id="ca-body" d="M 52 14 L 70 14 L 60 94 Q 58 100 56 94 Z" ${st(ORANGE, 5)}/>
    <path id="ca-lf1" d="M 58 14 L 50 4" ${st(GREEN, 3)}/>
    <path id="ca-lf2" d="M 62 14 L 62 2" ${st(GREEN, 3)}/>
    <path id="ca-lf3" d="M 68 14 L 74 5" ${st(GREEN, 3)}/>
  `, { a11y: "A tapering orange carrot with three green tops." }),
  P("birthday-cake", { w: 120, h: 105 }, ["food", "cake", "birthday", "celebrate"], `
    <path id="bc-base" d="M 20 60 L 100 60 L 100 92 L 20 92 Z" ${st(INK, 4)}/>
    <path id="bc-top" d="M 32 38 L 88 38 L 88 60 L 32 60 Z" ${st(INK, 4)}/>
    <path id="bc-c1" d="M 45 38 L 45 26" ${st(BLUE, 3)}/>
    <path id="bc-c2" d="M 60 38 L 60 26" ${st(BLUE, 3)}/>
    <path id="bc-c3" d="M 75 38 L 75 26" ${st(BLUE, 3)}/>
    <path id="bc-f1" d="${circlePath(45, 21, 4)}" ${st(GOLD, 3)}/>
    <path id="bc-f2" d="${circlePath(60, 21, 4)}" ${st(GOLD, 3)}/>
    <path id="bc-f3" d="${circlePath(75, 21, 4)}" ${st(GOLD, 3)}/>
  `, { a11y: "A two-tier cake with three candles and round flames." }),
  P("fish-catch", { w: 120, h: 95 }, ["food", "fish", "sea", "catch"], `
    <path id="fc-body" d="M 20 55 Q 40 32 68 38 Q 86 42 90 55 Q 86 68 68 72 Q 40 78 20 55 Z" ${st(TEAL, 4)}/>
    <path id="fc-tail" d="M 90 55 L 108 42 L 104 55 L 108 68 Z" ${st(TEAL, 4)}/>
    <path id="fc-eye" d="${circlePath(78, 50, 3.5)}" ${st(INK, 3)}/>
  `, { a11y: "A fish with a notched tail and a small round eye." }),
  P("ice-cream", { w: 120, h: 110 }, ["food", "ice cream", "dessert", "sweet"], `
    <path id="ic-cone" d="M 40 55 L 60 98 L 80 55 Z" ${st(GOLD, 4)}/>
    <path id="ic-scoop" d="M 40 55 A 20 20 0 0 1 80 55" ${st(RED, 4)}/>
    <path id="ic-cherry" d="${circlePath(60, 28, 5)}" ${st(RED, 3)}/>
  `, { a11y: "An ice cream cone with one scooped dome and a cherry." }),

  // ------------------------------------------------------------------
  // sports
  // ------------------------------------------------------------------
  P("soccer-ball", { w: 120, h: 120 }, ["sports", "soccer", "football", "game"], `
    <path id="so-ball" d="${circlePath(60, 55, 40)}" ${st(INK, 4)}/>
    <path id="so-penta" d="M 60 35 L 74 46 L 68 62 L 52 62 L 46 46 Z" ${st(INK, 4)}/>
    <path id="so-s1" d="M 46 46 L 32 40" ${st(INK, 3)}/>
    <path id="so-s2" d="M 74 46 L 88 40" ${st(INK, 3)}/>
    <path id="so-s3" d="M 52 62 L 45 78" ${st(INK, 3)}/>
    <path id="so-s4" d="M 68 62 L 75 78" ${st(INK, 3)}/>
    <path id="so-s5" d="M 60 35 L 60 20" ${st(INK, 3)}/>
  `, { a11y: "A soccer ball: one circle, a center pentagon, five spokes." }),
  P("medal-prize", { w: 120, h: 110 }, ["sports", "medal", "win", "podium"], `
    <path id="md-rib-l" d="M 45 10 L 52 40" ${st(RED, 4)}/>
    <path id="md-rib-r" d="M 75 10 L 68 40" ${st(RED, 4)}/>
    <path id="md-coin" d="${circlePath(60, 62, 24)}" ${st(GOLD, 4)}/>
    <path id="md-star" d="M 60 48 L 64 58 L 75 58 L 66 65 L 70 76 L 60 69 L 50 76 L 54 65 L 45 58 L 56 58 Z" ${st(INK, 3)}/>
  `, { a11y: "A gold medal on two red ribbons, starred in the middle." }),
  P("dumbbell-weights", { w: 120, h: 105 }, ["sports", "gym", "workout", "exercise"], `
    <path id="db-bar" d="M 25 55 L 95 55" ${st(INK, 4)}/>
    <path id="db-plate-1l" d="M 14 38 L 14 72" ${st(INK, 5)}/>
    <path id="db-plate-2l" d="M 22 32 L 22 78" ${st(INK, 5)}/>
    <path id="db-plate-1r" d="M 96 38 L 96 72" ${st(INK, 5)}/>
    <path id="db-plate-2r" d="M 104 32 L 104 78" ${st(INK, 5)}/>
  `, { a11y: "A dumbbell: one bar, two plates on each side." }),
  P("whistle-coach", { w: 120, h: 95 }, ["sports", "whistle", "coach", "call"], `
    <path id="wh-body" d="M 26 44 L 88 44 L 88 74 L 26 74 Z" ${st(INK, 4)}/>
    <path id="wh-mouth" d="M 88 50 L 104 50 L 104 60 L 88 60 Z" ${st(INK, 4)}/>
    <path id="wh-hole" d="${circlePath(46, 59, 8)}" ${st(RED, 3)}/>
  `, { a11y: "A referee's whistle with a mouthpiece and a round hole." }),
  P("bicycle", { w: 120, h: 105 }, ["sports", "bike", "cycling", "ride"], `
    <path id="bi-wheel-f" d="${circlePath(30, 75, 18)}" ${st(INK, 4)}/>
    <path id="bi-wheel-b" d="${circlePath(90, 75, 18)}" ${st(INK, 4)}/>
    <path id="bi-frame" d="M 30 75 L 55 45 L 85 45 L 90 75 Z" ${st(RED, 4)}/>
    <path id="bi-seat" d="M 55 45 L 50 36 L 42 36" ${st(INK, 4)}/>
    <path id="bi-bar" d="M 85 45 L 92 36 L 100 36" ${st(INK, 4)}/>
    <path id="bi-crank" d="M 55 75 L 55 88" ${st(INK, 3)}/>
  `, { a11y: "A bicycle: two wheels, a diamond frame, seat and handlebar." }),

  // ------------------------------------------------------------------
  // music
  // ------------------------------------------------------------------
  P("guitar", { w: 120, h: 115 }, ["music", "guitar", "acoustic", "band"], `
    <path id="gu-lower" d="${circlePath(60, 74, 26)}" ${st(GOLD, 4)}/>
    <path id="gu-upper" d="${circlePath(60, 44, 17)}" ${st(GOLD, 4)}/>
    <path id="gu-hole" d="${circlePath(60, 58, 7)}" ${st(INK, 3)}/>
    <path id="gu-neck-l" d="M 47 28 L 42 8" ${st(INK, 4)}/>
    <path id="gu-neck-r" d="M 73 28 L 78 8" ${st(INK, 4)}/>
    <path id="gu-head" d="M 42 8 L 78 8" ${st(INK, 4)}/>
  `, { a11y: "An acoustic guitar: figure-eight body, sound hole, neck." }),
  P("drum", { w: 120, h: 105 }, ["music", "drum", "percussion", "rhythm"], `
    <path id="dr-head" d="M 25 40 A 35 10 0 0 1 95 40" ${st(RED, 4)}/>
    <path id="dr-side-l" d="M 25 40 L 25 82" ${st(INK, 4)}/>
    <path id="dr-side-r" d="M 95 40 L 95 82" ${st(INK, 4)}/>
    <path id="dr-bottom" d="M 25 82 A 35 10 0 0 0 95 82" ${st(INK, 4)}/>
    <path id="dr-l1" d="M 35 47 L 35 79" ${st(BLUE, 3)}/>
    <path id="dr-l2" d="M 60 50 L 60 82" ${st(BLUE, 3)}/>
    <path id="dr-l3" d="M 85 47 L 85 79" ${st(BLUE, 3)}/>
    <path id="dr-st1" d="M 20 20 L 45 38" ${st(GOLD, 3)}/>
    <path id="dr-st2" d="M 100 20 L 75 38" ${st(GOLD, 3)}/>
  `, { a11y: "A drum shell with a curved head, tension lines and two sticks." }),
  P("music-note", { w: 120, h: 110 }, ["music", "song", "melody", "tune"], `
    <path id="mn-beam" d="M 70 15 L 95 25" ${st(INK, 5)}/>
    <path id="mn-stem1" d="M 70 15 L 70 72" ${st(INK, 4)}/>
    <path id="mn-stem2" d="M 95 25 L 95 60" ${st(INK, 4)}/>
    <path id="mn-head1" d="${circlePath(63, 73, 9)}" ${st(INK, 4)}/>
    <path id="mn-head2" d="${circlePath(88, 61, 9)}" ${st(INK, 4)}/>
  `, { a11y: "A beamed pair of eighth notes with two round heads." }),
  P("piano-keys", { w: 120, h: 95 }, ["music", "piano", "keys", "melody"], `
    <path id="pk-case" d="M 15 30 L 15 75 L 105 75 L 105 30 Z" ${st(INK, 4)}/>
    <path id="pk-k1" d="M 30 30 L 30 75" ${st(INK, 3)}/>
    <path id="pk-k2" d="M 45 30 L 45 75" ${st(INK, 3)}/>
    <path id="pk-k3" d="M 60 30 L 60 75" ${st(INK, 3)}/>
    <path id="pk-k4" d="M 75 30 L 75 75" ${st(INK, 3)}/>
    <path id="pk-k5" d="M 90 30 L 90 75" ${st(INK, 3)}/>
    <path id="pk-b1" d="M 25 30 L 25 52 L 35 52 L 35 30 Z" ${st(INK, 3)}/>
    <path id="pk-b2" d="M 40 30 L 40 52 L 50 52 L 50 30 Z" ${st(INK, 3)}/>
    <path id="pk-b3" d="M 70 30 L 70 52 L 80 52 L 80 30 Z" ${st(INK, 3)}/>
    <path id="pk-b4" d="M 85 30 L 85 52 L 95 52 L 95 30 Z" ${st(INK, 3)}/>
  `, { a11y: "A piano keyboard: white key dividers with four raised black keys." }),
  P("microphone-stage", { w: 120, h: 110 }, ["music", "microphone", "podcast", "sing"], `
    <path id="mi-head" d="${circlePath(60, 32, 20)}" ${st(INK, 4)}/>
    <path id="mi-grid1" d="M 44 30 L 76 30" ${st(BLUE, 3)}/>
    <path id="mi-grid2" d="M 46 20 L 74 20" ${st(BLUE, 3)}/>
    <path id="mi-grid3" d="M 60 12 L 60 52" ${st(BLUE, 3)}/>
    <path id="mi-clip" d="M 50 52 L 70 52" ${st(INK, 4)}/>
    <path id="mi-stand" d="M 60 52 L 60 80" ${st(INK, 4)}/>
    <path id="mi-base" d="M 42 94 Q 60 80 78 94" ${st(INK, 4)}/>
  `, { a11y: "A stage microphone on a stand with a gridded head." }),

  // ------------------------------------------------------------------
  // science
  // ------------------------------------------------------------------
  P("microscope", { w: 120, h: 110 }, ["science", "microscope", "biology", "lab"], `
    <path id="mi2-base" d="M 22 92 L 98 92" ${st(INK, 4)}/>
    <path id="mi2-arm" d="M 60 92 L 60 70 Q 60 55 70 48" ${st(INK, 4)}/>
    <path id="mi2-eye" d="M 38 14 L 50 26" ${st(BLUE, 4)}/>
    <path id="mi2-tube" d="M 42 20 L 64 46" ${st(BLUE, 4)}/>
    <path id="mi2-obj" d="M 62 44 L 70 56" ${st(INK, 4)}/>
    <path id="mi2-stage" d="M 30 62 L 80 62" ${st(INK, 4)}/>
    <path id="mi2-light" d="${circlePath(60, 78, 8)}" ${st(GOLD, 3)}/>
  `, { a11y: "A microscope: base, curved arm, tilted tube, stage and light." }),
  P("telescope", { w: 130, h: 110 }, ["science", "telescope", "astronomy", "stars"], `
    <path id="tl-top" d="M 22 72 L 82 32" ${st(INK, 5)}/>
    <path id="tl-bottom" d="M 34 80 L 94 40" ${st(INK, 5)}/>
    <path id="tl-cap" d="M 82 32 L 94 40" ${st(INK, 4)}/>
    <path id="tl-leg1" d="M 44 63 L 36 98" ${st(GOLD, 4)}/>
    <path id="tl-leg2" d="M 62 49 L 80 98" ${st(GOLD, 4)}/>
    <path id="tl-leg3" d="M 53 56 L 57 98" ${st(GOLD, 4)}/>
  `, { a11y: "A telescope tube on a three-legged tripod, aimed at the sky." }),
  P("test-tubes", { w: 120, h: 105 }, ["science", "chemistry", "experiment", "lab"], `
    <path id="tt-rack" d="M 20 70 L 100 70 L 100 88 L 20 88 Z" ${st(INK, 4)}/>
    <path id="tt-tube1" d="M 35 25 L 35 72 A 8 8 0 0 0 51 72 L 51 25" ${st(BLUE, 4)}/>
    <path id="tt-tube2" d="M 62 25 L 62 72 A 8 8 0 0 0 78 72 L 78 25" ${st(BLUE, 4)}/>
    <path id="tt-liq1" d="M 37 55 L 49 55" ${st(TEAL, 3)}/>
    <path id="tt-liq2" d="M 64 55 L 76 55" ${st(GOLD, 3)}/>
  `, { a11y: "Two rounded test tubes in a rack, one teal sample, one gold." }),
  P("planet-orbit", { w: 120, h: 110 }, ["science", "planet", "orbit", "space"], `
    <path id="po-ring-top" d="M 12 55 A 48 16 0 0 1 108 55" ${st(BLUE, 3)}/>
    <path id="po-ring-bottom" d="M 12 55 A 48 16 0 0 0 108 55" ${st(BLUE, 3)}/>
    <path id="po-planet" d="${circlePath(60, 55, 22)}" ${st(TEAL, 4)}/>
    <path id="po-moon" d="${circlePath(96, 42, 6)}" ${st(GOLD, 3)}/>
  `, { a11y: "A planet on an elliptical orbit ring with a small moon." }),

  // ------------------------------------------------------------------
  // finance tools
  // ------------------------------------------------------------------
  P("wallet-purse", { w: 120, h: 105 }, ["finance", "wallet", "purse", "money"], `
    <path id="wp-body" d="M 15 38 L 100 38 L 100 86 L 15 86 Z" ${st(GOLD, 4)}/>
    <path id="wp-pocket" d="M 72 52 L 100 52 L 100 76 L 72 76 Z" ${st(GOLD, 4)}/>
    <path id="wp-snap" d="${circlePath(79, 64, 3.5)}" ${st(INK, 3)}/>
  `, { a11y: "A gold wallet with a snap-closed coin pocket." }),
  P("credit-card", { w: 120, h: 95 }, ["finance", "credit", "debit", "payment"], `
    <path id="card-edge" d="M 12 30 L 108 30 L 108 80 L 12 80 Z" ${st(INK, 4)}/>
    <path id="card-stripe" d="M 12 44 L 108 44" ${st(INK, 5)}/>
    <path id="card-chip" d="M 22 58 L 36 58 L 36 70 L 22 70 Z" ${st(GOLD, 3)}/>
    <path id="card-sign" d="M 48 66 L 92 66" ${st(BLUE, 3)}/>
  `, { a11y: "A bank card with a magnetic stripe, chip and signature line." }),
  P("safe-vault", { w: 120, h: 110 }, ["finance", "vault", "secure", "safe"], `
    <path id="sv-box" d="M 15 20 L 105 20 L 105 92 L 15 92 Z" ${st(INK, 5)}/>
    <path id="sv-door" d="${circlePath(60, 54, 22)}" ${st(BLUE, 4)}/>
    <path id="sv-sp1" d="M 60 32 L 60 44" ${st(BLUE, 3)}/>
    <path id="sv-sp2" d="M 60 64 L 60 76" ${st(BLUE, 3)}/>
    <path id="sv-sp3" d="M 38 54 L 50 54" ${st(BLUE, 3)}/>
    <path id="sv-sp4" d="M 70 54 L 82 54" ${st(BLUE, 3)}/>
    <path id="sv-knob" d="${circlePath(60, 54, 6)}" ${st(RED, 3)}/>
  `, { a11y: "A safe with a spoked vault door and a red center knob." }),
  P("receipt-paper", { w: 120, h: 110 }, ["finance", "receipt", "invoice", "billing"], `
    <path id="rp-paper" d="M 30 10 L 90 10 L 90 88 L 82 95 L 74 88 L 66 95 L 58 88 L 50 95 L 42 88 L 30 95 Z" ${st(INK, 4)}/>
    <path id="rp-l1" d="M 40 28 L 80 28" ${st(BLUE, 3)}/>
    <path id="rp-l2" d="M 40 42 L 80 42" ${st(BLUE, 3)}/>
    <path id="rp-l3" d="M 40 56 L 72 56" ${st(BLUE, 3)}/>
    <path id="rp-total" d="M 40 74 L 80 74" ${st(RED, 3)}/>
  `, { a11y: "A receipt with a zigzag torn bottom and four printed lines." }),
  P("calculator", { w: 120, h: 110 }, ["finance", "calculator", "math", "count"], `
    <path id="cl-body" d="M 25 12 L 95 12 L 95 98 L 25 98 Z" ${st(INK, 4)}/>
    <path id="cl-screen" d="M 33 20 L 87 20 L 87 34 L 33 34 Z" ${st(BLUE, 3)}/>
    <path id="cl-k1" d="${circlePath(38, 52, 6)}" ${st(INK, 3)}/>
    <path id="cl-k2" d="${circlePath(60, 52, 6)}" ${st(INK, 3)}/>
    <path id="cl-k3" d="${circlePath(82, 52, 6)}" ${st(INK, 3)}/>
    <path id="cl-k4" d="${circlePath(38, 78, 6)}" ${st(INK, 3)}/>
    <path id="cl-k5" d="${circlePath(60, 78, 6)}" ${st(INK, 3)}/>
    <path id="cl-k6" d="${circlePath(82, 78, 6)}" ${st(INK, 3)}/>
  `, { a11y: "A calculator with a screen and six round keys." }),

  // ------------------------------------------------------------------
  // communication
  // ------------------------------------------------------------------
  P("megaphone-shout", { w: 120, h: 105 }, ["communication", "megaphone", "announce", "broadcast"], `
    <path id="mg-bell" d="M 22 42 L 62 30 L 62 70 L 22 58 Z" ${st(RED, 4)}/>
    <path id="mg-handle" d="M 40 66 L 40 82 L 52 82" ${st(INK, 4)}/>
    <path id="mg-wave1" d="M 74 38 Q 82 50 74 62" ${st(BLUE, 3)}/>
    <path id="mg-wave2" d="M 86 30 Q 98 50 86 70" ${st(BLUE, 3)}/>
  `, { a11y: "A megaphone cone with a handle and two sound waves." }),
  P("chat-bubbles", { w: 120, h: 115 }, ["communication", "chat", "talk", "dialogue"], `
    <path id="cb-b1" d="M 15 20 L 70 20 Q 80 20 80 30 L 80 52 Q 80 62 70 62 L 40 62 L 31 75 L 34 62 L 24 62 Q 15 62 15 52 Z" ${st(INK, 4)}/>
    <path id="cb-b2" d="M 52 74 L 98 74 Q 106 74 106 82 L 106 94 Q 106 102 98 102 L 72 102 L 64 110 L 66 102 Q 52 102 52 94 Z" ${st(BLUE, 4)}/>
  `, { a11y: "Two overlapping speech bubbles, one ink and one blue." }),
  P("pushpin-mark", { w: 120, h: 110 }, ["communication", "pin", "bookmark", "mark"], `
    <path id="pp-head" d="${circlePath(60, 30, 16)}" ${st(RED, 4)}/>
    <path id="pp-flange" d="M 48 46 L 72 46" ${st(INK, 4)}/>
    <path id="pp-needle" d="M 60 46 L 60 92" ${st(INK, 3)}/>
  `, { a11y: "A pushpin: round red head, flange, and a needle." }),
  P("gift-box", { w: 120, h: 105 }, ["generic", "gift", "donation", "present"], `
    <path id="gb-lid" d="M 20 40 L 100 40 L 100 55 L 20 55 Z" ${st(RED, 4)}/>
    <path id="gb-box" d="M 28 55 L 92 55 L 92 92 L 28 92 Z" ${st(RED, 4)}/>
    <path id="gb-rib1" d="M 54 40 L 54 92" ${st(GOLD, 3)}/>
    <path id="gb-rib2" d="M 66 40 L 66 92" ${st(GOLD, 3)}/>
    <path id="gb-bow-l" d="M 60 38 Q 46 20 38 30 Q 36 38 60 38" ${st(GOLD, 3)}/>
    <path id="gb-bow-r" d="M 60 38 Q 74 20 82 30 Q 84 38 60 38" ${st(GOLD, 3)}/>
  `, { a11y: "A gift box with a lid, a ribbon cross and a two-loop bow." }),
  P("puzzle-piece", { w: 120, h: 105 }, ["generic", "puzzle", "solution", "solve"], `
    <path id="pz-piece" d="M 25 40 L 45 40 Q 42 25 55 25 Q 68 25 65 40 L 95 40 L 95 85 L 25 85 Z" ${st(BLUE, 4)}/>
  `, { a11y: "A puzzle piece with one round knob on its top edge." }),
  P("crown-royal", { w: 120, h: 105 }, ["generic", "crown", "leader", "royal"], `
    <path id="cr-spikes" d="M 20 75 L 15 35 L 40 55 L 60 25 L 80 55 L 105 35 L 100 75 Z" ${st(GOLD, 4)}/>
    <path id="cr-band" d="M 20 75 L 100 75 L 100 88 L 20 88 Z" ${st(GOLD, 4)}/>
    <path id="cr-j1" d="${circlePath(38, 66, 4)}" ${st(RED, 3)}/>
    <path id="cr-j2" d="${circlePath(60, 66, 4)}" ${st(RED, 3)}/>
    <path id="cr-j3" d="${circlePath(82, 66, 4)}" ${st(RED, 3)}/>
  `, { a11y: "A three-spike crown with a banded base and three jewels." }),
  P("anchor-steady", { w: 120, h: 110 }, ["generic", "anchor", "stability", "grounded"], `
    <path id="an-ring" d="${circlePath(60, 14, 8)}" ${st(INK, 4)}/>
    <path id="an-shank" d="M 60 22 L 60 80" ${st(INK, 4)}/>
    <path id="an-bar" d="M 40 34 L 80 34" ${st(INK, 4)}/>
    <path id="an-flukes" d="M 30 62 Q 30 84 60 88 Q 90 84 90 62" ${st(INK, 4)}/>
    <path id="an-tip-l" d="M 30 62 L 24 54" ${st(INK, 4)}/>
    <path id="an-tip-r" d="M 90 62 L 96 54" ${st(INK, 4)}/>
  `, { a11y: "A ship anchor: ring, shank, crossbar and curved flukes." }),
  P("brush-paint", { w: 120, h: 110 }, ["art", "brush", "paint", "artist"], `
    <path id="br-handle-l" d="M 50 8 L 50 30" ${st(GOLD, 4)}/>
    <path id="br-handle-r" d="M 60 8 L 60 30" ${st(GOLD, 4)}/>
    <path id="br-ferrule" d="M 48 30 L 62 30 L 62 44 L 48 44 Z" ${st(INK, 3)}/>
    <path id="br-bristles" d="M 48 44 L 48 62 Q 55 70 62 62 L 62 44" ${st(INK, 4)}/>
    <path id="br-stroke" d="M 30 85 Q 45 78 60 85 Q 75 92 90 85" ${st(TEAL, 4)}/>
  `, { a11y: "A paint brush over a teal painted stroke." }),
  P("camera-photo", { w: 120, h: 100 }, ["art", "camera", "photo", "picture"], `
    <path id="cm-body" d="M 15 35 L 105 35 L 105 85 L 15 85 Z" ${st(INK, 4)}/>
    <path id="cm-hump" d="M 40 35 L 48 24 L 66 24 L 72 35" ${st(INK, 4)}/>
    <path id="cm-lens" d="${circlePath(60, 60, 17)}" ${st(BLUE, 4)}/>
    <path id="cm-inner" d="${circlePath(60, 60, 9)}" ${st(BLUE, 3)}/>
    <path id="cm-button" d="${circlePath(95, 42, 4)}" ${st(RED, 3)}/>
  `, { a11y: "A camera with a top hump, a two-ring lens and a shutter button." }),
  P("glasses-read", { w: 130, h: 105 }, ["generic", "glasses", "read", "vision"], `
    <path id="gl-lens-l" d="${circlePath(38, 55, 20)}" ${st(INK, 4)}/>
    <path id="gl-lens-r" d="${circlePath(92, 55, 20)}" ${st(INK, 4)}/>
    <path id="gl-bridge" d="M 58 55 Q 65 48 72 55" ${st(INK, 4)}/>
    <path id="gl-arm-l" d="M 18 55 L 8 45" ${st(INK, 4)}/>
    <path id="gl-arm-r" d="M 112 55 L 122 45" ${st(INK, 4)}/>
  `, { a11y: "A pair of round spectacles with a curved bridge." }),
  P("ladder-up", { w: 120, h: 115 }, ["generic", "ladder", "steps", "progress"], `
    <path id="ld-rail-l" d="M 40 8 L 40 105" ${st(GOLD, 5)}/>
    <path id="ld-rail-r" d="M 80 8 L 80 105" ${st(GOLD, 5)}/>
    <path id="ld-r1" d="M 40 25 L 80 25" ${st(INK, 4)}/>
    <path id="ld-r2" d="M 40 45 L 80 45" ${st(INK, 4)}/>
    <path id="ld-r3" d="M 40 65 L 80 65" ${st(INK, 4)}/>
    <path id="ld-r4" d="M 40 85 L 80 85" ${st(INK, 4)}/>
  `, { a11y: "A ladder with two gold rails and four rungs." }),
];

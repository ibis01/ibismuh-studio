// S-PAK — the Whiteboard production library pack (the audit's Priority 1,
// whiteboard half): the first structured expansion beyond the benchmark
// starter set. 48 hand-authored stroke assets across education, business,
// agriculture, health, technology, nature, and everyday-generic concepts —
// the W2 mention matcher (whiteboard-planner.ts KEYWORD_PICKS) reads the
// same ids, so narration can call them by concept.
//
// Authoring laws (the W3 validator gates every one of these at load — a
// failing built-in is a programming error and loadLibrary throws):
//   · every <path> is ONE stroke: a single M, no mid-path teleport;
//   · no path crosses itself (separate paths per stroke — crossings
//     BETWEEN paths are legal and common);
//   · stroke width 3–7, round caps, the house palette;
//   · closed shapes close with real area (no degenerate retraces);
//   · stroke-only art: no pure fills, so the fill-after-outline law is
//     trivially satisfied and every stroke rides the hand scheduler;
//   · arrows: the head is the LAST path and sits at the stem's tip (the
//     orientation law);
//   · every path carries an id (the scheduler, events, and repairs
//     address elements by id — an anonymous path is invisible to them).
//
// Coordinates are asset-space (each viewBox); scenes place assets via
// Placement with remapPlacement. The sketch pass retraces these strokes
// at registration like every built-in (tags carry no "traced").

import { sanitizeSvg } from "./svg";
import type { WhiteboardAsset } from "./assets";

export const P = (
  id: string,
  viewBox: { w: number; h: number },
  tags: string[],
  svg: string,
  meta: Partial<Pick<WhiteboardAsset, "role" | "alts" | "a11y" | "durWeight" | "framing">> = {}
): WhiteboardAsset => ({ id, viewBox, tags, svg: sanitizeSvg(svg), ...meta });

// Circle on the 120 grid: two half-arcs, one continuous stroke.
export const circlePath = (cx: number, cy: number, r: number): string =>
  `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`;

export const INK = "#1d3557";
export const BLUE = "#457b9d";
export const RED = "#e63946";
export const TEAL = "#2a9d8f";
export const GOLD = "#e9c46a";
export const GREEN = "#84a98c";

export const st = (color: string, width = 4): string =>
  `fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;

export const LIBRARY_PACK: WhiteboardAsset[] = [
  // ------------------------------------------------------------------
  // education
  // ------------------------------------------------------------------
  P("abacus", { w: 120, h: 100 }, ["education", "math", "count", "abacus", "numbers"], `
    <path id="ab-frame" d="M 10 15 L 110 15 L 110 85 L 10 85 Z" ${st(INK, 4)}/>
    <path id="ab-rail" d="M 10 38 L 110 38" ${st(BLUE, 3)}/>
    <path id="ab-rail2" d="M 10 62 L 110 62" ${st(BLUE, 3)}/>
    <path id="ab-bead1" d="${circlePath(24, 38, 7)}" ${st(RED, 3)}/>
    <path id="ab-bead2" d="${circlePath(40, 38, 7)}" ${st(RED, 3)}/>
    <path id="ab-bead3" d="${circlePath(72, 62, 7)}" ${st(TEAL, 3)}/>
    <path id="ab-bead4" d="${circlePath(88, 62, 7)}" ${st(TEAL, 3)}/>
  `, { alts: ["counting frame", "counting beads"], a11y: "A counting abacus with rows of beads on rails." }),
  P("apple", { w: 120, h: 120 }, ["education", "food", "fruit", "apple", "teacher"], `
    <path id="ap-body-l" d="M 60 45 A 27 27 0 1 0 60 99" ${st(RED, 4.5)}/>
    <path id="ap-body-r" d="M 60 45 A 27 27 0 1 1 60 99" ${st(RED, 4.5)}/>
    <path id="ap-stem" d="M 60 44 C 58 36, 60 28, 66 22" ${st(GREEN, 4)}/>
    <path id="ap-leaf" d="M 64 30 C 70 22, 84 20, 90 26 C 84 34, 70 36, 64 30 Z" ${st(GREEN, 3.5)}/>
  `, { alts: ["fruit", "teacher's apple"], a11y: "An apple with a stem and one leaf." }),
  P("backpack-wb", { w: 120, h: 120 }, ["education", "school", "bag", "student", "travel"], `
    <path id="bp-body" d="M 30 45 C 30 28, 42 18, 60 18 C 78 18, 90 28, 90 45 L 90 100 L 30 100 Z" ${st(INK, 4)}/>
    <path id="bp-flap" d="M 30 52 L 90 52" ${st(BLUE, 3.5)}/>
    <path id="bp-strap" d="M 44 45 C 44 32, 50 26, 60 26" ${st(BLUE, 3.5)}/>
    <path id="bp-buckle" d="M 50 52 L 50 62 L 70 62 L 70 52" ${st(GOLD, 3.5)}/>
  `, { alts: ["school bag", "rucksack"], a11y: "A student backpack with a front pocket." }),
  P("blackboard-wb", { w: 140, h: 110 }, ["education", "classroom", "teaching", "board", "school"], `
    <path id="bb-frame" d="M 15 12 L 125 12 L 125 76 L 15 76 Z" ${st(INK, 4)}/>
    <path id="bb-line1" d="M 25 30 L 80 30" ${st(GOLD, 3.5)}/>
    <path id="bb-line2" d="M 25 44 L 100 44" ${st(GOLD, 3.5)}/>
    <path id="bb-line3" d="M 25 58 L 65 58" ${st(GOLD, 3.5)}/>
    <path id="bb-leg-l" d="M 30 76 L 30 104" ${st(BLUE, 4)}/>
    <path id="bb-leg-r" d="M 110 76 L 110 104" ${st(BLUE, 4)}/>
  `, { alts: ["chalkboard", "classroom board"], a11y: "A classroom blackboard with chalk lines and legs." }),
  P("book-stack", { w: 130, h: 100 }, ["education", "books", "reading", "study", "library"], `
    <path id="bs-b1" d="M 15 84 L 115 84 L 115 68 L 15 68 Z" ${st(RED, 4)}/>
    <path id="bs-b2" d="M 22 68 L 108 68 L 108 52 L 22 52 Z" ${st(BLUE, 4)}/>
    <path id="bs-b3" d="M 18 52 L 112 52 L 112 36 L 18 36 Z" ${st(TEAL, 4)}/>
    <path id="bs-tie" d="M 62 36 L 62 84" ${st(GOLD, 3)}/>
  `, { alts: ["stacked books", "reading pile"], a11y: "Three stacked books tied with a ribbon." }),
  P("calendar-page", { w: 120, h: 120 }, ["calendar", "date", "schedule", "month", "planning", "time"], `
    <path id="cp-page" d="M 18 30 L 102 30 L 102 104 L 18 104 Z" ${st(INK, 4)}/>
    <path id="cp-top" d="M 18 52 L 102 52" ${st(BLUE, 3.5)}/>
    <path id="cp-ring-l" d="M 36 30 L 36 18" ${st(INK, 4)}/>
    <path id="cp-ring-r" d="M 84 30 L 84 18" ${st(INK, 4)}/>
    <path id="cp-marks" d="M 34 68 L 46 68" ${st(RED, 3.5)}/>
    <path id="cp-marks2" d="M 56 68 L 68 68" ${st(GOLD, 3.5)}/>
    <path id="cp-circle-mark" d="${circlePath(84, 84, 10)}" ${st(RED, 3.5)}/>
  `, { alts: ["calendar", "date planner"], a11y: "A calendar page with a circled date." }),
  P("certificate", { w: 130, h: 110 }, ["education", "diploma", "certificate", "award", "degree"], `
    <path id="ct-paper" d="M 15 12 L 115 12 L 115 86 L 15 86 Z" ${st(INK, 4)}/>
    <path id="ct-line1" d="M 28 32 L 102 32" ${st(BLUE, 3.5)}/>
    <path id="ct-line2" d="M 28 46 L 84 46" ${st(BLUE, 3.5)}/>
    <path id="ct-seal" d="${circlePath(96, 70, 12)}" ${st(GOLD, 3.5)}/>
    <path id="ct-ribbon" d="M 92 82 L 90 102" ${st(RED, 3.5)}/>
    <path id="ct-ribbon2" d="M 100 82 L 102 102" ${st(RED, 3.5)}/>
  `, { alts: ["diploma", "award document"], a11y: "A certificate with a gold seal and red ribbons." }),
  P("graduation-scroll", { w: 120, h: 100 }, ["education", "graduation", "scroll", "degree", "achieve"], `
    <path id="gs-body" d="M 20 50 C 20 40, 100 40, 100 50 C 100 60, 20 60, 20 50 Z" ${st(INK, 4)}/>
    <path id="gs-end-l" d="M 20 50 L 20 66" ${st(BLUE, 4)}/>
    <path id="gs-end-r" d="M 100 50 L 100 66" ${st(BLUE, 4)}/>
    <path id="gs-band" d="M 52 38 L 52 62" ${st(RED, 3.5)}/>
  `, { alts: ["diploma scroll", "degree scroll"], a11y: "A rolled graduation scroll with a ribbon band." }),

  // ------------------------------------------------------------------
  // business and finance
  // ------------------------------------------------------------------
  P("briefcase-wb", { w: 120, h: 100 }, ["business", "work", "office", "career", "briefcase"], `
    <path id="bc-case" d="M 15 35 L 105 35 L 105 92 L 15 92 Z" ${st(INK, 4)}/>
    <path id="bc-handle" d="M 45 35 L 45 22 C 45 18, 50 15, 60 15 C 70 15, 75 18, 75 22 L 75 35" ${st(INK, 4)}/>
    <path id="bc-clasp" d="M 52 55 L 68 55 L 68 66 L 52 66 Z" ${st(GOLD, 3.5)}/>
    <path id="bc-seam" d="M 15 48 L 105 48" ${st(BLUE, 3)}/>
  `, { alts: ["work case", "office bag"], a11y: "A business briefcase with a handle and clasp." }),
  P("chart-line-up", { w: 120, h: 120 }, ["business", "chart", "trend", "revenue", "data", "growth"], `
    <path id="cl-axis-y" d="M 22 15 L 22 100" ${st(INK, 4)}/>
    <path id="cl-axis-x" d="M 22 100 L 105 100" ${st(INK, 4)}/>
    <path id="cl-line" d="M 30 88 L 50 66 L 66 76 L 96 34" ${st(TEAL, 4.5)}/>
    <path id="cl-dot" d="${circlePath(96, 34, 5)}" ${st(TEAL, 3.5)}/>
  `, { alts: ["line chart", "rising graph"], a11y: "A rising line chart with an end-point dot." }),
  P("handshake-arms", { w: 140, h: 80 }, ["business", "deal", "partnership", "trust", "agreement", "meeting"], `
    <path id="ha-arm-l" d="M 10 30 L 48 42 C 56 44, 62 48, 68 54" ${st(INK, 4.5)}/>
    <path id="ha-arm-r" d="M 130 30 L 92 42 C 84 44, 78 48, 72 54" ${st(BLUE, 4.5)}/>
    <path id="ha-grip-l" d="M 68 54 C 62 60, 54 60, 50 54" ${st(INK, 4)}/>
    <path id="ha-grip-r" d="M 72 54 C 78 60, 86 60, 90 54" ${st(BLUE, 4)}/>
  `, { alts: ["deal shake", "partnership"], a11y: "Two arms meeting in a handshake." }),
  P("money-bag", { w: 110, h: 120 }, ["business", "money", "cash", "wealth", "funds", "savings"], `
    <path id="mb-body" d="M 42 40 C 30 52, 24 66, 24 82 C 24 102, 40 110, 55 110 C 70 110, 86 102, 86 82 C 86 66, 80 52, 68 40" ${st(INK, 4.5)}/>
    <path id="mb-neck" d="M 42 40 L 68 40" ${st(INK, 4)}/>
    <path id="mb-tie" d="M 40 48 C 48 54, 62 54, 70 48" ${st(GOLD, 3.5)}/>
    <path id="mb-coin" d="${circlePath(55, 82, 14)}" ${st(TEAL, 3.5)}/>
  `, { alts: ["sack of money", "cash bag"], a11y: "A tied money sack with a coin mark." }),
  P("piggy-bank-wb", { w: 130, h: 100 }, ["business", "savings", "piggy", "bank", "budget", "save"], `
    <path id="pb-body" d="M 35 50 C 35 32, 52 22, 72 22 C 92 22, 105 34, 105 52 C 105 70, 92 82, 72 82 L 45 82 C 40 82, 35 78, 35 70 Z" ${st(RED, 4.5)}/>
    <path id="pb-slot" d="M 55 30 L 75 30" ${st(INK, 4)}/>
    <path id="pb-snout" d="M 105 48 C 112 48, 114 54, 108 58" ${st(RED, 4)}/>
    <path id="pb-ear" d="M 62 22 C 60 14, 66 12, 70 18" ${st(RED, 3.5)}/>
    <path id="pb-leg" d="M 50 82 L 50 96" ${st(INK, 4)}/>
    <path id="pb-leg2" d="M 88 82 L 88 96" ${st(INK, 4)}/>
  `, { alts: ["savings bank", "piggy"], a11y: "A piggy bank with a coin slot and legs." }),
  P("presentation-board", { w: 130, h: 120 }, ["business", "presentation", "pitch", "report", "meeting", "easel"], `
    <path id="pr-board" d="M 18 15 L 112 15 L 112 72 L 18 72 Z" ${st(INK, 4)}/>
    <path id="pr-bar" d="M 30 58 L 48 58 L 48 40 L 66 40 L 66 48 L 84 48 L 84 30" ${st(TEAL, 4)}/>
    <path id="pr-leg-l" d="M 40 72 L 28 108" ${st(BLUE, 4)}/>
    <path id="pr-leg-r" d="M 90 72 L 102 108" ${st(BLUE, 4)}/>
    <path id="pr-leg-m" d="M 65 72 L 65 104" ${st(BLUE, 4)}/>
  `, { alts: ["easel chart", "pitch board"], a11y: "A presentation easel with a rising bar sketch." }),

  // ------------------------------------------------------------------
  // agriculture
  // ------------------------------------------------------------------
  P("sprout", { w: 120, h: 120 }, ["agriculture", "seedling", "sprout", "grow", "new", "beginning"], `
    <path id="sp-stem" d="M 60 105 L 60 62" ${st(GREEN, 4.5)}/>
    <path id="sp-leaf-l" d="M 60 62 C 58 46, 44 36, 28 38 C 30 54, 44 64, 60 62 Z" ${st(GREEN, 4)}/>
    <path id="sp-leaf-r" d="M 60 62 C 62 48, 74 40, 88 42 C 86 56, 74 64, 60 62 Z" ${st(GREEN, 4)}/>
    <path id="sp-soil" d="M 34 105 L 86 105" ${st(GOLD, 4)}/>
  `, { alts: ["seedling", "young plant"], a11y: "A two-leaf sprout rising from soil." }),
  P("sun-nature", { w: 120, h: 120 }, ["agriculture", "sun", "sunny", "day", "weather", "light"], `
    <path id="sn-disc" d="${circlePath(60, 60, 24)}" ${st(GOLD, 4.5)}/>
    <path id="sn-ray1" d="M 60 20 L 60 10" ${st(GOLD, 4)}/>
    <path id="sn-ray2" d="M 60 100 L 60 110" ${st(GOLD, 4)}/>
    <path id="sn-ray3" d="M 20 60 L 10 60" ${st(GOLD, 4)}/>
    <path id="sn-ray4" d="M 100 60 L 110 60" ${st(GOLD, 4)}/>
    <path id="sn-ray5" d="M 33 33 L 26 26" ${st(GOLD, 4)}/>
    <path id="sn-ray6" d="M 87 87 L 94 94" ${st(GOLD, 4)}/>
    <path id="sn-ray7" d="M 33 87 L 26 94" ${st(GOLD, 4)}/>
    <path id="sn-ray8" d="M 87 33 L 94 26" ${st(GOLD, 4)}/>
  `, { alts: ["sun", "sunshine"], a11y: "A radiant sun with eight rays." }),
  P("water-can", { w: 130, h: 110 }, ["agriculture", "watering", "irrigation", "garden", "care", "water"], `
    <path id="wc-body" d="M 35 40 L 85 40 L 85 88 L 35 88 Z" ${st(TEAL, 4)}/>
    <path id="wc-spout" d="M 35 52 L 14 34" ${st(TEAL, 4)}/>
    <path id="wc-head" d="M 14 34 C 12 30, 16 26, 20 28" ${st(TEAL, 4)}/>
    <path id="wc-handle" d="M 85 48 C 100 48, 104 62, 92 70" ${st(TEAL, 4)}/>
    <path id="wc-drop1" d="M 18 46 C 17 50, 19 52, 18 56" ${st(BLUE, 3)}/>
    <path id="wc-drop2" d="M 26 52 C 25 56, 27 58, 26 62" ${st(BLUE, 3)}/>
  `, { alts: ["watering can", "garden can"], a11y: "A watering can pouring two drops." }),
  P("barn", { w: 140, h: 110 }, ["agriculture", "farm", "barn", "rural", "storage"], `
    <path id="bn-roof" d="M 20 48 L 70 20 L 120 48" ${st(RED, 4.5)}/>
    <path id="bn-wall" d="M 28 48 L 28 100 L 112 100 L 112 48" ${st(RED, 4)}/>
    <path id="bn-door" d="M 56 100 L 56 66 L 84 66 L 84 100" ${st(INK, 4)}/>
    <path id="bn-cross1" d="M 56 66 L 84 100" ${st(INK, 3)}/>
    <path id="bn-cross2" d="M 84 66 L 56 100" ${st(INK, 3)}/>
  `, { alts: ["farm barn", "ranch building"], a11y: "A red barn with a crossed double door." }),
  P("corn-cob", { w: 110, h: 130 }, ["agriculture", "corn", "maize", "crop", "harvest", "food"], `
    <path id="cc-cob" d="M 55 28 C 68 40, 68 78, 55 98 C 42 78, 42 40, 55 28 Z" ${st(GOLD, 4)}/>
    <path id="cc-grain1" d="M 48 50 L 62 50" ${st(GOLD, 3)}/>
    <path id="cc-grain2" d="M 47 66 L 63 66" ${st(GOLD, 3)}/>
    <path id="cc-grain3" d="M 48 82 L 62 82" ${st(GOLD, 3)}/>
    <path id="cc-husk-l" d="M 55 98 C 44 106, 36 108, 30 106 C 34 96, 42 92, 52 94" ${st(GREEN, 4)}/>
    <path id="cc-husk-r" d="M 55 98 C 66 106, 74 108, 80 106 C 76 96, 68 92, 58 94" ${st(GREEN, 4)}/>
  `, { alts: ["maize", "ear of corn"], a11y: "An ear of corn with husk leaves." }),
  P("tractor-wb", { w: 140, h: 110 }, ["agriculture", "tractor", "farm", "machinery", "equipment"], `
    <path id="tr-body" d="M 20 55 L 20 40 L 62 40 L 78 58 L 108 58" ${st(TEAL, 4.5)}/>
    <path id="tr-cab" d="M 26 40 L 26 26 L 52 26 L 52 40" ${st(TEAL, 4)}/>
    <path id="tr-chimney" d="M 40 26 L 40 16" ${st(INK, 4)}/>
    <path id="tr-wheel-big" d="${circlePath(40, 78, 22)}" ${st(INK, 4.5)}/>
    <path id="tr-wheel-small" d="${circlePath(96, 84, 14)}" ${st(INK, 4)}/>
    <path id="tr-hub" d="${circlePath(40, 78, 6)}" ${st(INK, 3)}/>
  `, { alts: ["farm tractor"], a11y: "A tractor with a big rear wheel and small front wheel." }),
  P("chicken-egg", { w: 120, h: 110 }, ["agriculture", "chicken", "hen", "egg", "poultry", "farm"], `
    <path id="ce-egg" d="M 38 88 C 28 88, 24 76, 26 64 C 28 50, 36 42, 44 42 C 52 42, 60 50, 62 64 C 64 76, 60 88, 50 88 Z" ${st(GOLD, 4)}/>
    <path id="ce-body" d="M 72 88 C 66 80, 68 64, 78 58 C 76 48, 84 42, 92 46 C 102 42, 110 52, 106 62 C 112 70, 108 84, 98 88 Z" ${st(RED, 4)}/>
    <path id="ce-comb" d="M 86 46 C 85 40, 89 38, 92 42" ${st(RED, 3.5)}/>
    <path id="ce-eye" d="${circlePath(93, 55, 2)}" ${st(INK, 3)}/>
    <path id="ce-leg" d="M 84 88 L 84 98" ${st(RED, 3.5)}/>
  `, { alts: ["hen and egg", "poultry"], a11y: "A hen beside an egg." }),
  P("rain-sprout", { w: 130, h: 120 }, ["agriculture", "rain", "weather", "irrigation", "grow", "climate"], `
    <path id="rs-cloud" d="M 30 44 C 20 44, 14 38, 15 30 C 16 23, 22 18, 30 18 C 34 10, 46 8, 54 14 C 62 10, 72 14, 74 22 C 82 23, 88 30, 86 37 C 84 43, 76 44, 70 44" ${st(BLUE, 4)}/>
    <path id="rs-drop1" d="M 40 54 C 39 58, 41 61, 40 64" ${st(BLUE, 3.5)}/>
    <path id="rs-drop2" d="M 60 54 C 59 58, 61 61, 60 64" ${st(BLUE, 3.5)}/>
    <path id="rs-stem" d="M 62 104 L 62 84" ${st(GREEN, 4)}/>
    <path id="rs-leaf-l" d="M 62 84 C 58 74, 50 70, 40 72 C 42 82, 50 86, 62 84 Z" ${st(GREEN, 3.5)}/>
    <path id="rs-leaf-r" d="M 62 84 C 66 76, 74 72, 84 74 C 82 82, 74 86, 62 84 Z" ${st(GREEN, 3.5)}/>
    <path id="rs-ground" d="M 40 104 L 84 104" ${st(GOLD, 4)}/>
  `, { alts: ["rain on crops", "watering rain"], a11y: "A rain cloud watering a young sprout." }),

  // ------------------------------------------------------------------
  // health
  // ------------------------------------------------------------------
  P("medical-cross", { w: 120, h: 120 }, ["health", "medical", "hospital", "care", "emergency", "doctor"], `
    <path id="mc-ring" d="${circlePath(60, 60, 42)}" ${st(RED, 4.5)}/>
    <path id="mc-v" d="M 60 34 L 60 86" ${st(RED, 9)}/>
    <path id="mc-h" d="M 34 60 L 86 60" ${st(RED, 9)}/>
  `, { role: "outline", alts: ["health cross", "first aid"], a11y: "A medical cross inside a circle." }),
  P("heartbeat-line", { w: 140, h: 80 }, ["health", "pulse", "heartbeat", "fitness", "cardio", "vitals"], `
    <path id="hb-line" d="M 10 44 L 44 44 L 56 18 L 74 68 L 86 32 L 94 44 L 130 44" ${st(RED, 4.5)}/>
  `, { alts: ["ecg", "pulse trace"], a11y: "A heartbeat pulse trace." }),
  P("pill-capsule", { w: 130, h: 80 }, ["health", "medicine", "pill", "drug", "dose", "pharmacy"], `
    <path id="pc-body-l" d="M 45 24 A 22 22 0 1 0 45 56" ${st(RED, 4.5)}/>
    <path id="pc-body-r" d="M 85 24 A 22 22 0 1 1 85 56" ${st(GOLD, 4.5)}/>
    <path id="pc-top" d="M 45 24 L 85 24" ${st(INK, 4)}/>
    <path id="pc-bottom" d="M 45 56 L 85 56" ${st(INK, 4)}/>
    <path id="pc-split" d="M 65 24 L 65 56" ${st(INK, 3.5)}/>
  `, { alts: ["capsule", "tablet"], a11y: "A two-tone medicine capsule." }),
  P("stethoscope-wb", { w: 120, h: 130 }, ["health", "stethoscope", "doctor", "checkup", "diagnosis"], `
    <path id="sc-tube-l" d="M 34 15 L 34 45 C 34 62, 46 74, 62 74 C 78 74, 88 66, 88 50 L 88 44" ${st(BLUE, 4)}/>
    <path id="sc-tube-r" d="M 52 15 L 52 40" ${st(BLUE, 4)}/>
    <path id="sc-tail" d="M 88 44 L 88 78" ${st(BLUE, 4)}/>
    <path id="sc-cup" d="${circlePath(88, 100, 14)}" ${st(BLUE, 4)}/>
  `, { alts: ["doctor scope"], a11y: "A stethoscope tube ending in a listening cup." }),
  P("band-aid", { w: 130, h: 80 }, ["health", "bandage", "first-aid", "heal", "recover", "injury"], `
    <path id="ba-pad" d="M 30 22 L 100 22 L 100 58 L 30 58 Z" ${st(GOLD, 4)}/>
    <path id="ba-mat" d="M 55 22 L 75 22 L 75 58 L 55 58 Z" ${st(RED, 3.5)}/>
    <path id="ba-hole1" d="${circlePath(62, 34, 2)}" ${st(INK, 2.5)}/>
    <path id="ba-hole2" d="${circlePath(68, 46, 2)}" ${st(INK, 2.5)}/>
  `, { alts: ["plaster", "sticking plaster"], a11y: "A bandage with a center pad and holes." }),
  P("dna-strand", { w: 110, h: 130 }, ["health", "dna", "genetics", "science", "biology", "gene"], `
    <path id="dn-strand-l" d="M 38 12 C 38 40, 72 52, 72 78 C 72 96, 50 104, 44 118" ${st(TEAL, 4)}/>
    <path id="dn-strand-r" d="M 72 12 C 72 40, 38 52, 38 78 C 38 96, 60 104, 66 118" ${st(BLUE, 4)}/>
    <path id="dn-rung1" d="M 44 30 L 66 30" ${st(INK, 3)}/>
    <path id="dn-rung2" d="M 52 64 L 58 64" ${st(INK, 3)}/>
    <path id="dn-rung3" d="M 46 98 L 64 98" ${st(INK, 3)}/>
  `, { alts: ["genetic helix"], a11y: "A DNA double helix with rungs." }),

  // ------------------------------------------------------------------
  // technology
  // ------------------------------------------------------------------
  P("computer-screen", { w: 130, h: 120 }, ["technology", "computer", "laptop", "digital", "software", "screen"], `
    <path id="cs-frame" d="M 18 15 L 112 15 L 112 82 L 18 82 Z" ${st(INK, 4)}/>
    <path id="cs-cursor" d="M 34 34 L 62 34" ${st(TEAL, 3.5)}/>
    <path id="cs-cursor2" d="M 34 48 L 74 48" ${st(TEAL, 3.5)}/>
    <path id="cs-cursor3" d="M 34 62 L 52 62" ${st(GOLD, 3.5)}/>
    <path id="cs-stand" d="M 55 82 L 55 98" ${st(INK, 4)}/>
    <path id="cs-base" d="M 35 98 L 75 98" ${st(INK, 4)}/>
  `, { alts: ["monitor", "desktop"], a11y: "A computer monitor with lines of code." }),
  P("smartphone-wb", { w: 80, h: 130 }, ["technology", "phone", "mobile", "call", "app", "device"], `
    <path id="sm-body" d="M 20 12 L 60 12 L 60 118 L 20 118 Z" ${st(INK, 4)}/>
    <path id="sm-screen" d="M 26 30 L 54 30 L 54 100 L 26 100 Z" ${st(TEAL, 3.5)}/>
    <path id="sm-msg" d="M 30 46 L 50 46" ${st(BLUE, 3)}/>
    <path id="sm-msg2" d="M 30 58 L 44 58" ${st(BLUE, 3)}/>
    <path id="sm-btn" d="${circlePath(40, 110, 4)}" ${st(INK, 3)}/>
  `, { alts: ["mobile phone", "cellphone"], a11y: "A smartphone with a message on screen." }),
  P("wifi-waves", { w: 130, h: 110 }, ["technology", "wifi", "wireless", "signal", "internet", "network"], `
    <path id="wf-arc1" d="M 25 62 C 45 42, 85 42, 105 62" ${st(BLUE, 4)}/>
    <path id="wf-arc2" d="M 38 76 C 52 62, 78 62, 92 76" ${st(BLUE, 4)}/>
    <path id="wf-dot" d="${circlePath(65, 92, 6)}" ${st(TEAL, 4)}/>
    <path id="wf-arc0" d="M 12 48 C 40 22, 90 22, 118 48" ${st(TEAL, 4)}/>
  `, { alts: ["wireless signal", "network waves"], a11y: "Three arcs of a wifi signal over a dot." }),
  P("gear-cog", { w: 120, h: 120 }, ["technology", "gear", "machine", "engine", "process", "system"], `
    <path id="gc-ring" d="${circlePath(60, 60, 30)}" ${st(INK, 4.5)}/>
    <path id="gc-hub" d="${circlePath(60, 60, 10)}" ${st(BLUE, 4)}/>
    <path id="gc-t1" d="M 60 30 L 60 16" ${st(INK, 5)}/>
    <path id="gc-t2" d="M 60 90 L 60 104" ${st(INK, 5)}/>
    <path id="gc-t3" d="M 30 60 L 16 60" ${st(INK, 5)}/>
    <path id="gc-t4" d="M 90 60 L 104 60" ${st(INK, 5)}/>
    <path id="gc-t5" d="M 39 39 L 29 29" ${st(INK, 5)}/>
    <path id="gc-t6" d="M 81 81 L 91 91" ${st(INK, 5)}/>
    <path id="gc-t7" d="M 39 81 L 29 91" ${st(INK, 5)}/>
    <path id="gc-t8" d="M 81 39 L 91 29" ${st(INK, 5)}/>
  `, { alts: ["cog", "settings wheel"], a11y: "A gear wheel with eight teeth and a hub." }),
  P("robot-head", { w: 120, h: 110 }, ["technology", "robot", "ai", "automation", "machine", "bot"], `
    <path id="rh-head" d="M 25 35 L 95 35 L 95 90 L 25 90 Z" ${st(INK, 4)}/>
    <path id="rh-eye-l" d="${circlePath(46, 56, 7)}" ${st(TEAL, 3.5)}/>
    <path id="rh-eye-r" d="${circlePath(74, 56, 7)}" ${st(TEAL, 3.5)}/>
    <path id="rh-mouth" d="M 46 76 L 74 76" ${st(BLUE, 3.5)}/>
    <path id="rh-antenna" d="M 60 35 L 60 18" ${st(INK, 4)}/>
    <path id="rh-bulb" d="${circlePath(60, 12, 6)}" ${st(GOLD, 3.5)}/>
    <path id="rh-ear-l" d="M 25 58 L 12 58" ${st(INK, 4)}/>
    <path id="rh-ear-r" d="M 95 58 L 108 58" ${st(INK, 4)}/>
  `, { alts: ["bot head", "ai robot"], a11y: "A robot head with round eyes and an antenna." }),
  P("cloud-server", { w: 140, h: 110 }, ["technology", "cloud", "server", "hosting", "data", "backup"], `
    <path id="clb-cloud" d="M 34 42 C 24 42, 18 36, 19 28 C 20 21, 26 16, 34 16 C 38 8, 50 6, 58 12 C 66 8, 76 12, 78 20 C 86 21, 92 28, 90 35 C 88 41, 80 42, 74 42" ${st(BLUE, 4)}/>
    <path id="clb-server" d="M 40 62 L 100 62 L 100 96 L 40 96 Z" ${st(INK, 4)}/>
    <path id="clb-slot" d="M 48 74 L 72 74" ${st(TEAL, 3.5)}/>
    <path id="clb-slot2" d="M 48 86 L 62 86" ${st(TEAL, 3.5)}/>
    <path id="clb-link" d="M 60 46 C 60 52, 62 56, 66 58" ${st(TEAL, 3)}/>
  `, { alts: ["cloud storage", "hosted server"], a11y: "A cloud above a server box." }),

  // ------------------------------------------------------------------
  // nature and environment
  // ------------------------------------------------------------------
  P("tree-oak", { w: 120, h: 130 }, ["nature", "tree", "forest", "environment", "wood", "park"], `
    <path id="to-crown" d="${circlePath(60, 46, 32)}" ${st(GREEN, 4.5)}/>
    <path id="to-trunk" d="M 60 78 L 60 118" ${st(INK, 5)}/>
    <path id="to-branch-l" d="M 60 96 C 52 92, 46 90, 40 90" ${st(INK, 4)}/>
    <path id="to-branch-r" d="M 60 88 C 68 84, 74 82, 80 82" ${st(INK, 4)}/>
    <path id="to-ground" d="M 34 118 L 86 118" ${st(GOLD, 4)}/>
  `, { alts: ["oak tree", "big tree"], a11y: "A leafy tree with branches over ground." }),
  P("leaf-single", { w: 120, h: 120 }, ["nature", "leaf", "plant", "eco", "green", "organic"], `
    <path id="lf-blade" d="M 60 104 C 30 96, 18 66, 22 38 C 50 34, 84 44, 94 70 C 88 92, 76 102, 60 104 Z" ${st(GREEN, 4.5)}/>
    <path id="lf-midrib" d="M 28 44 C 44 60, 62 78, 84 92" ${st(INK, 3.5)}/>
  `, { alts: ["green leaf", "plant leaf"], a11y: "A single leaf with a midrib." }),
  P("mountain-peaks", { w: 140, h: 110 }, ["nature", "mountain", "peak", "summit", "challenge", "climb"], `
    <path id="mp-peak-l" d="M 12 100 L 52 26 L 78 74" ${st(INK, 4.5)}/>
    <path id="mp-peak-r" d="M 66 100 L 96 44 L 128 100" ${st(INK, 4.5)}/>
    <path id="mp-snow" d="M 44 42 L 52 34 L 60 42" ${st(BLUE, 3.5)}/>
    <path id="mp-base" d="M 12 100 L 128 100" ${st(GOLD, 4)}/>
  `, { alts: ["mountains", "peaks"], a11y: "Two mountain peaks with a snow cap." }),
  P("droplet", { w: 110, h: 130 }, ["nature", "water", "drop", "rain", "liquid", "resources"], `
    <path id="dr-body" d="M 55 14 C 55 14, 26 52, 26 80 C 26 100, 39 114, 55 114 C 71 114, 84 100, 84 80 C 84 52, 55 14, 55 14 Z" ${st(BLUE, 4.5)}/>
    <path id="dr-shine" d="M 40 78 C 40 88, 44 96, 52 100" ${st(TEAL, 3.5)}/>
  `, { alts: ["water drop", "tear"], a11y: "A water droplet with a shine." }),
  P("recycle-arrows", { w: 120, h: 120 }, ["nature", "recycle", "environment", "sustainable", "renewal", "circular"], `
    <path id="rc-top" d="M 45 42 L 60 20 L 75 42" ${st(TEAL, 4.5)}/>
    <path id="rc-top-head" d="M 68 34 L 76 44 L 64 46" ${st(TEAL, 4)}/>
    <path id="rc-right" d="M 80 52 L 102 78 L 76 82" ${st(TEAL, 4.5)}/>
    <path id="rc-right-head" d="M 88 74 L 74 84 L 86 92" ${st(TEAL, 4)}/>
    <path id="rc-left" d="M 42 54 L 22 82 L 46 88" ${st(TEAL, 4.5)}/>
    <path id="rc-left-head" d="M 36 78 L 50 90 L 36 94" ${st(TEAL, 4)}/>
  `, { alts: ["recycling loop", "renewal arrows"], a11y: "Three arrows chasing in a triangle." }),

  // ------------------------------------------------------------------
  // everyday generic
  // ------------------------------------------------------------------
  P("arrow-zigzag", { w: 140, h: 110 }, ["generic", "arrow", "fluctuate", "zigzag", "path", "change"], `
    <path id="az-stem" d="M 12 92 L 42 56 L 66 84 L 100 44" ${st(INK, 5)}/>
    <path id="az-head" d="M 88 40 L 102 42 L 96 56" ${st(INK, 5)}/>
  `, { role: "arrow", alts: ["winding arrow"], a11y: "A zigzag arrow ending at an arrowhead." }),
  P("arrow-loop", { w: 120, h: 120 }, ["generic", "arrow", "loop", "cycle", "repeat", "iterate"], `
    <path id="al-stem" d="M 60 98 A 38 38 0 1 1 92 74" ${st(BLUE, 5)}/>
    <path id="al-head" d="M 80 62 L 94 76 L 76 88" ${st(BLUE, 5)}/>
  `, { role: "arrow", alts: ["cycle arrow", "repeat arrow"], a11y: "A circular arrow indicating a loop." }),
  P("balance-scale-wb", { w: 130, h: 120 }, ["generic", "balance", "compare", "fair", "justice", "versus"], `
    <path id="bs-pole" d="M 65 25 L 65 105" ${st(INK, 4.5)}/>
    <path id="bs-base" d="M 45 105 L 85 105" ${st(INK, 4.5)}/>
    <path id="bs-beam" d="M 25 32 L 105 32" ${st(INK, 4.5)}/>
    <path id="bs-pan-l" d="M 25 32 A 13 13 0 0 0 51 32" ${st(BLUE, 4)}/>
    <path id="bs-pan-r" d="M 79 32 A 13 13 0 0 0 105 32" ${st(BLUE, 4)}/>
    <path id="bs-drop" d="M 25 32 L 25 44" ${st(BLUE, 3)}/>
    <path id="bs-drop-r" d="M 105 32 L 105 44" ${st(BLUE, 3)}/>
  `, { alts: ["scales", "weighing scale"], a11y: "A balance scale with two pans." }),
  P("bell-ring", { w: 120, h: 120 }, ["generic", "bell", "alert", "notification", "ring", "reminder"], `
    <path id="be-body" d="M 30 74 C 30 52, 38 38, 60 38 C 82 38, 90 52, 90 74" ${st(GOLD, 4.5)}/>
    <path id="be-rim" d="M 24 74 L 96 74" ${st(GOLD, 4.5)}/>
    <path id="be-top" d="M 60 38 L 60 26" ${st(INK, 4)}/>
    <path id="be-clapper" d="M 56 82 C 58 88, 62 88, 64 82" ${st(INK, 3.5)}/>
    <path id="be-ding-l" d="M 16 46 L 24 54" ${st(BLUE, 3.5)}/>
    <path id="be-ding-r" d="M 104 46 L 96 54" ${st(BLUE, 3.5)}/>
  `, { alts: ["notification bell", "alarm bell"], a11y: "A ringing bell with sound strokes." }),
  P("cup-trophy", { w: 120, h: 120 }, ["generic", "trophy", "win", "award", "success", "champion", "achieve"], `
    <path id="tr-cup" d="M 38 25 L 82 25 C 82 50, 74 64, 60 64 C 46 64, 38 50, 38 25 Z" ${st(GOLD, 4.5)}/>
    <path id="tr-handle-l" d="M 38 32 C 28 32, 26 44, 36 48" ${st(GOLD, 4)}/>
    <path id="tr-handle-r" d="M 82 32 C 92 32, 94 44, 84 48" ${st(GOLD, 4)}/>
    <path id="tr-stem" d="M 60 64 L 60 84" ${st(INK, 4.5)}/>
    <path id="tr-base" d="M 44 84 L 76 84 L 76 96 L 44 96 Z" ${st(INK, 4)}/>
    <path id="tr-star" d="M 60 38 L 63 46 L 71 46 L 65 51 L 67 59 L 60 54 L 53 59 L 55 51 L 49 46 L 57 46 Z" ${st(RED, 3)}/>
  `, { alts: ["award cup", "champion trophy"], a11y: "A trophy cup with a star and base." }),
  P("envelope-mail", { w: 130, h: 90 }, ["generic", "email", "mail", "message", "letter", "contact"], `
    <path id="em-body" d="M 15 20 L 115 20 L 115 75 L 15 75 Z" ${st(INK, 4)}/>
    <path id="em-flap" d="M 15 20 L 65 52 L 115 20" ${st(BLUE, 4)}/>
    <path id="em-stamp" d="M 92 26 L 108 26 L 108 40 L 92 40 Z" ${st(RED, 3)}/>
  `, { alts: ["letter", "email icon"], a11y: "An envelope with its flap and a stamp." }),
  P("home-house", { w: 130, h: 120 }, ["generic", "home", "house", "family", "living", "real estate"], `
    <path id="hh-roof" d="M 15 55 L 65 15 L 115 55" ${st(RED, 4.5)}/>
    <path id="hh-wall" d="M 24 52 L 24 105 L 106 105 L 106 52" ${st(INK, 4.5)}/>
    <path id="hh-door" d="M 54 105 L 54 72 L 76 72 L 76 105" ${st(BLUE, 4)}/>
    <path id="hh-window" d="M 34 62 L 46 62 L 46 74 L 34 74 Z" ${st(BLUE, 3.5)}/>
    <path id="hh-chimney" d="M 88 30 L 88 18 L 98 18 L 98 38" ${st(INK, 4)}/>
  `, { alts: ["family home", "residence"], a11y: "A house with roof, door, window, chimney." }),
  P("clock-face", { w: 120, h: 120 }, ["generic", "clock", "time", "watch", "schedule", "duration"], `
    <path id="cf-rim" d="${circlePath(60, 60, 44)}" ${st(INK, 4.5)}/>
    <path id="cf-hand-h" d="M 60 60 L 60 34" ${st(INK, 4)}/>
    <path id="cf-hand-m" d="M 60 60 L 82 72" ${st(RED, 4)}/>
    <path id="cf-tick-12" d="M 60 16 L 60 22" ${st(BLUE, 3.5)}/>
    <path id="cf-tick-3" d="M 104 60 L 98 60" ${st(BLUE, 3.5)}/>
    <path id="cf-tick-6" d="M 60 104 L 60 98" ${st(BLUE, 3.5)}/>
    <path id="cf-tick-9" d="M 16 60 L 22 60" ${st(BLUE, 3.5)}/>
  `, { alts: ["wall clock", "timepiece"], a11y: "A clock face with hour and minute hands." }),
  P("compass", { w: 120, h: 120 }, ["generic", "compass", "direction", "navigate", "guidance", "orientation"], `
    <path id="cp-ring" d="${circlePath(60, 60, 44)}" ${st(INK, 4.5)}/>
    <path id="cp-needle" d="M 60 26 L 68 60 L 60 94 L 52 60 Z" ${st(RED, 4)}/>
    <path id="cp-center" d="${circlePath(60, 60, 5)}" ${st(INK, 3.5)}/>
    <path id="cp-n" d="M 60 16 L 60 22" ${st(BLUE, 3.5)}/>
    <path id="cp-s" d="M 60 104 L 60 98" ${st(BLUE, 3.5)}/>
  `, { alts: ["navigation compass"], a11y: "A compass with a needle pointing north." }),
  P("lightbulb-wb", { w: 120, h: 130 }, ["generic", "idea", "innovation", "insight", "invention", "creative"], `
    <path id="lb-bulb" d="M 40 52 C 40 34, 48 22, 60 22 C 72 22, 80 34, 80 52 C 80 62, 74 68, 70 76 L 50 76 C 46 68, 40 62, 40 52 Z" ${st(GOLD, 4.5)}/>
    <path id="lb-base1" d="M 50 76 L 70 76" ${st(INK, 4)}/>
    <path id="lb-base2" d="M 52 86 L 68 86" ${st(INK, 4)}/>
    <path id="lb-filament" d="M 54 52 C 56 58, 64 58, 66 52" ${st(RED, 3.5)}/>
    <path id="lb-ray-l" d="M 26 40 L 16 34" ${st(GOLD, 3.5)}/>
    <path id="lb-ray-r" d="M 94 40 L 104 34" ${st(GOLD, 3.5)}/>
  `, { alts: ["bright idea bulb"], a11y: "A glowing lightbulb with rays." }),
  P("target-wb", { w: 120, h: 120 }, ["generic", "target", "goal", "aim", "focus", "objective"], `
    <path id="tg-ring-outer" d="${circlePath(60, 60, 42)}" ${st(RED, 4.5)}/>
    <path id="tg-ring-mid" d="${circlePath(60, 60, 26)}" ${st(INK, 4)}/>
    <path id="tg-bull" d="${circlePath(60, 60, 10)}" ${st(RED, 4)}/>
    <path id="tg-dart" d="M 96 24 L 74 46" ${st(GOLD, 4)}/>
  `, { alts: ["bullseye", "goal rings"], a11y: "A target with a dart flying in." }),
  P("magnet", { w: 120, h: 120 }, ["generic", "magnet", "attract", "pull", "draw", "engagement"], `
    <path id="mg-body-l" d="M 30 100 L 30 55 C 30 34, 44 20, 60 20" ${st(RED, 5)}/>
    <path id="mg-body-r" d="M 90 100 L 90 55 C 90 34, 76 20, 60 20" ${st(BLUE, 5)}/>
    <path id="mg-tip-l" d="M 30 100 L 44 100" ${st(INK, 5)}/>
    <path id="mg-tip-r" d="M 90 100 L 76 100" ${st(INK, 5)}/>
  `, { alts: ["attraction magnet"], a11y: "A horseshoe magnet with two poles." }),
  P("key-wb", { w: 120, h: 90 }, ["generic", "key", "access", "unlock", "secret", "solution"], `
    <path id="kw-ring" d="${circlePath(34, 45, 20)}" ${st(GOLD, 4.5)}/>
    <path id="kw-shaft" d="M 54 45 L 104 45" ${st(GOLD, 4.5)}/>
    <path id="kw-tooth" d="M 90 45 L 90 62" ${st(GOLD, 4.5)}/>
    <path id="kw-tooth2" d="M 102 45 L 102 58" ${st(GOLD, 4.5)}/>
  `, { alts: ["access key"], a11y: "A key with a round bow and two teeth." }),
  P("magnifier", { w: 120, h: 120 }, ["generic", "search", "magnifier", "find", "research", "inspect"], `
    <path id="mg-lens" d="${circlePath(52, 50, 28)}" ${st(BLUE, 4.5)}/>
    <path id="mg-handle" d="M 72 72 L 98 98" ${st(INK, 5)}/>
    <path id="mg-shine" d="M 42 38 C 46 34, 52 32, 58 34" ${st(TEAL, 3)}/>
  `, { alts: ["search glass", "loupe"], a11y: "A magnifying glass with a handle." }),
];

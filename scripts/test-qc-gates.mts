#!/usr/bin/env node
// qc-gates regression — the lane-scoped static QC gates (roadmap item 9).
//
// Pins the plan-static gates that run WITHOUT rendering a frame:
//
//   1. SLIDE FIT   — the 12px floor, the downscale-only shrink law, the
//                    overflow-below-floor failure, and the unmeasured state.
//   2. DECK REPORT — every headline gated at its planned display size.
//   3. FOCAL GATE  — every compositor-family scene declares its focal point.
//   4. BEAT GATE   — tiling: invalid windows, sub-minimum beats, blend-window
//                    tolerance, dead-air gaps, uncovered timeline tails.
//   5. RANGE LAW   — Av1an's score_within_target: inclusive bounds, and a
//                    non-finite measurement never passes.
//
// Run: npm run test:qc-gates   (pure — no DB, no DOM, no FS; CI step)

import {
  CLASSIC_BEAT_LIMITS,
  SLIDE_FIT_LIMITS,
  evaluateClassicBeatGate,
  evaluateClassicFocalGate,
  evaluateSlideTextGate,
  fitSlideText,
  scoreWithinTarget,
  slideDeckGateReport,
} from "../src/lib/ibismuh/qc-gates";

let passed = 0;
let failed = 0;
let suite = "";

function check(label: string, cond: boolean) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  FAIL [${suite}] ${label}`);
  }
}

function throwsWith(label: string, fn: () => unknown, re: RegExp) {
  try {
    fn();
    check(`${label} (no throw)`, false);
  } catch (e) {
    check(label, re.test(String((e as Error)?.message ?? e)));
  }
}

// ---------- 1. the slide fit gate ----------

suite = "slide-fit";

check(
  "a short headline fits at its planned size",
  evaluateSlideTextGate({ text: "Hello world", plannedFontPx: 176 }).status === "pass"
);
{
  const long = "This headline is far too long for the planned display size and must shrink to fit the column";
  const v = evaluateSlideTextGate({ text: long, plannedFontPx: 176 });
  check("an overflowing headline passes only with a declared shrink", v.status === "pass" && /shrink/.test(v.detail));
  check("the shrink stays above the 12px floor", (v.fittedFontPx ?? 0) >= SLIDE_FIT_LIMITS.minFontPx);
  check("the shrink never enlarges", (v.fittedFontPx ?? 1e9) < 176);
}
{
  const v = evaluateSlideTextGate({ text: "x".repeat(400), plannedFontPx: 176, boxWidthPx: 200, maxLines: 2 });
  check("overflow below the floor fails with shorten-the-text", v.status === "fail" && /shorten/.test(v.detail));
}
check(
  "a planned size under the floor fails outright",
  evaluateSlideTextGate({ text: "Tiny", plannedFontPx: 11 }).status === "fail" &&
    /12px floor/.test(evaluateSlideTextGate({ text: "Tiny", plannedFontPx: 11 }).detail)
);
check(
  "empty text is unmeasured (never silently green)",
  evaluateSlideTextGate({ text: "   ", plannedFontPx: 100 }).status === "unmeasured"
);
check(
  "a non-positive planned size is unmeasured",
  evaluateSlideTextGate({ text: "Hello", plannedFontPx: 0 }).status === "unmeasured"
);
{
  const a = fitSlideText("Deterministic text", 880, 4);
  const b = fitSlideText("Deterministic text", 880, 4);
  check("the fit is deterministic (same input, same verdict)", a.fittedFontPx === b.fittedFontPx && a.lines === b.lines);
  check("the fit is monotone in box width", fitSlideText("x".repeat(80), 400, 2).fittedFontPx <= fitSlideText("x".repeat(80), 800, 2).fittedFontPx);
}

// ---------- 2. the deck report ----------

suite = "deck-report";

{
  const planned = (h: string) => (h.length <= 10 ? 176 : h.length <= 20 ? 148 : h.length <= 36 ? 118 : h.length <= 60 ? 96 : 80);
  const ok = slideDeckGateReport(
    [
      { layout: "statement", headline: "Big idea" },
      { layout: "counter", headline: "27.4 million views" },
    ],
    planned
  );
  check("a sane deck passes", ok.status === "pass" && ok.rows.length === 2);
  const empty = slideDeckGateReport([], planned);
  check("a missing deck is unmeasured", empty.status === "unmeasured");
  const blank = slideDeckGateReport([{ layout: "statement", headline: "" }], planned);
  check("an all-empty deck is unmeasured, not failed", blank.status === "unmeasured");
  throwsWith("the report needs a planner function", () => slideDeckGateReport([{ layout: "statement", headline: "x" }], undefined as never), /./);
}

// ---------- 3. the focal gate ----------

suite = "focal-gate";

{
  const ok = evaluateClassicFocalGate([
    { id: "s1", focalPoint: "heart" },
    { id: "s2", focalPoint: "chart" },
  ]);
  check("all scenes with focal points pass", ok.status === "pass" && ok.coverage.missingFocal === 0);
  const bad = evaluateClassicFocalGate([
    { id: "s1", focalPoint: "heart" },
    { id: "s2", focalPoint: "" },
    { id: "s3", focalPoint: null },
  ]);
  check("missing focal points fail with per-scene findings", bad.status === "fail" && bad.findings.length === 2);
  check("no scenes yet is unmeasured", evaluateClassicFocalGate([]).status === "unmeasured");
}

// ---------- 4. the beat gate ----------

suite = "beat-gate";

{
  const tile = [
    { id: "s1", startMs: 0, endMs: 8000, focalPoint: "heart" },
    { id: "s2", startMs: 8000, endMs: 16000, focalPoint: "chart" },
    { id: "s3", startMs: 16000, endMs: 24000, focalPoint: "phrase" },
  ];
  const ok = evaluateClassicBeatGate(tile, 24000);
  check("a clean tiling passes", ok.status === "pass" && ok.coverage.overlaps === 0 && ok.coverage.gaps === 0);
  check("the span is measured", ok.coverage.spanMs === 24000);

  const blended = [
    { id: "s1", startMs: 0, endMs: 8500, focalPoint: "a" },
    { id: "s2", startMs: 8000, endMs: 16000, focalPoint: "b" },
  ];
  check(
    "an overlap within the blend-window tolerance is the crossfade, not an error",
    evaluateClassicBeatGate(blended).status === "pass"
  );

  const overlap = [
    { id: "s1", startMs: 0, endMs: 10000, focalPoint: "a" },
    { id: "s2", startMs: 5000, endMs: 16000, focalPoint: "b" },
  ];
  {
    const v = evaluateClassicBeatGate(overlap);
    check("a beyond-tolerance overlap fails with both ids", v.status === "fail" && /s1.*s2/.test(v.findings[0] ?? ""));
  }

  const gap = [
    { id: "s1", startMs: 0, endMs: 5000, focalPoint: "a" },
    { id: "s2", startMs: 5000 + CLASSIC_BEAT_LIMITS.maxGapMs + 1, endMs: 12000, focalPoint: "b" },
  ];
  check("dead air beyond the gap tolerance fails with its location", /dead air/.test(evaluateClassicBeatGate(gap).findings[0] ?? ""));

  const tail = [
    { id: "s1", startMs: 0, endMs: 5000, focalPoint: "a" },
    { id: "s2", startMs: 5000, endMs: 10000, focalPoint: "b" },
  ];
  check("an uncovered timeline tail fails", /tail is uncovered/.test(evaluateClassicBeatGate(tail, 30000).findings[0] ?? ""));

  const tiny = [{ id: "s1", startMs: 0, endMs: 300, focalPoint: "a" }];
  check("a sub-minimum beat fails", /minimum/.test(evaluateClassicBeatGate(tiny).findings[0] ?? ""));

  const inverted = [{ id: "s1", startMs: 5000, endMs: 1000, focalPoint: "a" }];
  check("an inverted window fails", /invalid window/.test(evaluateClassicBeatGate(inverted).findings[0] ?? ""));

  check("no beats yet is unmeasured", evaluateClassicBeatGate([]).status === "unmeasured");
}

// ---------- 5. the acceptance-range law ----------

suite = "range-law";

check("an in-range score passes", scoreWithinTarget(95, [94, 96]) === true);
check("the bounds are inclusive", scoreWithinTarget(94, [94, 96]) && scoreWithinTarget(96, [94, 96]));
check("below the range fails", scoreWithinTarget(93.9, [94, 96]) === false);
check("above the range fails", scoreWithinTarget(96.1, [94, 96]) === false);
check("a non-finite measurement never passes", !scoreWithinTarget(Number.NaN, [0, 100]) && !scoreWithinTarget(Number.POSITIVE_INFINITY, [0, 100]));
check("a malformed range fails closed", scoreWithinTarget(50, [100, 0]) === false);

// ---------- the verdict ----------

console.log(`qc-gates: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

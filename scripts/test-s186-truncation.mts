#!/usr/bin/env node
/**
 * The S186 truncation-honesty battery — the pins behind the "10 Forgotten
 * Empires" incident fix (2026-11-23).
 *
 *   node --import tsx scripts/test-s186-truncation.mts
 *
 * THE INCIDENT: a Topic-Radar-greenlit long video (20-scene target) failed
 * three times with two signatures — "Model did not return valid JSON" and
 * "Script came back short: 0 scenes". The second was a LIE about the first:
 * a reply truncated mid-stream was "salvaged" by the balanced scan into ONE
 * COMPLETE SCENE OBJECT (no `scenes` key), which the S151 floor then
 * reported as a lazy model. Every diagnostic pointed at the model's work
 * ethic; the actual cause was a cut-off stream.
 *
 * The pins:
 *   1. MID-STRING TRUNCATION — a cut inside a string value refuses the
 *      nested-fragment salvage and names the truncation.
 *   2. DANGLING-KEY TRUNCATION — a cut between a key and its value also
 *      refuses (the depth law catches every cut position, not just
 *      mid-string ones).
 *   3. PROSE STRAY QUOTE — a complete top-level payload followed by prose
 *      ending inside a quote character still parses (depth-0 salvage).
 *   4. S47 LAW UNTOUCHED — truncation OUTSIDE a string still repairs via
 *      appended closers (the pre-existing pinned behavior).
 *   5. EXHAUSTIVE SWEEP — no 1%..99% cut of a real-shaped 20-scene reply
 *      may produce a scene-object salvage masquerading as the package.
 *   6. FLOOR SHAPES — the story.ts floor error names WHICH short shape
 *      happened (no scenes array / all scenes filtered / lazy count).
 */

import assert from "node:assert/strict";
import fs from "node:fs";

let pass = 0;
let fail = 0;
const fails: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    pass++;
    console.log(`  PASS ${name}`);
  } catch (e) {
    fail++;
    const msg = e instanceof Error ? e.message : String(e);
    fails.push(`${name}: ${msg.split("\n")[0].slice(0, 220)}`);
    console.log(`  FAIL ${name} — ${msg.split("\n")[0].slice(0, 220)}`);
  }
}

// A real-shaped 20-scene package (the incident's geometry: long = exactly 20
// scenes, ~12K chars of JSON — comfortably over provider output caps when
// the model runs verbose).
function sceneJson(i: number): string {
  return `    {
      "title": "Empire ${i} Rises",
      "narration": "In the year fourteen ninety-two the empire stretched from the western mountains to the eastern sea and its merchants grew rich on salt and silk and stories of conquest.",
      "visual": "a wide desert caravan of camels loaded with salt blocks crossing golden dunes at dusk, distant walled city on the horizon",
      "camera": "push-in",
      "mood": "amber dusk, long shadows, dust haze",
      "caption": "The empire that maps forgot",
      "focal": "center",
      "hostInScene": false,
      "rehook": ${i % 4 === 0},
      "sfx": "none"
    }`;
}

const FULL_20_SCENES = `{
  "title": "10 Forgotten Empires That Shaped the World",
  "description": "A journey through history.",
  "tags": ["history", "empires"],
  "scenes": [
${Array.from({ length: 20 }, (_, i) => sceneJson(i + 1)).join(",\n")}
  ]
}`;

async function main(): Promise<void> {
  const { parseJsonLoose } = await import("../src/lib/ibismuh/ai.ts");

  console.log("\n== 1. MID-STRING TRUNCATION — the live 0-scenes killer ==");
  check("a cut inside a scene's narration refuses the fragment salvage and names the truncation", () => {
    const truncated =
      FULL_20_SCENES.slice(0, Math.floor(FULL_20_SCENES.length * 0.5)) +
      `cut mid-va`;
    assert.throws(
      () => parseJsonLoose(truncated),
      (err: unknown) => {
        assert.ok(err instanceof Error, "throws an Error");
        const msg = err.message;
        assert.match(msg, /did not return valid JSON/i, "the S47-readable message shape is kept");
        assert.match(msg, /cut off mid-string|truncated/i, "the error NAMES the truncation");
        return true;
      },
      "the truncated reply must throw (no fragment salvage)"
    );
  });

  console.log("\n== 2. DANGLING-KEY TRUNCATION — the cut between a key and its value ==");
  check("a cut after a dangling key-colon also refuses the fragment salvage", () => {
    const scene = (i: number) => `{"title":"S${i}","narration":"n${i}","visual":"v${i}"}`;
    const truncated =
      `{"title":"T","scenes":[` +
      Array.from({ length: 5 }, (_, i) => scene(i + 1)).join(",") +
      `,{"title":"S6","narration":"n6","rehook": `;
    assert.throws(
      () => parseJsonLoose(truncated),
      (err: unknown) => {
        assert.ok(err instanceof Error, "throws an Error");
        assert.match((err as Error).message, /did not return valid JSON/i, "the readable message shape");
        return true;
      },
      "the dangling-value reply must throw (no fragment salvage)"
    );
  });

  console.log("\n== 3. PROSE STRAY QUOTE — the depth-0 allowance ==");
  check("prose with a stray unclosed quote after a COMPLETE payload still parses", () => {
    const parsed = parseJsonLoose(
      '{"concept":"desert at dusk","scenes":[{"sceneIndex":1,"mood":"warm"}]}\nA closing thought: he said "oops'
    ) as { concept: string; scenes: unknown[] };
    assert.equal(parsed.concept, "desert at dusk", "the complete top-level payload is recovered");
    assert.equal(parsed.scenes.length, 1, "nested scenes survive the salvage");
  });

  console.log("\n== 4. THE S47 LAW UNTOUCHED — repairable tails still repair ==");
  check("truncation OUTSIDE a string still repairs via appended closers", () => {
    const parsed = parseJsonLoose('{"title":"T","items":[{"n":1},{"n":2}') as {
      items: { n: number }[];
    };
    assert.equal(parsed.items.length, 2, "both complete items survive the appended closers");
  });

  console.log("\n== 5. THE EXHAUSTIVE SWEEP — no cut position may lie ==");
  check("no 1%..99% cut of the 20-scene reply produces a scene-object salvage", () => {
    const lies: number[] = [];
    for (let pct = 1; pct < 100; pct++) {
      const cut = FULL_20_SCENES.slice(0, Math.floor((FULL_20_SCENES.length * pct) / 100));
      try {
        const parsed = parseJsonLoose(cut) as { title?: string };
        // A parse that "succeeds" with a SCENE title means a nested fragment
        // was handed back as the package — the 0-scenes lie.
        if (typeof parsed.title === "string" && /Empire \d+/.test(parsed.title)) lies.push(pct);
      } catch {
        // honest throw — mid-string cuts name the truncation, dangling-tail
        // cuts land in the readable generic; both fine.
      }
    }
    assert.deepEqual(lies, [], `scene-object salvages at cut positions: ${lies.join(", ")}`);
  });

  console.log("\n== 6. THE FLOOR SHAPES — story.ts names the short shape ==");
  check("the floor error distinguishes missing-array / all-filtered / lazy-count (source pins)", () => {
    const src = fs.readFileSync("src/lib/ibismuh/story.ts", "utf8");
    assert.ok(src.includes("Script came back short"), "the S151 phrase survives");
    assert.ok(src.includes("no scenes array in the reply"), "a missing scenes array says so (off-contract JSON shape)");
    assert.ok(src.includes("every scene was missing narration or visual"), "an all-filtered array says so (field drift)");
  });

  console.log(`\n${pass} passed, ${fail} failed${fails.length ? ":" : ""}`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(fail > 0 ? 1 : 0);
}

void main();

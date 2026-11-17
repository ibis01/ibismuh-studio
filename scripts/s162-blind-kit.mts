// S162 — the blind A/B kit for the measured easing + choreography slice
// (the w1/k1/s123 blind-rubric precedent — the six-engine audit's Part 6
// motion-graphics floor).
//
// The S120 §4 gate: every creative engine's acceptance closes with a
// BLIND re-score — codenamed artifacts shuffled together, ≥ 3 human
// scorers, composite ≥ 4/5 on the anchored rubric. THIS script builds the
// S162 session: the SAME scaffolded graphics fixture rendered twice
// through the REAL engine —
//
//   arm A (pre-S162): the scaffold's enter table rewritten to the
//     pre-S162 receipt (ease-back/ease-out/linear entrances, the 350 ms
//     sequential bullet stagger, the linear count, no landing pulse);
//   arm B (post-S162): the scaffold verbatim (measured-out entrances,
//     expo-out landings, the 150 ms kinetic stagger, the counter's
//     landing pulse).
//
// The ONLY delta between the arms is the S162 vocabulary — same scenes,
// same layout, same clocks, same renderer. The kit codenames every
// artifact (TFR-<8hex>.mp4), shuffles it, writes three per-scorer sheets
// (the Part 6 anchored rows), and drops the code→artifact key + manifest
// into the session dir — /validation/ is gitignored, the key never rides
// git. The scoring itself remains the human gate — the kit does not
// score, does not fabricate composites, and says so in the README.
//
// Run: node --import tsx scripts/s162-blind-kit.mts

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type { GraphicsDoc } from "../src/lib/tubeforge/graphics/types";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;
function ok(cond: unknown, msg: string): asserts cond {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

const sha256 = (file: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// ---------------------------------------------------------------------------
// The pre-S162 enter table — the receipt the arm-A rewrite restores
// verbatim (planner.ts nativeEnterFor as it stood at s161 / e72d0ad).
// ---------------------------------------------------------------------------

const PRE_S162_EASE: Record<string, { kind: string; durationMs: number; delayMs: number; ease: string }> = {
  headline: { kind: "rise", durationMs: 600, delayMs: 0, ease: "ease-back" },
  subhead: { kind: "fade", durationMs: 500, delayMs: 250, ease: "ease-out" },
  bullet: { kind: "slide", durationMs: 400, delayMs: 400, ease: "ease-out" }, // delay + 350·order
  counter: { kind: "count", durationMs: 1200, delayMs: 300, ease: "linear" },
  bar: { kind: "grow", durationMs: 900, delayMs: 300, ease: "ease-out" },
  barChart: { kind: "grow", durationMs: 900, delayMs: 300, ease: "ease-out" },
  icon: { kind: "draw", durationMs: 700, delayMs: 350, ease: "linear" },
  callout: { kind: "rise", durationMs: 400, delayMs: 500, ease: "ease-out" },
  shape: { kind: "grow", durationMs: 500, delayMs: 350, ease: "ease-out" },
  group: { kind: "fade", durationMs: 400, delayMs: 0, ease: "ease-out" },
  sprite: { kind: "fade", durationMs: 400, delayMs: 0, ease: "ease-out" },
};

/** Rewrite every enter to the pre-S162 receipt — a PURE map over the
 *  scaffolded doc (same elements, same layout, same clocks; only the
 *  motion vocabulary rewinds). `order` = the element's index among its
 *  kind, matching the planner's own order semantics. */
function rewindEntersToPreS162(doc: GraphicsDoc): GraphicsDoc {
  const scenes = doc.scenes.map((scene) => {
    const seen = new Map<string, number>();
    const elements = scene.elements.map((el) => {
      const order = seen.get(el.kind) ?? 0;
      seen.set(el.kind, order + 1);
      const pre = PRE_S162_EASE[el.kind];
      if (pre === undefined) return el;
      return {
        ...el,
        enter: {
          kind: pre.kind,
          durationMs: pre.durationMs,
          delayMs: el.kind === "bullet" ? pre.delayMs + 350 * order : pre.delayMs,
          ease: pre.ease,
        },
      } as typeof el;
    });
    return { ...scene, elements };
  });
  return { ...doc, scenes };
}

async function main(): Promise<void> {
  console.log("S162 — the blind A/B kit (measured easing + choreography)");

  const { scaffoldGraphicsDoc } = await import("../src/lib/tubeforge/graphics/planner");
  const { renderGraphics } = await import("../src/lib/tubeforge/graphics/render");
  const { runProcess } = await import("../src/lib/tubeforge/proc");

  // The fixture — three scenes hitting the three motion-heavy archetypes:
  // the opener (headline measured entrance), the stat (counter expo-out
  // + landing pulse), the list (bullet kinetic stagger). The chart rides
  // scene 3's data cue.
  const armB = scaffoldGraphicsDoc({
    scenes: [
      { index: 1, title: "The Growth Engine", narration: "Every product grows through three forces: reach, retention, and revenue." },
      { index: 2, title: "The conversion lift", narration: "Teams see conversion climb to 87 percent within the first quarter." },
      { index: 3, title: "The market data", narration: "Compared with last year, 42 percent versus 87 percent share. First the reach, next the retention, finally the revenue." },
    ],
    topic: "S162 blind kit",
    width: 640,
    height: 360,
    fps: 24,
  });
  const armA = rewindEntersToPreS162(armB);

  // The arms must differ EXACTLY in the motion vocabulary — same ids,
  // same layout, same clocks.
  ok(JSON.stringify(armA).length > 0 && armA.scenes.length === armB.scenes.length, "both arms scaffolded");
  const layoutA = JSON.stringify(armA.scenes.map((s) => s.elements.map((e) => [e.id, e.kind, e.at])));
  const layoutB = JSON.stringify(armB.scenes.map((s) => s.elements.map((e) => [e.id, e.kind, e.at])));
  ok(layoutA === layoutB, "the arms share layout element-for-element (the ONLY delta is motion)");
  const motionA = JSON.stringify(armA.scenes.map((s) => s.elements.map((e) => e.enter)));
  const motionB = JSON.stringify(armB.scenes.map((s) => s.elements.map((e) => e.enter)));
  ok(motionA !== motionB, "the arms' motion vocabularies differ (the S162 delta is real)");
  ok(motionB.includes('"measured-out"') && motionB.includes('"expo-out"'), "arm B rides the measured vocabulary");
  ok(motionA.includes('"ease-back"') && motionA.includes('"linear"'), "arm A rides the pre-S162 receipt");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sessionDir = path.join(REPO_ROOT, "validation", `s162-blind-kit-${stamp}`);
  const armsDir = path.join(sessionDir, "arms");
  fs.mkdirSync(armsDir, { recursive: true });

  // Render BOTH arms through the REAL engine (chromium → ffmpeg), silent
  // (no VO/music — the motion is the only variable, the kit renders fast).
  const renders: Array<{ arm: "A" | "B"; doc: GraphicsDoc }> = [
    { arm: "A", doc: armA },
    { arm: "B", doc: armB },
  ];
  const artifacts: Array<{ arm: "A" | "B"; file: string; sha: string; durSec: number }> = [];
  for (const { arm, doc } of renders) {
    const outDir = path.join(armsDir, `arm-${arm}`);
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`  rendering arm ${arm} …`);
    const t0 = Date.now();
    const res = await renderGraphics(doc, { outDir });
    const sec = (Date.now() - t0) / 1000;
    ok(fs.existsSync(res.file), `arm ${arm} encoded (${sec.toFixed(1)}s): ${path.basename(res.file)}`);
    // ffprobe — h264, positive duration, the delivered clock intact.
    const probe = await runProcess(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,duration", "-of", "json", res.file],
      { timeoutMs: 60_000, label: `s162-kit-probe-${arm}` },
    );
    const info = JSON.parse(probe.stdout) as { streams?: Array<{ codec_name?: string; duration?: string }> };
    const stream = info.streams?.[0];
    ok(stream?.codec_name === "h264", `arm ${arm} is h264`);
    const durSec = Number(stream?.duration ?? "0");
    ok(durSec > 0, `arm ${arm} duration ${durSec.toFixed(2)}s > 0`);
    artifacts.push({ arm, file: res.file, sha: sha256(res.file), durSec });
  }
  ok(artifacts[0]?.sha !== artifacts[1]?.sha, "the two arms' bytes differ (the delta reached the pixels)");

  // Codename + shuffle (the seed lives ONLY in the key — never the sheets).
  const codename = (sha: string): string => `TFR-${sha.slice(0, 8)}`;
  const shuffled = [...artifacts];
  const seedBytes = crypto.randomBytes(16).toString("hex");
  let seedNum = parseInt(seedBytes.slice(0, 12), 16);
  const rand = (): number => {
    // Mulberry32 — the shuffle is reproducible FROM THE KEY only.
    seedNum |= 0;
    seedNum = (seedNum + 0x6d2b79f5) | 0;
    let t = Math.imul(seedNum ^ (seedNum >>> 15), 1 | seedNum);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = shuffled[i];
    const b = shuffled[j];
    if (a !== undefined && b !== undefined) {
      shuffled[i] = b;
      shuffled[j] = a;
    }
  }

  // The anchored rubric rows (the six-engine audit Part 6, motion graphics).
  const rubricRows = [
    "composition — the frame reads clean at rest (1-5)",
    "motion feel — entrances/exits read measured, not generated (1-5)",
    "craft details — landings, staggers, holds read deliberate (1-5)",
    "readability — text and numbers stay legible in motion (1-5)",
  ];

  for (let s = 1; s <= 3; s++) {
    const rows = shuffled
      .map((a) => `- ${codename(a.sha)} (${a.durSec.toFixed(1)}s)\n${rubricRows.map((r) => `  ${r}: ___`).join("\n")}`)
      .join("\n\n");
    fs.writeFileSync(
      path.join(sessionDir, `scorer-${s}.md`),
      `# S162 blind score — scorer ${s}\n\n` +
        `Two motion-graphics clips, shuffled. Score every row 1-5 (5 = best).\n` +
        `Do NOT discuss with other scorers before submitting.\n\n${rows}\n\n` +
        `One line on WHY (the feel, not the features): ___________\n`,
    );
  }

  const key = {
    session: "s162-blind-kit",
    stamp,
    shuffleSeed: seedBytes,
    key: shuffled.map((a, i) => ({ position: i + 1, code: codename(a.sha), arm: a.arm, sha256: a.sha, durationSec: a.durSec })),
  };
  fs.writeFileSync(path.join(sessionDir, "key.json"), JSON.stringify(key, null, 2));
  fs.writeFileSync(
    path.join(sessionDir, "manifest.json"),
    JSON.stringify(
      {
        session: "s162-blind-kit",
        stamp,
        artifacts: artifacts.map((a) => ({ arm: a.arm, code: codename(a.sha), sha256: a.sha, durationSec: a.durSec })),
        arms: {
          A: "pre-S162 enter table (ease-back/ease-out/linear, 350 ms sequential stagger, linear count, no landing pulse)",
          B: "the S162 scaffold verbatim (measured-out entrances, expo-out landings, 150 ms kinetic stagger, landing pulse)",
        },
        fixture: "scaffoldGraphicsDoc: opener + stat + list/chart archetypes, 640x360 @ 24 fps, silent",
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(sessionDir, "README.md"),
    `# S162 blind kit session\n\n` +
      `Two arms of the SAME graphics fixture, differing ONLY in the S162 motion vocabulary, ` +
      `rendered through the real engine and shuffled.\n\n` +
      `Protocol (S120 §4 / the six-engine audit Part 6): ≥ 3 human scorers, the anchored rows on ` +
      `each scorer sheet, composite ≥ 4/5 per arm. THE KIT DOES NOT SCORE — hand the sheets out, ` +
      `collect composites, record them in the successor audit doc. The code→artifact key is ` +
      `key.json IN THIS DIRECTORY ONLY (never commit it, never paste it into a shared doc before scoring closes).\n`,
  );

  console.log(`\n  session: ${sessionDir}`);
  console.log(`  artifacts: ${shuffled.map((a) => codename(a.sha)).join(", ")} (shuffled)`);
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

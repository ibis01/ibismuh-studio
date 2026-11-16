// S128 — the blind re-score kit session builder (the audit's action 3:
// "Obtain three independent visual scores" — everything an autonomous run
// can do short of the humans themselves).
//
// The S120 §4 gate: every creative engine's acceptance closes with a BLIND
// re-score — codenamed artifacts shuffled together, ≥ 3 human scorers,
// composite ≥ 4/5 on the anchored rubric. The two rubric records
// (docs/audits/k1-blind-rubric.md, docs/audits/s123-blind-rescore.md) map
// the protocol and stay PENDING; THIS script makes the kit session a
// single command instead of a manual ceremony:
//
//   node --import tsx scripts/blind-rescore-kit.mts
//
// What it does:
//   1. renders the arms through the REAL engines — the K1 rig smoke
//      (compiled gesture beats), the S123 graphics proof (the mixed
//      graphics render), and — in-process — the K1 fixture's REST-ONLY
//      control arm (same art, same narration, same clock, same mouth
//      schedule; the ONLY delta is the compiled gesture layer);
//   2. codenames every artifact (TFR-<8hex>.mp4) and shuffles it;
//   3. writes three per-scorer markdown sheets (the anchored rubric rows
//      transcribed verbatim from the two rubric records);
//   4. writes the code→artifact key + manifest (sha256) into the session
//      dir — /validation/ is gitignored, the key never rides git.
//
// The scoring itself remains the human gate — the kit does not score,
// does not fabricate composites, and says so in the README it writes.
//
// Flags: --skip-g1 / --skip-k1 reuse the existing receipt artifacts on
// disk instead of re-spawning the proof pipelines (a session rebuild
// after a crash mid-kit).
//
// Run: node --import tsx scripts/blind-rescore-kit.mts

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_G1 = process.argv.includes("--skip-g1");
const SKIP_K1 = process.argv.includes("--skip-k1");

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

function runNode(script: string, label: string): void {
  console.log(`\n[kit] ${label} — spawning ${script} …`);
  const res = spawnSync("node", ["--import", "tsx", script], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    timeout: 20 * 60_000,
  });
  if (res.error) throw new Error(`${label}: the spawn failed — ${String(res.error)}`);
  if (res.status !== 0) throw new Error(`${label}: exited ${res.status} — the arm's own gate failed; fix it before assembling a kit`);
  console.log(`[kit] ${label} — green`);
}

// ---------------------------------------------------------------------------
// The K1 rest-only control arm — the A/B isolation
// ---------------------------------------------------------------------------

async function renderRestArm(sessionDir: string): Promise<string> {
  const { renderRigScene } = await import("../src/lib/tubeforge/characters/rig-render");
  const { validateRigDoc, validateRigParts, scaffoldRigDoc, RIG_VERSION } = await import(
    "../src/lib/tubeforge/characters/rig2d"
  );
  const { planRigTimeline } = await import("../src/lib/tubeforge/characters/rig-director");
  const { K1_SMOKE_FIXTURE } = await import("./k1-rig-smoke.mts");

  const f = K1_SMOKE_FIXTURE;
  const artCheck = validateRigParts(f.art);
  if (!artCheck.parts) throw new Error("the fixture parts must validate");
  const scaffolded = scaffoldRigDoc({ parts: f.seeds, art: f.art });
  // The CONTROL sheet: rest poses ONLY. planRigTimeline's gesture table
  // finds no raise/point/welcoming candidates and degrades every sentence
  // to rest — the compiled-gesture layer is the A/B's only variable.
  const restSheet = f.poseSheet.filter((p) => p.name === "Rest" || p.name === "Brow rest");
  const doc = scaffolded.doc
    ? { ...scaffolded.doc, poses: restSheet }
    : { version: RIG_VERSION, width: f.stage, height: f.stage, fps: f.fps, background: "#1c1424", parts: f.seeds, poses: restSheet };
  const docCheck = validateRigDoc(doc, artCheck.parts);
  if (!docCheck.doc) throw new Error(`the rest fixture must validate — ${JSON.stringify(docCheck.errors)}`);

  const plan = planRigTimeline({ narration: f.narration, rig: docCheck.doc, durationMs: f.sceneMs, anchors: null });
  const gestureRows = plan.timeline.rows.filter((r) => r.poseId !== null && !/rest/i.test(r.poseId));
  if (gestureRows.length > 0)
    throw new Error(`the rest arm leaked ${gestureRows.length} gesture rows — the control is compromised`);
  if (plan.speech.speaking !== true) throw new Error("the rest arm must still SPEAK (mouth beats ride the shared schedule)");

  const outDir = path.join(sessionDir, "rest-arm");
  fs.mkdirSync(outDir, { recursive: true });
  const result = await renderRigScene({
    rig: docCheck.doc,
    art: artCheck.parts,
    timeline: plan.timeline,
    speech: plan.speech,
    slot: { sceneIndex: 1, durationMs: f.sceneMs },
    opts: { outDir, canvas: { width: 1920, height: 1080 }, fps: f.fps, onProgress: (l) => process.stdout.write(`    ${l}\r`) },
  });
  process.stdout.write("\n");
  ok(fs.existsSync(result.file) && fs.statSync(result.file).size > 10_000, "the rest-only control arm rendered (same art, narration, clock, mouth; gestures degraded to rest)");
  return result.file;
}

// ---------------------------------------------------------------------------
// The kit assembly
// ---------------------------------------------------------------------------

interface KitArtifact {
  code: string;
  lane: string;
  arm: string;
  source: string;
  sha256: string;
  bytes: number;
}

function code(): string {
  return `TFR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

const G1_ROWS = [
  "motion-naturalness (eases, staggers, holds read as designed, not mechanical)",
  "semantic-order (elements enter in the narration's order)",
  "narration-alignment (beats land where the voice is)",
  "chart/diagram-readability (bars/counters legible, honest scales)",
  "text-readability (sizes, weights, contrast against the background)",
  "transition-quality (scene boundaries read as intentional cuts)",
  "audio (VO slots + bed balance under the −16 LUFS contract)",
  "comprehension (the scene's message survives one viewing)",
];

const K1_ROWS = [
  "pose-naturalness (FK gestures read as intent, not mechanical rotation; tweens land at explainer tempo)",
  "identity-floor (the rendered rig reads as the character — anchor traits recognizable; N/A only for a mouthless rig, which this is NOT)",
  "mouth-beat-sync (open/close beats land inside the spoken words; gaps close; no dead-open mouths)",
  "gesture-narration-alignment (setup welcomes, action points, emphasis punctuates — the intent is VISIBLE)",
  "art-decomposition-quality (parts join at pivots without gaps/overlaps; the mouth swap is invisible)",
  "staging-legibility (the character reads at 1080p contain-fit; background is set dressing, not noise)",
  "comprehension (the scene's message survives one viewing)",
  "honesty (nothing claims phoneme lip-sync, IK, or skinning — the motion is beat-sync, labeled as such)",
];

function scorerSheet(n: number, artifacts: KitArtifact[]): string {
  const lines: string[] = [];
  lines.push(`# Blind re-score — scorer ${n} of 3`);
  lines.push("");
  lines.push("**Rules (the S120 §4 gate):** whole numbers 1–5 per row. 1 = fails the row outright, 3 = usable, 5 = excellent. No halves. N/A only where a row says it may apply. Score EVERY file below. Do not discuss with the other scorers until all three sheets are in. Do not open the session's `key.json` — the key unblinds the arms and an unblinded score is void.");
  lines.push("");
  lines.push("You will see TWO kinds of artifact:");
  lines.push("- motion-graphics explainers → score on the GRAPHICS sheet;");
  lines.push("- puppet-character scenes → score on the CHARACTER sheet.");
  lines.push("The blindness you are keeping: WHICH arm (what each file was rendered FROM) — that mapping lives in the gitignored key.");
  lines.push("");
  lines.push("## The files to score");
  for (const a of artifacts) lines.push(`- \`kit/${a.code}.mp4\``);
  lines.push("");
  lines.push("## GRAPHICS sheet (motion-graphics artifacts)");
  lines.push("");
  lines.push("| # | row | score 1–5 |");
  lines.push("|---|---|---|");
  G1_ROWS.forEach((r, i) => lines.push(`| ${i + 1} | ${r} | |`));
  lines.push("");
  lines.push("## CHARACTER sheet (puppet-character artifacts)");
  lines.push("");
  lines.push("| # | row | score 1–5 |");
  lines.push("|---|---|---|");
  K1_ROWS.forEach((r, i) => lines.push(`| ${i + 1} | ${r} | |`));
  lines.push("");
  lines.push("**Verdict rule:** a lane passes when its composite (mean of every row across every artifact scored on that sheet) is ≥ 4.0/5 with ≥ 3 scorers. A failing lane routes back before Stage X's mixed dispatch.");
  lines.push("");
  lines.push("Notes (optional):");
  lines.push("");
  return lines.join("\n") + "\n";
}

function readme(artifacts: KitArtifact[], session: string): string {
  return `# Blind re-score kit — session ${session}

Built by \`scripts/blind-rescore-kit.mts\` (S128) through the REAL engines:
the K1 rig smoke, the S123 graphics proof, and an in-process rest-only
control render. No artifact here is a mock; every MP4 is chromium + ffmpeg
output from the committed pipelines.

## What is in this directory

| file | what it is |
|---|---|
| \`kit/TFR-*.mp4\` | the codenamed, shuffled artifacts — what the scorers watch |
| \`scorer-1.md\` … \`scorer-3.md\` | the per-scorer sheets (identical but numbered) |
| \`manifest.json\` | session metadata + artifact hashes (sha256) |
| \`key.json\` | **the code→arm mapping — gitignored; NEVER commit; scorers never open it** |
| \`rest-arm/\`, \`g1/\`, \`k1/\` | the un-coded source renders (keep for provenance; not for scoring) |

## The protocol

1. Hand each scorer ONE sheet (scorer-N.md) and the \`kit/\` directory.
2. Scorers score alone; sheets come back filled.
3. Composite per sheet across scorers; the verdict rule is on the sheet.
4. Unblind with key.json ONLY after all three sheets are in; record the
   composite + per-dimension deltas in the lane's rubric record
   (docs/audits/k1-blind-rubric.md, docs/audits/s123-blind-rescore.md).

## The arms (in the key, not here)

- the K1 compiled-gesture arm — the rig smoke's render;
- the K1 rest-only control — the SAME fixture rendered with the gesture
  sheet stripped to rests: same art, same narration, same 8.00s clock,
  the same mouth schedule; the ONLY delta is the compiled gesture layer.
  (Protocol note: the K1 rubric originally named the S93 portrait zoompan
  as the control; the rest-only arm is a strictly better-controlled A/B
  for the gesture rows and keeps the narration identical — the deviation
  is recorded here, not hidden. The S93 portrait render remains available
  via scripts/s93-rig-smoke.mts.)
- the G1 graphics arm — the S123 proof's full render.

## Honesty

The kit does NOT score. ${"≥"} 3 humans scoring is the gate; nothing here
pretends otherwise. No composite is pre-filled anywhere.
`;
}

async function main(): Promise<void> {
  const session = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const sessionDir = path.join(REPO_ROOT, "validation", "rescore", session);
  console.log(`S128 — the blind re-score kit session\n  → ${path.relative(REPO_ROOT, sessionDir)}\n`);

  // --- 1. the arms ---------------------------------------------------------
  const k1Clip = path.join(REPO_ROOT, "validation", "s125", "render", "rig-scene.mp4");
  if (SKIP_K1 && fs.existsSync(k1Clip)) {
    console.log("[kit] --skip-k1: reusing the existing K1 smoke artifact");
  } else {
    runNode("scripts/k1-rig-smoke.mts", "the K1 rig smoke (the compiled-gesture arm)");
  }
  ok(fs.existsSync(k1Clip), "the K1 arm artifact exists (validation/s125/render/rig-scene.mp4)");

  const g1Clip = path.join(REPO_ROOT, "validation", "s123", "render", "final.mp4");
  if (SKIP_G1 && fs.existsSync(g1Clip)) {
    console.log("[kit] --skip-g1: reusing the existing S123 proof artifact");
  } else {
    runNode("scripts/s123-graphics-proof.mts", "the S123 graphics proof (the G1 arm)");
  }
  ok(fs.existsSync(g1Clip), "the G1 arm artifact exists (validation/s123/render/final.mp4)");

  console.log("\n[kit] the rest-only control arm — in-process render …");
  const restClip = await renderRestArm(sessionDir);

  // --- 2. codename + shuffle ----------------------------------------------
  fs.mkdirSync(path.join(sessionDir, "kit"), { recursive: true });
  const sources: { lane: string; arm: string; file: string }[] = [
    { lane: "character", arm: "k1-compiled-gestures", file: k1Clip },
    { lane: "character", arm: "k1-rest-only-control", file: restClip },
    { lane: "graphics", arm: "g1-proof-render", file: g1Clip },
  ];
  // Fisher–Yates with crypto randomness — the shuffle is the blindness.
  for (let i = sources.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [sources[i], sources[j]] = [sources[j], sources[i]];
  }
  const artifacts: KitArtifact[] = sources.map((s) => {
    const c = code();
    const dest = path.join(sessionDir, "kit", `${c}.mp4`);
    fs.copyFileSync(s.file, dest);
    return { code: c, lane: s.lane, arm: s.arm, source: path.relative(REPO_ROOT, s.file), sha256: sha256(dest), bytes: fs.statSync(dest).size };
  });
  ok(artifacts.length === 3, "three codenamed artifacts shuffled into kit/");

  // --- 3. the sheets + key + manifest --------------------------------------
  for (const n of [1, 2, 3]) {
    fs.writeFileSync(path.join(sessionDir, `scorer-${n}.md`), scorerSheet(n, artifacts));
  }
  fs.writeFileSync(path.join(sessionDir, "key.json"), JSON.stringify({ session, generatedAt: new Date().toISOString(), artifacts }, null, 2) + "\n");
  fs.writeFileSync(
    path.join(sessionDir, "manifest.json"),
    JSON.stringify(
      {
        session,
        generatedAt: new Date().toISOString(),
        builtBy: "scripts/blind-rescore-kit.mts (S128)",
        protocol: ["docs/audits/k1-blind-rubric.md", "docs/audits/s123-blind-rescore.md"],
        scorersExpected: 3,
        verdictRule: "composite ≥ 4.0/5 per lane sheet, ≥ 3 scorers; a failing lane routes back before Stage X",
        artifacts: artifacts.map(({ code: c, lane, sha256: h, bytes }) => ({ code: c, lane, sha256: h, bytes })),
      },
      null,
      2,
    ) + "\n",
  );
  fs.writeFileSync(path.join(sessionDir, "README.md"), readme(artifacts, session));

  // --- 4. the report --------------------------------------------------------
  console.log(`\nS128 — the kit session is ready (${passed} assertions passed)`);
  for (const a of artifacts) console.log(`  kit/${a.code}.mp4  ${a.sha256.slice(0, 16)}…  ${(a.bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`\n  sheets:   ${path.relative(REPO_ROOT, sessionDir)}/scorer-{1,2,3}.md`);
  console.log(`  key:      ${path.relative(REPO_ROOT, sessionDir)}/key.json (gitignored — scorers never open it)`);
  console.log(`  next:     3 humans, 3 sheets, then unblind + record in the two rubric records`);
  if (failed > 0) {
    console.error(`\nkit: ${failed} FAILED assertion(s)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

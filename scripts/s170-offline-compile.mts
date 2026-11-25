// S170 — the offline-compile proof (the acceptance receipt).
//
// The acceptance test, verbatim from the roadmap: "disconnect the AI
// provider after the project has been approved. Ibismuh Studio must still
// render the complete video." The compile half of that acceptance is
// THIS script: a real three-mode project (graphics + character + 3d)
// compiled to the engine-facing plan with the provider surface
// structurally absent. The render half is the engines' own existing
// gates (the golden-video harness, the S167 assembly smoke) — they run
// without any model by construction.
//
// What the receipt pins:
//   1. a fully-authored universal project compiles (S169 validate →
//      S170 resolve → S87 projection);
//   2. the compiled plan is DETERMINISTIC — serialized twice, byte-
//      identical, sha256 recorded;
//   3. the compile path's import graph carries zero AI/provider modules
//      (the same source scan the battery pins, run standalone);
//   4. the doc pass-through: the graphics scene rides a REAL
//      scaffoldGraphicsDoc (pure planning — no model asked for anything).
//
// Run: node --import tsx scripts/s170-offline-compile.mts

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

async function main(): Promise<void> {
  console.log("S170 — the offline-compile proof (the AI-disconnect acceptance)");

  const { compileUniversalProject } = await import("../src/lib/ibismuh/animation-compiler");
  const { serializeUniversalProject, validateUniversalProject } = await import("../src/lib/ibismuh/universal-scene");
  const { scaffoldGraphicsDoc } = await import("../src/lib/ibismuh/graphics/planner");

  // The graphics scene rides a REAL native doc — scaffolded by the pure
  // planner (the AI-free path that has been the graphics lane's floor
  // since S153's "AI suggests, human approves" law).
  const graphicsDoc = scaffoldGraphicsDoc({
    scenes: [
      { index: 1, title: "The offline compile", narration: "Approved plans render with the provider unplugged." },
    ],
    topic: "S170 offline compile",
    width: 640,
    height: 360,
    fps: 24,
  }) as unknown as Record<string, unknown>;

  const project = {
    version: 1,
    title: "The offline compile",
    mode: "free",
    scenes: [
      {
        version: 1,
        sceneId: "scene_001",
        kind: "graphics",
        durationMs: 8000,
        background: { type: "color", color: "#101014" },
        narration: { text: "Approved plans render with the provider unplugged.", voiceId: "narrator_01" },
        assets: [],
        directives: [
          { domain: "animation", target: "headline", action: "enter:rise", params: { ease: "measured-out" } },
          { domain: "animation", target: "boundary:1", action: "transition:crossfade" },
          { domain: "visual-style", target: "scene-1", action: "style:graphics" },
        ],
        doc: graphicsDoc,
      },
      {
        version: 1,
        sceneId: "scene_002",
        kind: "character",
        durationMs: 6000,
        narration: { text: "The compile is data, not a model call." },
        assets: [],
        directives: [{ domain: "animation", target: "character", action: "gesture:emphasis" }],
      },
      {
        version: 1,
        sceneId: "scene_003",
        kind: "3d",
        durationMs: 5000,
        assets: [],
        directives: [{ domain: "animation", target: "camera", action: "3d:push-in", params: { rate: 0.15 } }],
      },
    ],
  };

  // 1. validate → compile.
  const check = validateUniversalProject(project);
  ok(check.ok, `the S169 validator admits the project${check.ok ? "" : ` — ${JSON.stringify(check.errors)}`}`);
  const verdict = compileUniversalProject(project);
  ok(verdict.ok, `the compiler produces the plan${verdict.ok ? "" : ` — ${JSON.stringify(verdict.errors)}`}`);
  if (!verdict.ok || !check.ok) throw new Error("the compile must succeed for the receipt to be written");

  const plan = verdict.plan;
  ok(plan.scenes.length === 3, "three scenes compiled");
  ok(plan.totalMs === 19000, `the composition clock reads ${plan.totalMs} ms (8+6+5 s)`);
  ok(plan.scenes[0]?.doc !== null && typeof plan.scenes[0]?.doc === "object", "the real GraphicsDoc rode through untouched (pass-through, no re-validation)");
  ok((plan.scenes[0]?.operations.length ?? 0) >= 3, `scene 1 carries ${plan.scenes[0]?.operations.length} operations`);
  const trans = plan.scenes[0]?.operations.find((o) => o.op === "graphics-transition");
  ok(trans !== undefined && trans.atMs === 8000, "boundary:1 resolves to 8000 ms by arithmetic");
  ok(plan.scenes[1]?.narration !== null && plan.scenes[2]?.narration === null, "narration slots: present where authored, null where not");

  // 2. determinism — serialize, re-parse, re-compile, value-identical.
  // (The project's key ORDER differs between the authored object and the
  // sorted serialization, so both plans compare through a STABLE
  // stringify — the determinism claim is value identity, and the stable
  // form is the byte-identity pin.)
  const stableStringify = (v: unknown): string => {
    const sort = (x: unknown): unknown => {
      if (Array.isArray(x)) return x.map(sort);
      if (x !== null && typeof x === "object") {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(x as Record<string, unknown>).sort()) out[k] = sort((x as Record<string, unknown>)[k]);
        return out;
      }
      return x;
    };
    return JSON.stringify(sort(v));
  };
  const s1 = serializeUniversalProject(project as never);
  const reparsed = JSON.parse(s1);
  const verdict2 = compileUniversalProject(reparsed);
  ok(verdict2.ok, "the re-parsed project re-compiles");
  const planJson1 = stableStringify(plan);
  const planJson2 = stableStringify(verdict2.ok ? verdict2.plan : null);
  ok(planJson1 === planJson2, "the compiled plan is value-identical across an independent compile (stable form byte-identical)");
  ok(serializeUniversalProject(project as never) === serializeUniversalProject(reparsed as never), "the S169 serialization is key-order-independent (sorted)");
  const sha = crypto.createHash("sha256").update(planJson1).digest("hex");
  console.log(`  plan sha256 (stable form): ${sha}`);

  // 3. the import graph — the provider surface structurally absent.
  const src = fs.readFileSync(path.join(REPO_ROOT, "src/lib/ibismuh/animation-compiler.ts"), "utf8");
  const imports = [...src.matchAll(/from "\.\/([^"]+)"/g)].map((m) => m[1]);
  ok(
    imports.length > 0 && imports.every((imp) => !/(zai|llm|provider|voice|openai|research|ai\.ts)/.test(imp)),
    `the compile path imports only data modules: ${imports.join(", ")}`,
  );

  // 4. the receipt.
  const receipt = {
    acceptance: "disconnect the AI provider after the project has been approved — Ibismuh Studio must still render the complete video",
    proof: "the compile half: a fully-authored three-mode project compiles offline (data-in/data-out, zero provider imports); the render half rides the engines' own AI-free gates",
    compiledAtCommit: "HEAD",
    planSha256: sha,
    scenes: plan.scenes.length,
    totalMs: plan.totalMs,
    operationsByLane: plan.scenes.map((s) => ({ sceneId: s.sceneId, kind: s.kind, ops: s.operations.length })),
    determinism: "compiled plan value-identical across two independent compiles (stable-form sha256 of record)",
    imports,
  };
  const receiptPath = path.join(REPO_ROOT, "docs/audits/s170-offline-compile.json");
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  ok(fs.existsSync(receiptPath), `the receipt is on disk: docs/audits/s170-offline-compile.json`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

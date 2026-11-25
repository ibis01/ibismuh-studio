// LIVE-PROVIDER PRODUCTION TEST — the complete script-to-video money path
// with the AI stages hitting the REAL provider.
//
// What makes it "live": scripts/b4-production-test.mts (the three-project
// test) ran the pipeline OFFLINE and recorded the honest provider-gated
// failures. THIS harness is the same money path with the provider-backed
// stages running FOR REAL, measured per stage:
//
//   1. brief accepted (POST /api/videos) — the create route auto-starts
//      the story-lane script job (the LLM lane)
//   2. LIVE script generation — the LLM writes the script (polled through
//      the standard video DTO)
//   3. LIVE script analysis — POST /api/videos/analyze-script (the same
//      verdict the creator-in-control UI shows BEFORE approval)
//   4. LIVE voiceover — POST /api/videos/:id/voiceover {mode:"tts"} (the
//      built-in TTS lane; 202 job → poll hasVoiceover)
//   5. render — the real engine (chromium + ffmpeg) → hasVideo
//   6. QC — the render's QC tail (loudness, dead-air, …) read from the DTO
//   7. export — GET /api/videos/:id/export
//
// The receipt lands under validation/live-provider/ (gitignored) and the
// printed summary is the citation of record for
// docs/audits/live-provider-validation.md.
//
// Gating (never a surprise spend):
//   - IBISMUH_STUDIO_LIVE_AI=0  → hard skip (CI default outside this sandbox)
//   - unreachable server        → skip, with the run command
//   - a failed live stage       → FAIL exit 1, with the provider
//     configuration guide printed (registry.ts is the menu)
//
// Run: node --import tsx scripts/live-provider-production-test.mts
//      [--base http://localhost:3000]

import fs from "node:fs";
import path from "node:path";

/** Loose JSON probe shape — the harness asserts on fixture/DTO shapes the
 *  app itself serializes; unknown-field access is the point of a probe. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the probe shape: harness asserts on app-serialized DTO fields dynamically
type Json = Record<string, any>;
const asJson = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});


const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3000";

interface StageMetric {
  stage: string;
  ok: boolean;
  ms: number;
  note: string;
}
interface Receipt {
  stamp: string;
  base: string;
  verdict: "PASS" | "FAIL" | "SKIPPED";
  reason?: string;
  videoId?: string;
  stages: StageMetric[];
  honestGaps: string[];
  costNote: string;
}

let passed = 0;
let failed = 0;
const stages: StageMetric[] = [];
const honestGaps: string[] = [];
let cookie = "";
let videoId: string | undefined;

function stage(name: string, okFlag: boolean, ms: number, note: string): void {
  stages.push({ stage: name, ok: okFlag, ms, note });
  if (okFlag) {
    passed++;
    console.log(`  ✓ ${name} (${(ms / 1000).toFixed(1)}s) — ${note}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} (${(ms / 1000).toFixed(1)}s) — ${note}`);
  }
}
const now = () => Date.now();
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

async function api(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: () => Promise<Json>; ok: boolean }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: () => res.json(), ok: res.ok };
}

async function pollVideo(
  id: string,
  pick: (v: Json) => boolean,
  maxMs: number,
  pollMs = 2000
): Promise<{ video: Json } | null> {
  const deadline = now() + maxMs;
  while (now() < deadline) {
    const r = await api("GET", `/api/videos/${id}`);
    if (r.ok) {
      const body = await r.json();
      if (pick(body.video ?? {})) return body;
    }
    await new Promise((res) => setTimeout(res, pollMs));
  }
  return null;
}

function writeReceipt(verdict: Receipt["verdict"], reason?: string): void {
  const receipt: Receipt = {
    stamp: new Date().toISOString(),
    base: BASE,
    verdict,
    reason,
    videoId,
    stages,
    honestGaps,
    costNote:
      "default app provider lane (Z.ai SDK gateway as configured); the registry's free flash lane means script generation costs $0 on a fresh key — this run trips no external spend gate; measured spend record: see the printed stage table",
  };
  const dir = path.join(process.cwd(), "validation", "live-provider");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `receipt-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2), "utf-8");
  console.log(`\nreceipt: ${file}`);
}

const PROVIDER_GUIDE = `
PROVIDER CONFIGURATION GUIDE (providers/registry.ts is the full menu):
  - Z.ai (GLM)  — default. Flash models are FREE (scripts cost $0 on a fresh
    key): https://z.ai/model-api — set key in Settings → AI.
  - OpenAI      — cheapest chat: gpt-6-luna ($0.10/$0.50 per 1M).
    https://platform.openai.com/api-keys
  - Local/native — Ollama / LM Studio / vLLM: $0, no key (requiresKey: false).
  Wire formats for public OpenAI-compatible endpoints are already validated
  by scripts/test-providers.mjs Part A (the stub suite).
`;

async function main(): Promise<void> {
  console.log("LIVE-PROVIDER PRODUCTION TEST — complete script→video, AI stages live");
  console.log(`base: ${BASE}\n`);

  // ---------- gate 1: the kill switch ----------
  if (process.env.IBISMUH_STUDIO_LIVE_AI === "0") {
    console.log("SKIPPED — IBISMUH_STUDIO_LIVE_AI=0 (the CI/nightly default outside a provisioned sandbox).");
    writeReceipt("SKIPPED", "kill switch");
    return;
  }

  // ---------- gate 2: server reachable ----------
  const tPing = now();
  let up = false;
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(8000) });
    up = res.ok;
  } catch {
    up = false;
  }
  if (!up) {
    console.log(`SKIPPED — no server at ${BASE}. Start it (bun run dev) and re-run.`);
    writeReceipt("SKIPPED", "server unreachable");
    return;
  }
  stage("server reachable", true, now() - tPing, "GET / answered");

  // ---------- auth ----------
  const tAuth = now();
  const email = `live-ai-${Date.now()}@ibismuh.test`;
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Built, never a literal after `password:` — the S116/gitleaks law.
    body: JSON.stringify({ name: "Live Provider Test", email, password: ["liveai", String(Date.now() % 100000)].join("-") }),
  });
  const setCookie = reg.headers.get("set-cookie") ?? "";
  cookie = setCookie.split(";")[0] ?? "";
  const regBody = (await reg.json().catch(() => ({}))) as { verification?: { url?: string } };
  if (regBody.verification?.url) await fetch(`${BASE}${regBody.verification.url}`);
  stage("register + login", reg.status < 300 && cookie.includes("ibismuh_session="), now() - tAuth, `${email}`);

  // ---------- the brief (create route auto-starts the LLM script job) ----------
  const tBrief = now();
  const created = await api("POST", "/api/videos", {
    topic: "How coffee reshaped the modern city — the café as office, salon, and engine of the newspaper",
    format: "story",
    niche: "history",
    approved: true,
  });
  const createBody = created.status < 300 ? await created.json() : {};
  videoId = createBody?.video?.id;
  stage("brief accepted", created.status < 300 && Boolean(videoId), now() - tBrief, `POST /api/videos → ${videoId ?? "no id"}`);
  if (!videoId) {
    writeReceipt("FAIL", "create route rejected the brief");
    console.error(PROVIDER_GUIDE);
    process.exit(1);
  }

  // ---------- LIVE script generation (the LLM lane) ----------
  const tScript = now();
  const landedScript = await pollVideo(
    videoId,
    (v) => Boolean(v.error) || (typeof v.script === "string" && v.script.trim().length > 40) || (v.scenes?.length ?? 0) > 0,
    180_000
  );
  const vScript = landedScript?.video ?? {};
  const scriptText = typeof vScript.script === "string" ? vScript.script : "";
  const sceneCount = Array.isArray(vScript.scenes) ? vScript.scenes.length : 0;
  const scriptOk = !vScript.error && (scriptText.trim().length > 40 || sceneCount > 0);
  stage(
    "LIVE script generation",
    scriptOk,
    now() - tScript,
    scriptOk
      ? `${wordCount(scriptText) || "(script in scenes)"} words, ${sceneCount} scenes scaffolded`
      : `error: ${String(vScript.error ?? "no script landed within 180s").slice(0, 160)}`
  );
  if (!scriptOk) honestGaps.push(`script lane surfaced: ${String(vScript.error ?? "timeout").slice(0, 200)}`);

  // ---------- LIVE script analysis (the creator-in-control verdict) ----------
  const tAnalyze = now();
  const sample =
    scriptText.trim().length > 40
      ? scriptText
      : "Coffee houses spread through Europe in the seventeenth century. They charged a penny at the door, so a clerk could sit all day for the price of a cup. The London penny universities employed more people per building than any workshop, and the daily sheets they printed became the first newspapers the city read over breakfast.";
  const analyze = await api("POST", "/api/videos/analyze-script", { script: sample, topic: "coffee houses and the modern city" });
  const analyzeBody = await analyze.json().catch(() => ({}));
  const analyzeOk = analyze.status < 300 && analyzeBody && !analyzeBody.error;
  stage(
    "LIVE script analysis",
    analyzeOk,
    now() - tAnalyze,
    analyzeOk
      ? `verdict keys: ${Object.keys(analyzeBody).slice(0, 6).join(", ")}`
      : `HTTP ${analyze.status}: ${JSON.stringify(analyzeBody).slice(0, 160)}`
  );

  // ---------- LIVE voiceover (built-in TTS lane) ----------
  const tVo = now();
  const vo = await api("POST", `/api/videos/${videoId}/voiceover`, { mode: "tts" });
  const voAccepted = [200, 202].includes(vo.status);
  const voLanded = voAccepted
    ? await pollVideo(videoId, (v) => v.hasVoiceover === true || Boolean(v.error), 240_000)
    : null;
  const voOk = voAccepted && Boolean(voLanded?.video?.hasVoiceover) && !voLanded?.video?.error;
  stage(
    "LIVE voiceover (TTS)",
    voOk,
    now() - tVo,
    voOk
      ? "hasVoiceover true — the TTS job completed"
      : `accepted=${vo.status}, landed=${Boolean(voLanded?.video?.hasVoiceover)}, error: ${String(voLanded?.video?.error ?? "none").slice(0, 160)}`
  );
  if (!voOk) honestGaps.push(`voiceover stage: HTTP ${vo.status}; ${String(voLanded?.video?.error ?? "did not land in 240s").slice(0, 200)}`);

  // ---------- render (the real engine) ----------
  const tRender = now();
  const render = await api("POST", `/api/videos/${videoId}/render`, {});
  const renderAccepted = [200, 202].includes(render.status);
  const renderLanded = renderAccepted
    ? await pollVideo(videoId, (v) => Boolean(v.hasVideo) || Boolean(v.error), 300_000)
    : null;
  const renderOk = renderAccepted && Boolean(renderLanded?.video?.hasVideo);
  stage(
    "render (real engine)",
    renderOk,
    now() - tRender,
    renderOk
      ? `hasVideo true${renderLanded?.video?.videoDuration ? ` — ${renderLanded.video.videoDuration}s program` : ""}`
      : `accepted=${render.status}, body: ${JSON.stringify(await render.json().catch(() => ({}))).slice(0, 200)}`
  );
  if (!renderOk) honestGaps.push(`render stage: HTTP ${render.status}; ${String(renderLanded?.video?.error ?? "refused or timed out").slice(0, 200)}`);

  // ---------- QC (the render's QC tail) ----------
  const tQc = now();
  let qcReport: Json | null = null;
  for (let i = 0; i < 30; i++) {
    const dto = await (await api("GET", `/api/videos/${videoId}`)).json();
    qcReport = asJson(asJson(dto).video).qc ?? null;
    if (qcReport) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const qcPassed = Boolean(qcReport?.passed);
    const loudness = String(((qcReport?.checks ?? []) as Json[]).find((r) => asJson(r).id === "loudness")?.value ?? "?");
  const deadAir = String(((qcReport?.checks ?? []) as Json[]).find((r) => asJson(r).id === "dead-air")?.value ?? "?");
  stage("QC battery", qcPassed, now() - tQc, `loudness ${loudness}, dead-air ${deadAir}`);
  if (!qcPassed) {
    const rows = ((qcReport?.checks ?? []) as Json[]);
    const bad = rows.filter((r) => (r.status ?? (r.passed ? "pass" : "fail")) === "fail").map((r) => r.id ?? r.label);
    honestGaps.push(`QC flagged: ${bad.join(", ") || "report absent"}`);
  }

  // ---------- export ----------
  const tExport = now();
  const bundle = await api("GET", `/api/videos/${videoId}/export`);
  const exportOk = bundle.status < 300;
  stage("export bundle", exportOk, now() - tExport, `GET /export → ${bundle.status}`);

  // ---------- verdict ----------
  const verdict: Receipt["verdict"] = failed === 0 ? "PASS" : "FAIL";
  console.log(`\n===== LIVE-PROVIDER RESULT: ${verdict} — ${passed} passed, ${failed} failed =====`);
  for (const g of honestGaps) console.log(`  gap: ${g}`);
  if (failed > 0) {
    console.error(PROVIDER_GUIDE);
    writeReceipt("FAIL");
    process.exit(1);
  }
  writeReceipt("PASS");
}

main().catch((err: unknown) => {
  console.error("suite crashed:", err);
  writeReceipt("FAIL", String(err).slice(0, 300));
  process.exit(1);
});

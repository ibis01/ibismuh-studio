#!/usr/bin/env node
// provider readiness battery — master plan Phase 9: the readiness surface's
// laws, pinned (pure aggregation — no DB, no live services).
//
//   1. READY LAW    — providerKnown AND (keyOptional OR hasKey OR
//                     platformBacked); every other shape is NOT ready.
//   2. FAIL-CLOSED  — an unknown provider is never ready, whatever keys
//                     claim otherwise.
//   3. DEGRADATION  — a not-ready capability names the lane contracts' own
//                     fallback sentences (the honest consequence); a ready
//                     one carries none.
//   4. LANE MAPPING — voice-provider maps to the lanes whose contracts
//                     declare it; the brain capabilities map to every lane.
//   5. PRIVACY      — the readiness object never carries a secret-shaped
//                     field (the battery pins the exact key set).
//   6. WIRING       — the route rides requireUser (the standard gate) and
//                     the response carries no key material (textual pin).
//
// Run: npm run test:provider-status   (pure; CI step)

import fs from "node:fs";

let passed = 0;
let failed = 0;
const failures: string[] = [];
let suite = "";

function suiteStart(name: string): void {
  suite = name;
  console.log(`\n◆ ${name}`);
}
function ok(cond: unknown, msg?: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg ?? "ok"}`);
  } else {
    failed += 1;
    failures.push(`${suite} — ${msg ?? "ok"}`);
    console.log(`  ✗ ${suite} — ${msg ?? "ok"}`);
  }
}
function eq(actual: unknown, expected: unknown, msg: string): void {
  ok(actual === expected, `${msg} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

const { computeCapabilityReadiness, PROVIDER_CAPABILITIES } = await import(
  "../src/lib/ibismuh/providers/status"
);

// --- 1+2. THE READY LAW + FAIL-CLOSED ---------------------------------------

suiteStart("the ready law — known provider, one usable credential path");

{
  const local = computeCapabilityReadiness("chat", { provider: "ollama", model: "llama3", hasKey: false });
  ok(local.providerKnown && local.keyOptional && local.ready, "a local provider (requiresKey false) is ready key-less");
  const keyed = computeCapabilityReadiness("chat", { provider: "openai", model: "gpt-4o", hasKey: true });
  ok(keyed.ready, "a keyed cloud provider is ready");
  const keyless = computeCapabilityReadiness("chat", { provider: "openai", model: "gpt-4o", hasKey: false });
  ok(!keyless.ready, "a cloud provider without a key is NOT ready");
  const platform = computeCapabilityReadiness("chat", { provider: "zai", model: "glm-4", hasKey: false, platformBacked: true });
  ok(platform.ready && platform.platformBacked, "the platform's global grant makes zai ready");
  const ghost = computeCapabilityReadiness("chat", { provider: "not-a-provider", model: "", hasKey: true });
  ok(!ghost.ready && !ghost.providerKnown, "an unknown provider is NEVER ready (fail-closed)");
}

// --- 3. THE DEGRADATION SENTENCES -------------------------------------------

suiteStart("the degradation sentences — the honest consequence rides the answer");

{
  const notReady = computeCapabilityReadiness("tts", { provider: "openai", model: "", hasKey: false });
  ok(notReady.degradation.length > 0, "a not-ready voice capability names its degradation");
  const contracts = await import("../src/lib/ibismuh/lane-contracts");
  const expected = [...new Set(notReady.lanes.map((l) => contracts.LANE_CONTRACTS[l].fallbackPolicy))];
  eq(JSON.stringify(notReady.degradation), JSON.stringify(expected), "the sentences are the contracts' fallbackPolicy, verbatim and deduped");
  const ready = computeCapabilityReadiness("tts", { provider: "openai", model: "tts-1", hasKey: true });
  eq(ready.degradation.length, 0, "a ready capability carries no degradation");
}

// --- 4. THE LANE MAPPING ------------------------------------------------------

suiteStart("the lane mapping — derived mechanically from the contracts' capability tags");

{
  const contracts = await import("../src/lib/ibismuh/lane-contracts");
  const voice = computeCapabilityReadiness("tts", { provider: "zai", model: "", hasKey: false });
  const declaredVoice = contracts.LANE_ORDER.filter((t) => contracts.LANE_CONTRACTS[t].capabilities.includes("voice-provider"));
  eq(JSON.stringify(voice.lanes), JSON.stringify(declaredVoice), "tts maps to exactly the lanes that declare voice-provider");
  const brain = computeCapabilityReadiness("chat", { provider: "zai", model: "", hasKey: false });
  eq(brain.lanes.length, 6, "chat (the director brain) maps to every lane");
  const asr = computeCapabilityReadiness("asr", { provider: "zai", model: "", hasKey: false });
  eq(asr.lanes.length, 6, "asr maps to every lane too (the caption seam rides all lanes)");
}

// --- 5. THE PRIVACY LAW -------------------------------------------------------

suiteStart("the privacy law — the surface never carries secrets");

{
  const readiness = computeCapabilityReadiness("chat", { provider: "zai", model: "glm-4", hasKey: true });
  const allowed = new Set([
    "provider", "model", "providerKnown", "keyOptional", "hasKey", "platformBacked", "ready", "lanes", "degradation",
  ]);
  for (const key of Object.keys(readiness)) ok(allowed.has(key), `field "${key}" is declared shape`);
  const serialized = JSON.stringify(readiness);
  ok(!/sk-[A-Za-z0-9]{8,}/.test(serialized), "no key-shaped material in the payload");
}

// --- 6. THE WIRING PIN ---------------------------------------------------------

suiteStart("the wiring pin — the route rides the standard gate, the shape is schema-stamped");

{
  const routeSrc = fs.readFileSync("src/app/api/providers/status/route.ts", "utf8");
  ok(routeSrc.includes("requireUser(req)"), "the endpoint is behind the standard auth gate");
  ok(!routeSrc.includes("maskKey") && !routeSrc.includes("apiKey:"), "the route never serializes key material itself");
  ok(routeSrc.includes("schema: 1"), "the response is schema-stamped");
  eq(PROVIDER_CAPABILITIES.length, 5, "all five capabilities report");
}

// --- report --------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(failures.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(1);
}

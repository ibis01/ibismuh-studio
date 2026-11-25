#!/usr/bin/env node
// plan-contracts — the shared production spine (master plan §4.2/§4.3/§4.4).
//
// One suite pins the three contracts every lane now shares:
//
//   audio-receipt.ts   — measured audio measured ONCE: sane spans, ordered
//                        timelines, declared timing priority chain.
//   timeline-ops.ts    — the closed 12-op vocabulary, stable unique ids,
//                        ordered windows, fail-closed parsing.
//   plan-envelope.ts   — the immutable versioned plan: lane truth from the
//                        registry, declared timing, mandatory provenance,
//                        declared fallbacks, tamper-evident fingerprints.
//
// Run: npm run test:plan-contracts   (pure — no DB, no DOM; CI step)

import {
  buildAudioReceipt,
  parseAudioReceipt,
  resolveTimingSource,
  serializeAudioReceipt,
  audioReceiptHash,
  TIMING_PRIORITY,
  type AudioReceipt,
} from "../src/lib/ibismuh/audio-receipt";
import { compileTimeline, parseTimeline, serializeTimeline, timelineHash } from "../src/lib/ibismuh/timeline-ops";
import type { TimelineDoc } from "../src/lib/ibismuh/timeline-ops";
import {
  compilePlanEnvelope,
  computePlanFingerprint,
  parsePlanEnvelope,
  serializePlanEnvelope,
  type VideoPlanEnvelope,
} from "../src/lib/ibismuh/plan-envelope";

let passed = 0;
let failed = 0;
const failures: string[] = [];
let suite = "";

function suiteStart(name: string) {
  suite = name;
  console.log(`\n◆ ${name}`);
}

function ok(cond: unknown, msg?: string) {
  if (cond) return;
  throw new Error(msg ?? `assertion failed in "${suite}"`);
}

function eq(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) return;
  throw new Error(msg ?? `expected ${b}, got ${a} (in "${suite}")`);
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push(`${suite} — ${name}: ${err instanceof Error ? err.message : String(err)}`);
    console.log(`  ✗ ${name}`);
  }
}

function throwsWith(fn: () => unknown, re: RegExp, what: string) {
  let err: unknown = null;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  ok(err instanceof Error && re.test(err.message), `${what} — got: ${String(err)}`);
}

const HASH = "a".repeat(64);

function receipt(over: Partial<AudioReceipt> = {}): AudioReceipt {
  return {
    version: 1,
    sourceHash: HASH,
    durationMs: 60_000,
    sampleRate: 44_100,
    channels: 2,
    silenceSpans: [{ startMs: 0, endMs: 200 }],
    sentenceSpans: [{ id: "s1", startMs: 200, endMs: 30_000 }],
    wordSpans: [
      { word: "hello", startMs: 200, endMs: 700 },
      { word: "world", startMs: 720, endMs: 1_200 },
    ],
    normalization: { applied: true, target: "-16 LUFS" },
    ...over,
  };
}

// --- 1. AUDIO RECEIPT -----------------------------------------------------------

suiteStart("audio receipt");

await test("the priority chain is declared and ordered", () => {
  eq(TIMING_PRIORITY, ["manual", "word-timestamps", "sentence-timestamps", "estimate"]);
});

await test("a receipt builds, serializes deterministically, and hashes stably", () => {
  const a = buildAudioReceipt({
    sourceHash: HASH,
    durationMs: 60_000,
    sampleRate: 44_100,
    channels: 2,
    wordSpans: [{ word: "hello", startMs: 0, endMs: 500 }],
  });
  const b = buildAudioReceipt({
    sourceHash: HASH,
    durationMs: 60_000,
    sampleRate: 44_100,
    channels: 2,
    wordSpans: [{ word: "hello", startMs: 0, endMs: 500 }],
  });
  eq(serializeAudioReceipt(a), serializeAudioReceipt(b));
  eq(audioReceiptHash(a), audioReceiptHash(b));
});

await test("a receipt round-trips through parse", () => {
  const r = buildAudioReceipt({
    sourceHash: HASH,
    durationMs: 60_000,
    sampleRate: 44_100,
    channels: 1,
    sentenceSpans: [{ id: "s1", startMs: 0, endMs: 9_999 }],
  });
  const back = parseAudioReceipt(serializeAudioReceipt(r));
  eq(serializeAudioReceipt(back), serializeAudioReceipt(r), "the canonical form is the round-trip identity");
  eq(back.normalization.applied, false);
});

await test("structural nonsense fails closed", () => {
  throwsWith(() => buildAudioReceipt({ sourceHash: "nope", durationMs: 1, sampleRate: 44_100, channels: 1 }), /sha256/, "bad hash");
  throwsWith(
    () => buildAudioReceipt({ sourceHash: HASH, durationMs: -5, sampleRate: 44_100, channels: 1 }),
    /durationMs/,
    "negative duration",
  );
  throwsWith(
    () => buildAudioReceipt({ sourceHash: HASH, durationMs: 1_000, sampleRate: 44_100, channels: 1, wordSpans: [{ word: "late", startMs: 0, endMs: 2_000 }] }),
    /past the 1000ms/,
    "span past the audio",
  );
  throwsWith(
    () =>
      buildAudioReceipt({
        sourceHash: HASH,
        durationMs: 60_000,
        sampleRate: 44_100,
        channels: 1,
        sentenceSpans: [
          { id: "s2", startMs: 0, endMs: 10_000 },
          { id: "s1", startMs: 5_000, endMs: 20_000 },
        ],
      }),
    /ordered/,
    "unordered spans",
  );
  throwsWith(
    () => buildAudioReceipt({ sourceHash: HASH, durationMs: 60_000, sampleRate: 44_100, channels: 1, wordSpans: [{ word: "", startMs: 0, endMs: 10 }] }),
    /word text/,
    "empty word",
  );
});

await test("parsing rejects unknown versions and garbage", () => {
  throwsWith(() => parseAudioReceipt("{not json"), /not valid JSON/, "bad json");
  const doc = receipt(); doc.version = 99;
  throwsWith(() => parseAudioReceipt(JSON.stringify(doc)), /unsupported version/, "unknown version");
  const missing = receipt() as unknown as Record<string, unknown>;
  delete missing.sampleRate;
  throwsWith(() => parseAudioReceipt(JSON.stringify(missing)), /sampleRate/, "missing field");
});

await test("the timing-source decision walks the priority chain", () => {
  eq(resolveTimingSource({ manualEditedTiming: true, allowEstimate: false }).source, "manual");
  eq(resolveTimingSource({ audioReceipt: receipt(), allowEstimate: false }).source, "word-timestamps");
  const sentenceOnly = receipt({ wordSpans: undefined });
  eq(resolveTimingSource({ audioReceipt: sentenceOnly, allowEstimate: false }).source, "sentence-timestamps");
  const bare = receipt({ wordSpans: undefined, sentenceSpans: [] });
  const est = resolveTimingSource({ audioReceipt: bare, allowEstimate: true });
  eq(est.source, "estimate");
  eq(est.declared, true, "an estimate is always declared");
  ok(/DECLARED/.test(est.reason));
  throwsWith(() => resolveTimingSource({ allowEstimate: false }), /not allowed/, "no evidence + no estimate");
});

// --- 2. TIMELINE OPS ------------------------------------------------------------

suiteStart("timeline ops");

const baseOps = () => [
  { op: "showAsset" as const, startMs: 0, endMs: 5_000, assetRef: "a1", sceneRef: "s1" },
  { op: "drawPath" as const, startMs: 500, endMs: 3_000, assetRef: "a1", beatId: "b1" },
  { op: "caption" as const, startMs: 5_000, endMs: 9_000, beatId: "b2" },
];

await test("a timeline compiles with deterministic ids and stable hash", () => {
  const a = compileTimeline("plan-1", baseOps());
  const b = compileTimeline("plan-1", baseOps());
  eq(serializeTimeline(a), serializeTimeline(b));
  eq(timelineHash(a), timelineHash(b));
  eq(a.ops.map((o) => o.id), ["showAsset:0", "drawPath:500", "caption:5000"]);
});

await test("timeline compilation fails closed on structural nonsense", () => {
  throwsWith(() => compileTimeline(undefined, [{ op: "holagram" as never, startMs: 0, endMs: 1 }]), /unknown operation/, "unknown op");
  throwsWith(() => compileTimeline(undefined, [{ op: "hold", startMs: 5, endMs: 1 }]), /ends at 1ms before/, "inverted window");
  throwsWith(() => compileTimeline(undefined, [{ op: "hold", startMs: -1, endMs: 5 }]), /negative/, "negative time");
  throwsWith(
    () => compileTimeline(undefined, [{ op: "hold", startMs: 0, endMs: 1 }, { op: "hold", startMs: 0, endMs: 1 }]),
    /duplicate op id/,
    "duplicate ids",
  );
  throwsWith(
    () => compileTimeline(undefined, [{ op: "hold", startMs: 10, endMs: 20 }, { op: "hold", startMs: 5, endMs: 8 }]),
    /ordered by start/,
    "unordered starts",
  );
});

await test("a timeline round-trips and parses fail-closed", () => {
  const doc = compileTimeline("plan-1", baseOps());
  eq(parseTimeline(serializeTimeline(doc)).ops.length, 3);
  const bad = JSON.parse(serializeTimeline(doc)) as Record<string, unknown>;
  bad.version = 42;
  throwsWith(() => parseTimeline(JSON.stringify(bad)), /unsupported version/, "unknown version");
  const inverted = compileTimeline(undefined, baseOps());
  (inverted.ops[1] as { endMs: number }).endMs = -3;
  throwsWith(() => parseTimeline(JSON.stringify(inverted)), /invalid|before it starts|must be a finite/, "mutated window");
  throwsWith(
    () => compileTimeline(undefined, [{ op: "hold", startMs: 0, endMs: 1, params: { x: Number.NaN } }]),
    /non-finite/,
    "NaN param refused at compile",
  );
  // A params value of an exotic type is also refused, at both gates.
  const exotic = compileTimeline(undefined, [{ op: "hold", startMs: 0, endMs: 1, params: { mode: "still" } }]);
  eq(parseTimeline(serializeTimeline(exotic)).ops[0].params, { mode: "still" });
  const objectParam = { version: 1, planRef: undefined, ops: [{ id: "hold:0", op: "hold", startMs: 0, endMs: 1, params: { x: { nested: true } } }] };
  throwsWith(() => parseTimeline(JSON.stringify(objectParam)), /string\|number\|boolean/, "object param");
});

// --- 3. PLAN ENVELOPE -----------------------------------------------------------

suiteStart("plan envelope");

function envelopeInput(over: Parameters<typeof compilePlanEnvelope>[0] = {} as never): Parameters<typeof compilePlanEnvelope>[0] {
  const timeline: TimelineDoc = compileTimeline(undefined, [
    { op: "showAsset", startMs: 0, endMs: 10_000, assetRef: "asset-1", sceneRef: "scene-1" },
    { op: "caption", startMs: 0, endMs: 10_000, beatId: "b1" },
  ]);
  return {
    planId: "plan-abc",
    revision: 1,
    videoType: "whiteboard",
    briefHash: HASH,
    aspect: "16:9",
    width: 1920,
    height: 1080,
    fps: 30,
    narration: { source: "word-timestamps", text: "Draw the idea" },
    audioReceipt: receipt(),
    beats: [{ id: "b1", narrationWindow: { startMs: 0, endMs: 10_000 }, visualIntent: "open on the concept", sceneRef: "scene-1" }],
    assets: [
      {
        assetId: "asset-1",
        sourceKind: "builtin",
        license: "ibismuh-builtin",
        contentHash: "b".repeat(64),
        storageKey: "tenants/t1/whiteboard/asset-1.svg",
        tenantId: "t1",
      },
    ],
    timeline,
    fallback: { mode: "native", declared: true, reason: "full-fidelity lane — no degradation taken" },
    rendererVersion: "whiteboard-engine-v1",
    ...over,
  };
}

await test("a whiteboard envelope compiles, fingerprints, and round-trips", () => {
  const plan = compilePlanEnvelope(envelopeInput());
  eq(plan.renderMode, "whiteboard", "renderMode comes from the lane registry");
  eq(plan.format, "story");
  eq(plan.qcProfile, "whiteboard-engine-v1");
  ok(plan.fingerprint.length === 64);
  const back = parsePlanEnvelope(serializePlanEnvelope(plan));
  eq(back.fingerprint, plan.fingerprint);
});

await test("deterministic compilation is byte-stable", () => {
  const a = compilePlanEnvelope(envelopeInput());
  const b = compilePlanEnvelope(envelopeInput());
  eq(serializePlanEnvelope(a), serializePlanEnvelope(b));
});

await test("lane truth: the envelope must agree with its lane's declarations", () => {
  throwsWith(() => compilePlanEnvelope(envelopeInput({ videoType: "slides", aspect: "16:9", width: 1920, height: 1080 })), /does not support aspect/, "slides demands 9:16");
  throwsWith(() => compilePlanEnvelope(envelopeInput({ videoType: "classic", fps: 24 })), /does not produce 24fps/, "classic is 30fps");
  throwsWith(() => compilePlanEnvelope(envelopeInput({ videoType: "holagram" as never })), /unknown lane/, "unknown lane");
});

await test("declared timing: measured sources require a riding receipt", () => {
  throwsWith(() => compilePlanEnvelope(envelopeInput({ audioReceipt: undefined })), /requires a riding audio receipt/, "word-timestamps without receipt");
  const est = compilePlanEnvelope(envelopeInput({ narration: { source: "estimate", estimatedDurationMs: 42_000 }, audioReceipt: undefined }));
  eq(est.narration.source, "estimate");
  throwsWith(
    () => compilePlanEnvelope(envelopeInput({ narration: { source: "estimate" }, audioReceipt: undefined })),
    /estimatedDurationMs/,
    "estimate without its declaration",
  );
});

await test("provenance and fallback laws", () => {
  const noLicense = envelopeInput();
  noLicense.assets = [{ ...noLicense.assets[0], license: "" }];
  throwsWith(() => compilePlanEnvelope(noLicense), /license/, "empty license");
  const noTenant = envelopeInput();
  noTenant.assets = [{ ...noTenant.assets[0], tenantId: "" }];
  throwsWith(() => compilePlanEnvelope(noTenant), /tenantId/, "empty tenant");
  const badHash = envelopeInput();
  badHash.assets = [{ ...badHash.assets[0], contentHash: "zz" }];
  throwsWith(() => compilePlanEnvelope(badHash), /contentHash/, "bad content hash");
  throwsWith(
    () => compilePlanEnvelope(envelopeInput({ fallback: { mode: "native", declared: false, reason: "none" } as never })),
    /declared must be true/,
    "undeclared fallback",
  );
});

await test("beat laws: unique ids, sane windows, declared intent", () => {
  const dup = envelopeInput();
  dup.beats = [dup.beats[0], { ...dup.beats[0] }];
  throwsWith(() => compilePlanEnvelope(dup), /duplicated/, "duplicate beat id");
  const inverted = envelopeInput();
  inverted.beats = [{ id: "b1", narrationWindow: { startMs: 9_000, endMs: 1_000 }, visualIntent: "x" }];
  throwsWith(() => compilePlanEnvelope(inverted), /invalid narration window/, "inverted window");
  const noIntent = envelopeInput();
  noIntent.beats = [{ id: "b1", narrationWindow: { startMs: 0, endMs: 1_000 }, visualIntent: "" }];
  throwsWith(() => compilePlanEnvelope(noIntent), /visual intent/, "missing intent");
});

await test("repair linkage: a new revision linked to its parent is a DIFFERENT plan", () => {
  const r1 = compilePlanEnvelope(envelopeInput());
  const r2 = compilePlanEnvelope(envelopeInput({ revision: 2, parentRevision: 1 }));
  ok(r1.fingerprint !== r2.fingerprint, "a repair revision changes the fingerprint");
  const back = parsePlanEnvelope(serializePlanEnvelope(r2));
  eq(back.parentRevision, 1);
  eq(back.revision, 2);
});

await test("parsing is version-first, lane-truthful, and tamper-evident", () => {
  throwsWith(() => parsePlanEnvelope("{nope"), /not valid JSON/, "bad json");
  const plan = compilePlanEnvelope(envelopeInput());

  const wrongVersion = JSON.parse(serializePlanEnvelope(plan)) as Record<string, unknown>;
  wrongVersion.version = 7;
  throwsWith(() => parsePlanEnvelope(JSON.stringify(wrongVersion)), /unsupported version/, "unknown version");

  // A forged renderMode WITH a recomputed fingerprint still fails — the
  // lane-truth law fires after the shape check.
  const forged = JSON.parse(serializePlanEnvelope(plan)) as Record<string, unknown>;
  forged.renderMode = "graphics";
  forged.fingerprint = computePlanFingerprint(forged as unknown as VideoPlanEnvelope);
  throwsWith(() => parsePlanEnvelope(JSON.stringify(forged)), /contradicts lane/, "forged renderMode");

  // An honest-looking edit without a fingerprint recompute is tamper-evident.
  const tampered = serializePlanEnvelope(plan).replace("1920", "1919");
  throwsWith(() => parsePlanEnvelope(tampered), /fingerprint mismatch/, "byte tamper");

  const missingFingerprint = JSON.parse(serializePlanEnvelope(plan)) as Record<string, unknown>;
  delete missingFingerprint.fingerprint;
  throwsWith(() => parsePlanEnvelope(JSON.stringify(missingFingerprint)), /fingerprint must be/, "missing fingerprint");
});

await test("serializePlanEnvelope embeds the fingerprint so the stored document self-verifies", () => {
  const plan = compilePlanEnvelope(envelopeInput());
  ok(serializePlanEnvelope(plan).includes(plan.fingerprint));
});

// --- teardown -------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed${failures.length ? ":" : ""}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failed > 0 ? 1 : 0);

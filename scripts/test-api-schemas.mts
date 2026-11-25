// API schemas — the shared-validation battery (2026-11-23).
//
//   npm run test:api-schemas
//
// Finding F-08: manual per-route validation coerced silently (Number → NaN
// rode into the DB layer), accepted absurd lengths, and defaulted unknown
// enums. This battery pins the shared Zod layer: NaN/Infinity rejection,
// enum snapping replaced by rejection, malformed ids, length walls, and the
// routes' integration (source pins).

import fs from "node:fs";

let failed = false;
function ok(cond: unknown, msg: string): asserts cond {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failed = true;
    console.error(`  ✗ ${msg}`);
  }
}

async function main(): Promise<void> {
  console.log("◆ api schemas — the shared validation battery (F-08)");

  const mod = await import("../src/lib/ibismuh/api-schemas.ts");
  const {
    videoCreateSchema,
    videoPatchSchema,
    jobCancelSchema,
    providerSettingsPatchSchema,
    providerTestSchema,
    cloneMetaSchema,
    parseJsonValue,
  } = mod;

  // ---- 1. video create -------------------------------------------------
  console.log("\n— 1. videoCreateSchema: the old silent-coercion class dies");

  ok(videoCreateSchema.safeParse({ topic: "How to focus" }).success, "1.1  a minimal valid create passes");
  {
    const r = videoCreateSchema.safeParse({ topic: "x", ttsSpeed: Number.NaN });
    ok(!r.success, "1.2  NaN speed is REJECTED (the old path clamped NaN through Math.min/max)");
  }
  {
    const r = videoCreateSchema.safeParse({ topic: "x", musicVolume: Number.POSITIVE_INFINITY });
    ok(!r.success, "1.3  Infinity volume is REJECTED");
  }
  {
    const r = videoCreateSchema.safeParse({ topic: "x", format: "bogus" });
    ok(!r.success, "1.4  an unknown format is REJECTED (the old path silently defaulted to 'script')");
  }
  {
    const r = videoCreateSchema.safeParse({ topic: "x", renderMode: "nonexistent" });
    ok(!r.success, "1.5  an unknown render mode is REJECTED (silent 'kenburns' default is gone)");
  }
  {
    const r = videoCreateSchema.safeParse({ topic: "x", channelId: "../../etc/passwd" });
    ok(!r.success, "1.6  a path-traversal channelId is REJECTED at the schema (the scoped lookup stays as layer 2)");
  }
  ok(!videoCreateSchema.safeParse({ topic: "a".repeat(301) }).success, "1.7  an over-long topic is rejected");
  ok(!videoCreateSchema.safeParse({ topic: "x", researchSources: Array.from({ length: 7 }, () => ({ url: "https://a.test/1" })) }).success, "1.8  more than 6 research sources is rejected");
  ok(videoCreateSchema.safeParse({ topic: "x", ttsSpeed: 1.5, format: "story", musicVolume: 0.8 }).success, "1.9  a fully-populated valid create passes");

  // ---- 2. video patch ---------------------------------------------------
  ok(videoPatchSchema.safeParse({ title: "New title" }).success, "2.1  a partial patch passes");
  ok(!videoPatchSchema.safeParse({ title: "a".repeat(301) }).success, "2.2  an over-long title is rejected");

  // ---- 3. job cancel -----------------------------------------------------
  ok(jobCancelSchema.safeParse({ entityId: "cmwti42620001b0n43eko3mnn", kind: "script" }).success, "3.1  a valid cancel passes");
  ok(!jobCancelSchema.safeParse({ entityId: "x", kind: "script" }).success, "3.2  a malformed entityId is rejected");
  ok(!jobCancelSchema.safeParse({ entityId: "cmwti42620001b0n43eko3mnn", kind: "" }).success, "3.3  an empty kind is rejected");

  // ---- 4. provider settings ---------------------------------------------
  ok(providerSettingsPatchSchema.safeParse({ capability: "chat", provider: "zai", model: "glm-4.6" }).success, "4.1  a valid provider patch passes");
  ok(!providerSettingsPatchSchema.safeParse({ capability: "not-a-capability" }).success, "4.2  an unknown capability is rejected");
  ok(!providerSettingsPatchSchema.safeParse({ apiKey: "k".repeat(501) }).success, "4.3  an absurd API key length is rejected");
  ok(providerTestSchema.safeParse({}).success, "4.4  an empty test body passes (the 'test saved settings' contract)");
  ok(!providerTestSchema.safeParse({ model: "m".repeat(121) }).success, "4.5  an absurd model name is rejected");

  // ---- 5. clone metadata --------------------------------------------------
  ok(cloneMetaSchema.safeParse({ name: "My voice" }).success, "5.1  valid clone metadata passes");
  ok(!cloneMetaSchema.safeParse({ name: "n".repeat(81) }).success, "5.2  an over-long clone name is rejected");
  ok(!cloneMetaSchema.safeParse({ sampleText: "s".repeat(4001) }).success, "5.3  an over-long sample transcript is rejected");

  // ---- 6. parseJsonValue never throws ------------------------------------
  {
    const r = parseJsonValue({ topic: "ok" }, videoCreateSchema);
    ok(r.ok && r.data.topic === "ok", "6.1  parseJsonValue returns the parsed data");
    const bad = parseJsonValue({ topic: "x", ttsSpeed: "not a number" }, videoCreateSchema);
    ok(!bad.ok && bad.ok === false && "error" in bad, "6.2  parseJsonValue returns a typed error, never throws");
    // undefined is not an object — the caller decides empty-body semantics
    // (settings POST does `raw ?? {}`); the helper must answer a typed
    // error, never throw.
    const broken = parseJsonValue(undefined, cloneMetaSchema, "Invalid body");
    ok(!broken.ok, "6.3  undefined answers a typed error (callers own the empty-body contract)");
  }

  // ---- 7. route integration (source pins) --------------------------------
  console.log("\n— 7. Route integration pins");
  {
    const read = (p: string) => fs.readFileSync(p, "utf8");
    const post = read("src/app/api/videos/route.ts");
    ok(post.includes("parseJsonBody(req, videoCreateSchema)"), "7.1  POST /api/videos admits bodies through the shared schema");
    const cancel = read("src/app/api/jobs/cancel/route.ts");
    ok(cancel.includes("parseJsonBody(req, jobCancelSchema)"), "7.2  POST /api/jobs/cancel admits through the shared schema");
    const settings = read("src/app/api/settings/ai/route.ts");
    ok(
      settings.includes("parseJsonBody(req, providerSettingsPatchSchema)") &&
        settings.includes("providerTestSchema"),
      "7.3  settings/ai PUT+POST admit through the shared schemas",
    );
    const clone = read("src/app/api/voices/clone/route.ts");
    ok(clone.includes("parseJsonValue") && clone.includes("cloneMetaSchema"), "7.4  voices/clone metadata admits through the shared schema");
    const login = read("src/app/api/auth/login/route.ts");
    ok(login.includes("z.object"), "7.5  auth login keeps its existing Zod schema (pre-Phase-5 baseline)");
  }

  if (failed) {
    console.error("\napi schemas battery: FAIL");
    process.exit(1);
  }
  console.log("\napi schemas battery: PASS");
}

main().catch((err) => {
  console.error("[test-api-schemas] fatal:", err);
  process.exit(1);
});

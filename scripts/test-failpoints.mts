#!/usr/bin/env node
// failpoints battery — master plan Phase 8: the fault-injection seam's
// laws, pinned.
//
//   1. OFF LAW     — no env, zero behavior (real writes land).
//   2. FAIL-CLOSED — an unknown failpoint name, an unknown action, or a
//                    malformed part THROWS (a typo must never silently
//                    disable armed chaos).
//   3. ERROR       — an armed error site throws the named
//                    FaultInjectionError with the spec's message.
//   4. HANG        — an armed hang site blocks the caller for (about)
//                    the armed window, rides the 10s cap, then RETURNS.
//   5. WIRING      — every declared site is wired at exactly one call
//                    site (textual pin — a removed wiring fails here).
//   6. RESET       — the test reset re-reads the env (spec swaps without
//                    a reboot).
//
// Run: npm run test:failpoints   (pure + scratch storage writes)

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
    const line = `${suite} — ${msg ?? "ok"}`;
    failures.push(line);
    console.log(`  ✗ ${line}`);
  }
}
function throwsSync(fn: () => unknown, match: RegExp, msg: string): void {
  try {
    fn();
    ok(false, `${msg} (nothing thrown)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ok(match.test(message), `${msg} (${message.slice(0, 90)})`);
  }
}
async function throwsAsync(fn: () => Promise<unknown> | unknown, match: RegExp, msg: string): Promise<void> {
  try {
    await fn();
    ok(false, `${msg} (nothing thrown)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ok(match.test(message), `${msg} (${message.slice(0, 90)})`);
  }
}

const FP = await import("../src/lib/ibismuh/failpoints");
const storage = await import("../src/lib/ibismuh/storage");

function setEnv(v: string | undefined): void {
  if (v === undefined) delete process.env[FP.FAILOPOINT_ENV];
  else process.env[FP.FAILOPOINT_ENV] = v;
  FP.resetFailpointsForTests();
}

const PROBE = "__failpoints_probe/put.txt";

// --- 1. THE OFF LAW ---------------------------------------------------------

suiteStart("the off law — no env, zero behavior");

{
  setEnv(undefined);
  FP.failpointCheck("queue.claim");
  FP.failpointCheck("queue.lease.renew");
  FP.failpointCheck("storage.put");
  ok(FP.failpointArmed("storage.put") === false, "nothing armed without the env");
  await storage.put(PROBE, Buffer.from("failpoints off law"));
  const downloaded = await storage.get(PROBE);
  ok(downloaded?.toString("utf8") === "failpoints off law", "storage.put works with the seam compiled in (off)");
  await storage.delete?.(PROBE).catch(() => undefined);
}

// --- 2. FAIL-CLOSED PARSING ---------------------------------------------------

suiteStart("fail-closed parsing — a typo never silently disarms chaos");

{
  setEnv("queue.claims:error");
  throwsSync(() => FP.failpointCheck("queue.claim"), /unknown failpoint "queue\.claims"/, "unknown failpoint name refuses");
  setEnv("queue.claim:explode");
  throwsSync(() => FP.failpointCheck("queue.claim"), /unknown action "explode"/, "unknown action refuses");
  setEnv("queue.claim");
  throwsSync(() => FP.failpointCheck("queue.claim"), /malformed spec part/, "a part without :action refuses");
  setEnv("storage.put:hang=notanumber");
  throwsSync(() => FP.failpointCheck("storage.put"), /hang arg must be a positive ms count/, "a non-numeric hang refuses");
  setEnv("");
  ok(FP.failpointArmed("queue.claim") === false, "an empty spec arms nothing");
}

// --- 3. THE ERROR ACTION ------------------------------------------------------

suiteStart("the error action — the named throw");

{
  setEnv("queue.claim:error=Queue claim drill;storage.put:error=Storage drill");
  ok(FP.failpointArmed("queue.claim") && FP.failpointArmed("storage.put"), "both sites armed");
  await throwsAsync(
    () => storage.put(PROBE, Buffer.from("boom")),
    /fault injection at "storage\.put": Storage drill/,
    "storage.put throws the spec's message",
  );
  let caught: unknown = null;
  try {
    await storage.put(PROBE, Buffer.from("boom2"));
  } catch (e) {
    caught = e;
  }
  ok(caught instanceof FP.FaultInjectionError, "the thrown error IS a FaultInjectionError");
  ok(caught !== null && (caught as FP.FaultInjectionError).failpoint === "storage.put", "the error names its site");
  FP.resetFailpointsForTests();
}

// --- 4. THE HANG ACTION -------------------------------------------------------

suiteStart("the hang action — a bounded window, then return");

{
  setEnv("storage.put:hang=120");
  const t0 = Date.now();
  FP.failpointCheck("storage.put");
  const waited = Date.now() - t0;
  ok(waited >= 100 && waited < 5000, `the hang blocked about the armed window (${waited}ms)`);
  setEnv("storage.put:hang=99999");
  const t1 = Date.now();
  FP.failpointCheck("storage.put");
  const capped = Date.now() - t1;
  ok(capped < 12000, `the hang rides the 10s cap, not the raw spec (${capped}ms)`);
  FP.resetFailpointsForTests();
}

// --- 5. THE WIRING PIN --------------------------------------------------------

suiteStart("the wiring pin — every declared site is wired exactly once");

{
  const queueSrc = fs.readFileSync("src/lib/ibismuh/queue.ts", "utf8");
  const storageSrc = fs.readFileSync("src/lib/ibismuh/storage.ts", "utf8");
  for (const name of FP.FAILOPOINTS) {
    const needle = `failpointCheck("${name}")`;
    const count = queueSrc.split(needle).length - 1 + storageSrc.split(needle).length - 1;
    ok(count === 1, `"${name}" wired exactly once (found ${count})`);
  }
}

// --- 6. THE RESET LAW ---------------------------------------------------------

suiteStart("the reset law — spec swaps without a reboot");

{
  setEnv("storage.put:error=first");
  await throwsAsync(() => storage.put(PROBE, Buffer.from("x")), /first/, "the first spec arms");
  setEnv("storage.put:off");
  ok(FP.failpointArmed("storage.put") === false, "an explicit off disarms");
  await storage.put(PROBE, Buffer.from("after off"));
  ok(true, "the write lands after the explicit off");
  setEnv(undefined);
  await storage.put(PROBE, Buffer.from("after reset"));
  ok(true, "the write lands after the reset");
  await storage.delete?.(PROBE).catch(() => undefined);
}

// --- report -------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(failures.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(1);
}

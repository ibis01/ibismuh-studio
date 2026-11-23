// Queue reliability — the never-retry + metrics battery (2026-11-23).
//
//   npm run test:queue-reliability
//
// Phase 7 additions over the existing queue suite (backoff, leases,
// fencing — already covered by test-queue.mts and the S75 drill):
//   1. PERMANENT-FAILURE CLASSIFICATION — dead credentials, quota/policy
//      refusals, tenant-ownership violations and invalid media NEVER retry:
//      the job dead-letters on its first attempt.
//   2. TRANSIENT failures still retry (the backoff path is untouched).
//   3. QUEUE METRICS — the operator surface (counts, queue age, retries,
//      expiring leases) reports numbers, never payloads.

import { createPrisma } from "../src/lib/ibismuh/prisma-factory.mjs";

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
  console.log("◆ queue reliability — never-retry classification + metrics");

  const { PermanentJobError, isPermanentFailure } = await import(
    "../src/lib/ibismuh/permanent-failure.ts"
  );

  // ---- 1. permanent classes ------------------------------------------------
  console.log("\n— 1. Permanent failures are classified, never retried");

  ok(isPermanentFailure(new PermanentJobError("operator said no")), "1.1  PermanentJobError is permanent by definition");
  ok(isPermanentFailure(new Error("Provider request failed (HTTP 401): invalid api key")), "1.2  a 401 invalid-api-key is permanent");
  ok(isPermanentFailure(new Error("Provider request failed (HTTP 403): forbidden")), "1.3  a 403 is permanent");
  ok(isPermanentFailure(new Error("workspace's storage quota by ~50 MB")), "1.4  storage quota exhaustion is permanent");
  ok(isPermanentFailure(new Error("request blocked by the network policy: Blocked — 169.254.169.254 is link-local")), "1.5  a network-policy refusal is permanent");
  ok(isPermanentFailure(Object.assign(new Error("cross-tenant attachment refused"), { code: "P2003" })), "1.6  a tenant FK violation (P2003) is permanent");
  ok(isPermanentFailure(new Error("That file does not look like an audio file")), "1.7  invalid media (failed magic bytes) is permanent");
  ok(isPermanentFailure(new Error("insufficient credits for this render")), "1.8  credit exhaustion is permanent");

  // ---- 2. transient classes still retry -----------------------------------
  console.log("\n— 2. Transient failures keep the retry path");

  ok(!isPermanentFailure(new Error("socket hang up")), "2.1  a socket hang-up stays transient");
  ok(!isPermanentFailure(new Error("request timed out after 30s")), "2.2  a timeout stays transient");
  ok(!isPermanentFailure(new Error("Provider request failed (HTTP 500): upstream exploded")), "2.3  an upstream 500 stays transient");
  ok(!isPermanentFailure(new Error("ECONNRESET reading the response")), "2.4  ECONNRESET stays transient");
  ok(!isPermanentFailure(new Error("HTTP 429: rate limited — try again")), "2.5  a 429 rate-limit stays transient (backoff is the cure)");

  // ---- 3. the queue's decision reads the classifier (source pins) --------
  console.log("\n— 3. The queue's retry decision consults the classifier");

  const fs = await import("node:fs");
  const q = fs.readFileSync("src/lib/ibismuh/queue.ts", "utf8");
  ok(
    q.includes("isPermanentFailure(jobError)") && q.includes("dead-lettered without retry"),
    "3.1  executeClaimed dead-letters permanent failures on the FIRST attempt (no retry)",
  );
  ok(
    q.includes("attempts < maxAttempts") && q.includes('outcome = "retry"'),
    "3.2  the transient backoff path (attempts < maxAttempts) is unchanged",
  );
  ok(q.includes("export async function queueMetrics"), "3.3  queueMetrics is exported for the operator health surface");

  // ---- 4. metrics against the real DB --------------------------------------
  console.log("\n— 4. Queue metrics (counts and ages only)");

  const db = createPrisma();
  try {
    const { queueMetrics } = await import("../src/lib/ibismuh/queue.ts");
    const m = await queueMetrics();
    ok(typeof m.pending === "number" && m.pending >= 0, `4.1  pending=${m.pending} is a count`);
    ok(typeof m.running === "number" && m.running >= 0, `4.2  running=${m.running} is a count`);
    ok(typeof m.retrying === "number" && m.retrying >= 0, `4.3  retrying=${m.retrying} is a count`);
    ok(m.oldestPendingAgeMs === null || m.oldestPendingAgeMs >= 0, "4.4  queue age is null (empty) or a non-negative age");
    const serialized = JSON.stringify(m);
    ok(!serialized.includes("topic") && !serialized.includes("payload"), "4.5  metrics carry no payloads or topics (safe observability)");
  } finally {
    await db.$disconnect();
  }

  if (failed) {
    console.error("\nqueue reliability battery: FAIL");
    process.exit(1);
  }
  console.log("\nqueue reliability battery: PASS");
}

main().catch((err) => {
  console.error("[test-queue-reliability] fatal:", err);
  process.exit(1);
});

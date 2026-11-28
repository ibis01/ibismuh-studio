#!/usr/bin/env node
// Phase 1.4 (master plan after 646c79c) — the E2E server-log contract.
//
// The E2E suite can pass every browser assertion while the SERVER writes
// evidence of real integrity defects into its own log: Prisma P2003
// foreign-key failures from fire-and-forget metering, uncaught exceptions,
// unexplained 5xx responses. This classifier reads the harness server log
// (scripts/e2e-web-server.mjs tees it), normalizes dynamic ids, classifies
// every line against an EXPLICIT vocabulary, and fails the run on anything
// forbidden or unknown. The receipt (counts by class, pinned to the commit)
// lands in test-results/log-classification.json.
//
// Named mode (Phase 1.3): NO_PROVIDER_FIXTURE — the deterministic
// no-provider E2E environment MAY emit the four documented degradation
// classes (provider-unavailable, retry, permanent-degraded, stale-executor-
// fencing). It may NOT emit Prisma FK/P2003, uncaught exceptions, or
// unexpected 5xx responses. Graceful fallback is never treated as provider
// validation — and never silently reclassified as noise either.
//
// Usage:
//   node scripts/classify-e2e-server-log.mjs [logfile]
//   node scripts/classify-e2e-server-log.mjs --self-test
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const MODE = process.env.E2E_LOG_CONTRACT || "NO_PROVIDER_FIXTURE";
const DEFAULT_LOG = "test-results/e2e-server.log";

// --- normalization: dynamic identifiers collapse before class matching ---
function normalize(line) {
  return line
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    // cuid2-style ids are lowercase, 20-32 chars — case-sensitive so camel
    // identifiers (PrismaClientKnownRequestError…) are never mangled.
    .replace(/\bc?[a-z0-9]{20,32}\b/g, "<cuid>")
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, "<email>")
    .replace(/\b\d{1,3}(\.\d{1,3}){3}(:\d+)?/g, "<host>")
    .replace(/\b\d+(\.\d+)?(ms|s)\b/g, "<dur>");
    // NOTE: deliberately NO bare number rule — it once ate HTTP status
    // codes (200/401/500 → <n>) and silenced every request line, which the
    // self-test caught. Status codes are contract evidence, not noise.
}

// --- the explicit class vocabulary ---
// Every class is a named, documented reason a line may exist. Anything not
// matching a class AND carrying error signal is UNKNOWN → the run fails.
const EXPECTED_CLASSES = [
  ["next-dev-noise", /Ready in|✓ Compiled|Compiling|Fast Refresh|HMR|Downloading|telemetry|Learn more|proxy|middleware|chrome-error|Development Mode|Turbopack|Next\.js/i],
  ["static-request", /\b(GET|HEAD) (?!\/api\/)(\/|_next\/|favicon|icon|manifest|logo|font|asset)\S*\s+(200|304|404)\b/],
  ["prisma-query", /^prisma:query/],
  ["sql-fragment", /SUM\(CASE WHEN|AS failures|AS ok_count/],
  ["node-runtime-warning", /\(node:\d+\) Warning:|trace-warnings/],
  ["worker-ops", /queue initialized|Job worker|claimedBy|leaseToken|nextRunAt|recovered \d+ stale|"msg":"queue|reaped expired job leases/i],
  ["auth-deny-4xx", /\b(GET|POST|PATCH|PUT|DELETE) \/api\/\S+ (401|403|404)\b/],
  ["controlled-4xx", /\b(GET|POST|PATCH|PUT|DELETE) \/api\/\S+ 4\d\d\b/],
  ["ok-request", /\b(GET|POST|PATCH|PUT|DELETE) \S+ (200|201|202|204|307|308)\b/],
];

// Phase 1.3 — allowed ONLY in the named NO_PROVIDER_FIXTURE mode.
const NO_PROVIDER_CLASSES = [
  ["provider-unavailable", /provider (unavailable|not configured|missing)|no (provider|API key)|ECONNREFUSED|ENOTFOUND|fetch failed|connect ECONNREFUSED|Invalid API key|status code 40[13]/i],
  ["retry", /\bretry(ing|ed)?\b|attempt \d+|withRetry|backoff/i],
  ["permanent-degraded", /\bdegraded\b|permanent(ly)? (degraded|fail)|falling back|fallback|call failed after attempts/i],
  ["stale-executor-fencing", /stale executor|fencing|lease (expired|stolen)|recovered .* stale/i],
];

// Forbidden anywhere, in any mode — these are the integrity defects the
// contract exists to catch.
const FORBIDDEN_CLASSES = [
  ["prisma-fk", /P2003|foreign key|Foreign key constraint/i],
  ["uncaught", /Uncaught|uncaughtException|unhandledRejection|Unhandled promise/i],
  ["server-5xx", /\b(GET|POST|PATCH|PUT|DELETE) \/api\/\S+ 5\d\d\b/],
  ["node-error", /level":50|FATAL|Error: cannot|ERR_ASSERTION|RangeError|TypeError:/],
];

const LOG_SIGNAL = /error|warn|fail|exception|fatal|P2003|level":(40|50)/i;

function classifyLine(raw) {
  const line = normalize(raw);
  for (const [cls, re] of FORBIDDEN_CLASSES) if (re.test(line)) return { cls, verdict: "forbidden" };
  if (MODE === "NO_PROVIDER_FIXTURE")
    for (const [cls, re] of NO_PROVIDER_CLASSES) if (re.test(line)) return { cls, verdict: "allowed-degradation" };
  for (const [cls, re] of EXPECTED_CLASSES) if (re.test(line)) return { cls, verdict: "expected" };
  if (!LOG_SIGNAL.test(line)) return { cls: "silent", verdict: "expected" };
  return { cls: "unknown", verdict: "unknown" };
}

function classifyLog(text) {
  const counts = {};
  const offenders = [];
  let total = 0;
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    total++;
    const { cls, verdict } = classifyLine(raw);
    counts[cls] = (counts[cls] ?? 0) + 1;
    if (verdict === "forbidden" || verdict === "unknown")
      offenders.push({ verdict, cls, line: normalize(raw).slice(0, 300) });
  }
  return { total, counts, offenders };
}

function commitSha() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return process.env.GITHUB_SHA || "unknown";
  }
}

function writeReceipt(result, logPath) {
  const receipt = {
    commit: commitSha(),
    mode: MODE,
    log: logPath,
    verdict: result.offenders.length === 0 ? "PASS" : "FAIL",
    totalLines: result.total,
    countsByClass: result.counts,
    offenders: result.offenders.slice(0, 40),
    policy: {
      forbidden: FORBIDDEN_CLASSES.map(([c]) => c),
      allowedDegradations: MODE === "NO_PROVIDER_FIXTURE" ? NO_PROVIDER_CLASSES.map(([c]) => c) : [],
    },
  };
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/log-classification.json", JSON.stringify(receipt, null, 2));
  return receipt;
}

function printReceipt(receipt) {
  console.log("\n=== E2E server-log contract receipt ===");
  console.log(`commit:  ${receipt.commit}`);
  console.log(`mode:    ${receipt.mode}`);
  console.log(`verdict: ${receipt.verdict}`);
  console.log(`lines:   ${receipt.totalLines}`);
  for (const [cls, n] of Object.entries(receipt.countsByClass).sort()) console.log(`  ${cls.padEnd(26)} ${n}`);
  for (const o of receipt.offenders.slice(0, 15)) console.log(`  [${o.verdict}/${o.cls}] ${o.line}`);
  if (receipt.offenders.length > 15) console.log(`  … and ${receipt.offenders.length - 15} more`);
  console.log(`receipt: test-results/log-classification.json\n`);
}

// --- self-test: the rules are themselves pinned (runs inside `check`) ---
function selfTest() {
  const lines = [
    "(node:5405) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.", // node-runtime-warning
    "(Use `node --trace-warnings ...` to show where the warning was created)", // node-runtime-warning
    '            SUM(CASE WHEN NOT "ok" THEN 1 ELSE 0 END) AS failures', // sql-fragment
    "▲ Next.js 16.4.6 (Turbopack)", // next-dev-noise
    "prisma:query SELECT `Job` WHERE ...", // prisma-query
    '{"level":30,"msg":"queue initialized"}', // worker-ops
    "GET /api/videos 200 in 42ms", // ok-request
    "POST /api/auth/login 401 in 5ms", // auth-deny-4xx
    "POST /api/videos/abc/script/hook-panel 400 in 8ms", // controlled-4xx
    "[hook] provider unavailable — ECONNREFUSED 127.0.0.1:9", // provider-unavailable
    "[hook] retrying attempt 2 after backoff", // retry
    "[hook] degraded: the deterministic half still serves", // permanent-degraded
    '{"level":40,"msg":"call failed after attempts","service":"llm","attempts":3,"label":"hook panel judge"}', // permanent-degraded (the budget.ts chain-failure warn that rides the ok=false row)
    "stale executor fenced — lease expired, job requeued", // stale-executor-fencing
    "PrismaClientKnownRequestError: P2003 Foreign key constraint failed on the field: `userId`", // prisma-fk FORBIDDEN
    "Uncaught TypeError: cannot read properties of undefined", // uncaught FORBIDDEN
    "POST /api/videos 500 in 120ms", // server-5xx FORBIDDEN
    "Something exploded: Error: badly broken today", // unknown FORBIDDEN (error signal, no declared class)
  ];
  const result = classifyLog(lines.join("\n"));
  const expect = (cls, n) => {
    const got = result.counts[cls] ?? 0;
    if (got !== n) {
      console.error(`self-test FAIL: class ${cls} expected ${n} got ${got}`);
      console.error(JSON.stringify(result.counts, null, 2));
      process.exit(1);
    }
  };
  expect("next-dev-noise", 1);
  expect("prisma-query", 1);
  expect("sql-fragment", 1);
  expect("node-runtime-warning", 2);
  expect("worker-ops", 1);
  expect("ok-request", 1);
  expect("auth-deny-4xx", 1);
  expect("controlled-4xx", 1);
  expect("provider-unavailable", 1);
  expect("retry", 1);
  expect("permanent-degraded", 2);
  expect("stale-executor-fencing", 1);
  expect("prisma-fk", 1);
  expect("uncaught", 1);
  expect("server-5xx", 1);
  expect("unknown", 1);
  if (result.offenders.length !== 4) {
    console.error(`self-test FAIL: expected exactly 4 offenders, got ${result.offenders.length}`);
    console.error(JSON.stringify(result.offenders, null, 2));
    process.exit(1);
  }
  console.log("log-contract self-test PASS — every class fires, forbidden lines are caught, clean lines stay clean");
}

// --- main ---
if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const logPath = process.argv[2] || process.env.E2E_SERVER_LOG || DEFAULT_LOG;
if (!existsSync(logPath)) {
  if (process.env.CI) {
    console.error(`log-contract FAIL: the harness server log is missing at ${logPath} — the harness server must run through scripts/e2e-web-server.mjs`);
    process.exit(1);
  }
  console.warn(`log-contract SKIPPED: no harness server log at ${logPath} (a reused external dev server has no tee)`);
  process.exit(0);
}

const text = readFileSync(logPath, "utf8");
const result = classifyLog(text);
const receipt = writeReceipt(result, logPath);
printReceipt(receipt);
process.exit(receipt.verdict === "PASS" ? 0 : 1);

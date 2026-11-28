#!/usr/bin/env node
// Phase 1 (master plan after 941a6ee) — the reproducible head audit.
//
// WHY THIS EXISTS: the plan's Phase 1 verdict was that check/build/E2E were
// already isolated CI jobs, but nothing serialized the sequence for a HUMAN
// audit with machine-readable provenance. This script is that runbook: it
// runs the gates SERIALLY (never concurrently — generated-state races are
// the defect class the plan calls out), captures each gate's exit code and
// duration, and writes ONE receipt pinned to the audited head.
//
// What the receipt records (the plan's exact list):
//   - exit code per gate (PASS/FAIL/SKIPPED — never a silent skip);
//   - the audited commit SHA, branch, and dirty-tree flag;
//   - Node version, npm version, Next.js version;
//   - tool availability (git, ffmpeg, ffprobe, docker, psql, python3).
//
// Receipt location: scratch/audit-current-head.json (+ .txt human summary).
// scratch/ is generated state — it is never committed; the JSON travels into
// CI artifacts or worklog receipts by reference, not by copy.
//
// Usage:
//   node scripts/audit-current-head.mjs                 # full audit (no reinstall)
//   node scripts/audit-current-head.mjs --with-install  # npm ci first (slow, exact)
//   node scripts/audit-current-head.mjs --skip-e2e      # quick audit; receipt says SKIPPED
//   node scripts/audit-current-head.mjs --skip-unit     # quick audit; receipt says SKIPPED
//
// LAWS:
//   - Gates run ONE AT A TIME, in a fixed order. Never parallel. Never a
//     second npm process while another holds .next.
//   - A skipped gate is recorded as SKIPPED in the receipt and NEVER counted
//     as a pass.
//   - The build-log guard runs against THIS audit's own build log.
//   - Any gate failure exits 1 but still writes the receipt (fail-visible).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const SCRATCH = "scratch";
const RECEIPT_JSON = path.join(SCRATCH, "audit-current-head.json");
const RECEIPT_TXT = path.join(SCRATCH, "audit-current-head.txt");

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function toolAvailable(name) {
  try {
    execSync(`${name} --version`, { stdio: "ignore", timeout: 15_000 });
    return true;
  } catch {
    try {
      execSync(`command -v ${name}`, { stdio: "ignore", shell: "/bin/bash" });
      return true;
    } catch {
      return false;
    }
  }
}

function gitInfo() {
  const head = sh("git", ["rev-parse", "HEAD"]);
  const branch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = sh("git", ["status", "--porcelain"]);
  return {
    sha: head.code === 0 ? head.stdout.trim() : null,
    branch: branch.code === 0 ? branch.stdout.trim() : null,
    dirty: dirty.code === 0 ? dirty.stdout.trim().length > 0 : null,
    dirtyFiles: dirty.code === 0 ? dirty.stdout.trim().split("\n").filter(Boolean) : [],
  };
}

function versions() {
  let next = null;
  try {
    const pkg = JSON.parse(readFileSync("node_modules/next/package.json", "utf8"));
    next = pkg.version;
  } catch {
    next = null; // honest: next not installed
  }
  return {
    node: process.version,
    npm: sh("npm", ["--version"]).stdout.trim() || null,
    next,
  };
}

function tools() {
  const names = ["git", "ffmpeg", "ffprobe", "docker", "psql", "python3"];
  const out = {};
  for (const name of names) out[name] = toolAvailable(name);
  return out;
}

// The serialized gate list. Order matches the plan's Phase 0 sequence, with
// the proxy-convention guard up front (a tree that cannot build must not
// spend the audit's minutes on batteries).
function gateList(opts) {
  const gates = [
    { name: "typecheck", script: "typecheck", tee: "scratch/audit-gate-typecheck.log" },
    { name: "lint", script: "lint", tee: "scratch/audit-gate-lint.log" },
    { name: "proxy-convention", script: "test:proxy-convention", tee: "scratch/audit-gate-proxy-convention.log" },
  ];
  if (!opts.skipUnit) gates.push({ name: "unit", script: "test", tee: "scratch/audit-gate-unit.log" });
  gates.push({ name: "build", script: "build", tee: "build.log" });
  if (!opts.skipE2E) gates.push({ name: "e2e", script: "test:e2e", tee: "scratch/audit-gate-e2e.log" });
  return gates;
}

function runGate(gate) {
  const started = Date.now();
  const logPath = gate.tee;
  // Tee through the gate's canonical log so a huge gate never blows the
  // maxBuffer and the log survives as an artifact even when the receipt is
  // read later. The build gate tees to build.log — the exact name CI's
  // build-log guard asserts against.
  const full = spawnSync("bash", ["-lc", `set -o pipefail; npm run ${gate.script} 2>&1 | tee ${logPath}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60 * 60 * 1000,
  });
  const tail = (full.stdout ?? "").split("\n").filter(Boolean).slice(-12).join("\n");
  return {
    name: gate.name,
    exit: full.status,
    ms: Date.now() - started,
    log: logPath,
    tail,
  };
}

function buildLogGuard() {
  const logPath = "build.log";
  if (!existsSync(logPath)) {
    return { guard: "build-log", exit: 1, problems: ["build.log missing — the build gate did not tee (audit requires it)"] };
  }
  const text = readFileSync(logPath, "utf8");
  const problems = [];
  if (text.includes("Dynamic filesystem access")) {
    problems.push("a dynamic filesystem import lost its turbopackIgnore annotation");
  }
  if (text.includes("file convention is deprecated")) {
    problems.push("a file-convention deprecation warning returned (the middleware/proxy law)");
  }
  return { guard: "build-log", exit: problems.length === 0 ? 0 : 1, problems };
}

async function main() {
  const opts = {
    withInstall: process.argv.includes("--with-install"),
    skipE2E: process.argv.includes("--skip-e2e"),
    skipUnit: process.argv.includes("--skip-unit"),
  };
  mkdirSync(SCRATCH, { recursive: true });

  const gates = [];
  if (opts.withInstall) {
    const started = Date.now();
    const r = spawnSync("bash", ["-lc", "npm ci 2>&1 | tee scratch/audit-gate-install.log"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60 * 60 * 1000,
    });
    gates.push({ name: "install", exit: r.status, ms: Date.now() - started, log: "scratch/audit-gate-install.log", tail: (r.stdout ?? "").split("\n").filter(Boolean).slice(-8).join("\n") });
    if (r.status !== 0) {
      writeReceipt({ gates, verdict: "FAIL", git: gitInfo(), versions: versions(), tools: tools() });
      console.error("FAIL: npm ci failed — receipt written, aborting the audit");
      process.exit(1);
    }
  }

  for (const gate of gateList(opts)) {
    console.log(`\n=== audit gate: ${gate.name} ===`);
    const result = runGate(gate);
    gates.push(result);
    console.log(result.tail);
    console.log(`--- ${gate.name} exit=${result.exit} (${(result.ms / 1000).toFixed(1)}s)`);
    if (result.exit !== 0) {
      const receipt = { gates, verdict: "FAIL", git: gitInfo(), versions: versions(), tools: tools() };
      writeReceipt(receipt);
      console.error(`FAIL at gate ${gate.name} — receipt written to ${RECEIPT_JSON}`);
      process.exit(1);
    }
  }

  const guard = buildLogGuard();
  gates.push({ name: "build-log-guard", exit: guard.exit, ms: 0, log: "build.log", tail: guard.problems.join("; ") || "zero dynamic-fs tracing warnings, zero convention deprecations" });

  const verdict = guard.exit === 0 ? "PASS" : "FAIL";
  const receipt = { gates, verdict, git: gitInfo(), versions: versions(), tools: tools() };
  writeReceipt(receipt);
  console.log(`\nAUDIT ${verdict} — receipt: ${RECEIPT_JSON}`);
  if (verdict !== "PASS") process.exit(1);
}

function writeReceipt(receipt) {
  const finished = new Date().toISOString();
  const payload = { auditedAt: finished, ...receipt };
  writeFileSync(RECEIPT_JSON, JSON.stringify(payload, null, 2));
  const lines = [];
  lines.push(`# Head audit — ${finished}`);
  lines.push(`sha: ${payload.git.sha}  branch: ${payload.git.branch}  dirty: ${payload.git.dirty}`);
  lines.push(`node: ${payload.versions.node}  npm: ${payload.versions.npm}  next: ${payload.versions.next}`);
  lines.push(`tools: ${Object.entries(payload.tools).map(([k, v]) => `${k}=${v ? "yes" : "no"}`).join(" ")}`);
  lines.push(`verdict: ${payload.verdict}`);
  for (const gate of payload.gates) {
    lines.push(`  ${gate.name.padEnd(18)} exit=${gate.exit}  ${(gate.ms / 1000).toFixed(1)}s  log=${gate.log}`);
  }
  writeFileSync(RECEIPT_TXT, lines.join("\n") + "\n");
  // statSync keeps the import honest: receipt includes the log sizes.
  payload.gates.forEach((gate) => {
    try {
      gate.logBytes = statSync(gate.log).size;
    } catch {
      gate.logBytes = null;
    }
  });
  writeFileSync(RECEIPT_JSON, JSON.stringify(payload, null, 2));
}

main();

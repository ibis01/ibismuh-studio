#!/usr/bin/env node
// Phase 0 (master plan after 941a6ee) — the proxy-convention guard.
//
// LAW: the repo carries EXACTLY ONE recognized routing-convention file, and
// it is src/proxy.ts. Next.js 16 renamed the middleware convention to proxy
// (PROXY_FILENAME = 'proxy'); carrying BOTH src/middleware.ts and src/proxy.ts
// makes `next build` refuse to start (the P0 release blocker this guard
// closes), and carrying neither leaves every default-deny law unenforced. The
// guard is a SOURCE assertion (filesystem-level, not a build-log grep) so it
// fires even when the build never runs. CI runs it as its own check-job step
// and `npm run check` runs it first, before any battery spends a minute on a
// tree that cannot build.
//
// Recognized conventions (repo root or src/):
//   Next <= 15: middleware.{js,ts,mjs,tsx,jsx}
//   Next 16+:   proxy.{js,ts,mjs,tsx,jsx}
//
// Fail-visible: any violation exits 1 with every offending path listed; a
// green run prints the audited set. `--self-test` feeds synthetic trees
// through the SAME auditor — no fixture files ever touch the repo.

import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const EXTENSIONS = ["ts", "js", "mjs", "tsx", "jsx"];
const ROOTS = ["", "src/"];
const REQUIRED = "src/proxy.ts";

// Pure auditor: `exists(rel)` and `read(rel)` are injected so --self-test can
// feed synthetic trees without touching the repository.
export function auditRoutingConvention(exists, read) {
  const found = [];
  for (const base of ["middleware", "proxy"]) {
    for (const root of ROOTS) {
      for (const ext of EXTENSIONS) {
        const rel = `${root}${base}.${ext}`;
        if (exists(rel)) found.push(rel);
      }
    }
  }

  const problems = [];
  if (!found.includes(REQUIRED)) {
    problems.push(`missing the required convention file ${REQUIRED}`);
  }
  if (found.length !== 1) {
    problems.push(
      `recognized convention files must number exactly one, found ${found.length}: ${
        found.join(", ") || "(none)"
      }`,
    );
  } else if (found[0] !== REQUIRED) {
    problems.push(`the sole convention file is ${found[0]}, must be ${REQUIRED}`);
  }
  if (exists(REQUIRED)) {
    const source = read(REQUIRED);
    if (!/export\s+(?:default\s+)?(?:async\s+)?(?:function|const)\s+proxy\b/.test(source)) {
      problems.push(`${REQUIRED} does not export a \`proxy\` handler`);
    }
  }
  return { ok: problems.length === 0, found, problems };
}

function selfTest() {
  const fixtures = [
    {
      name: "green: exactly src/proxy.ts exporting the handler",
      files: { "src/proxy.ts": "export async function proxy(req) { return null; }\n" },
      expectOk: true,
    },
    {
      name: "red: the dual-convention blocker (middleware.ts AND proxy.ts)",
      files: {
        "src/middleware.ts": "export function middleware() {}\n",
        "src/proxy.ts": "export async function proxy(req) { return null; }\n",
      },
      expectOk: false,
    },
    {
      name: "red: sole file is the retired middleware convention",
      files: { "src/middleware.ts": "export function middleware() {}\n" },
      expectOk: false,
    },
    {
      name: "red: no convention file at all",
      files: {},
      expectOk: false,
    },
    {
      name: "red: proxy.ts exists but exports nothing named proxy",
      files: { "src/proxy.ts": "export const config = { matcher: [] };\n" },
      expectOk: false,
    },
    {
      name: "green: root proxy.js is recognized but fails the REQUIRED pin (must be src/proxy.ts)",
      files: { "proxy.js": "export async function proxy() {}\n" },
      expectOk: false,
    },
  ];

  let failed = 0;
  for (const fixture of fixtures) {
    const result = auditRoutingConvention(
      (rel) => rel in fixture.files,
      (rel) => fixture.files[rel] ?? "",
    );
    if (result.ok !== fixture.expectOk) {
      failed += 1;
      console.log(`SELF-TEST FAIL: ${fixture.name} — expected ok=${fixture.expectOk}, got ok=${result.ok}`);
      console.log(`  problems: ${result.problems.join(" | ") || "(none)"}`);
    } else {
      console.log(`SELF-TEST ok: ${fixture.name}`);
    }
  }
  return failed;
}

function main() {
  if (process.argv.includes("--self-test")) {
    const failed = selfTest();
    if (failed > 0) {
      console.error(`self-test FAILED: ${failed} fixture(s) diverged`);
      process.exit(1);
    }
    console.log("self-test PASS: all fixtures behaved as the law requires");
    return;
  }

  const repoRoot = process.cwd();
  const exists = (rel) => existsSync(path.join(repoRoot, rel));
  const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");
  const result = auditRoutingConvention(exists, read);

  console.log(`proxy-convention audit — recognized files: ${result.found.join(", ") || "(none)"}`);
  if (!result.ok) {
    console.error("FAIL: the routing-convention law is violated:");
    for (const problem of result.problems) console.error(`  - ${problem}`);
    console.error("Fix: keep exactly src/proxy.ts (Next 16 convention); delete any middleware.* sibling.");
    process.exit(1);
  }
  console.log("guard PASS: exactly one recognized convention exists and it is src/proxy.ts");
}

// Optional deep probe (IBISMUH_GUARD_TMP_PROBE=1): exercises the auditor
// against a REAL synthetic directory on disk (not just the injected fakes),
// then cleans it up. Off by default; the --self-test path is the CI surface.
if (process.env.IBISMUH_GUARD_TMP_PROBE === "1") {
  const dir = mkdtempSync(path.join(tmpdir(), "proxy-guard-"));
  mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(path.join(dir, "src", "proxy.ts"), "export async function proxy() {}\n");
  const probe = auditRoutingConvention(
    (rel) => existsSync(path.join(dir, rel)),
    (rel) => readFileSync(path.join(dir, rel), "utf8"),
  );
  rmSync(dir, { recursive: true, force: true });
  if (!probe.ok) {
    console.error("tmp-probe FAIL: the auditor rejected a real synthetic directory");
    process.exit(1);
  }
  console.log("tmp-probe PASS: auditor accepts a real on-disk synthetic tree");
}

main();

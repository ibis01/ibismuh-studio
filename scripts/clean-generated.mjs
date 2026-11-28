#!/usr/bin/env node
// Phase 1 (master plan after 941a6ee) — the explicit, safe generated-state
// cleanup. `npm run clean`.
//
// WHY: the plan requires "npm run clean or an equivalent disposable cleanup
// command" to be explicit and safe. Until now cleanup was tribal knowledge
// (rm -rf .next test-results) — easy to over-delete (the SQLite database and
// the scratch evidence live one directory away from .next).
//
// WHAT IT REMOVES (generated state only):
//   .next              — the Next build/dev output
//   test-results       — Playwright results + the E2E server log
//   playwright-report  — Playwright HTML report
//   build.log          — the CI-canonical build tee
//
// WHAT IT NEVER TOUCHES (beyond a documented, hard refusal):
//   db/                — the live SQLite database
//   scratch/           — audit receipts and evidence
//   worklog.md         — the project's receipt ledger
//   public/, uploads/, prisma/, src/, scripts/
//
// SAFETY LAWS:
//   - Refuses to run unless package.json is in cwd (not the repo root -> abort).
//   - Refuses to remove anything that is a symlink (never follows out of the tree).
//   - Prints every removal; exits 1 if any path fails to clear.

import { existsSync, lstatSync, readFileSync, rmSync } from "node:fs";

const REMOVABLE = [".next", "test-results", "playwright-report", "build.log"];
const NEVER = ["db", "scratch", "worklog.md", "public", "uploads", "prisma", "src", "scripts"];

function main() {
  if (!existsSync("package.json")) {
    console.error("FAIL: run npm run clean from the repository root (package.json not found here)");
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  if (pkg.name !== "ibismuh-studio") {
    console.error(`FAIL: unexpected package "${pkg.name}" — refusing to clean a foreign tree`);
    process.exit(1);
  }
  for (const guarded of NEVER) {
    if (REMOVABLE.includes(guarded)) {
      console.error(`FAIL: "${guarded}" is on both the removable and never lists — script bug`);
      process.exit(1);
    }
  }

  let failures = 0;
  for (const target of REMOVABLE) {
    if (!existsSync(target)) {
      console.log(`clean: ${target} (absent, nothing to do)`);
      continue;
    }
    let stat;
    try {
      stat = lstatSync(target);
    } catch (error) {
      console.error(`clean FAIL: cannot stat ${target}: ${error.message}`);
      failures += 1;
      continue;
    }
    if (stat.isSymbolicLink()) {
      console.error(`clean FAIL: ${target} is a symlink — refusing (never follow links out of the tree)`);
      failures += 1;
      continue;
    }
    try {
      rmSync(target, { recursive: true, force: true });
      console.log(`clean: removed ${target}`);
    } catch (error) {
      console.error(`clean FAIL: could not remove ${target}: ${error.message}`);
      failures += 1;
    }
  }

  if (failures > 0) {
    console.error(`clean FAILED: ${failures} target(s) not cleared`);
    process.exit(1);
  }
  console.log("clean PASS: generated state cleared; db/, scratch/, worklog.md untouched");
}

main();

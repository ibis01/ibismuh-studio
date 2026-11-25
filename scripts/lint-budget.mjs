#!/usr/bin/env node
// lint-budget.mjs — the warning-count wall (2026-11-23 hardening, Phase 9).
//
//   node scripts/lint-budget.mjs
//
// The lint baseline is ZERO warnings (drove the 19 production-harness
// no-explicit-any warnings to zero on 2026-11-23). This script re-runs the
// linter, counts warnings, and FAILS on any growth — CI cannot silently
// accumulate a new warning class. To legitimately raise the budget (never
// casually), update BASELINE with a justification in the commit message.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = 0;

let out;
try {
  out = execFileSync(
    process.execPath,
    ["--stack-size=8000", join(root, "node_modules/eslint/bin/eslint.js"), ".", "--format", "json"],
    { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
} catch (err) {
  // eslint exits non-zero on errors — parse the JSON payload either way
  out = String(err.stdout ?? "");
  if (!out.trim()) {
    console.error("[lint-budget] fatal: lint run produced no output:", err.message);
    process.exit(1);
  }
}

let reports;
try {
  reports = JSON.parse(out);
} catch {
  console.error("[lint-budget] fatal: could not parse eslint JSON output");
  process.exit(1);
}

let errors = 0;
let warnings = 0;
const byRule = new Map();
for (const r of reports) {
  for (const m of r.messages ?? []) {
    if (m.severity === 2) errors++;
    else if (m.severity === 1) {
      warnings++;
      byRule.set(m.ruleId ?? "unknown", (byRule.get(m.ruleId ?? "unknown") ?? 0) + 1);
    }
  }
}

console.log(`[lint-budget] errors: ${errors}, warnings: ${warnings} (baseline ${BASELINE})`);
for (const [rule, count] of byRule) console.log(`  ${rule}: ${count}`);

if (errors > 0) {
  console.error("[lint-budget] FAIL — lint errors present (these are not budgetable)");
  process.exit(1);
}
if (warnings > BASELINE) {
  console.error(
    `[lint-budget] FAIL — warning count ${warnings} exceeds the baseline ${BASELINE}. ` +
      "Fix the new warnings, or justify + update BASELINE in scripts/lint-budget.mjs.",
  );
  process.exit(1);
}
console.log("[lint-budget] PASS — within budget");

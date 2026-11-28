// Playwright globalTeardown (Phase 1.4) — the server-log contract gate.
//
// Runs AFTER every spec (even when all browser assertions passed): the
// harness server log (tee'd by scripts/e2e-web-server.mjs) is classified
// against the explicit contract in scripts/classify-e2e-server-log.mjs.
// A forbidden line — Prisma P2003/FK, an uncaught exception, an
// unexplained 5xx — or an unknown error-signal line fails the whole run
// with a nonzero exit, so the CI step cannot green-wash server-side
// integrity defects. The compact receipt lands in
// test-results/log-classification.json for artifact upload.
import { spawnSync } from "node:child_process";

export default function globalTeardown() {
  const res = spawnSync("node", ["scripts/classify-e2e-server-log.mjs"], {
    stdio: "inherit",
    env: process.env,
  });
  if (res.error) throw new Error(`log-contract classifier failed to start: ${String(res.error)}`);
  if (res.status !== 0) {
    throw new Error(
      `E2E server-log contract FAILED (classifier exit ${res.status}) — forbidden or unknown server-side errors were emitted during this run. See test-results/log-classification.json`
    );
  }
}

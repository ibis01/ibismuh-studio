import { defineConfig, devices } from "@playwright/test";

// Stage 1 (task T-1.17): Playwright was already a runtime dependency (the
// keynote-slides renderer needs Chromium), but no test harness existed. This
// wires a minimal browser smoke suite; Stage 7 grows it into the full
// cross-tenant isolation + mobile responsiveness battery.
//
// Run: npm run test:e2e   (starts its own dev server on :3000)

export default defineConfig({
  testDir: "./e2e",
  // Phase 1.4 (master plan after 646c79c) — the server-log contract: the
  // teardown classifies the harness server's tee'd log and FAILS the run on
  // forbidden classes (Prisma P2003/FK, uncaught, unexplained 5xx) even when
  // every browser assertion passed.
  globalTeardown: "./e2e/log-contract.teardown.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Phase 1.4 — the harness owns its server through the tee wrapper so
    // the log contract has complete server-side evidence. Missing log in
    // CI is itself a contract failure (fail-visible); a reused external
    // dev server locally skips the gate with a loud receipt note.
    command: "node scripts/e2e-web-server.mjs",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // S68 — the suite is one IP making a studio-load of writes (register +
    // create + PUT + render across 39 tests in under two minutes), which
    // brushes the middleware's per-IP WRITE_LIMIT (90/min) — whichever spec
    // crosses a window boundary ate a 429 (the flake the first full-suite
    // runs showed, alternating victims by file order). The harness is a
    // trusted single-tenant load, so its OWN server raises the ceilings;
    // production defaults are untouched.
    env: {
      ...process.env,
      // B4 — the stage-B rebrand renamed these env keys and the old names
      // went dead at BOTH limiter layers (rate-limit.ts + shared-rate-limit.ts
      // read the new names only) — the S68 ceilings silently stopped applying
      // and every full-suite run re-manifested the alternating-victim 429
      // flake. The harness speaks the CURRENT names (and a battery pin keeps
      // the harness env and the limiter env from drifting apart again).
      IBISMUH_STUDIO_RATE_WRITE: "10000",
      IBISMUH_STUDIO_RATE_READ: "100000",
      // Phase 1.1 — the integrity spec points chat at a LOCAL stub server
      // (127.0.0.1, port chosen at runtime) to prove a SUCCESSFUL provider
      // call meters real tokens. The SSRF guard's documented escape hatch
      // covers the trusted single-tenant harness only — production keeps
      // private hosts default-deny. Host-level entries, so any port works.
      IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS: "1",
      IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST: "127.0.0.1,localhost",
      // Phase 1.4 — the named log-contract mode and the tee target shared
      // by the wrapper, the spec's own FK assertion, and the teardown.
      E2E_SERVER_LOG: "test-results/e2e-server.log",
      E2E_LOG_CONTRACT: "NO_PROVIDER_FIXTURE",
    },
  },
});

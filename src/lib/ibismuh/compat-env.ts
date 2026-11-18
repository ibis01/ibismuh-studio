// Legacy env-name compatibility — the controlled rebrand (2026-11-17).
//
// Deployments provisioned before the rebrand carry TUBEFORGE_* variables
// (Fly secrets, .env files, CI caches). This module mirrors every legacy
// name into its IBISMUH_STUDIO_* equivalent AT LOAD TIME; the new name is
// always authoritative — the legacy value fills in ONLY where the new name
// is unset. Import it FIRST in every server-side entry (middleware,
// instrumentation, worker) so it runs before any reader.
//
// Pure process.env manipulation — no node:* imports (src/middleware.ts is
// architecture-banned from them; the project's middleware runs Node runtime,
// where process.env is fully dynamic, unlike the inlined edge runtime).
//
// The dual-read helpers on the two security-critical readers
// (getAuthSecret / getEncryptionKey) cover the one ordering gap that remains:
// preserved historical probes that set legacy variables AFTER this module
// has already loaded.
//
// NOTE: this file must keep spelling TUBEFORGE_ literally — it sits outside
// the rebrand's mechanical env-name sweep on purpose.

export function mirrorLegacyEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith("TUBEFORGE_")) continue;
    const next = "IBISMUH_STUDIO_" + key.slice("TUBEFORGE_".length);
    if (process.env[next] === undefined) {
      process.env[next] = process.env[key];
    }
  }
}

mirrorLegacyEnv();

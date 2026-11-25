// RAW-DB GATEWAY · QUEUE RECOVERY — the approved unscoped client for the
// durable job machinery (2026-11-23 hardening, Phase 6).
//
// WHY raw access is legitimate here: the claim loop, lease fencing, crash
// recovery and cancellation reads must inspect Job rows ACROSS organizations
// (reaping expired leases is by definition not tenant-scoped). Execution
// itself re-derives the row's tenant context (ctxFromRow) and every handler
// runs through the tenant-scoped client — a job payload can never pivot to
// another organization's entities (pinned by the tenant-isolation battery).
//
// APPROVED IMPORTERS: queue.ts, jobs.ts, claim.ts.
export { rawDatabase } from "../tenant-db";

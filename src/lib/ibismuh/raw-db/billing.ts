// RAW-DB GATEWAY · BILLING & QUOTAS — the approved unscoped client for the
// money and metering ledgers (2026-11-23 hardening, Phase 6).
//
// WHY raw access is legitimate here: usage records, spend reservations,
// storage reservations and the shared rate-limit counters are written by
// background jobs and multi-tenant sweeps that carry EXPLICIT organizationId
// values on every row (the reservation protocol in storage-quota.ts /
// spend.ts serializes admission through scoped keys). The tenant registry
// still covers these models for any request-scoped path (Phase 3).
//
// APPROVED IMPORTERS: billing.ts, budget.ts, spend.ts, cost-guard.ts,
// storage-quota.ts, shared-rate-limit.ts.
export { rawDatabase } from "../tenant-db";

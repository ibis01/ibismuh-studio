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
// storage-quota.ts, shared-rate-limit.ts, music.ts (Phase 2 after 941a6ee:
// the seed-account liveness guard — two SELECTs before synthesis, so a dead
// account pauses the seed at info instead of printing an FK error),
// tier-limits.ts (Phase 9: the per-tier render admission gates — the daily
// quota's guarded upsert + retention sweep and the dead-letter-adjacent tier
// reads ride the same global-accounting legitimacy: every TierRenderCounter
// row carries an explicit organizationId, and the counters are org-owned
// quota state, not tenant content).
export { rawDatabase } from "../tenant-db";

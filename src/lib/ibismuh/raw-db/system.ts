// RAW-DB GATEWAY · SYSTEM & INTEGRATIONS — the approved unscoped client for
// cross-tenant system surfaces (2026-11-23 hardening, Phase 6).
//
// WHY raw access is legitimate here: per-USER (not per-organization) stores
// — user settings, provider credentials, YouTube account links, the
// account deletion/export surfaces — resolve by userId before any
// organization exists in the request, and the zai config sync touches the
// process-wide SDK configuration. Account deletion sweeps every org the
// user belongs to (the mandate's "never automatically delete user data" is
// honored: deletion is the explicit, user-initiated flow).
//
// APPROVED IMPORTERS: settings.ts, zai-client.ts, zai-config.ts, youtube.ts,
// graphics/import-store.ts, and the account/youtube API routes.
export { rawDatabase } from "../tenant-db";

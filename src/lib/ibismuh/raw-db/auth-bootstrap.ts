// RAW-DB GATEWAY · AUTH BOOTSTRAP — the approved unscoped client for
// identity establishment (2026-11-23 hardening, Phase 6).
//
// WHY raw access is legitimate here: authentication runs BEFORE a tenant
// context exists. Resolving the session row, the user row, the login
// throttle counters and the password hash all happen with no organizationId
// to scope by — by design. Everything downstream (requireUser onward) MUST
// use the tenant-scoped client (src/lib/ibismuh/tenant-db.ts).
//
// APPROVED IMPORTERS (the auditable inventory — enforced by the ESLint rule
// rawdb/no-direct-import): tenant.ts (session/user bootstrap), auth.ts,
// auth-throttle.ts, and the src/app/api/auth/** routes.
export { rawDatabase } from "../tenant-db";

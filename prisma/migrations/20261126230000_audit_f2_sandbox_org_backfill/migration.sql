-- AUDIT F-2 backfill: the sandbox lane (StudioProject + its children) wrote
-- every row under the constant organizationId 'local' while its routes
-- carried no route-level guard. The remediation wires requireUser + the
-- caller's real organization into the lane (orgId()), so pre-remediation
-- rows must ride along or they vanish from their owner's view.
--
-- Safe in every deployment that can exist today: there is no invite flow,
-- so every organization is single-member and first-org wins is correct.
-- The WHERE clause re-scopes only rows still pinned to the legacy constant,
-- and the subquery is guarded to run only when exactly one organization
-- exists — a multi-org install (none can exist yet) stays untouched and
-- explicit instead of silently re-homed.
UPDATE "StudioProject" SET "organizationId" = (SELECT "id" FROM "Organization" LIMIT 1)
WHERE "organizationId" = 'local' AND (SELECT COUNT(*) FROM "Organization") = 1;
UPDATE "PlanRevision" SET "organizationId" = (SELECT "id" FROM "Organization" LIMIT 1)
WHERE "organizationId" = 'local' AND (SELECT COUNT(*) FROM "Organization") = 1;
UPDATE "AssetRecord" SET "organizationId" = (SELECT "id" FROM "Organization" LIMIT 1)
WHERE "organizationId" = 'local' AND (SELECT COUNT(*) FROM "Organization") = 1;
UPDATE "AudioReceiptRecord" SET "organizationId" = (SELECT "id" FROM "Organization" LIMIT 1)
WHERE "organizationId" = 'local' AND (SELECT COUNT(*) FROM "Organization") = 1;
UPDATE "RenderJob" SET "organizationId" = (SELECT "id" FROM "Organization" LIMIT 1)
WHERE "organizationId" = 'local' AND (SELECT COUNT(*) FROM "Organization") = 1;
UPDATE "QcReportRecord" SET "organizationId" = (SELECT "id" FROM "Organization" LIMIT 1)
WHERE "organizationId" = 'local' AND (SELECT COUNT(*) FROM "Organization") = 1;
UPDATE "StudioEvent" SET "organizationId" = (SELECT "id" FROM "Organization" LIMIT 1)
WHERE "organizationId" = 'local' AND (SELECT COUNT(*) FROM "Organization") = 1;

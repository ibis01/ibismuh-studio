-- AUDIT F-2 backfill: the sandbox lane (StudioProject + its children) wrote
-- every row under the constant organizationId 'local' while its routes
-- carried no route-level guard. The remediation wires requireUser + the
-- caller's real organization into the lane (orgId()), so pre-remediation
-- rows must ride along or they vanish from their owner's view.
--
-- SAFE IN BOTH SCHEMA STATES. The sandbox tables are created by the stage2
-- bootstrap phases, NOT by a SQL migration — a fresh chain replay (the PG
-- CI wedge-recovery job) reaches this migration BEFORE any StudioProject
-- table exists. Every statement therefore runs only when its table is
-- present (information_schema guard); on a fresh replay this migration is
-- a no-op, and on a live deployment the backfill re-homes legacy rows.
--
-- Safe in every deployment that can exist today: there is no invite flow,
-- so every organization is single-member and first-org wins is correct.
-- The WHERE clause re-scopes only rows still pinned to the legacy constant,
-- and the subquery is guarded to run only when exactly one organization
-- exists — a multi-org install (none can exist yet) stays untouched and
-- explicit instead of silently re-homed.
DO $$
DECLARE
  org_count int;
  target_org text;
BEGIN
  SELECT COUNT(*) INTO org_count FROM "Organization";
  IF org_count <> 1 THEN
    RETURN; -- zero orgs (fresh replay) or multi-org (cannot exist yet): no-op
  END IF;
  SELECT "id" INTO target_org FROM "Organization" LIMIT 1;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'StudioProject') THEN
    UPDATE "StudioProject" SET "organizationId" = target_org WHERE "organizationId" = 'local';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PlanRevision') THEN
    UPDATE "PlanRevision" SET "organizationId" = target_org WHERE "organizationId" = 'local';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'AssetRecord') THEN
    UPDATE "AssetRecord" SET "organizationId" = target_org WHERE "organizationId" = 'local';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'AudioReceiptRecord') THEN
    UPDATE "AudioReceiptRecord" SET "organizationId" = target_org WHERE "organizationId" = 'local';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'RenderJob') THEN
    UPDATE "RenderJob" SET "organizationId" = target_org WHERE "organizationId" = 'local';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'QcReportRecord') THEN
    UPDATE "QcReportRecord" SET "organizationId" = target_org WHERE "organizationId" = 'local';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'StudioEvent') THEN
    UPDATE "StudioEvent" SET "organizationId" = target_org WHERE "organizationId" = 'local';
  END IF;
END
$$;

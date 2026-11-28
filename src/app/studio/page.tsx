// /studio — the ADDITIVE planner-pipeline surface (a01f72f "lands on the
// main spine, additive").
//
// WORKSPACE ADJUDICATION (G2): the canonical studio is `/` — every
// master-plan workstream (timeline-studio, production workspace, catalog,
// QC gates) lives and ships there. This surface is the alternate six-lane
// pipeline workspace over the same hardened /api/projects backend; it is
// reachable from exactly ONE quiet, honestly-labeled dashboard entry
// ("Planner pipeline preview") and never from the main nav, so a preview
// can never present itself as the canonical studio.
//
// The decision record: docs/decisions/0001-studio-ownership.md (Master
// plan Phase 3). Amending the adjudication requires amending that record
// and e2e/studio-preview.spec.ts in the same commit — a silent fork of
// the surfaces is a defect by definition.
//
// It shares the six-lane contract via ./studio-catalogs + studio-lanes.ts —
// the drift law (scripts/test-lane-registry-drift.mts) keeps that contract
// identical to the canonical registry.

import { StudioApp } from "@/components/studio/studio-app";

export default function StudioPipelinePage() {
  return <StudioApp />;
}

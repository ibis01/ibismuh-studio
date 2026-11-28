# Decision 0001 — /studio workspace ownership (the G2 adjudication)

- **Status:** ACCEPTED (reaffirmed by the Master plan "After 646c79c", Phase 3)
- **Date:** first adjudicated in the G2 session (commit a01f72f); recorded here 2026-11-28
- **Deciders:** the single-owner programme (ibis01)
- **Scope:** every present and future "studio" surface in this repository

## Decision

**The canonical studio is `/`.** Every master-plan workstream — the
timeline studio, the production workspace, the catalog, the QC gates, the
render pipeline surfaces — lives and ships at the `/` route.

**`/studio` is an additive, subordinate surface.** It is the alternate
six-lane pipeline workspace over the SAME hardened `/api/projects`
backend. It exists to iterate on pipeline UX without destabilizing the
canonical studio.

## The laws (each enforced by a test — not by convention)

1. **One quiet entry.** `/studio` is reachable from exactly ONE
   honestly-labeled dashboard entry ("Planner pipeline preview") and never
   from the main nav, so a preview can never present itself as the
   canonical studio. *Enforced: `e2e/studio-preview.spec.ts` (identity
   marker, main-nav absence, dashboard presence).*
2. **Honest identity.** The surface self-describes as a preview in its own
   chrome (`src/components/studio/nav-rail.tsx` identity marker).
3. **Shared contract, no fork.** `/studio` consumes the same six-lane
   registry (`src/lib/ibismuh/lane-contracts.ts`) through derived adapters
   (`studio-lanes.ts`, `video-lanes.ts`). *Enforced:
   `scripts/test-lane-registry-drift.mts` (`npm run test:lane-drift`, in
   the `check` chain) — object identity + fingerprint stability laws.*
4. **No second render engine.** Neither surface may grow an independent
   renderer; both resolve through `render-lane.ts` admission over the same
   engine lanes.
5. **The adjudication is in-source.** `src/app/studio/page.tsx` carries the
   decision in its header so a reader of the code hits it before any
   import.

## Consequences

- New studio features LAND AT `/` first. Porting a slice to `/studio` is a
  downstream, optional act — never the primary vehicle.
- If a future decision REVERSES this one, this file is amended (not
  deleted), `page.tsx`'s adjudication header is rewritten in the same
  commit, and `e2e/studio-preview.spec.ts` is updated to pin the new law —
  a silent fork of the surfaces is a defect by definition.
- The historical baseline audit's "App pages: 2" figure
  (`docs/audits/b0-ibismuh-studio-baseline.md`) predates the additive
  surface and is preserved as written; this document supersedes it for
  route-count questions.

## References

- In-source adjudication: `src/app/studio/page.tsx` (header)
- e2e enforcement: `e2e/studio-preview.spec.ts`
- Contract single-source: `src/lib/ibismuh/lane-contracts.ts`
- Drift battery: `scripts/test-lane-registry-drift.mts`
- Session receipt: `worklog.md` (G2 entry)

# CINEMATIC FULL-STUDIO UPGRADE

**Repository:** `ibis01/ibismuh-studio`
**Proposed document:** `docs/design/CINEMATIC_FULL_STUDIO_UPGRADE_PLAN.md`
**Baseline:** `b2fd3f3`
**Status:** PROPOSED — implementation approval required per release
**Legacy repository:** `ibis01/tubeforge` — strictly out of scope

## 1. Mission

Evolve Ibismuh Studio into a premium cinematic AI visual-production environment.

Preserve B1–B4 architecture and existing functionality. Improve the application shell, project workflow, production workspace, 2D/3D authoring, timeline, audio, assets, publishing and account experience.

The creator remains in control. AI assists with creative decisions; it does not silently take control of production.

## 2. Design contract

- Dark-first cinematic navy foundation.
- Existing blue/cyan brand accents retained.
- Clear hierarchy between application shell, workspace, preview and inspector.
- Immersive media presentation without sacrificing editing density.
- Geist typography and Lucide iconography.
- Consistent spacing, borders, panel geometry and elevation.
- Restrained motion and complete reduced-motion support.
- Accessible contrast, focus and keyboard interaction.
- No unrelated redesign of existing engineering architecture.

## 3. Workstreams

### C1 — Design system and shell
Files: `globals.css`, `layout.tsx`, `page.tsx`, `app-sidebar.tsx`, `brand.tsx`, `logo.tsx`, `command-palette.tsx`, `shared.tsx`, `icon.svg`, `manifest.webmanifest`.

Deliver: tokens, shared panel grammar, navigation, header, loading/empty/error states and responsive shell.

### C2 — Home, Projects and Create
Files: `dashboard-view.tsx`, `library-view.tsx`, `create-view.tsx`, `plan-card.tsx`, `production-board.tsx`, `attention-panel.tsx`, `research-view.tsx`, `calendar-view.tsx`.

Deliver: cinematic project cards, useful dashboard, guided creative brief, visual production profiles, project filtering and clear status.

### C3 — Production workspace
Files: `production-workspace.tsx`, `workspace-view.tsx`, `scene-editor.tsx`, `scene-trust-panel.tsx`, `director-card.tsx`, `critic-card.tsx`, `pacing-strip.tsx`, `transition-controls.tsx`, `motion-controls.tsx`, `ui/resizable.tsx`.

Deliver: coherent Director, Storyboard, Canvas, Timeline and Inspector experience; improved scene selection, inspection, revision and save feedback.

### C4 — Animation and visual authoring
Files: `graphics-studio.tsx`, `graphics-canvas.tsx`, `motion-panel.tsx`, `whiteboard-studio.tsx`, `wb-canvas.tsx`, `scene3d-panel.tsx`, `characters/rig-panel.tsx`, `characters/rig-preview.tsx`; related existing animation modules only where an evidenced defect requires changes.

Deliver: improved 2D, whiteboard, 3D and character authoring UX; clearer keyframes, motion, camera and preview controls.

### C5 — Timeline, audio and finishing
Files: `timeline-studio.tsx`, `music-controls.tsx`, `music-upload-dialog.tsx`, `studio-sound.ts`, `audiomix.ts`, `sound-plan.ts`, `preview-lanes.ts`, `render-qc.ts`, `qc.ts`.

Deliver: readable multi-track editing, better clip controls, narration/music/SFX editing, export controls and understandable QC.

### C6 — Assets, publishing and account
Files: cast/world/voice/analytics/channels/settings views, `account-card.tsx`, `security-card.tsx`, `brand-kit.tsx`.

Deliver: consistent asset management, voice and reference tools, analytics, publishing preparation, provider settings and account experience.

## 4. Release sequence

- R1: Design system and shell.
- R2: Home, Projects and Create.
- R3: Production workspace.
- R4: 2D, whiteboard and 3D authoring.
- R5: Timeline, audio and finishing.
- R6: Assets, publishing and account surfaces.

Each release has a separate implementation record and acceptance receipt.

## 5. Acceptance

Every release must pass:

- Typecheck, lint and relevant unit tests.
- Production build.
- Relevant Playwright regression tests.
- Desktop, tablet and mobile browser inspection.
- Keyboard and reduced-motion inspection.
- Empty, loading, error and populated-state checks.
- Real project walkthrough for affected workflows.
- Before/after visual evidence.

The final full-suite gate includes the existing E2E suite and `npm run check`.

Animation changes must preserve deterministic render behavior and the existing human visual acceptance process.

## 6. Regression protection

No redesign-driven changes to:

- Prisma schema or migrations.
- Authentication, sessions or tenant isolation.
- Billing, Stripe or spend gates.
- Provider abstractions or provider credentials.
- Queue semantics and worker recovery.
- Rendering and export contracts.
- Animation clocks, document schemas or deterministic output.
- Storage ownership and delivery contracts.

Any required engineering change must be separately justified, scoped and tested.

## 7. Production gate

The production stabilization findings remain separately tracked:

- PostgreSQL migration and raw-SQL compatibility.
- SQLite-specific query handling.
- Worker availability.
- Email delivery and public verification URLs.
- Live storage verification.
- Live render delivery.

No release may claim production readiness from a successful frontend build alone.

## 8. Repository boundaries

All changes must be committed exclusively to `ibis01/ibismuh-studio`.

Never push, cherry-pick, rename, or modify files in `ibis01/tubeforge` as part of this programme.

## 9. Reporting format

For every release:

- Status: PASS / PARTIAL / FAIL / BLOCKED / NOT VERIFIED.
- Files changed.
- Why each file changed.
- Tests executed and results.
- Screenshots or visual evidence.
- Known regressions and unresolved issues.
- Deployment status, if applicable.
- Commit SHA.

No completion claim without evidence.

## 10. Boundaries carried into implementation

- No wholesale redesign of B1–B4. The current architecture is already substantial; replacing it would create unnecessary regressions.
- No new animation engine just for visual improvement. The existing graphics, whiteboard, 3D and animation compiler improve through their established interfaces.
- No production deployment claim from CI passing. Production stabilization, storage verification, human visual acceptance and actual render delivery remain separate gates.
- The plan deliberately does not invent the missing verbatim ten-screen enumeration mentioned in the design kickoff. Existing documented screens and routes are the scope until that specification is formally restored.
- The S162 human visual acceptance law is unchanged: at least three independent scorers, arm B composite at least 4/5 and better than arm A. Unit tests cannot replace it.

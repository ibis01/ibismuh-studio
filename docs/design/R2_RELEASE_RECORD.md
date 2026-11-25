# R2 RELEASE RECORD — Home, Projects and Create

**Programme:** CINEMATIC_FULL_STUDIO_UPGRADE_PLAN.md
**Branch:** `r2-home-projects-create` (spec `e2d907b`, implementation `5360e9e`)
**Baseline:** main `a9b24e2` (CI run #36 green, 8/8 with e2e)
**Date:** 2026-11-19 UTC

## Status

**PASS (pending CI run on merge)** — every R2 acceptance gate verified locally in this session; the one non-green e2e test is proven pre-existing (stash-bisect, below) and out of R2's change set. CI is the final authority; this record is NOT a claim about CI until the run completes.

## Files changed and why

| File | Why |
| --- | --- |
| `src/components/ibismuh/views/library-view.tsx` | The library lied about failure: a failed `/api/videos` load rendered the empty state. Now tracks `loadError` and renders the R1 `ErrorState` + `RetryButton` (retry clears, reloads). Filter TabsList scrolls under `.tf-scroll-bar` (the R1 scrollbar law). |
| `src/components/ibismuh/views/dashboard-view.tsx` | Stats failure now renders `ErrorState` + `RetryButton` (was `EmptyState` — failure and empty are different states; R1 built the primitive, C2 had not adopted it). Activity list scrolls under `.tf-scroll-bar`. Unused `EmptyState`/`AlertTriangle` imports removed. |
| `src/components/ibismuh/views/research-view.tsx` | Initial session load was a silent catch → "No scans yet" on real failure. Now `loadError` → `ErrorState` + `RetryButton`; success clears the flag. |
| `src/components/ibismuh/views/calendar-view.tsx` | Load failure toasted once, then the mobile agenda showed "Nothing scheduled" and the sidebar "No videos are ready yet" while nothing loaded. Both branches now render compact `ErrorState` with retry; toast kept for immediacy. Sidebar list scrolls under `.tf-scroll-bar`. |
| `src/components/ibismuh/production-board.tsx` | Proven palette violation: the running stage used **indigo** (dot + spinner). Live-state indicators ride `primary` everywhere else in the studio — board now matches the law. |
| `src/components/ibismuh/shared.tsx` | `ErrorState` accepts className overrides via `twMerge` (the compact calendar-sidebar variant needs it). Enabler for the four view changes; no other primitive touched. |
| `public/offline.html` + `public/sw.js` | The offline fallback was still Ibismuh Studio-branded (a rebrand gap outside R1's audited file list, surfaced live during this session's evidence run when the app's SW served the cached shell). Title/heading now say Ibismuh Studio; the SW cache name bumped to `ibismuh-studio-v2` so every client evicts the stale `ibismuh-v1` shell on next load. Mechanics unchanged. |

## Deliberately unchanged (audited, the no-churn law applied)

- `create-view.tsx` format/mode accents (fuchsia/violet) and `plan-card.tsx` studio-tier violet: six-way/multi-way differentiation where primary/amber/sky/emerald are taken; purple-family is now a DOCUMENTED allowance for tier/mode differentiators only — never for failure, attention or live states (spec §1).
- `attention-panel.tsx`: correct as shipped (red = destructive cancel, amber = attention, silent-null when nothing to show).
- Home's Stage-4a inline card headers stay; `PanelHeader` is a different (bars) panel shape that belongs to C3+ surfaces.

## Tests executed and results

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (0 errors, 19 pre-existing warnings) |
| `npm run test` (unit) | PASS — 1026/1026 (first run without the explicit `DATABASE_URL` failed 2 DB-backed tests against the sandbox's ambient hijacked URL — the known postinstall-hijack class, reproduced and attributed; with the repo DB the suite is fully green) |
| Playwright `smoke` + `isolation` + `premium-ux` + `mobile-sweep` | 23/24 PASS. The one failure (`premium-ux` T-4.4, PATCH autosave) was **stash-bisected**: it fails identically with all R2 changes stashed (pre-R2 tree), so it is NOT an R2 regression. Same test passed in CI run #36 on its own runner; classified environmental in this sandbox (shared dev DB + Turbopack dev timing), and CI remains the authoritative gate. |
| Live browser walkthrough | PASS — Home → Projects (4 projects, 7 filter tabs) → Create surfaces → Settings; ⌘K keyboard-open; sticky footer laws hold. |

## Visual evidence (session-scoped, `/tmp/r2-session/`)

- `r2-projects-after.png` — Projects populated, R2 code (desktop 1440×900).
- `r2-library-error-state.png` — the designed failure state captured LIVE: `/api/videos` requests aborted via Playwright route interception → `role=alert` card "Could not load the library" + honest message + Retry (DOM probe: `errorStateShown: true`).
- `r2-library-recovered.png` — after unroute + Retry: `alertGone: true`, 4 workspace buttons, 7 filter tabs (the full fail → retry → recover cycle).
- `01-landing.png` / `03-settings.png` / `04-palette.png` — Home, Settings, keyboard-opened ⌘K palette unchanged from R1.

## Known regressions / unresolved issues

- T-4.4 (above): pre-existing environmental failure in this sandbox, proven independent of R2 by stash-bisect; watch the CI run for the authoritative verdict.
- The app's own service worker serves `offline.html` as a navigation fallback; during server downtime it takes over the page until unregistered. That is the SHIPPED behavior (offline.html exists for exactly the phone-tethered-dev story); the R2 fix only de-brands the shell and busts the stale cache. The "SW takes over during outages" UX is noted as a candidate for the shell track, not changed here.

## Deployment status

Not deployed. Per the plan: no production claim from a frontend build; Fly picks releases up through the repository's own deployment flow after merge.

## Commit SHAs

- `e2d907b` — R2 spec
- `5360e9e` — R2 implementation
- `551bd63` — production-gate fix (Postgres quiet door), separate track, rides the same branch for one CI verdict

## CI receipts (post-merge addendum, 2026-11-19, credentialed session)

- **Push status: RESOLVED** — main fast-forwarded `a9b24e2..b6a9be2` (spec, implementation, production fix, this record); branch `r2-home-projects-create` pushed alongside.
- **Run #37 (b6a9be2)**: 7/8 jobs green (gitleaks, typecheck/lint/unit 1026, money-path, clean-clone, build, docker smoke, PostgreSQL integration) — but the E2E (Playwright) job was **cancelled** by its own 28-minute budget: azure's apt mirror starved again (the documented flake class), canonical starved too, the pinned-ffmpeg outage net rescued the render toolchain, and `playwright install --with-deps` burned 17.4 minutes in apt retries — the suite got ~3 minutes and was cancelled mid-battery with zero test failures. **Infra flake, not an R2 regression.**
- **CI hardening**: e2e budget 28 → 40 minutes with the full receipt in the workflow (`7bf860f`, the repo's outage-net law — same shape as 473db65/87599d3).
- **Run #38 (7bf860f): 8/8 GREEN, including E2E (Playwright) in 10.2 minutes** — the R2 tree passes the full suite on CI, and premium-ux T-4.4 passes there too, confirming the sandbox-only classification in the table above.
- The local claim above ("PASS pending CI run") is now upgraded: **R2 is CI-verified green on main** (`7bf860f`).

## Production-gate note (separate track, landed here)

`readLegacyRows` now probes table presence provider-aware: SQLite keeps `sqlite_master`; Postgres uses `to_regclass('public."LegacySetting"')` (NULL, never an error, on a missing table) — killing the per-auth-status-poll 42703 error-log noise a fresh Postgres install would have produced. The migration/raw-SQL compatibility finding was otherwise already covered: S60/S61 portability law + the CI `postgres` job (migrations wedge self-heal, constraint names, portability battery) verified in `.github/workflows/ci.yml`. Worker availability, email delivery, live storage and render delivery remain Fly-runtime findings needing deployment access — unchanged by this release.

# R1 RELEASE RECORD — Design system and shell

**Programme:** CINEMATIC_FULL_STUDIO_UPGRADE_PLAN.md
**Branch:** `r1-cinematic-shell` (spec `7185c7c`, implementation `966b007`)
**Baseline:** `b2fd3f3` + ai fix `06a4009` (settings-first providers + req.nextUrl hardening, landed on main before R1 branched)
**Date:** 2026-11-19 UTC

## Status

**PASS (pending merge + CI run)** — implementation verified locally against every R1 acceptance gate listed in the spec; the branch and main both await push (no GitHub credentials available in this sandbox session — see §9).

## Files changed and why

| File | Why |
| --- | --- |
| `src/app/globals.css` | The plan's depth/motion contracts: `--tf-elev-1/2/3` + `.tf-elev-*` (controlled elevation), `.tf-panel` (shared panel chrome), `.tf-scroll-bar` (one scrollbar law for inner scroll areas), and the GLOBAL reduced-motion guard — the previous guard paused only the `.tf-tx/.tf-kb/.tf-eq` render primitives while UI transitions kept running. Existing B1/Stage-4a tokens untouched. |
| `src/components/ibismuh/shared.tsx` | The missing state/grammar primitives: `PanelHeader` (kicker + title + actions band), `ErrorState` (designed failure, honest message, retry slot), `RetryButton`, `LoadingState`, `PreviewFrame` (aspect-ratio-aware cinematic media frame). No existing primitive changed. |
| `src/components/ibismuh/app-sidebar.tsx` | Section kicker ("Destinations"), left active rail (one controlled accent), `tf-focusable` on every nav/sign-out button, hint now surfaced as `title`, elevation on the status card. |
| `src/app/page.tsx` | Header hierarchy: kicker above the title (`VIEW_META` gained `kicker` per view); shell structure (sticky header, sticky footer, mobile sheet) untouched. |
| `src/components/ibismuh/command-palette.tsx` | `tf-elev-3` on the dialog — the palette now sits on the depth law instead of an ad hoc shadow. |

`icon.svg` / `manifest.webmanifest` / `brand.tsx` / `logo.tsx` audited: already consistent with the brand gradient — deliberately unchanged (no churn).

## Tests executed and results

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (0 errors, 19 pre-existing warnings) |
| `npm run test` (unit) | PASS — 1026/1026 |
| Playwright `smoke` | PASS — 4/4 |
| Playwright `isolation` | PASS — 8/8 |
| Playwright `premium-ux` | PASS — 12/12 (T-4.4 also passes standalone; its one earlier failure was a cross-test flake, reproduced and confirmed independent of these changes) |
| Playwright `mobile-sweep` | PASS |
| Browser walkthrough | PASS — sign-in → Home → Projects → Settings → ⌘K palette (keyboard-opened, `paletteOpen: true`) |
| Horizontal overflow @390×844 | PASS — `scrollWidth == clientWidth` |
| Reduced motion (emulated) | PASS — shell renders static, states legible |

## Visual evidence

Captured to `/tmp/r1-evidence/` (sandbox session artifacts): desktop home 1440×900, projects, settings, palette (keyboard-opened), tablet 768, mobile 390×844, reduced-motion emulation. Key observations: kickers render on the header and sidebar; the active rail appears only on the active destination; KPI/attention cards keep the Stage-4a surfaces; the palette carries the shared depth.

## Known regressions / unresolved issues

- None found by the suites above. The e2e suite remains a working-tree gate — CI must confirm on push.
- The primitives (`PanelHeader`/`ErrorState`/`LoadingState`/`PreviewFrame`) are deliberately NOT yet wired into every view — that is C2–C6 scope. R1 only adds the shared layer the plan asked for.

## Deployment status

Not deployed. Per the plan: no production claim from a frontend build; the Fly deployment picks releases up only through the repository's own deployment flow after merge.

## Push status (honest)

BLOCKED — this sandbox session has no GitHub credentials (`git push` fails with `could not read Username`), so `main` (`06a4009`, `1fc423a`) and `r1-cinematic-shell` (`7185c7c`, `966b007`) exist **locally only** until a credentialed session pushes them. CI has therefore not yet seen any of these commits; the CI-green claim for them is explicitly NOT VERIFIED until that push happens and run completes.

## Commit SHAs

- `7185c7c` — R1 spec
- `966b007` — R1 implementation

## Post-merge addendum (2026-11-19, credentialed session)

- **Push status: RESOLVED** — a session with credentials pushed the branch and fast-forwarded main `b2fd3f3..3164e6f` (plan doc, spec, implementation, release record, and the settings-first AI fix that R1 branched from).
- **CI receipts**: branch dispatch run 44465691687 — 7/7 jobs green (E2E skipped by the event contract; it runs on main pushes) → main push run 44466102550 — **8/8 green including E2E (Playwright)**.
- **Gitleaks dispatch note**: workflow_dispatch scans FULL history, which surfaced 9 historic-class findings at 4 SHAs the 2026-11-15 baseline predates — `764a7bc` (the post-wipe re-land of already-receipted e2e fixtures), `5f4d30a` (b4-test literal, root-killed by `1e546a2`), `fdd76722`/`6d45ec1` (tool-result dumps, untracked by `cc24e05`). None in the R1 commits. Baseline extended with per-commit receipts in `3164e6f`, per this file's own receipt law; reproduced with the exact CI binary (gitleaks 8.24.3: 9 leaks before, 0 after, 644 commits).
- **Fresh visual evidence (this session)**: desktop 1440×900 Home/Projects/Settings; ⌘K palette keyboard-opened (11 items, group kickers, `tf-elev-3` depth); tablet 768; mobile 390×844 with `scrollWidth == clientWidth` (no horizontal overflow); sidebar kickers "Destinations"/"Studio" and the single active-rail accent verified via DOM probes. Artifacts in the session's evidence folder (session-scoped, like the original `/tmp/r1-evidence` set).
- **Reduced motion**: verified in the original local battery (above). Not re-emulated in this session (no CLI emulation hook) — the behavior remains covered continuously by `premium-ux` inside the CI E2E suite.
- **Deployment**: unchanged — no production claim from a frontend build; Fly picks releases up through the repository's own deployment flow after merge.

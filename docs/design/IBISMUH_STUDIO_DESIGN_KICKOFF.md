# IBISMUH Studio — Design Kickoff (Execution Artifact 01)

**Status:** APPROVED — kickoff record for the design-first evolution of Ibismuh Studio.
**Recorded:** 2026-11-17.
**Provenance:** This file preserves the decisions approved in the kickoff artifact
(Execution Artifact 01). Two restoration items are tracked below as B1
deliverables rather than silently paraphrased here: (a) the verbatim 10-screen
enumeration, (b) the verbatim B1–B7 stage definitions. Nothing in this document
authorises implementation ahead of that restoration — no speculative work.

---

## 1. Mission

IBISMUH Studio is an AI visual production studio — *"From imagination to motion."*
It is the design-first evolution of the Ibismuh Studio codebase: the engineering core is
preserved wholesale, and the product surface is rebuilt against a new design system.

## 2. Non-negotiable engineering constraints

1. **Preserve all existing functionality.** Every current capability keeps working
   through every release stage.
2. **Do not rewrite the engineering core.** Off-limits for rewrite:
   - database schemas (Prisma),
   - authentication,
   - billing,
   - AI provider layer,
   - rendering pipeline,
   - queue,
   - animation engines.
3. **No global rename of Ibismuh Studio identifiers.** Product naming evolves only at
   the user-visible surface; code-level identifiers stay.
4. **No speculative implementation.** Nothing is built that the current stage's
   spec does not pin.
5. **No unnecessary rewrite.** Working code is not rewritten for taste.
6. **No unverified completion claims.** Every "done" carries a receipt.

## 3. Design language (approved tokens)

Dark-first. Surface hierarchy reads dark → darker; text reads light on all surfaces.

| Token | Value | Role |
| --- | --- | --- |
| Background | `#080D18` | app background (darkest plane) |
| Sidebar | `#0D1423` | navigation rail |
| Surface | `#111C30` | cards, panels, elevated content |
| Border | `#24334B` | strokes, separators, input outlines |
| Primary | `#548BFF` | primary actions, active states |
| Accent | `#37D6E8` | accent highlights, focus, data emphasis |
| Text | `#F3F6FC` | primary text |
| Text secondary | `#98A8BD` | secondary text, metadata, placeholders |

- **Typography:** Geist (sans) as the product face; Geist Mono for code and data.
- **Iconography:** Lucide, exclusively.
- **Mode:** dark-first; light mode is not a B-series deliverable unless restated
  by the artifact restoration.

## 4. Information architecture (approved)

Four navigation groups:

1. **Workspace**
2. **Production**
3. **Publishing**
4. **Administration**

Navigation model: persistent sidebar (`#0D1423`) with group sections mapping the
four groups above onto the existing route surface.

## 5. Screen inventory

The artifact approves a **10-screen specification** across the four IA groups.
The verbatim per-screen enumeration from the artifact is a **B1 deliverable**
(restoration of the artifact text). Screens are NOT to be implemented until that
enumeration is pinned in `docs/design/`.

## 6. Release ladder

- **B0 — Engineering baseline evidence.** Defined and executed: clean install,
  production build, battery baseline (1003), route/component/screenshot
  inventory, secret audit, docs reconciliation. Record:
  `docs/audits/b0-ibismuh-studio-baseline.md`.
- **B1 — Design spec pass:** artifact verbatim restoration (10 screens + B1–B7
  stage definitions) pinned into `docs/design/`; IA-to-route mapping table.
- **B2–B7 —** stage definitions pending verbatim restoration (see B1). Do not
  infer scope from names; the restored artifact is authoritative.

## 7. Bootstrap record (2026-11-17)

1. Repository `ibis01/ibismuh-studio` created by the operator (currently private).
2. **Gate A — licence review: PASS.** `LICENSE` is proprietary, © 2026 Ismail
   Ibrahim; `package.json` is `UNLICENSED` / `private: true`. The copyright
   holder publishing their own repository is consistent with the licence as
   written (its GitHub ToS carve-out governs viewing). Licence and manifest
   fields preserved untouched.
3. **Gate B — full-history secret scan: PASS.** 4,149 blobs across 681 commits
   scanned: zero live GitHub/AWS/Google/Slack/Stripe/npm credentials and zero
   private keys. The only matches are synthetic test fixtures
   (`scripts/test-unit.mts`, `scripts/s25-unit-probe.mts`). The legacy tokens
   referenced in earlier session notes appear nowhere in history (consistent
   with the standing gitleaks CI job).
4. **Full history mirrored** to this repository — exact ref-for-ref copy:
   `main @ b06f222` + 26 side branches; tags: none (none exist upstream).
5. B0 baseline executed on node `v24.22.3` / npm `11.19.1` / ffmpeg `7.1.5`
   (matching the CI pins): clean install exit 0, production build exit 0,
   battery **1003 passed / 0 failed**.

## 8. Visibility

The repository is currently **private** (operator's setting at creation).
Making it public is one API call (`PATCH /repos/ibis01/ibismuh-studio`,
`{"private": false}`) and stays an operator decision — both push gates have
already passed.

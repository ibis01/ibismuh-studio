# S136 — the Stabilisation Wave (the Gate's first repair cycle)

**Date:** 2026-11-15 · **Baseline:** `f9f57c1` (S135) · **Feature freeze:** HELD
**Companion (operator-side):** `/home/z/tubeforge-gate-reports/2026-11-15-stabilisation-gate.md`

## 1. The audit

A fresh READ-ONLY audit at `f9f57c1` classified the nine Stabilisation Gate exit
conditions — **4 PASS / 5 PARTIAL / 0 FAIL** — on four parallel evidence legs (render
lanes + mixed compositions; character K1; scene editing + production QC; docs +
security/data-integrity). Every claim carries file:line evidence reproducible at the
baseline commit. CI run #323 on the same commit: Success, 4m53s, 8/8 jobs.

## 2. The mandate (operator-approved, with adjustments)

1. Execution order fixed: scene-revision integration → K1 rig smoke (ids ≠ slots
   MANDATED) → graphics output validation → narration-sync QC → cancellation drill.
2. B1 and B2 are implementation defects — fixed alongside failing-first regression
   tests; no green obtained by weakening assertions.
3. Security immediate: the public source ZIP investigated BEFORE removal.
4. All changes reviewed before merge; full CI after repairs; the audit record updated
   with evidence.

## 3. What landed

| Item | Change | Proof |
|---|---|---|
| W1-1 | `test:scene-revisions` joins the CI check job | 29/29 locally (the battery was green before wiring) |
| W1-2 + B1 | the K1 rig smoke joins the e2e job; a SECOND fixture with part ids ≠ slots; rendered-frame sha movement + true-hold asserts; the slot→part bridge in `poseAt` (`jointsReachableByParts`); the mocap route refuses captures that bind no part (422, `boundParts`) | fails-first: 0.00° before the bridge, 45.00° after; battery pin "S136 the mocap binding law"; route source pin |
| W1-3 | s87 battery Part C (graphics ffprobe: per-scene windows, concat total, audio, one-consumer tracks); graphics e2e asserts `videoDuration > 0` + the QC `playable` verdict; **the probe wall** — an unmeasurable render THROWS instead of landing 0.0s (both engine lanes) | s87: ALL GREEN 25/25 in 32.4s; S75 pin re-anchored + wall pinned |
| W1-4 | the narration-sync QC check's first verdict fixtures (+0.5s drift passes, −6s fails hard) + the caption speech-run aligner against ground truth | battery: 3 new tests green |
| W1-5 | the E12 queue drill joins the e2e job (`test:queue-drill`) | local: PASS in 23s ("Stop really stops") |
| B2 | the S135 receipt-ordering guard ported to render/storyboard/scene/short/convert | repo-wide source pin (guards ≥ 5, retried ≥ 5, best-effort ≥ 5, lanes named) |
| W2 | the PATCH concurrency gate moved UP-FRONT (same 409 shape, before ANY mutation); the scene editor sends `expectedSceneVersion`; `GraphicsImport` + `WhiteboardAssetUpload` join `ORG_SCOPED_MODELS`; the schema-scan pin; SQLite `busy_timeout=10000` + one-shot WAL | ordering pin; scope pins (the scan found the sixth carrier the manual audit missed) |
| W3 | worklog + this record; README/ROADMAP/ARCHITECTURE/s120-doc/external-doc/SECURITY reconciled; `public/tubeforge.zip` untracked; `public/*.patch` gitignored | the divergence list closed |

## 4. The zip investigation (before removal, as mandated)

381 files, 2026-10-31 snapshot. **No secrets**: `.z-ai-config` carries an EMPTY
`apiKey`; `.env` inside the zip contains only a dev SQLite file path
(`file:/home/z/my-project/db/custom.db`); `.env.example` is placeholders; a
secret-pattern scan across all 381 files found zero credential material. The
`voice-server/` deployment docs use `<your-username>`/`<ip>` placeholders, and the
source itself was already public (this is a public repository). Removed as stale
weight and confusion — not as an exposure. `tf-git-setup.sh` / `tf-go-public.sh`
scanned: clean (they are hygiene enforcers).

## 5. Verification state at close

- Unit battery **814 passed, 0 failed** (807 → 814: the binding law, 2 narration-sync,
  the aligner, the receipt-guard pin, the scope pin, the ordering pin).
- `tsc --noEmit` clean; changed-file eslint clean (full lint re-run recorded in CI).
- s87 battery ALL GREEN 25/25 (with Part C); E12 drill PASS; scene-revisions 29/29.
- The K1 smoke's full local run + the complete CI gate are the merge's own evidence
  (the run on this branch is the receipt — the audit's numbers were never assumed).

## 6. Still open (honest ledger)

- The blind re-scores + the identity VCE row: the humans' item (S128 kit).
- Walk/turn locomotion: K1-ext (the roadmap row records the scope honestly).
- Per-scene engine mixing: Stage X by design (gated) — the gate's condition 7 reads
  as the shipped architecture ("per-video engine lanes compose through one shared
  contract; per-scene mixing is Stage X").
- The operator's standing item: revoke the four chat-exposed PATs.

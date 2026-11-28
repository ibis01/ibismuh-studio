# Blind human release composite — TEMPLATE (Status: PENDING)

> Honest state: **PENDING** — this is the execution template for the human
> release gate (master plan Phase 10 after `941a6ee`). The machine gate is
> GOVERNED; the human composite has NOT run yet. This file becomes the real
> record `docs/audits/blind-release-composite.md` ONLY when three humans have
> actually scored — the gate script never accepts a template as a pass, and
> nobody is to copy scores into this file that were not produced by the
> process below.

## 1. What this gate is

The release rides a blind human composite: codenamed artifacts, ≥ 3
independent scorers, one anchored rubric, ≥ 4.0/5 per lane. The machine gate
(`scripts/release-gate.mts`) checks the RECORD; the humans produce it.

## 2. Execution procedure

1. **Kit generation** — run the blind kit builder
   (`node --import tsx scripts/s162-blind-kit.mts`): renders are assigned
   codenames (`TFR-<8hex>`) and cryptographically shuffled (Mulberry32 from
   the kit key — reproducible from the key only, never from the artifact
   order). The kit ships contact sheets per artifact.
2. **Scorers** — give the SAME kit and rubric to at least three independent
   scorers who did not author the renders and cannot map codenames to lanes
   or projects. Scorers submit scores independently, before seeing each
   other's.
3. **Rubric (anchored, per artifact)** — composition, narrative clarity,
   timing, motion quality, typography, audio/narration alignment, artifact
   defects, lane-specific quality. Each dimension 1-5 with the anchor
   descriptions from `src/lib/ibismuh/whiteboard/benchmark-scenarios.ts`
   (the human-rubric dims) as the calibration.
4. **Composite** — per lane: the mean of the scorers' lane totals, to one
   decimal. Every lane composite must be ≥ 4.0/5.
5. **Record** — rename/fill this template as
   `docs/audits/blind-release-composite.md` with the fields in §3, commit,
   then run `npm run gate:release -- --strict`.
6. **Failure path** — a lane under 4.0 is a release exception ONLY with an
   owned record: risk, expiry date, rollback plan, follow-up issue. The
   exception lives in the same composite record under "Exception" — never a
   silent pass.

## 3. Fields the record must carry (the gate parses these)

- `scorers: <N>` (N ≥ 3)
- Per-lane composites in the `<score>/5` form, one per lane sheet, e.g.
  `whiteboard: 4.3/5`, `graphics: 4.1/5`, plus every lane under release.
- Artifact hashes (sha256 of each scored MP4/contact sheet), the commit SHA,
  the kit key reference (NOT the key itself), scorer count, per-scorer
  comments, and any exception with risk/expiry/rollback/follow-up.

## 4. Current status

- Kit: `scripts/s162-blind-kit.mts` (codename + shuffle machinery — EXISTS)
- Scorers: not recruited (NOT EXECUTED)
- Composite: not produced (PENDING)
- Gate state at last machine run: `GOVERNED` with one `NOT VERIFIED` human
  composite — the honest posture until §2 completes.

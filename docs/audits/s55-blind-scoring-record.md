# S55 kit — the November 8 eight-profile blind scoring: the returned round, the baseline of record

| | |
|---|---|
| Anchors | `docs/baselines/s55-eval-kit-manifest.json` (the eight tier-1 profile anchors, recorded 2026-11-08, commit `21cf723`) |
| Protocol | `docs/runbooks/s55-human-evaluation-kit.md` — blind, anchored rubric, human scoring |
| Machine baseline | `docs/baselines/s55-blind-scoring-baseline-2026-11-08.json` (preserved verbatim) |
| Status | **EXECUTED** (the kit's human half returned; mean 3.25/5 — the historical baseline of record) |
| State | **The kit's human half RETURNED.** The runbook's "advisory until review rounds put findings on record" clause is now exercised: these findings are ON RECORD as the November 8 historical baseline. |

## 1. The scores (preserved verbatim — never overwritten)

Eight profiles, blind, five scoring dimensions, overall per profile:

| Profile | Overall | Reading (the runbook's rule) |
|---|---|---|
| Narrative | 4/5 | engine direction holds (mean ≥ 3.5, no axis ≤ 2) |
| Documentary | 4/5 | holds |
| Podcast | 4/5 | holds |
| Advertisement | 4/5 | holds |
| Explainer | 3/5 | direction itself needs review (mean < 3.5) |
| Animation | 3/5 | direction itself needs review |
| Social | 2/5 | **defect finding** (an axis ≤ 2) — unconvincing facial movement |
| Islamic history | 2/5 | **defect finding** — scene continuity and character artifacts |

**Mean overall 3.25/5.** Mean temporal coherence 4.5/5. 4/8 profiles at 4; 2/8 at 2.

Direction law preserved for all future rounds: **artifact load uses 5 = few
artifacts** (the original rubric's direction — never inverted).

## 2. The central finding (the round's verdict on the architecture)

Ibismuh Studio can produce visually attractive scenes, but it does not
consistently produce **meaningful motion**:

- Social: facial expression barely changes.
- Explainer: mechanical components remain stationary.
- Animation: the origami dragon barely moves.
- Islamic history: characters appear abruptly.
- Advertisement: camera moves, but the product remains static.

This is the evidence the AI Director + native animation architecture
answers: the AI describes what needs to happen; the animation engine makes
it happen. An engine animation (the piston, connecting rod and crankshaft
moving through actual mechanical relationships) beats an image with a glow
baked in.

## 3. The findings table (weakness → priority)

| Profile | Main weakness | Priority |
|---|---|---|
| Social | Unconvincing facial movement | Critical |
| Explainer | Static mechanical objects | High |
| Narrative | Minor geometry instability | Medium |
| Animation | Insufficient object movement | High |
| Islamic history | Scene continuity and character artifacts | Critical |
| Advertisement | Too much camera-only movement | Medium |
| Podcast | Minor appearance instability | Medium |
| Documentary | Weak environmental dynamics | Medium |

**Profile reading:** Narrative, advertisement, podcast and documentary are
currently the strongest. Social and Islamic history need the most
attention. Explainer and animation need stronger subject-level motion.

## 4. The five engineering priorities (the round's translation)

1. **P1 — Subject animation** (the top priority): facial expression
   systems; eye and mouth movement; object transformation; mechanical
   movement; character gestures.
2. **P2 — Temporal continuity**: scene-entry and exit states; persistent
   object identity; no unexplained character appearances; stable geometry
   across frames.
3. **P3 — Environmental animation**: water movement; smoke and particles;
   lighting changes; atmospheric depth; background movement.
4. **P4 — Camera choreography**: dolly and tracking; parallax; controlled
   zoom; focus changes; camera movement coordinated with subject movement.
5. **P5 — Profile-specific quality control**: different video types need
   different motion expectations — a podcast is not evaluated with a
   mechanical explainer's standards.

These priorities feed VQ1 (the Visual Quality Programme in
`docs/roadmap/master-product-roadmap.md`), which turns them into
measurable engineering requirements for S162–S180.

## 5. The special requirement of record (Islamic history)

Preserve historical scene continuity and avoid generating visible
depictions of prominent religious figures where the production brief
prohibits them. This rides the existing restricted-visual chain (S49's
fail-closed policy scan, the `restricted-subjects.ts` law) — the baseline's
requirement tightens the VISUAL-QUALITY bar (continuity artifacts) on top
of the existing policy bar.

## 6. The re-benchmark protocol (the next round, fixed now)

The next eight-profile blind benchmark uses: the same eight profiles; the
same five scoring dimensions; three or more independent blind reviewers;
the same scene durations and sampling points; side-by-side comparison
against this baseline; the artifact-load direction (5 = few artifacts)
preserved. It runs AFTER the VQ1 implementation rounds land — the
comparison is the improvement evidence, so the conditions must not move.

## 7. What this round changes operationally

1. The S55 kit's human half is no longer the open item — the returned
   round IS the baseline.
2. VQ1 enters the master roadmap as the quality overlay programme (below
   Programme A in priority but reading A's output: every S162–S180 slice
   must answer "which baseline weakness does this close?").
3. The QC honesty gap this session's batch exposed is fixed in code: the
   scene recheck now rides the S136 audio contract (`sceneAudioVerdict`) —
   a silent scene's video-only preview is playable, the sound lenses are
   not asked on a stream-less artifact, and dead-air can NEVER read
   "pass/none" over a file with no audio stream (the vacuous pass the
   November batch review caught is dead).

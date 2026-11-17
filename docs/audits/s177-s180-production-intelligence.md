# S177–S180 — Programmes E + F (Asset Generation Intelligence + Production Intelligence)

| | |
|---|---|
| Milestones | S177 — Image Generation Intelligence; S178 — Music and Sound Design; S179 — Visual Quality Intelligence; S180 — Intelligent Scene Repair. |
| Modules | `asset-intelligence.ts`, `sound-plan.ts`, `production-intelligence.ts` — all pure. |
| Status | **CLOSED (code)** — battery 993/993 (4 new pins), typecheck + lint clean. |

## S177 — the asset cost ladder

`native < reuse < stock < generate` — the Director decides WHERE pixels
come from by cheapest-that-satisfies, exactly the roadmap's caution ("a
chart should be drawn by the graphics engine, not generated as an
image"). Decisions come from the scene's OWN data: native tells
(count/grow/draw/object-add directives) prove the engine renders it; a
declared background reuses; the classic lane's image needs ride the
stock lane first; generation is the LAST resort and carries the highest
rank. `planAssetIntelligence` returns the whole-project ledger with the
generate count named.

## S178 — the sound plan rides the EXISTING catalogs

The Director selects; TubeForge mixes. The plan is data: the music mood
MUST be a `music.ts` catalog id (junk refuses — the Director selects
from the closed mood set); the duck intensity MUST be an `audiomix.ts`
intensity; the loudness contract is the house −16 LUFS constant; and
the SFX cues are the CLOSED transition→cue pairing table over the S163
boundary clock (crossfade→swish, iris/zoomthrough→whoosh,
whiteout→impact) — every cue must sit inside the composition clock.
No provider is called; the mixing lanes already exist (S167's duck
envelopes, audiomix's chains).

## S179 — the plan-side quality inspector

Walks the COMPILED plan (the render-side frame QC already lives in
render-qc/visual-qc/scene-qc — this is the layer the Director can act
on before a single frame renders): empty compositions (block),
repetitive imagery (consecutive same-kind scenes with no movement
primitive and no boundary transition), unnatural movement (authored
durations outside the S171 measured walls — the op→primitive mapping
covers the graphics enters, transitions and the camera family),
inconsistent-lighting hooks, audio sync (narration outrunning the scene
window — block), and static-card unreadable-text tells. Findings are
typed, severity-ranked, scene-addressed.

## S180 — the repair is a valid directive, one scene, approved

Every finding's proposed correction is an S168 DIRECTIVE — the battery
pins that every canned proposal survives `validateDirectorDirective`
(a proposal that is not valid vocabulary is counted and refused, never
silently applied). `repairScopeGuard` enforces the structural
guarantees: the repair targets a DECLARED scene (never an invented
one) and `requiresApproval` is ALWAYS true — the user approves;
TubeForge regenerates only the affected scene. Audio-sync and
movement-wall findings deliberately propose nothing canned — they need
human replanning, not a reflex directive.

## Acceptance evidence

Battery 993/993 — pins: the ladder's rank order + the native-tell /
reuse / stock decisions + a zero-generation native-first ledger; the
sound plan's catalog memberships (mood junk refuses, duck junk
refuses, out-of-clock cues refuse) with the −16 contract and the
crossfade→swish pairing; the inspector catching repetitive imagery and
the 99.9 s count outside the measured wall; repairs all approval-gated,
validator-surviving, scope-guarded (invented scenes and unapproved
repairs refuse).

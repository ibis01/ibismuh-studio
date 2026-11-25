# S171 + S172 — Programme C (the universal animation layer)

| | |
|---|---|
| Milestones | S171 — the Shared Animation Vocabulary; S172 — Cross-Mode Integration ("shared capabilities, not duplicated engines"). |
| Modules | `src/lib/ibismuh/anim/primitives.ts` (S171, pure, mode-agnostic); `src/lib/ibismuh/cross-mode.ts` (S172, the matrix + resolver). |
| Status | **CLOSED (code)** — battery 981/981 (7 new pins), typecheck + lint clean. |

## S171 — the shared vocabulary

The roadmap's named fourteen primitives, closed:
`fade · scale · rotate · translate · draw · reveal · morph · camera-pan ·
camera-zoom · particle · character-move · stagger · spring · parallax`.

Every primitive samples `(t01, params)` → the ONE normalized
`PrimitiveState` (opacity / scale / rotationDeg / translate / progress /
camera), every field clamped, junk params REFUSED with typed errors
(never coerced), and every easing rides **the ONE curve table**
(`anim/easing.ts evalEase`, the S162 opus-anchored set). Timing walls
are declared per primitive (`PRIMITIVE_TIMING`: min/default/max ms) —
engine clocks may be tighter, never looser (`checkPrimitiveTiming`).

The spring is the one deliberate shape exception: its damped oscillator
is the primitive's PHYSICS (parameterized damping 0.1–1, frequency
≤ 6 Hz, bounded envelope), not a new easing — the table remains the
only place an easing is defined. The stagger composes others via
`staggerSchedule` (arithmetic windows, bounded 1–1000 items).

Pure: no wall-clock, no randomness, no I/O — the frame-truth scan
covers `anim/` whole.

## S172 — the cross-mode matrix

`CROSS_MODE_CAPABILITIES` — the closed list of shared capabilities,
each naming its host mode, its borrowers, and the **ONE implementing
module** (borrow through it, never duplicate): the hand-drawn feel
(S164), the draw-on entrance, kinetic typography (S153/S162), 3D camera
movement (S167/motion.ts), character gesture beats (the gesture table),
animated charts, the native transitions (S163), the finisher channels
(S167), the measured curves, and the S171 primitives themselves.

Each capability carries an HONEST wiring status — the matrix may not
lie:
- **native** — both sides render it today through their own engines;
- **borrowed** — a real consumer imports the one implementation
  (pinned by the battery's source scans);
- **codified** — named and implementor-named, wiring is future work
  (PROPOSED-first).

`resolveCrossModeCapability(capability, mode)` admits hosts and named
borrowers and refuses the rest with typed reasons;
`crossModeMatrixAudit()` keeps the matrix itself honest (house
implementors only, hosts + borrowers required). Growth = design-doc
slice.

## Acceptance evidence

Battery 981/981 — pins: the closed fourteen with honest walls; ease
overrides must be table names (the table is the only easing authority);
normalized clamped samples (opacity/zoom ceilings, t-clamping, junk
param refusal, no sixteenth primitive); spring determinism; timing
walls refuse loose clocks; the stagger schedule's arithmetic; the
matrix audit green with all three honesty levels in use; the resolver's
host/borrower/refusal verdicts with implementors named.

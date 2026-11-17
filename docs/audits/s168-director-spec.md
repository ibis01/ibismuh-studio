# S168 — The Director Specification (the closed authority surface)

| | |
|---|---|
| Milestone | S168 — Director Specification: "a formal spec defining what the AI Director can and cannot control… the Director must understand the capabilities of the six engines and **must not invent unsupported animation commands**." |
| Module | `src/lib/tubeforge/director-vocabulary.ts` — the law as code: closed catalogs, derivation from the engines' own constants, the validator, the batch gate, the prohibitions. |
| Status | **CLOSED (spec + enforcement)** — battery 960/960 (8 new pins), typecheck + lint clean. The runtime wiring (the plan format, the compiler) is S169/S170. |

## 1. What the Director MAY decide (the closed nine domains)

`DIRECTOR_DECISION_DOMAINS` — closed set, any other domain is refused:

`script · storyboard · scene-duration · visual-style · camera · animation · music · sound · production-mode`

Two domains are deliberately NOT decision domains: rendering (the engines
render deterministically without AI — the S153 house law) and provider
selection (the registry owns providers; the Director may *suggest* music
and sound, never instantiate them).

## 2. What the Director MAY name (the animation catalog)

`DIRECTOR_ANIMATION_CATALOG` — every entry resolves to a native
implementor named in its `implements` field (S170's compiler resolves
through it; if the implementor dies, the catalog cannot silently rot):

| Vocabulary | Derivation (never a copy) | Implementor |
|---|---|---|
| `enter:<motion>` | union of the doc validator's own `MOTION_KINDS_BY_ELEMENT` | `graphics/render.ts` |
| `transition:<type>` | `NATIVE_TRANSITION_TYPES`, imported verbatim (same reference — pinned) | `graphics/transitions.ts` (S163) |
| `camera:<move>` | typed `MoveKind[]` — a 14-name list that FAILS TYPECHECK if the engine's union changes | `motion.ts` |
| `slide-camera:<kind>` | typed `SlideCameraKind[]` | `slides-kinetic.ts` |
| `slide-kinetic-reveal` | the kinetic page's one public action | `slides-kinetic.ts` |
| `3d:<action>` | the scene3d grammar: object-add / light-add / camera-keyframe / push-in / shake | `scene3d.ts` (+ the S167 finisher) |
| `whiteboard:<knob>` | `RoughKnobs` keys — roughness / bowing | `whiteboard/roughen.ts` (S164) |
| `gesture:<intent>` | purposes (setup/action/emphasis/rest), never pose geometry | `characters/rig-director.ts planRigTimeline` |

Eases ride the ONE curve table (`EASE_CURVES` — the S162 opus-anchored
set, `DIRECTOR_EASES` derived from its keys).

## 3. What the Director CANNOT do (the never-list, as data)

`DIRECTOR_PROHIBITIONS` — exported constants, pinned in the battery:

1. No invented animation commands — every directive must resolve through
   the catalog (`assertNoInventedCommands` is fail-closed: a plan with
   ANY invented command refuses to compile, it is never skipped-and-rendered).
2. No phoneme lip-sync claims — beat-sync mouth classes, labeled as such.
3. No new engine kinds or lanes — the six engines are the whole world.
4. No timeline override beyond scene duration — the S87 universal
   timeline owns the clock.
5. No provider invention — providers come from the registry.
6. No cost-creating action outside the budget gate — spend safety rides
   `spend.ts`, not the Director.
7. No rendering decisions — the Director suggests, the human approves,
   the engines render.

## 4. The enforcement architecture (layering, one writer each)

- **Membership (this module):** can the command be named at all? Closed
  domains, closed catalog, closed namespaces per domain.
- **Compatibility (the engines, verbatim):** an `enter:` must survive the
  doc validator's own `MOTION_KINDS_BY_ELEMENT` table (the validator
  *reads* the table — it does not re-list it; a "count" on a headline is
  refused with the table named in the error). A `transition:` binds ONLY
  to a `boundary:N` ref (the S163 engine's own indexing).
- **Ranges (the engines' sanitizers):** the Director vocabulary never
  re-clamps a range it does not own — junk numbers are refused as
  non-finite; precise walls stay with the engine that enforces them.
- **Geometry (never):** gesture directives carry intent; params that
  smuggle pose geometry (`pose*`, `rotation*`, `position*` keys) are
  refused — the gesture table owns poses.

## 5. The directive shape (S169/S170's input)

```ts
interface DirectorDirective {
  domain: DirectorDecisionDomain; // the closed nine
  target: string;                 // element id | scene ref | boundary:N | lane name
  action: string;                 // catalog name or domain payload ("mode:free", "music:suggest", …)
  params?: Record<string, number | string | boolean>; // JSON-stable scalars, finite
}
```

`serializeDirectorDirective` is JSON-stable (sorted keys, byte-stable
round-trip — pinned). The Director's output is DATA: the plan survives
provider loss because data needs no provider — S170's acceptance test
(disconnect the AI after approval; the render completes) compiles against
this shape and never calls a model.

## 6. Acceptance evidence

- Battery 960/960 — pins: the closed nine domains; the catalog is exactly
  the union of its derived parts with every entry naming its implementor;
  reference-identity derivation for transitions; valid directives pass
  (six shapes); invented commands refused (seven shapes including the
  per-kind table and the boundary rule); pose-smuggling and NaN params
  refused; the batch gate names exactly the offending index; serialization
  byte-stable with sorted keys; the never-list on record.
- `MoveKind`/`SlideCameraKind`/`RoughKnobs`/`EaseName` bindings are
  compile-time — typecheck is itself a pin (the catalog cannot drift from
  the engines unnoticed).

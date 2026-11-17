# S170 — The Animation Compiler (the AI-disconnect acceptance)

| | |
|---|---|
| Milestone | S170 — "Translates Director instructions into native engine operations: identify the target, select an approved preset, calculate its timeline, apply easing, generate frame states, render through the native engine. The AI does not generate the animation." |
| Module | `src/lib/tubeforge/animation-compiler.ts` — pure, data-in/data-out. |
| Acceptance | **"Disconnect the AI provider after the project has been approved. TubeForge must still render the complete video."** — the compile half is PROVEN (receipt `docs/audits/s170-offline-compile.json`, sha256 `141e0ba3…`); the render half rides the engines' own AI-free gates (the S165 golden-video harness, the S167 assembly smoke). |
| Status | **CLOSED (compiler)** — battery 974/974 (4 new pins), proof 13/13, typecheck + lint clean. |

## 1. What the compiler does

`compileUniversalProject(project)`:

1. re-runs the **S169 validator** (defense in depth — the gate is the
   validator, not caller discipline);
2. walks every scene's **S168 directives** into typed
   `CompiledOperation`s: the op kind and lane come from the action
   prefix (`enter:` → graphics-enter, `transition:` → graphics-transition,
   `camera:` → camera-move, `slide-*`, `3d:*`, `whiteboard:*`,
   `gesture:*`, `style:*`);
3. **resolves the timeline from the schema's own clocks** — boundary:N
   sits at scene N's end by arithmetic (never a clock invention);
   scene-scoped ops ride their scene's window; element enters leave
   sequencing to the engine (no invented `atMs`);
4. **authored values only**: `ease` must be in `DIRECTOR_EASES` (the ONE
   curve table) or the compile refuses; `durationMs`/`atMs` are consumed
   from params only when authored — absent fields mean the ENGINE's own
   defaults apply at render (one writer each; the compiler never
   re-lists an engine's defaults);
5. emits the **S87 clip projection**, the **narration slots** (text +
   window, ready for the voice lane), the **asset manifest** (ids,
   provenance-closed by S169), and **suggestions** (music/sound pass
   through verbatim — the asset lane disposes).

Frame states are NOT generated here — they are the engines' business.
The AI does not generate the animation; the compiler does not generate
anything but the plan.

## 2. The acceptance, structurally

- The import graph is `director-vocabulary`, `universal-scene`,
  `timeline` — **zero provider modules** (pinned in the battery by
  source scan AND run standalone in the proof; the module also carries
  no fetch, no wall-clock, no randomness — even the comments stay clean
  of the banned tokens, because the source pins grep them).
- The proof compiles a fully-authored **three-mode project** (graphics
  riding a real `scaffoldGraphicsDoc`, character, 3d), re-compiles from
  the sorted serialization, and pins **value-identical plans** (stable
  form sha256 `141e0ba3a5901ae39bf73d473392d00f27d7e55212a713f2392eb3295cb5fbe4`).
- Fail-closed at every layer: a boundary past the last scene refuses
  (defense in depth beyond S168's shape check); an ease outside the
  measured table refuses; validation errors compile-errors, never
  skip-and-render.

## 3. What S170 does NOT claim

The compiled plan is the HANDOFF, not the render. Wiring the plan into
the dispatchers (which ops feed which engine call) is the mode lanes'
existing render paths — the golden-video harness already proves those
render deterministically without AI. The compiler's claim is exactly the
roadmap's sentence: instructions in, native engine operations out, no
model in the loop.

# Whiteboard pipeline reference review for Ibismuh Studio

The best approach is not to copy one repository wholesale. No open-source project found is a complete, multi-tenant, hosted SaaS equivalent to Ibismuh Studio. Instead, use three direct whiteboard renderers as visual and algorithmic references, then use Motion Canvas and Remotion as production-engineering references for timing, previews, captions, and render orchestration.

## The repositories worth studying

### 1. `gnipbao/whiteboard-video-engine` — closest architectural reference

Repository: [gnipbao/whiteboard-video-engine](https://github.com/gnipbao/whiteboard-video-engine)

This is the strongest reference for the rendering core. It separates a reusable engine from its CLI/agent adapter, and its documented pipeline is:

```text
script/image
  -> scene split or line-art extraction
  -> SVG/raster stroke extraction
  -> natural block ordering
  -> stroke renderer
  -> color-fill pass
  -> FFmpeg MP4
```

The useful ideas are explicit provider boundaries, line-art preprocessing, skeleton tracing, endpoint-based stroke merging, semantic block ordering, resumable orchestration, render fingerprints, and tests that do not require neural model weights. Its architecture document says missing neural providers should fail loudly instead of silently switching to a weak fallback. [1]

**Use it in Ibismuh Studio for:**

- a formal preprocessing stage between generated/uploaded artwork and `WhiteboardAsset`;
- a normalized intermediate representation containing paths, lengths, bounding boxes, semantic groups, order, and source provenance;
- a render fingerprint so changing only camera or draw-speed settings invalidates video frames but does not regenerate the storyboard or line art;
- explicit provider adapters for line-art extraction rather than importing heavy model code into the main renderer;
- a “doctor” or preflight check that reports missing FFmpeg, fonts, model wrappers, or asset libraries before the queue starts.

Do not copy its local filesystem assumptions directly. Ibismuh must store the source asset and derived line art under tenant-scoped storage keys and must keep provider execution behind the existing safe transport and job boundary.

### 2. `masihsultani/whiteboard-animator` — closest reference for perceptual drawing quality

Repository: [masihsultani/whiteboard-animator](https://github.com/masihsultani/whiteboard-animator)

This project is particularly valuable for how it makes a finished illustration look hand-drawn. It detects text separately, orders components, allocates time slots, traces skeletons from real endpoints, handles closed outlines, uses outline-then-fill behavior, and streams frames to FFmpeg. It supports explicit region plans and narrated scenes. Its test suite includes unit tests and CLI-to-MP4 integration tests. [2]

It also states an important limitation honestly: narration pacing based on estimated text/region proportions can lead or lag the voice; exact cue times require explicit start/end times in the lower-level API. That limitation is directly relevant to Ibismuh because the whiteboard lane already has word-anchor support and should prefer measured timing over heuristic timing. [2]

**Use it in Ibismuh Studio for:**

- text-aware drawing: text should be written as handwriting/glyph strokes, not traced as a generic bitmap blob;
- endpoint-aware path tracing so arrows, V-shapes, branches, and diagrams start at a natural point;
- a region plan such as `{assetId, semanticRole, narrationSpan, revealMode, startMs, endMs}`;
- separate reveal modes: handwriting, outline, fill, speed-paint, hold, erase, and emphasis mark;
- a CPU-only deterministic fallback when a neural line-art provider is unavailable;
- integration tests that render a small real MP4 with FFmpeg rather than testing only JSON plans.

Do not adopt its heuristic audio allocation as the final timing law. Keep it only as a fallback when word timestamps are unavailable.

### 3. `Rsverma/OpenDoodler` — closest reference for creator/editor experience

Repository: [Rsverma/OpenDoodler](https://github.com/Rsverma/OpenDoodler)

OpenDoodler is a desktop editor rather than a hosted web service, but its feature set is an excellent product reference. It includes autosave and crash recovery, a scene canvas, layers, snapping and alignment guides, an asset library, scene templates, stroke-by-stroke animation, hand skins, per-scene camera moves, a project timeline, per-scene voiceover, background music, transitions, undo/redo, preview, cancellation, progress reporting, export presets, and aspect-ratio settings. [3]

Its user guide separates canvas editing, assets, scenes/timeline, settings, and preview/export into distinct surfaces. [4]

**Use it in Ibismuh Studio for:**

- a real scene-level whiteboard editor instead of only prompt-to-video generation;
- visible layer ordering and lock/visibility controls;
- a library manager that can detect corrupted or invalid SVG assets;
- scene templates that insert new scenes without overwriting the current scene;
- per-scene voiceover trimming and waveform display;
- camera keyframes with a scrub-preview of the actual crop;
- autosave/version snapshots and recovery after a browser or worker failure;
- cancellation that leaves the last valid preview available.

Do not copy its SQLite/local-project persistence. Translate the editor concepts into tenant-scoped database rows and immutable render-plan snapshots.

### 4. Motion Canvas — reference for reusable timelines and preview/final parity

Repository: [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) and its [animation-flow documentation](https://motioncanvas.io/docs/flow)

Motion Canvas describes animations with TypeScript generator functions. Its `all`, `chain`, `delay`, `sequence`, and `loop` flow primitives make concurrency and sequencing explicit, and the same project can be previewed in an editor. It is not a whiteboard renderer, but it is a strong reference for expressing animation as a deterministic timeline rather than scattering timing across renderer code. [5] [6]

**Use it in Ibismuh Studio for:**

- represent every scene as a timeline of typed events, not ad-hoc FFmpeg filters;
- make `parallel`, `sequence`, `delay`, `hold`, and `loop` explicit in the whiteboard plan;
- share the same frame plan between the browser preview and Chromium/FFmpeg final render;
- build reusable animation primitives such as `drawPath`, `writeText`, `cameraMove`, `handTravel`, `fillRegion`, and `holdFrame`;
- test the plan independently from rasterization.

Do not embed Motion Canvas wholesale unless a technical spike proves that it can coexist with the current Next.js/Chromium pipeline. Borrow the timeline model first.

### 5. Remotion — reference for render-farm and caption product patterns

Repository: [remotion-dev/remotion](https://github.com/remotion-dev/remotion)

Remotion treats videos as programmatic compositions and documents interactive editing, batch rendering, applications, a Player, captions, and rendering infrastructure. Its license is not simply MIT and may require a company license in some circumstances, so use it as an architectural reference unless legal review approves a dependency. [7]

Its caption documentation separates importing subtitles, transcribing audio, displaying captions, and exporting subtitles. [8]

**Use it in Ibismuh Studio for:**

- a composition/player separation: render the same immutable plan in preview and final export;
- caption data as a first-class artifact, supporting SRT/VTT export and burned-in captions;
- render jobs split by scene/frame ranges with retryable work units;
- render metadata and progress that can be inspected independently from the final MP4;
- a clear boundary between composition code and infrastructure code.

Do not copy its license-sensitive packages without reviewing the exact license and commercial terms.

## What Ibismuh already has compared with the references

Ibismuh is not starting from zero. The current whiteboard lane already contains several production-grade foundations:

- `src/lib/ibismuh/whiteboard/beat-plan.ts` compiles narration sentences into semantic beats while preserving one existing animation-event grammar.
- `src/lib/ibismuh/whiteboard/timing.ts` is the shared clock for draw scheduling and frame planning.
- `src/lib/ibismuh/whiteboard/voice-anchors.ts` and the render seam support measured word anchors when available.
- `src/lib/ibismuh/whiteboard/render.ts` uses Chromium to rasterize controlled SVG and FFmpeg to assemble output, with network routes aborted in the render page.
- `src/lib/ibismuh/whiteboard/asset-validate.ts` and the whiteboard policy modules provide fail-closed validation and content-policy/provenance boundaries.
- `src/lib/ibismuh/whiteboard/benchmark-scenarios.ts` defines five fixed scene types across 16:9, 9:16, and 1:1 and includes perceptual rubric dimensions such as stroke naturalness, semantic order, narration alignment, camera readability, hand realism, continuity, text readability, audio, and comprehension.
- The test suite already covers path validation, continuous-board carry, hand travel, glyph drawing, camera direction, voice anchors, SFX planning, and deterministic behavior.

Therefore, Ibismuh’s highest-value work is not replacing the renderer. It is completing the missing production loop around it: stronger asset preprocessing, explicit region plans, editor controls, perceptual regression, and operational failure handling.

## Recommended target architecture

Use this pipeline for every whiteboard scene:

```text
brief + narration
  -> scene plan
  -> asset plan with provenance
  -> line-art normalization
  -> semantic region/beat plan
  -> measured narration anchors
  -> typed frame/timeline plan
  -> browser preview
  -> deterministic final render
  -> media/QC/perceptual gates
  -> immutable manifest + repair actions
```

### 1. Add a normalized drawable intermediate representation

Create a pure module, for example `src/lib/ibismuh/whiteboard/drawable-ir.ts`, with types similar to:

```ts
export type DrawableKind = "path" | "text" | "shape" | "fill" | "image";

export interface DrawablePath {
  id: string;
  assetId: string;
  kind: DrawableKind;
  d: string;
  length: number;
  bbox: { x: number; y: number; width: number; height: number };
  semanticGroup: string;
  order: number;
  role: "outline" | "detail" | "arrow" | "handwriting" | "mark";
}

export interface WhiteboardRegionPlan {
  id: string;
  semanticRole: "title" | "subject" | "process" | "comparison" | "conclusion" | "detail";
  drawableIds: string[];
  startMs: number;
  endMs: number;
  reveal: "draw" | "write" | "fill" | "hold" | "erase";
  narrationWordStart?: number;
  narrationWordEnd?: number;
}
```

The renderer should consume this IR. The AI planner, SVG parser, uploaded-asset adapter, and future line-art model should produce it. This prevents each provider from inventing its own timing and stroke semantics.

### 2. Make measured audio the primary clock

Use this priority:

1. explicit editor timings;
2. word timestamps from ASR/TTS;
3. sentence timestamps;
4. deterministic duration estimate only as a fallback.

When a word window is available, draw the associated region inside that window. If the narration pauses, hold the current board state instead of continuing to draw unrelated content. Preserve the existing fallback behavior when anchors are absent.

Add a per-scene timing receipt:

```json
{
  "audioDurationMs": 8120,
  "drawWindowMs": [420, 7420],
  "regions": [
    {"id": "heart", "startMs": 820, "endMs": 2460, "wordStart": 4, "wordEnd": 11}
  ],
  "timingSource": "word-anchors"
}
```

This will make timing failures diagnosable instead of subjective.

### 3. Improve path ordering and continuity

Adopt the reference projects’ long/medium/short stroke strategy:

- long strokes for major contours;
- medium strokes for details and anatomy;
- short strokes for dots, fingers, facial marks, and accents.

Merge fragments only when endpoint distance and tangent direction are compatible. Keep an explicit `max` detail mode for advanced users, but use `balanced` or `rich` for defaults. Add tests for arrows, branches, closed loops, letters, crossings, and disconnected dots.

The quality metric should not be “number of paths.” It should measure whether the hand appears to make intentional continuous gestures.

### 4. Add an editor workflow inspired by OpenDoodler

Prioritize these UI capabilities in `production-workspace` and the scene editor:

1. inspect and reorder drawable layers;
2. select a region and change its start/end narration window;
3. change draw/write/fill/hold behavior;
4. scrub the actual camera crop and hand position;
5. preview one scene without rendering the whole project;
6. replace one asset while keeping the scene id and narration;
7. undo/redo and autosave the plan;
8. show a readable warning when an asset is invalid or a region has no timing window.

This will turn the whiteboard lane from a black-box generator into an editable production tool.

### 5. Add render fingerprints and resumable stages

Use stage fingerprints such as:

```text
scene-plan hash
+ narration/audio hash
+ line-art hash
+ drawable-IR hash
+ region-plan hash
+ style-profile hash
+ camera hash
+ render-settings hash
```

Then cache stages separately:

- planning;
- generated illustration;
- line-art extraction;
- drawable IR;
- audio alignment;
- scene frame render;
- audio mix;
- final composition.

A camera-only change should not call the image provider again. A caption-only change should not rerun line-art extraction. A provider outage should leave all completed stages available for retry.

### 6. Add perceptual regression, not only structural tests

Keep the current fixed W1 benchmark and extend it with:

- a clean SVG process diagram;
- a dense handwritten paragraph;
- a branching flowchart;
- a portrait with facial details;
- an equation or chart;
- an uploaded-photo-to-line-art case;
- long and short narration versions;
- all three aspect ratios;
- 24 and 30 FPS.

For every benchmark, store:

- frame hashes at fixed timestamps;
- OCR/readability result for text;
- path teleport/retrace violations;
- percentage of the draw window containing visible progress;
- hand travel distance and off-canvas time;
- audio/video duration difference;
- loudness and silence reports;
- human rubric score for naturalness and comprehension.

Structural tests should block regressions automatically. Human review should be reserved for the perceptual dimensions that cannot be reliably automated.

## Concrete implementation sequence

### Sprint 1: reference-quality contracts

- Add the drawable IR and region-plan types.
- Make SVG parsing and the current built-in library compile into the IR.
- Persist a versioned plan snapshot with a tenant-scoped storage manifest.
- Add plan validation for missing drawable ids, invalid bounds, overlapping impossible windows, and out-of-order regions.

### Sprint 2: timing and preview parity

- Make the editor preview and final renderer consume the same frame plan.
- Add explicit `timingSource` and timing receipts.
- Use word anchors first, sentence anchors second, and heuristics last.
- Add a scene-only preview endpoint/job with cancellation.

### Sprint 3: editor controls

- Add layer/region inspection and ordering.
- Add draw/write/fill/hold/erase selection.
- Add camera keyframes and scrub-preview.
- Add per-scene voiceover trim and waveform.
- Add autosave/recovery and immutable revisions.

### Sprint 4: render reliability and QC

- Add stage fingerprints and resumable jobs.
- Add missing-dependency preflight.
- Add exact duration, loudness, caption, safe-area, and black/freeze-frame checks.
- Add golden-frame comparisons for the fixed benchmark.
- Add explicit repair actions instead of rerendering the entire project.

### Sprint 5: production operations

- Run queue crash/recovery and cancellation tests.
- Run tenant-isolation tests for source assets, derived line art, plans, previews, and final MP4s.
- Add deterministic provider fakes for CI.
- Keep neural-provider tests optional and clearly labeled when model weights are unavailable.
- Review all third-party licenses before adopting code, assets, model weights, or fonts.

## What not to copy

Do not copy model weights or visual assets without verifying their licenses. Do not treat GitHub stars or demo videos as proof of production readiness. Do not import an entire animation framework before proving it solves a measured gap. Do not use estimated narration pacing as the primary clock when word timestamps exist. Do not silently fall back from a failed neural line-art provider to a visually inferior output; report the capability and let the user choose a fallback.

## Final recommendation

Use `whiteboard-video-engine` for the **pipeline and provider boundary**, `whiteboard-animator` for **stroke ordering and perceptual draw behavior**, OpenDoodler for the **editor and recovery workflow**, Motion Canvas for the **typed timeline model**, and Remotion for **composition/player/caption/render-farm patterns**. Keep Ibismuh’s existing deterministic whiteboard engine as the implementation center, then add the normalized drawable IR, measured region timing, editable scene plan, stage fingerprints, and perceptual benchmark gates around it.

## References

[1]: https://github.com/gnipbao/whiteboard-video-engine "whiteboard-video-engine repository and architecture"
[2]: https://github.com/masihsultani/whiteboard-animator "whiteboard-animator repository and rendering documentation"
[3]: https://github.com/Rsverma/OpenDoodler "OpenDoodler repository"
[4]: https://github.com/Rsverma/OpenDoodler/tree/main/docs/guide "OpenDoodler user guide"
[5]: https://github.com/motion-canvas/motion-canvas "Motion Canvas repository"
[6]: https://motioncanvas.io/docs/flow "Motion Canvas animation flow documentation"
[7]: https://github.com/remotion-dev/remotion "Remotion repository and license notice"
[8]: https://www.remotion.dev/docs/captions "Remotion captions documentation"

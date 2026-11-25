# S145 — PAE Phase 3: the production benchmarks (the spec §6 program) — RECORD

| | |
|---|---|
| Gate | The PAE record's §4 "Remaining (Phase 3 — benchmarks, not code)": the production benchmark harness over a fixed doc that exercises EVERY directive kind, on the five axes the spec names. The six tickets (S129–S134) landed; Phase 3 was the program's unblocked remainder — and it caught a real defect (§3). |
| State | **COMPLETE — receipts on disk.** `docs/baselines/pae-phase3-2026-11-16.txt`; the harness is committed (`scripts/s145-pae-phase3-benchmark.mts`, phased: sweep / full1 / full2 / baseline / resume / report). |
| Head | Assembled on `9b06888` + this stage's fix (§3) — the 2D/3D lanes as LANDED (S139…S144). |
| Battery | **846 passed, 0 failed** (845 + the S145 fresh-manifest source pin). typecheck and lint clean. |

## 1. The fixture (the spec's "fixed doc, 3 scenes, ~30 s, every directive kind")

Three scenes carrying the three programs, one scene each (~10 s apiece, 720
frames @ 24 fps, 1920×1080):

- **scene-1 — historical**: a dated headline + a counting figure, a
  documentary camera (3 keys), `hit` + `cue` events; tweens on `dx` and
  `rotateDeg`, an `opacity` breathing tween.
- **scene-2 — educational**: a growing bar chart with a `progress` tween
  (the compat-table-legal kind), breathing bullets (`scale`, `dy`, `dx`
  tweens), `sfx` + `hit` events, a pushing camera.
- **scene-3 — motion-graphics**: orbiting shapes (`dx`+`dy`+`rotateDeg`+
  `opacity` tweens), a callout, a camera riding the zoom ceiling (`zoom: 4`,
  the bound's own receipt), `cue` + `hit` + `sfx` events.

All six tween channels exercised; all three event kinds; camera keys on both
edges of the `[1, 4]` zoom domain. Plus the **3D fixture**: three
`Scene3DObject`s — position-keyed, rotation+scale-keyed, and a STATIC
witness (the byte-identity path) — driven through the S134 `objectAt`
adapter. The **stripped twin** (the identical doc with tweens/camera/events
deleted) is the (b) baseline arm.

## 2. The five measurements (the receipt's numbers)

| axis | result |
| --- | --- |
| (a) frame-at cost | frameAt mean **3.9–7.6 µs**, p95 ≤ 13.8 µs (scene-3's 22.6 µs mean is one 10.9 ms GC outlier over 600 samples — the p95 is the honest figure); objectAt (3 objects) mean **4.8 µs**, double-pass state-identical; the static witness holds its authored fields at every sampled t |
| (b) wall time A/B | full doc ×2: **32.9 s / 32.8 s** vs the stripped twin: **31.1 s** → the ENTIRE PAE directive vocabulary costs **+1.7 s ≈ +5.6 %** of baseline. Note: no historical S128 receipt exists in docs/baselines/, so the comparison is the same-session A/B (same rig, minutes apart) — a stronger comparison than a stale number |
| (c) determinism | two independent full renders: **decoded video streams md5-equal per scene** (pixel-level, container-independent — the renderer deletes frame dirs after encode, so the decoded stream is the law); the G1-DET-1 pure sweep double-runs equal and never-NaN (301 samples) |
| (d) the resume drill | SIGKILL mid-program (scene-1 encoded, scene-2's frames landing) → the manifest survives → resume reuses scene-1 **byte-identically**, re-renders scenes 2–3 whose decoded streams match the control, deletes the manifest on completion; all three scene MP4s byte-equal on this rig |
| (e) readcheck | **ZERO violations** across all six on-screen texts (visible windows 4.1–9.3 s vs floors 0.8–1.3 s) |

## 3. THE DEFECT THE DRILL CAUGHT (fixed — the drill worked)

The first drill run proved the S132 seam **dead for its primary scenario**:
the resume manifest was initialized ONLY inside `if (opts.resume === true)`
— a FRESH render never wrote one, so a first-time render that crashed
mid-program left no crash record and "resume" silently re-rendered from
scratch. The seam's own contract ("a crash loses at most the scene it was
mid-rendering") was unfulfilled exactly when it matters. The poll trace
nailed it: `encoded=-1` on every poll while scene-2 rendered.

**The fix** (`graphics/render.ts`): the manifest write moved OUT of the
resume gate — every render (fresh included) writes the all-pending manifest
at start; the per-scene updates and the completion-time deletion are
unchanged. Recovery bookkeeping only: it never shapes scene bytes (the
fingerprint pins those). Pinned in the battery: the S145 source pin asserts
the write sits between the resume gate and the scene loop. After the fix the
drill runs green through the REAL seam (the poll sees `encoded=0` from the
first seconds, the kill window hits, resume reuses honestly).

This is the Phase-3 program doing its job: the spec's (d) measurement exists
to catch precisely this class of lie.

## 4. Scope note (the 3D arm, honestly bounded)

The harness measures the 3D adapter's DIRECTIVE evaluation (objectAt cost,
double-pass determinism, the static-witness byte-identity path). The full
WebGL render pipeline is covered by S134's own pins (keyed-object render
args, static-object byte-identity); the (b)–(d) production measurements ride
the graphics lane's chromium+ffmpeg pipeline, the PAE program's primary
surface. Nothing here re-implements an engine.

## 5. Prohibitions — verified

- No second animation clock: the harness samples the doc clock through
  `frameAt` / the normalized clock through `objectAt` — no new timebase.
- Benchmarks-not-code held EXCEPT the drill-caught defect fix (§3) — the
  exception the program is designed to force, pinned and receipted.
- No new dependencies; no whiteboard-tree changes; no Director routing.

## 6. The program's close-out

The PAE arc is now fully receipted: Phase 0/1 (the spec), Phase 2
(S129–S134, the six tickets), Phase 3 (this stage — the five axes + the
drill's defect). The remaining open item across the whole 2D/3D program is
the humans' blind re-score (S144's session, PENDING by design).

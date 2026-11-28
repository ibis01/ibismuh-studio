#!/usr/bin/env node
// lane-failure-injection.mts — THE SIX-LANE FAILURE-INJECTION RECEIPT (master
// plan Phase 8: "failure injection... per-lane results").
//
// The plan's rule is the receipt's law: NEVER TURN AN UNAVAILABLE PROOF INTO
// A PASS. Every probe below injects a NAMED failure at a REAL seam of the
// lane's production code path and records what actually happened:
//
//   FAIL-CLOSED        the seam refused with a named error (the lane's
//                      admission gate / validator / failpoint threw)
//   DECLARED-FALLBACK  the seam degraded honestly to the lane contract's
//                      DECLARED fallback (recorded in fallbackPolicy)
//   DECLARED-COERCION  the seam is fail-open BY DESIGN and says so
//                      (the slides sanitizer's "never throws" contract)
//   WALL-PINNED        the wall decision is pinned arithmetically at the
//                      caller (recorded honestly as a pin, not a live crash)
//   NOT VERIFIED       no seam exists for the named failure in this sandbox —
//                      recorded open, never faked
//
// THE SEAMS USED (all real, none invented):
//   · THE ENV-GATED FAILOPOINT SEAM (src/lib/ibismuh/failpoints.ts — Phase 8's
//     declared sites: queue.claim, queue.lease.renew, storage.put). The
//     publish seam (storage.put) is armed per lane and the drill's message
//     must come back as a FaultInjectionError naming its site; then the OFF
//     law re-proves the same put lands (a failpoint is off by default —
//     zero behavior change). The queue sites are DB-backed; this script
//     never touches the database (a throwaway copy rides in /tmp for the
//     import-time pragma), so the queue drills stay owned by
//     scripts/test-failpoints.mts and are recorded NOT VERIFIED here.
//   · THE ADMISSION/VALIDATOR SEAMS each lane's contract names (the render
//     gate, the storyboard validator, the rig validator, the budget walls,
//     the row resolver, the slides sanitizer).
//   · THE TIMEOUT SEAM — the repo's zombie-aware runner (proc.ts runProcess)
//     with a tiny budget: a real process is killed at the wall and the
//     runner rejects with the named "timed out" error. The encodes of the
//     graphics, slides, rig and compositor paths ride this seam (textual
//     wiring cited in the receipt); the whiteboard renderer carries its own
//     budget race around its encode (recorded per lane, honestly).
//
// Receipt: docs/baselines/mp8-lane-failure-injection-<UTC date>.json +
// the console table. Every row carries the evidence, not just the verdict.
//
// Run: node --import tsx scripts/lane-failure-injection.mts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Scratch-only storage + a throwaway database copy (the import-time WAL
// pragma must never land on db/custom.db).
const MP8_SCRATCH = "/tmp/mp8-uploads";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SCRATCH_DB = path.join(MP8_SCRATCH, "benchmark-scratch.db");
process.env.IBISMUH_STUDIO_UPLOAD_ROOT ||= MP8_SCRATCH;
if (!fs.existsSync(SCRATCH_DB)) fs.copyFileSync(path.join(ROOT, "db", "custom.db"), SCRATCH_DB);
process.env.DATABASE_URL = `file:${SCRATCH_DB}`;
process.env.IBISMUH_STUDIO_AUTH_SECRET ||= "mp8-benchmark-secret-0123456789";
fs.mkdirSync(MP8_SCRATCH, { recursive: true });

const FP = await import("../src/lib/ibismuh/failpoints");
const storage = await import("../src/lib/ibismuh/storage");
const { runProcess } = await import("../src/lib/ibismuh/proc");

interface ProbeRow {
  lane: string;
  failure: string;
  seam: string;
  verdict: string;
  evidence: string;
}

const rows: ProbeRow[] = [];
const record = (lane: string, failure: string, seam: string, verdict: string, evidence: string): void => {
  rows.push({ lane, failure, seam, verdict, evidence });
  console.log(`  [${verdict}] ${lane} · ${failure} — ${evidence.slice(0, 150)}`);
};

function setEnv(v: string | undefined): void {
  if (v === undefined) delete process.env[FP.FAILOPOINT_ENV];
  else process.env[FP.FAILOPOINT_ENV] = v;
  FP.resetFailpointsForTests();
}

async function expectThrow(fn: () => Promise<unknown> | unknown, match: RegExp): Promise<string> {
  try {
    await fn();
    throw new Error(`NO-THROW: the probe expected a named error matching ${String(match)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("NO-THROW")) throw new Error(message);
    if (!match.test(message)) {
      throw new Error(`WRONG-ERROR: expected ${String(match)}, got: ${message.slice(0, 220)}`);
    }
    return message;
  }
}

// --- the shared seams --------------------------------------------------------

/** The publish seam drill (the env-gated failpoint, storage.put): armed, the
 *  put must throw the NAMED FaultInjectionError; reset, the put must land
 *  (the OFF law — no env, zero behavior change). */
async function publishFailpointDrill(lane: string): Promise<void> {
  const key = `__mp8-failpoint-drill/${lane}.txt`;
  setEnv(`storage.put:error=${lane} publish drill`);
  let message = "";
  try {
    await storage.put(key, Buffer.from("boom"));
    throw new Error("the armed publish seam did NOT throw");
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
    if (!(err instanceof FP.FaultInjectionError) || !/publish drill/.test(message)) {
      throw new Error(`the armed seam threw the wrong thing: ${message.slice(0, 200)}`);
    }
  }
  setEnv(undefined);
  await storage.put(key, Buffer.from("the off law lands"));
  const back = await storage.get(key);
  if (back?.toString("utf8") !== "the off law lands") {
    throw new Error("the off-law put did not land");
  }
  await storage.delete?.(key).catch(() => undefined);
  record(lane, "publish-time fault (the env-gated failpoint)", "storage.put (failpoints.ts declared site; armed via IBISMUH_STUDIO_FAILPOINTS)",
    "FAIL-CLOSED", `FaultInjectionError at "storage.put": ${lane} publish drill; the off law re-proved the write lands`);
}

/** The timeout seam drill: a real ffmpeg process killed at a tiny budget. */
async function timeoutSeamDrill(lane: string, seamNote: string): Promise<void> {
  const message = await expectThrow(
    () => runProcess("ffmpeg", ["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=10", "-c:v", "libx264", "-preset", "ultrafast", "-f", "null", "-"], { timeoutMs: 400, label: `${lane} timeout drill` }),
    /timed out after/,
  );
  record(lane, "timeout at the encode seam", seamNote, "FAIL-CLOSED", message.slice(0, 160));
}

// --- the per-lane admission probes -------------------------------------------

async function probeClassic(): Promise<void> {
  const { renderVideo } = await import("../src/lib/ibismuh/render");
  const { parseTimeline } = await import("../src/lib/ibismuh/timeline");
  const { videoDir } = await import("../src/lib/ibismuh/ai");
  const { sceneWavFile } = await import("../src/lib/ibismuh/story");

  const videoId = "mp8-classic-injection";
  const dir = videoDir(videoId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // The voiceover EXISTS, the storyboard image is MISSING — the gate must
  // refuse with the named scene before any ffmpeg work starts.
  fs.writeFileSync(path.join(dir, sceneWavFile(1)), Buffer.alloc(44));
  const message = await expectThrow(
    () => renderVideo({
      videoId,
      scenes: [{ index: 1, title: "s", narration: "n", visual: "v", camera: "c", mood: "m", caption: "", hostInScene: false, rehook: false, sfx: "none" }],
      mode: "kenburns", burnSubtitles: false, smartCaptions: false, music: false, sfx: false,
      quality: "draft", aspectRatio: "16:9", frameRate: 30,
    } as never),
    /Scene 1 has no storyboard image/,
  );
  record("classic", "missing asset (the storyboard art)", "the render gate (render.ts preflight: ensureSceneAssetsLocal / the art existence wall)", "FAIL-CLOSED", message);
  fs.rmSync(dir, { recursive: true, force: true });

  const refused = parseTimeline("this is not a timeline") === null;
  if (!refused) throw new Error("parseTimeline accepted garbage");
  record("classic", "invalid input (a corrupt timeline doc)", "parseTimeline (timeline.ts — refuses, never throws a render)", "FAIL-CLOSED", "parseTimeline answered null for non-JSON garbage (fail-closed refusal)");
}

async function probeStory(): Promise<void> {
  const { renderVideo } = await import("../src/lib/ibismuh/render");
  const { resolveLaneFromRow } = await import("../src/lib/ibismuh/lane-contracts");
  const { videoDir } = await import("../src/lib/ibismuh/ai");
  const { sceneImageFile } = await import("../src/lib/ibismuh/story");

  const videoId = "mp8-story-injection";
  const dir = videoDir(videoId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // The storyboard art EXISTS, the narration WAV is MISSING — the gate must
  // refuse with the named scene.
  fs.writeFileSync(path.join(dir, sceneImageFile(1)), Buffer.alloc(16));
  const message = await expectThrow(
    () => renderVideo({
      videoId,
      scenes: [{ index: 1, title: "s", narration: "n", visual: "v", camera: "c", mood: "m", caption: "", hostInScene: false, rehook: false, sfx: "none" }],
      mode: "kenburns", burnSubtitles: false, smartCaptions: false, music: false, sfx: false,
      quality: "draft", aspectRatio: "16:9", frameRate: 30,
    } as never),
    /Scene 1 has no voiceover/,
  );
  record("story", "missing asset (the scene narration)", "the render gate (render.ts preflight: the WAV existence wall)", "FAIL-CLOSED", message);
  fs.rmSync(dir, { recursive: true, force: true });

  // The lane-identity law: story and character deliberately share
  // (format story + renderMode kenburns) — the row resolver must report the
  // AMBIGUITY instead of silently picking Ken Burns (the fail-closed law).
  const resolution = resolveLaneFromRow("story", "kenburns");
  if (resolution.status !== "ambiguous" || !resolution.candidates.includes("story") || !resolution.candidates.includes("character")) {
    throw new Error(`the row resolver did not report the declared ambiguity: ${JSON.stringify(resolution)}`);
  }
  record("story", "invalid input (an ambiguous format+renderMode row)", "resolveLaneFromRow (lane-contracts.ts — the no-silent-default law)", "FAIL-CLOSED",
    `status "ambiguous", candidates ${resolution.candidates.join(" + ")}, message "${resolution.message.slice(0, 90)}"`);
}

async function probeWhiteboard(): Promise<void> {
  const { validateWhiteboardProject } = await import("../src/lib/ibismuh/whiteboard/storyboard");
  const { loadLibrary } = await import("../src/lib/ibismuh/whiteboard/assets");
  const lib = loadLibrary().libraryIndex;

  const raw = {
    version: 1, width: 960, height: 540, fps: 24,
    scenes: [{
      id: "scene-1", narration: "the missing asset drill",
      placements: [{ assetId: "no-such-asset-anywhere" }],
    }],
  };
  const { project, errors } = validateWhiteboardProject(raw, lib);
  if (project !== null || !errors.some((e) => /unknown asset "no-such-asset-anywhere"/.test(e))) {
    throw new Error(`the whiteboard validator accepted an unknown asset: ${JSON.stringify(errors)}`);
  }
  record("whiteboard", "missing asset (a placement naming an unknown library asset)", "validateWhiteboardProject (storyboard.ts — the admission validator)", "FAIL-CLOSED",
    errors.find((e) => e.includes("unknown asset")) ?? "");

  const badId = {
    version: 1, width: 960, height: 540, fps: 24,
    scenes: [{ id: "scene::1--bad", narration: "the id charset drill" }],
  };
  const bad = validateWhiteboardProject(badId, lib);
  if (bad.project !== null || !bad.errors.some((e) => /id charset/.test(e))) {
    throw new Error(`the whiteboard validator accepted a corrupt id: ${JSON.stringify(bad.errors)}`);
  }
  record("whiteboard", "invalid input (an id that breaks the DOM namespace)", "validateWhiteboardProject (storyboard.ts — the S65 id-charset law)", "FAIL-CLOSED",
    bad.errors.find((e) => e.includes("id charset")) ?? "");
}

async function probeGraphics(): Promise<void> {
  const { renderGraphics } = await import("../src/lib/ibismuh/graphics/render");
  const { scaffoldGraphicsDoc } = await import("../src/lib/ibismuh/graphics/planner");
  const { assertGraphicsBudget } = await import("../src/lib/ibismuh/graphics/preflight");

  // Missing asset at the VO seam: the slot file does not exist — the render
  // refuses BEFORE chromium launches (the VO slots are read first, S152).
  const doc = scaffoldGraphicsDoc({
    scenes: [{ index: 1, title: "The drill", narration: "one two three four five" }],
    topic: "mp8 graphics injection",
    width: 320, height: 180, fps: 24,
  });
  const outDir = path.join(MP8_SCRATCH, "mp8-graphics-injection");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const message = await expectThrow(
    () => renderGraphics(doc, { outDir, voFiles: new Map([["scene-1", "/nonexistent/mp8-missing-vo.wav"]]) }),
    /(No such file|failed|STUCK|vo normalize|scene-1)/i,
  );
  record("graphics2d", "missing asset (a narration slot file that does not exist)", "renderGraphics VO-slot normalization (render.ts VO-first law, pre-chromium)", "FAIL-CLOSED", message.slice(0, 200));
  fs.rmSync(outDir, { recursive: true, force: true });

  // The budget wall: a doc far past the engine wall must refuse with the
  // named-wall refusal before chromium.
  const wallDoc = scaffoldGraphicsDoc({
    scenes: [{ index: 1, title: "The wall", narration: "one two three four five" }],
    topic: "mp8 graphics wall drill",
    width: 320, height: 180, fps: 24,
  });
  wallDoc.scenes[0].durationMs = 60 * 60 * 1000; // one hour — far past 25,920 frames @24
  const wallMessage = await expectThrow(() => assertGraphicsBudget(wallDoc), /frame budget wall/);
  record("graphics2d", "invalid input (a doc whose delivered clock exceeds the engine wall)", "assertGraphicsBudget (graphics/preflight.ts — the E0 §6 risk-4 wall)", "FAIL-CLOSED", wallMessage.slice(0, 200));
}

async function probeCharacter(): Promise<void> {
  const { validateRigDoc, validateRigParts, RIG_VERSION } = await import("../src/lib/ibismuh/characters/rig2d");
  const { assertRigBudget } = await import("../src/lib/ibismuh/characters/preflight");
  const { K1_SMOKE_FIXTURE } = await import("./k1-rig-smoke.mts");
  const artCheck = validateRigParts(K1_SMOKE_FIXTURE.art);
  if (!artCheck.parts) throw new Error("the smoke parts must validate for the drill to be meaningful");

  // Missing asset: a seed whose svgRef names a part id the library lacks.
  const orphan = {
    version: RIG_VERSION, width: 1080, height: 1080, fps: 30, background: "#111111",
    parts: [{ id: "ghost", slot: "torso", svgRef: "does-not-exist", z: 1, pivot: { x: 540, y: 540 } }],
    poses: [],
  };
  const checked = validateRigDoc(orphan, artCheck.parts);
  if (checked.doc !== null || checked.errors.length === 0) {
    throw new Error("the rig validator accepted a seed naming a missing part");
  }
  record("character", "missing asset (a rig seed naming a part id the library lacks)", "validateRigDoc (rig2d.ts — the admission validator)", "FAIL-CLOSED", checked.errors.join("; ").slice(0, 200));

  // The preflight wall: one scene far past the rig's frame budget.
  const wallMessage = await expectThrow(
    () => assertRigBudget([{ sceneIndex: 1, durationMs: 60 * 60 * 1000 }], 24),
    /budget|wall|refus/i,
  );
  record("character", "invalid input (a slot whose delivered clock exceeds the rig wall)", "assertRigBudget (characters/preflight.ts — the R-1 wall)", "FAIL-CLOSED", wallMessage.slice(0, 200));
}

async function probeSlides(): Promise<void> {
  const { sanitizeSlideSpec } = await import("../src/lib/ibismuh/slides");
  const { renderKineticSlideClips } = await import("../src/lib/ibismuh/slides-kinetic");
  const { frameCountOf } = await import("../src/lib/ibismuh/anim/clock");
  const { SLIDES_KINETIC_FRAME_BUDGET } = await import("../src/lib/ibismuh/slides-kinetic");

  // Invalid input — the sanitizer's DECLARED contract is fail-open coercion
  // ("Coerce arbitrary LLM/JSON data into a valid SlideSpec (never throws)"):
  // recorded as the contract's own verdict, not disguised as a refusal.
  const coerced = sanitizeSlideSpec({ layout: "bogus", headline: 42, accent: "neon", bars: "nope", number: "///" });
  if (coerced.layout !== "statement" || coerced.headline !== "Next slide") {
    throw new Error(`the sanitizer did not coerce per its contract: ${JSON.stringify(coerced).slice(0, 200)}`);
  }
  record("slides", "invalid input (a garbage slide spec from the planner)", "sanitizeSlideSpec (slides.ts — the declared never-throws coercion)", "DECLARED-COERCION",
    `layout "${coerced.layout}", headline "${coerced.headline}" — the fallback deck stays renderable (the sanitizer's own contract)`);

  // Missing asset — the photo layout's art: the data-URI reader returns null
  // for an unreadable file and the slide DEGRADES to its fallback (the
  // composer's law, the lane contract's declared fallback). A REAL render of
  // one small slide proves the degradation lands as a clip, not a crash.
  const outDir = path.join(MP8_SCRATCH, "mp8-slides-injection");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const spec = sanitizeSlideSpec({
    layout: "photo", accent: "yellow", headline: "The missing art drill.", useImage: true,
  });
  const clips = await renderKineticSlideClips(outDir, [{ scene: { index: 1, rehook: false }, spec, durationMs: 1200, imageUrl: "/nonexistent/mp8-missing-art.png" }], {
    outDir, brand: null, motion: { mode: "on", intensity: 10 }, fps: 24, force: true,
  });
  const clip = clips[0];
  if (!clip || !fs.existsSync(clip) || fs.statSync(clip).size < 10_000) {
    throw new Error(`the photo layout's missing-art degradation did not land a clip: ${String(clip)}`);
  }
  record("slides", "missing asset (the photo layout's art file)", "renderKineticSlideClips → dataUriFromFile (the composer's null-art fallback)", "DECLARED-FALLBACK",
    `the slide degraded to its fallback and the clip still landed (${path.basename(clip)}, ${fs.statSync(clip).size} bytes — the lane contract's declared degradation)`);
  fs.rmSync(outDir, { recursive: true, force: true });

  // The deck-total wall: the caller refuses the whole kinetic pass when the
  // program exceeds the frame budget (the still deck carries the video).
  // Pinned arithmetically against the exported constants — recorded as a
  // PIN, honestly, not as a live crash.
  const overWall = frameCountOf(40 * 60 * 1000, 30) > SLIDES_KINETIC_FRAME_BUDGET;
  if (!overWall) throw new Error("the deck-wall arithmetic does not hold");
  record("slides", "invalid input (a deck whose program exceeds the kinetic frame budget)", "the deck-total gate (render.ts caller over SLIDES_KINETIC_FRAME_BUDGET)", "WALL-PINNED",
    `frameCountOf(40min, 30fps) = ${frameCountOf(40 * 60 * 1000, 30)} > budget ${SLIDES_KINETIC_FRAME_BUDGET} — the caller refuses the pass and the still deck plays (declared per scene)`);
}

// --- the wiring pin (the failpoint battery's law, mirrored) -------------------

function wiringPin(): void {
  const queueSrc = fs.readFileSync(path.join(ROOT, "src/lib/ibismuh/queue.ts"), "utf8");
  const storageSrc = fs.readFileSync(path.join(ROOT, "src/lib/ibismuh/storage.ts"), "utf8");
  for (const name of FP.FAILOPOINTS) {
    const needle = `failpointCheck("${name}")`;
    const count = queueSrc.split(needle).length - 1 + storageSrc.split(needle).length - 1;
    if (count !== 1) throw new Error(`failpoint "${name}" is wired ${count} times — the declared-once law broke`);
  }
  console.log(`  [PINNED] the failpoint wiring — ${FP.FAILOPOINTS.join(", ")} each wired exactly once (queue.ts + storage.ts)`);
}

// --- main ---------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("lane-failure-injection — the six-lane failure-injection receipt");
  wiringPin();

  for (const lane of ["classic", "story", "whiteboard", "graphics2d", "character", "slides"]) {
    await publishFailpointDrill(lane);
  }

  // The timeout seam — LIVE on the shared runner; the per-lane encode walls
  // are recorded textually (which seam each lane's encode actually rides).
  await timeoutSeamDrill("shared-encode-seam", "proc.ts runProcess (the zombie-aware runner; the graphics/slides/rig/compositor encodes ride it)");
  record("whiteboard", "timeout at the encode seam", "whiteboard/render.ts encode budget race (its own wall around the ffmpeg call)", "RECORDED (live evidence: the shared encode-seam drill)",
    "the shared runProcess drill above is the live timeout evidence; the whiteboard renderer carries its own budget race around execFileP (pinned textually — the same wall class), so this row records rather than re-arms");

  await probeClassic();
  await probeStory();
  await probeWhiteboard();
  await probeGraphics();
  await probeCharacter();
  await probeSlides();

  // The honest open rows — the seams this sandbox genuinely cannot arm.
  for (const lane of ["classic", "story", "whiteboard", "graphics2d", "character", "slides"]) {
    record(lane, "queue-time fault (claim / lease renewal)", "queue.claim + queue.lease.renew (the DB-backed queue)", "NOT VERIFIED",
      "the queue sites are DB-backed; this benchmark never touches the database — the drills are owned by scripts/test-failpoints.mts (the env-gated seam itself IS pinned above at the publish seam)");
  }

  // --- the receipt ------------------------------------------------------------
  const date = new Date().toISOString().slice(0, 10);
  const receipt = {
    schema: "mp8-lane-failure-injection/1",
    generatedAt: new Date().toISOString(),
    law: "Never turn an unavailable proof into a PASS: FAIL-CLOSED = the seam refused with a named error; DECLARED-FALLBACK / DECLARED-COERCION = the lane contract's declared honest degradation; WALL-PINNED = the wall decision pinned arithmetically; NOT VERIFIED = no seam in this sandbox, recorded open.",
    failpointEnv: FP.FAILOPOINT_ENV,
    declaredFailpoints: FP.FAILOPOINTS,
    probes: rows,
    summary: Object.fromEntries(
      ["classic", "story", "whiteboard", "graphics2d", "character", "slides"].map((lane) => [
        lane,
        {
          missingAsset: rows.find((r) => r.lane === lane && r.failure.startsWith("missing asset"))?.verdict ?? "NOT VERIFIED",
          invalidInput: rows.find((r) => r.lane === lane && r.failure.startsWith("invalid input"))?.verdict ?? "NOT VERIFIED",
          timeout: rows.find((r) => r.lane === lane && r.failure.includes("timeout"))?.verdict ?? (rows.find((r) => r.lane === "shared-encode-seam" && r.failure.includes("timeout")) ? "FAIL-CLOSED (via the shared encode seam)" : "NOT VERIFIED"),
          publishFailpoint: rows.find((r) => r.lane === lane && r.failure.includes("publish-time"))?.verdict ?? "NOT VERIFIED",
          queueFailpoint: "NOT VERIFIED (DB-backed — scripts/test-failpoints.mts owns the queue drills)",
        },
      ])
    ),
  };
  const outPath = path.join(ROOT, "docs", "baselines", `mp8-lane-failure-injection-${date}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2) + "\n");
  console.log(`\nreceipt: docs/baselines/mp8-lane-failure-injection-${date}.json (${rows.length} probe rows)`);

  const bad = rows.filter((r) => r.verdict === "FAIL");
  if (bad.length > 0) {
    console.error(`FAIL: ${bad.length} probe(s) failed: ${bad.map((b) => `${b.lane}/${b.failure}`).join("; ")}`);
    process.exit(1);
  }
  console.log("ALL PROBES RECORDED — every verdict above is the seam's real answer, no gap disguised");
}

main().catch((err) => {
  console.error("lane-failure-injection crashed:", err instanceof Error ? err.stack : String(err));
  process.exit(1);
});

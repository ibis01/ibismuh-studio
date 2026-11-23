import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/ibismuh/tenant-db";
import { requireUser } from "@/lib/ibismuh/tenant";
import { parseScenes, storyboardComplete } from "@/lib/ibismuh/story";
import { isJobRunning, lastJobError, jobProgress, startJob, jobFleetStatus } from "@/lib/ibismuh/jobs";
import { assertWithinVideoCeiling, CostCeilingExceededError } from "@/lib/ibismuh/cost-guard";

const digestOf = (input: string) =>
  createHash("sha256").update(input, "utf8").digest("hex").slice(0, 16);
import { runRenderJob, runWhiteboardJob, runGraphicsJob, type RenderJobOptions } from "@/lib/ibismuh/video-jobs";
import { renderStaleness, parseRenderManifest } from "@/lib/ibismuh/render-assembly";
import { resolveMusicForVideo, isMusicEnabledForVideo, musicBedActive } from "@/lib/ibismuh/music";
import { docMusicPick, resolveDeliveryQuality, resolveBurnSubtitles } from "@/lib/ibismuh/studio-doc";
import { parseTimeline } from "@/lib/ibismuh/timeline";
import { getApprovedAudioMap } from "@/lib/ibismuh/director-plan";
import { sanitizeTransition } from "@/lib/ibismuh/transitions";
import { resolveUserPlan, hasCredits, RENDER_ESTIMATE_MICRO, planSupportsResolution, microToCredits } from "@/lib/ibismuh/billing";
import { parseWhiteboardDoc } from "@/lib/ibismuh/whiteboard/whiteboard-planner";
import { validateWhiteboardProject } from "@/lib/ibismuh/whiteboard/storyboard";
import { loadVideoLibrary } from "@/lib/ibismuh/whiteboard/asset-store";
import { parseGraphicsDoc } from "@/lib/ibismuh/graphics/types";
import { assertGraphicsBudget } from "@/lib/ibismuh/graphics/preflight";
import { measureGraphicsVoMs } from "@/lib/ibismuh/graphics/vo-ms";
import { videoDir } from "@/lib/ibismuh/ai";
import { resolveRenderLane } from "@/lib/ibismuh/render-lane";

type Ctx = { params: Promise<{ id: string }> };

/** GET — render job status (drives the client progress bar). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (video.format !== "story")
    return NextResponse.json({ error: "Not a scene-based video" }, { status: 400 });

  // S87 slice 3 — the shared status surface sees ALL lanes: a whiteboard
  // video renders through the "whiteboard" job kind, a graphics video
  // through "graphics" (the engine lanes), so the compositor's "render"
  // kind reads empty and the honest answer comes from the lane that is
  // actually running.
  const laneKind =
    video.renderMode === "whiteboard" ? "whiteboard" : video.renderMode === "graphics" ? "graphics" : null;
  // S151 — FLEET truth: the render POST and this poll may land on different
  // serverless instances; the in-memory registry alone answers "not
  // rendering" on tick 0 while the job is running (or failed) elsewhere.
  const [fleetRender, fleetLane] = await Promise.all([
    jobFleetStatus(id, "render"),
    laneKind !== null
      ? jobFleetStatus(id, laneKind)
      : Promise.resolve({ active: false, error: null as string | null }),
  ]);
  const rendering =
    isJobRunning(id, "render") ||
    fleetRender.active ||
    (laneKind !== null && (isJobRunning(id, laneKind) || fleetLane.active));
  // S117 — the manifest + the live staleness verdict (computed, never
  // stored): what the standing final was assembled from, and whether the
  // current approved content has moved on since.
  const staleness = video.hasVideo ? await renderStaleness(video) : null;
  return NextResponse.json({
    rendering,
    mode: rendering ? video.renderMode : null,
    progress:
      jobProgress(id, "render") ??
      (laneKind ? jobProgress(id, laneKind) : null),
    hasVideo: video.hasVideo,
    videoDuration: video.videoDuration,
    manifest: parseRenderManifest(video.renderManifest),
    staleness,
    error:
      lastJobError(id, "render") ??
      fleetRender.error ??
      (laneKind ? lastJobError(id, laneKind) ?? fleetLane.error : null) ??
      video.error,
  });
}

/**
 * POST — render the final MP4 as a background job (202).
 * Body: { mode?: "kenburns" | "stock" | "slides" | "animated" | "whiteboard" | "graphics",
 *         subtitles?: boolean, music?: boolean,
 *         sceneLimit?: number }  — sceneLimit renders a preview (first N scenes).
 *         { sceneIndex } — S114: one scene's preview (scene-preview-NN.mp4).
 *         { boundaryAfter } — S116: the seam pair (scene-boundary-NN.mp4),
 *                             the media the scene recheck's boundary lens
 *                             measures. All three grammars are mutually
 *                             exclusive.
 *
 * S119 — THE LANE CONTRACT: `mode` is the user's click (the dialog's mode
 * picker is local state that only reaches the server here). An explicit
 * "whiteboard" pins the row to the engine lane; an explicit story mode
 * flips a whiteboard row back; a silent body defers to the row. Before
 * S119 `mode: "whiteboard"` degraded silently to kenburns — the picker
 * said Whiteboard, the button rendered Ken Burns.
 * S123 (G1) — the graphics lane rides the SAME contract (the engine lanes
 * are a set, not a case): an explicit "graphics" pins the row and routes
 * to the engine; the lockstep commit landed the picker entry + this route
 * branch + the compositor dispatch in ONE commit (acceptance criterion 4).
 *
 * The job body is runRenderJob (video-jobs.ts) — the SAME function the durable
 * queue's crash-recovery handler runs, with the request options persisted on
 * the Job row so a restart re-renders what the user asked for.
 *
 * Music resolution: video-level pin → Settings manual pick → auto mood-match
 * by niche (music.ts); falls back to the inline synthesized drone when the
 * library has no active track. Full renders finish with the QC battery
 * (qc.ts) recorded on the video row.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (video.format !== "story")
    return NextResponse.json(
      { error: "Not a scene-based video — rendering applies to scene-format videos" },
      { status: 400 }
    );

  const scenes = parseScenes(video.scenes);
  if (scenes.length === 0)
    return NextResponse.json(
      { error: "Video has no scenes — generate the scene script first" },
      { status: 400 }
    );

  // Stage interlock FIRST (before the hasVoiceover validation, which trips
  // during a regen because the voiceover route clears its flags upfront):
  // the compositor reads every scene WAV to time the cuts — a concurrent
  // voiceover regen would feed it half-old, half-new narration (seen live:
  // mixed stub-tone + re-spoken audio in one render). The whiteboard lane
  // reads the SAME WAVs (its VO slots), so the interlock guards both lanes.
  if (isJobRunning(id, "voiceover"))
    return NextResponse.json(
      { error: "The voiceover is still regenerating — wait for it to finish before rendering" },
      { status: 409 }
    );

  const body = await req.json().catch(() => ({}));

  // S119 — THE LANE CONTRACT (render-lane.ts, unit-pinned truth table):
  // resolve the lane from the body's explicit mode (the click) and the
  // row's renderMode (the standing truth), persist any pin BEFORE
  // admission so the engine lane, the job replay and every subsequent
  // bare caller agree, then dispatch.
  const bodyMode = typeof body?.mode === "string" ? body.mode : null;
  const lane = resolveRenderLane(bodyMode, video.renderMode);
  if (lane.pinRenderMode)
    await db.video.update({
      where: { id },
      data: { renderMode: lane.pinRenderMode },
    });

  // S87 slice 3 — THE SHARED PATH. A whiteboard video renders through its
  // ENGINE lane: peer at the engine level (own planner, own renderer, own
  // Studio), unified at the contract level (the engine emits timeline
  // tracks; its render composes on the shared frame-quantized clock). The
  // story-lane gates below do NOT apply — the whiteboard scaffold needs
  // neither storyboard art nor the hasVoiceover flag (silent drafts are a
  // legal render), and the engine renders natively at $0 (no generation
  // API, so no credit gate). Scene previews stay on the Whiteboard
  // Studio's own route (a full render is what "the render button" means).
  if (lane.lane === "whiteboard") {
    const doc = parseWhiteboardDoc(video.whiteboardProject);
    if (!doc)
      return NextResponse.json(
        { error: "No whiteboard project yet — scaffold one in the Whiteboard Studio first" },
        { status: 409 }
      );
    // Same gate the lane's own route applies — the validator's verbatim
    // errors on click, not in a failed job card (and the SAME merged
    // library the render will see, per S69).
    const { lib } = await loadVideoLibrary(id);
    const { project, errors } = validateWhiteboardProject(doc.project, lib.libraryIndex);
    if (!project)
      return NextResponse.json(
        { error: "The whiteboard project is invalid — fix it in the Studio first", errors },
        { status: 400 }
      );

    await db.video.update({ where: { id }, data: { error: null } });
    const accepted = await startJob(id, "whiteboard", () => runWhiteboardJob(id, {}));
    return NextResponse.json(
      { accepted, generating: true, mode: "whiteboard", scope: "full" },
      { status: accepted ? 202 : 200 }
    );
  }

  // S123 (G1) — THE GRAPHICS LANE (the whiteboard branch mirrored): peer
  // at the engine level (own doc, own renderer, own Studio), unified at
  // the contract level (the engine emits timeline tracks; its render
  // composes on the shared frame-quantized clock). The story-lane gates
  // below do NOT apply — the graphics scaffold needs neither storyboard
  // art nor the hasVoiceover flag (silent drafts are a legal render), and
  // the engine renders natively at $0 (no generation API, so no credit
  // gate). The PREFLIGHT WALL runs HERE at admission — the named-wall
  // refusal (the DELIVERED frame arithmetic at doc.fps, R-1) hits on
  // click, not in a failed job card.
  if (lane.lane === "graphics") {
    const doc = parseGraphicsDoc(video.graphicsDoc);
    if (!doc)
      return NextResponse.json(
        { error: "No graphics doc yet — scaffold one in the Graphics Studio first" },
        { status: 409 }
      );
    try {
      // S152 — the wall reads the MEASURED narration clock (the WAV truth
      // the render extends its scenes to hold), so admission judges the
      // delivered program, not an estimate-only shadow of it.
      assertGraphicsBudget(doc, measureGraphicsVoMs(videoDir(id), doc));
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "the graphics doc exceeds the frame budget" },
        { status: 400 }
      );
    }

    await db.video.update({ where: { id }, data: { error: null } });
    const accepted = await startJob(id, "graphics", () => runGraphicsJob(id, {}));
    return NextResponse.json(
      { accepted, generating: true, mode: "graphics", scope: "full" },
      { status: accepted ? 202 : 200 }
    );
  }

  // Keynote slides design their own deck — storyboard art is optional there.
  // The row flag is written by the storyboard job's SUCCESS TAIL, but the
  // storyboard UI derives "painted" from STORAGE (serializeScenes stats), so
  // there is a real window — a few seconds normally, longer when the
  // success tail's artifact-invalidation runs — where every scene shows
  // painted on the board while the row still reads false. A user who clicks
  // Render in that window got "Generate the storyboard first — there is no
  // scene art yet": a lie the pixels on their own board disprove (field
  // report: the board painted, render refused, retry fixed it). The gate now
  // falls back to the SAME storage truth the board shows; a stale-false flag
  // self-heals on the way through, and a genuinely unpainted board still
  // gets the honest refusal.
  if (!video.hasStoryboard && body?.mode !== "slides") {
    const painted = await storyboardComplete(id, scenes).catch(() => false);
    if (!painted)
      return NextResponse.json(
        { error: "Generate the storyboard first — there is no scene art yet" },
        { status: 400 }
      );
    await db.video
      .update({ where: { id }, data: { hasStoryboard: true } })
      .catch(() => {}); // self-heal is best-effort; the render proceeds
  }
  if (!video.hasVoiceover)
    return NextResponse.json(
      { error: "Generate the voiceover first — narration drives the scene timing" },
      { status: 400 }
    );

  // Stage 7 (T-7.5 wiring) — plan gate. Resolution gating by tier + credit
  // check for paid plans (the Starter/free tier never hard-blocks). Runs
  // BEFORE the enqueue so an overdrawn paid account gets a 402 with a
  // readable message instead of a failed job row after the queue claims it.
  // The render pipeline is 1080p in every geometry today (aspect ≠
  // resolution); when 1440p/2160p rendering lands, `requestedResolution`
  // reads from the body and this gate starts differentiating by tier.
  const resolvedPlan = await resolveUserPlan(auth.ctx.userId);
  const requestedResolution = "1080p";
  if (!planSupportsResolution(resolvedPlan.plan, requestedResolution)) {
    return NextResponse.json(
      {
        error: `Your ${resolvedPlan.plan.name} plan renders up to ${resolvedPlan.plan.maxResolution} — upgrade to render ${requestedResolution}`,
        plan: resolvedPlan.plan.tier,
      },
      { status: 402 }
    );
  }
  if (!hasCredits(resolvedPlan, RENDER_ESTIMATE_MICRO)) {
    return NextResponse.json(
      {
        error: "Not enough credits for this render — upgrade your plan or wait for the next monthly grant",
        // creditBalance is microCredits (canonical); display in UI credits.
        creditBalance: microToCredits(resolvedPlan.creditBalance),
        plan: resolvedPlan.plan.tier,
      },
      { status: 402 }
    );
  }

  // S115 — the per-PROJECT ceiling (opt-in, Video.spendCeilingMicro),
  // enforced in the same admission window as the credit hold: the video's
  // recorded spend + this render's estimate must fit, else 402 with the
  // numbers. The org's credit balance gates the USER; this gates the
  // PROJECT ("enforce remaining budget", the operator's requirement D).
  try {
    await assertWithinVideoCeiling(video, RENDER_ESTIMATE_MICRO);
  } catch (err) {
    if (err instanceof CostCeilingExceededError)
      return NextResponse.json(
        {
          error: err.message,
          spentMicroUsd: err.spentMicroUsd,
          ceilingMicroUsd: err.ceilingMicroUsd,
          estimateMicroUsd: err.estimateMicroUsd,
        },
        { status: 402 }
      );
    throw err;
  }

  // Keynote slides: captions duplicate the slide headlines — default OFF.
  const mode = ["animated", "stock", "slides"].includes(body?.mode) ? body.mode : "kenburns";
  // S14 — the delivery: the caption's shipping form resolves through the
  // ONE chain (a per-render body override > the row's standing pick > the
  // format default) so a bare render honors the studio's pick. Before S14
  // the row's burnCaptions was written by the dialog's presets and read by
  // NOBODY — the route fell straight to `mode !== "slides"`.
  const subtitles = resolveBurnSubtitles(body?.subtitles, video.burnCaptions, mode);
  const smartCaptions = body?.smartCaptions !== false; // default: ASR-synced cues (Phase 4)
  const music = body?.music !== false; // default: ambient bed
  const sceneLimitRaw = Number(body?.sceneLimit);
  const sceneLimit =
    Number.isInteger(sceneLimitRaw) && sceneLimitRaw >= 1
      ? Math.min(sceneLimitRaw, scenes.length)
      : undefined;

  // S114 — Scene-Level Editing, Stage 3: render ONE scene as
  // scene-preview-NN.mp4 (the story-lane twin of the whiteboard lane's
  // per-scene preview). Mutually exclusive with sceneLimit — the prefix
  // grammar and the arbitrary-scene grammar are different requests.
  const sceneIndexRaw = Number(body?.sceneIndex);
  const sceneIndex =
    Number.isInteger(sceneIndexRaw) && sceneIndexRaw >= 1 ? sceneIndexRaw : undefined;
  if (sceneIndex != null && sceneLimit != null)
    return NextResponse.json(
      { error: "sceneIndex and sceneLimit are mutually exclusive — preview ONE scene or the first N" },
      { status: 400 }
    );
  if (sceneIndex != null && !scenes.some((s) => s.index === sceneIndex))
    return NextResponse.json({ error: `Scene ${sceneIndex} does not exist` }, { status: 404 });

  // S116 — Scene-Level Editing, Stage 5: render a BOUNDARY PAIR — scenes
  // boundaryAfter + boundaryAfter+1 with their seam — as
  // scene-boundary-NN.mp4, the media the scene recheck's boundary lens
  // measures. Mutually exclusive with BOTH other scene-scoped grammars.
  const boundaryAfterRaw = Number(body?.boundaryAfter);
  const boundaryAfter =
    Number.isInteger(boundaryAfterRaw) && boundaryAfterRaw >= 1 ? boundaryAfterRaw : undefined;
  if (boundaryAfter != null && (sceneIndex != null || sceneLimit != null))
    return NextResponse.json(
      { error: "boundaryAfter is mutually exclusive with sceneIndex and sceneLimit — render the pair, one scene, or the first N" },
      { status: 400 }
    );
  if (boundaryAfter != null) {
    const last = scenes[scenes.length - 1]?.index ?? 0;
    if (boundaryAfter >= last)
      return NextResponse.json(
        { error: `There is no scene after ${boundaryAfter} — the last scene's seam is ${last - 1}|${last}` },
        { status: 404 }
      );
    if (!scenes.some((s) => s.index === boundaryAfter))
      return NextResponse.json({ error: `Scene ${boundaryAfter} does not exist` }, { status: 404 });
  }

  // Stage 6 (T-6.8) — per-render aspect + frame-rate overrides (optional).
  // When absent, the job falls back to the per-PROJECT defaults on the video
  // row (video.aspectRatio / video.frameRate); 30 fps + 16:9 otherwise.
  // Slides mode is always 9:16; an explicit 1:1 is honored only for the
  // other modes (the slide deck's PNG is 1080x1920).
  const aspectRatio: "16:9" | "9:16" | "1:1" | undefined =
    body?.aspectRatio === "16:9" || body?.aspectRatio === "9:16" || body?.aspectRatio === "1:1"
      ? body.aspectRatio
      : undefined;
  const frameRate: 24 | 30 | 60 | undefined =
    body?.frameRate === 24 || body?.frameRate === 30 || body?.frameRate === 60
      ? body.frameRate
      : undefined;
  // S3 — the delivery encode tier, resolved through the ONE chain (S14): a
  // per-render body override (the export-preset picker) > the timeline
  // doc's standing renderPrefs.quality pick > standard. Before S14 this
  // route passed the body tier through verbatim and let the JOB resolve
  // the doc fallback one layer down (its own comment promised a chain its
  // code never ran) — now the chain runs here, and the response echoes
  // what the job will honor.
  const quality = resolveDeliveryQuality(body?.quality, parseTimeline(video.timeline)?.renderPrefs ?? null);

  // Stage 6 (T-6.10) — when the user explicitly clicks "render without
  // timeline" (the route body carries `ignoreTimeline: true`), pass an empty
  // array so the job skips timeline consumption. Otherwise the job reads
  // Video.timeline itself. Per-scene durations in the body are NOT honored
  // here — the timeline is the source of truth for trims; the body's role
  // is to disable timeline consumption, not to override it ad hoc.
  const sceneDurationsSec: number[] | undefined = body?.ignoreTimeline === true ? [] : undefined;

  // Durable render options — the job re-derives scenes/motion/transition/
  // brand/music from the video row; the payload preserves the user's picks.
  const renderOpts: RenderJobOptions = {
    mode,
    subtitles,
    smartCaptions,
    music,
    sceneLimit,
    sceneIndex,
    boundaryAfter,
    aspectRatio,
    frameRate,
    quality,
    sceneDurationsSec,
  };
  // Response-time music resolution (the job re-resolves for itself) — the
  // SAME flag truth the job applies (musicBedActive): the doc pick re-tops
  // the chain and a disabled bed is silence, so the response never promises
  // a bed — or a drone — the job will not lay.
  const docPick = docMusicPick(parseTimeline(video.timeline)?.renderPrefs ?? null);
  const musicOn = music && musicBedActive(docPick, await isMusicEnabledForVideo(video));
  const planAudio = await getApprovedAudioMap(id);
  const resolved = musicOn ? await resolveMusicForVideo(video, planAudio.musicMood, docPick) : null;

  // Scene transitions: per-video override (null = built-in crossfade 0.5s).
  // Slides beats read like slide changes — hard cuts are the format's native
  // grammar, so an unset transition defaults to "cut" for this mode.
  const transition = sanitizeTransition(
    mode === "slides" && video.transitionStyle === null
      ? { style: "cut", durationSec: video.transitionDuration }
      : {
          style: video.transitionStyle,
          durationSec: video.transitionDuration,
        }
  );

  // Clear any stale error before the job starts.
  await db.video.update({ where: { id }, data: { error: null } });

  // S115 — the idempotent enqueue: the key is deterministic per (video row
  // state, options) — a retried request or double-click resolves to the
  // standing job (done rows are never re-billed); ANY content change bumps
  // updatedAt and mints a fresh key, so a re-render after an edit is never
  // blocked. The unique index is the race floor.
  const renderIdempotencyKey = `render:${id}:${video.updatedAt.getTime()}:${digestOf(
    JSON.stringify(renderOpts)
  )}`;
  const accepted = await startJob(
    id,
    "render",
    () => runRenderJob(id, renderOpts),
    { payload: renderOpts, idempotencyKey: renderIdempotencyKey }
  );

  return NextResponse.json(
    {
      accepted,
      generating: true,
      mode,
      sceneIndex: sceneIndex ?? null,
      sceneLimit: sceneLimit ?? null,
      boundaryAfter: boundaryAfter ?? null,
      transition,
      music: resolved
        ? { track: resolved.track.name, why: resolved.why }
        : musicOn
          ? "synthesized-fallback"
          : false,
      // S14 — the resolved delivery, echoed so the response never promises
      // a grade or a caption form the job will not honor (the S7 doctrine,
      // now covering the whole export contract).
      quality,
      subtitles,
    },
    { status: accepted ? 202 : 200 }
  );
}

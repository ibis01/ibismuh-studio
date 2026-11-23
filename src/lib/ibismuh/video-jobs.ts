// Video-stage background job bodies (Stage 3 close-out).
//
// Every function here is the SINGLE implementation of one job kind, called
// from BOTH execution paths:
//   * the route's enqueue closure (the in-process fast path), and
//   * the durable queue's crash-recovery handler (queue-handlers.ts), which
//     re-runs the job after a process death from DB state + Job.payload.
//
// That is the whole point of this module: before it, each route carried its
// own closure capturing request-scoped choices, so a restart marked the job
// "interrupted" and the user re-kicked the stage. Now the choices either live
// on the video row (re-derived below) or in the small JSON payload the route
// stores at enqueue time — and a crash resumes with the SAME choices.
//
// Contract (same as script-job.ts / runStockRefresh):
//   * the function runs under a tenant context (assertCtx) — inherited from
//     the launching request (closure) or restored from the Job row (handler);
//   * a deleted/transformed video ends the job QUIETLY (no error surfaces);
//   * a vanished prerequisite (storyboard, script, …) throws a readable
//     error so the failure lands on the video row where the UI polls it.

import fs from "fs";
import path from "path";
import { db } from "./tenant-db";
import { assertCtx } from "./tenant";
import { errorText } from "@/lib/ibismuh/redact";
import { runDirectorPass, runContinuityCheck } from "./director";
import {
  generateVoiceover,
  generateThumbnail,
  deriveThumbnailConcept,
  readMedia,
  videoDir,
} from "./ai";
import {
  generateSceneVoiceovers,
  generateStoryboard,
  generateSceneImage,
  editSceneImage,
  storyboardComplete,
  parseScenes,
} from "./story";
import type { Scene } from "./types";
import type { Video } from "@prisma/client";
import { ingestCustomAudio } from "./voice";
import { deriveStatus } from "./status";
import { runQualityGate } from "./quality";
import { renderVideo, invalidateRenderedArtifacts } from "./render";
import type { LivelinessDecision } from "./liveliness";
import { draftColdStartOpener, pickBestScene, renderShort } from "./shorts";
import { convertClassicToScenes } from "./convert";
import { verifyNarration } from "./verify";
import { generateEngagementKit } from "./comments";
import {
  resolveMusicForVideo,
  resolveDuckingForVideo,
  getSfxEnabled,
  trackAbsolutePath,
  isMusicEnabledForVideo,
  musicBedActive,
} from "./music";
import { qcForVideo, qcForPreview, type QcReport } from "./qc";
import { commitSceneChanges } from "./scene-revisions";
import { registerSceneArtifact } from "./scene-artifacts";
import { resolveRenderAssembly, manifestOf } from "./render-assembly";
import {
  resolveContentPolicy,
  runRestrictedVisualScan,
} from "./restricted-subjects";
import {
  runSubjectContinuityScan,
  runTextArtifactScan,
} from "./visual-qc";
import { expectedCutsForTimeline } from "./render-qc";
import type { ExpectedCuts } from "./render-qc";
import { applyQcPolicy, qcEnforcementMode } from "./qc-policy";
import { parsePlan, getApprovedAudioMap } from "./director-plan";
import { parseTimeline, docSceneSettings, type DocSceneSettings } from "./timeline";
import { compositionPlan, type CompositionPlan, type PlanVisualKind } from "./composition-plan";
import type { ExportQuality, MusicPick, PosterPick, ShortPick } from "./studio-doc";
import { docMusicPick, docPosterPick, docShortPick } from "./studio-doc";
import { resolveTransition, transitionSummary, sanitizeTransitionStyle, TRANSITION_IDS } from "./transitions";
import type { TransitionSettings } from "./transitions";
import { sanitizeMotion } from "./motion";
import {
  renderWhiteboard,
  probeDurationSec,
} from "./whiteboard/render";
// S167 — the scene-story 3D engine lane: the video's scene3d doc renders
// through the shared chromium rasterizer (render3d) and joins the assembly
// the S143 way, as a pre-rendered engine segment.
import { parseScene3D } from "./scene3d";
import { renderScene3D } from "./render3d";
// S123 (G1) P3 — the graphics engine lane: the renderer + the lane-aware
// QC helpers (the doc's hold windows + the hard-cut expectation),
// imported at the SAME seam the whiteboard engine rides.
import { renderGraphics } from "./graphics/render";
import { graphicsDraftDoc, graphicsDraftKey, isGraphicsDraftScale } from "./graphics/draft";
import { resolveSpriteAssets } from "./graphics/import-store";
import { graphicsExpectedCuts, graphicsHoldWindows } from "./graphics/qc";
import { measureGraphicsVoMs } from "./graphics/vo-ms";
import { parseGraphicsDoc, validGraphicsId } from "./graphics/types";
import { loadVideoLibrary } from "./whiteboard/asset-store";
import type { WhiteboardAsset } from "./whiteboard/assets";
import {
  parseWhiteboardDoc,
  type WhiteboardDoc,
} from "./whiteboard/whiteboard-planner";
import { validateWhiteboardProject, validWhiteboardId, type WhiteboardProject } from "./whiteboard/storyboard";
import { sceneWavFile } from "./story";
import {
  loadSlideDeck,
  planSlides,
  rerollSlideSpec,
  saveSlideSpecAt,
  renderSlidePngs,
  slideBrandFor,
} from "./slides";
import { get, put, remove, materialize, putFromPath } from "./storage";
import { promoteVariant, pickVariantStyles } from "./ai";
import { uploadToYouTube } from "./youtube";
import {
  JobCancelledError,
  isJobCancelled,
  setJobProgress,
  startJob,
} from "./jobs";
import { runConsistencyEngine, runTargetedRecheck, normalizeConsistencyCheckMode } from "./visual-consistency";
import { getUserSetting } from "./settings";

/** Character inputs for scene art — derived from video.characterId. */
async function castOptsFor(video: {
  characterId: string | null;
}): Promise<
  | { id: string; name: string; identityAnchor: string | null; appearance: string | null }
  | null
> {
  const character = video.characterId
    ? await db.character.findUnique({ where: { id: video.characterId } })
    : null;
  return character
    ? {
        id: character.id,
        name: character.name,
        identityAnchor: character.identityAnchor,
        appearance: character.appearance,
      }
    : null;
}

// ---------------------------------------------------------------------------
// voiceover

/** Durable voiceover source spec (JSON-payload safe). */
export type VoiceoverJobSource =
  | { kind: "url"; url: string; label?: string }
  | { kind: "upload"; storageKey: string; label: string };

/**
 * (Re)generate the voiceover. source=null → built-in TTS (scene videos get
 * per-scene TTS). Custom sources: "url" re-downloads; "upload" reads back the
 * bytes the route staged into object storage BEFORE enqueueing (a raw request
 * buffer cannot survive a restart — the storage key can).
 */
export async function runVoiceoverJob(
  videoId: string,
  opts: { source?: VoiceoverJobSource | null } = {}
): Promise<void> {
  const ctx = assertCtx("runVoiceoverJob");
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return; // deleted while queued — end quietly

  const scenes = video.format === "story" ? parseScenes(video.scenes) : [];
  const source = opts.source ?? null;

  try {
    let durationSec: number;
    let voiceSource = "tts";
    let voiceLabel: string | null = null;
    let activityMsg: string;

    if (source) {
      // ----- Bring-your-own-voice: normalize + (scene videos) cut -----
      let buffer: Buffer | null = null;
      if (source.kind === "upload") {
        buffer = await get(source.storageKey).catch(() => null);
        if (!buffer)
          throw new Error(
            "The uploaded audio is no longer available — attach the file again"
          );
      }

      const result = await ingestCustomAudio({
        videoId,
        source:
          source.kind === "upload"
            ? { kind: "upload", buffer: buffer as Buffer, filename: source.label }
            : { kind: "url", url: source.url },
        onProgress: (label) => setJobProgress(videoId, "voiceover", 1, 2, label),
      });
      // The staged copy has served its purpose — drop it (best-effort).
      if (source.kind === "upload") await remove(source.storageKey).catch(() => {});

      durationSec = result.durationSec;
      voiceSource = "custom";
      voiceLabel =
        source.kind === "upload" ? source.label : (source.label ?? result.sourceLabel);
      activityMsg = `Custom voice attached from ${source.kind === "upload" ? "upload" : "web link"} — “${voiceLabel}”, ${Math.round(durationSec)}s${
        result.scenesCut !== null ? `, cut across ${result.scenesCut} scenes` : ""
      }`;
    } else if (video.format === "story" && scenes.length > 0) {
      // Per-scene narration → scene-XX.wav + merged voiceover.wav. Module E:
      // an APPROVED director plan paces the read per scene (slow for weight,
      // fast for urgency) — only on a fresh synthesis, existing wavs keep
      // their original pacing.
      const planAudio = await getApprovedAudioMap(videoId);
      const paced = planAudio.pacing.size > 0;
      const result = await generateSceneVoiceovers({
        videoId,
        scenes,
        voice: video.voice,
        speed: video.ttsSpeed,
        pacing: planAudio.pacing,
      });
      durationSec = result.durationSec;
      activityMsg = `Scene-by-scene voiceover rendered (${video.voice}, ${video.ttsSpeed}x${paced ? " · director pacing" : ""}) — ${Math.round(durationSec)}s across ${scenes.length} scenes`;
    } else if (video.format === "story") {
      throw new Error("Scene video has no scenes — regenerate the scene script");
    } else {
      if (!video.script)
        throw new Error("Video has no script yet — generate the script first");
      const result = await generateVoiceover({
        script: video.script,
        voice: video.voice,
        speed: video.ttsSpeed,
        videoId,
      });
      durationSec = result.durationSec;
      activityMsg = `Voiceover rendered (${video.voice}, ${video.ttsSpeed}x) — ${Math.round(durationSec)}s of audio`;
    }

    if (video.format === "story") {
      // Old renders no longer match the new narration timing.
      // Stage 4a (T-4.0): driver-correct removal (s3-safe, quota-decrementing)
      // + local scratch cleanup for the copies the render pipeline retains.
      for (const f of [
        "final.mp4",
        "preview.mp4",
        "subtitles.srt",
        "short.mp4",
        "short-thumb.png",
      ]) {
        await remove(`${videoId}/${f}`).catch(() => {});
        fs.rmSync(path.join(videoDir(videoId), f), { force: true });
      }
    }

    const fresh = await db.video.findUnique({ where: { id: videoId } });
    const nextStatus = deriveStatus(video, {
      hasVoiceover: true,
      hasThumbnail: fresh?.hasThumbnail ?? video.hasThumbnail,
    });

    await db.video.update({
      where: { id: videoId },
      data: {
        hasVoiceover: true,
        audioDuration: Math.round(durationSec * 10) / 10,
        voiceSource,
        voiceLabel,
        hasVideo: video.format === "story" ? false : video.hasVideo,
        hasShort: video.format === "story" ? false : video.hasShort,
        shortDuration: video.format === "story" ? null : video.shortDuration,
        shortScene: video.format === "story" ? null : video.shortScene,
        status: nextStatus,
        error: null,
      },
    });

    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "voiceover",
        message: activityMsg,
      },
    });
  } catch (err) {
    const message = errorText(err, "Voiceover failed");
    await db.video.update({
      where: { id: videoId },
      data: { status: "failed", error: message },
    });
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "voiceover",
        level: "error",
        message: `Voiceover failed: ${message}`,
      },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// storyboard (full + single scene)

/** Paint every scene still missing art (resumes: existing images are kept). */
export async function runStoryboardJob(videoId: string): Promise<void> {
  const ctx = assertCtx("runStoryboardJob");
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return;
  if (video.format !== "story") return; // format changed while queued

  const scenes = parseScenes(video.scenes);
  if (scenes.length === 0) return; // re-scripted to nothing — nothing to paint

  const castOpts = await castOptsFor(video);

  try {
    await generateStoryboard({
      videoId,
      scenes,
      character: castOpts,
      shouldCancel: () => isJobCancelled(videoId, "storyboard"),
      onSceneDone: (i, total) =>
        setJobProgress(videoId, "storyboard", i + 1, total, `Painting scene ${i + 1} of ${total}`),
    });

    await invalidateRenderedArtifacts(videoId, { slidePngs: true });
    await db.video.update({
      where: { id: videoId },
      data: {
        hasStoryboard: true,
        hasVideo: false,
        videoDuration: null,
        error: null,
      },
    });
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "storyboard",
        message: `Storyboard painted — ${scenes.length} scenes${castOpts ? ` (host: ${castOpts.name})` : ""}`,
      },
    });

    // S77 auto-chain — the fresh paint is judged while it's new (design §7).
    // Style cohesion needs ≥2 painted scenes; the engine itself reports
    // honestly when it has less. `startJob` is idempotent (a check already
    // queued/running for this video returns false) and the chain FAILS OPEN:
    // an enqueue hiccup must never fail a storyboard that just succeeded —
    // the manual check route remains (§0.3). S80 — the user's
    // consistencyCheck preference gates the AUTO path ("auto" only; a
    // corrupt setting normalizes to "auto", never silently disables).
    if (scenes.length >= 2) {
      const mode = normalizeConsistencyCheckMode(
        await getUserSetting("consistencyCheck").catch(() => null)
      );
      if (mode === "auto") {
        await startJob(videoId, "consistency", () => runConsistencyJob(videoId, "storyboard")).catch(
          () => {
            /* fail-open — the manual consistency route is the fallback */
          }
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message === "__CANCELLED__") {
      await db.video.update({
        where: { id: videoId },
        data: {
          hasStoryboard: await storyboardComplete(videoId, scenes),
          error: null,
        },
      });
      await db.activity.create({
        data: {
          organizationId: video.organizationId,
          userId: ctx.userId,
          videoId,
          stage: "storyboard",
          message: `Storyboard cancelled — finished scenes were kept`,
        },
      });
      throw new JobCancelledError();
    }
    const message = errorText(err, "Storyboard failed");
    // S136 — the S135 ORDER REPAIR, ported to the storyboard lane: the video
    // row's failure state lands FIRST (the money fact the honesty gate
    // reads) with a bounded 500ms-retried second attempt, and the Activity
    // row is best-effort AFTER it. The old unguarded order could lose BOTH
    // writes to a Prisma throw under the post-timeout SQLite writer lock
    // (the exact live incident S135 recorded) — leaving a "rendering" row
    // with no error. The hasStoryboard recompute is itself a DB read: a
    // failed recompute (null) leaves the flag untouched instead of lying.
    const painted = await storyboardComplete(videoId, scenes).catch(() => null);
    const failData =
      painted === null
        ? { error: message }
        : { hasStoryboard: painted, error: message };
    const writeFailureState = () =>
      db.video
        .update({ where: { id: videoId }, data: failData })
        .catch(async () => {
          await new Promise((r) => setTimeout(r, 500));
          return db.video.update({ where: { id: videoId }, data: failData }).catch(() => {});
        });
    await writeFailureState();
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "storyboard",
        level: "error",
        message: `Storyboard failed: ${message}`,
      },
    }).catch(() => {});
    throw err;
  }
}

/**
 * Re-roll (or AI-edit) ONE scene image. entityId is "<videoId>#scene<N>";
 * payload carries the instruction (edit mode) — omitted means re-roll.
 * A re-roll resumed after a crash bumps the seed variant again, i.e. it
 * paints a fresh take — never the stale pixels the crash interrupted.
 */
export async function runSceneJob(
  entityId: string,
  opts: { sceneIndex?: number; instruction?: string } = {}
): Promise<void> {
  const ctx = assertCtx("runSceneJob");
  // entityId is the durable encoding — parse it when explicit opts are absent.
  const [videoId, suffix] = splitEntityId(entityId, "#scene");
  const sceneIndex = Number.isInteger(opts.sceneIndex)
    ? (opts.sceneIndex as number)
    : suffix !== null
      ? Number(suffix)
      : NaN;
  if (!Number.isInteger(sceneIndex) || sceneIndex < 1)
    throw new Error("Scene job has no valid scene index");

  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return;
  if (video.format !== "story") return;

  const scenes: Scene[] = parseScenes(video.scenes);
  const scene = scenes.find((s) => s.index === sceneIndex);
  if (!scene) return; // scene vanished (re-scripted) — end quietly
  // S112 — the pre-mutation snapshot for the revision diff (the re-roll
  // bumps seedVariant in place below).
  const beforeScenes = parseScenes(video.scenes);

  const instruction =
    typeof opts.instruction === "string" ? opts.instruction.trim() : "";
  const mode = instruction ? "edit" : "reroll";

  try {
    if (mode === "edit") {
      await editSceneImage({ videoId, scene, instruction });
    } else {
      // Re-roll = a NEW take: bump the scene's generation counter BEFORE
      // painting so the pinned seed (identity locking on text-to-image
      // providers) yields a fresh image instead of the same pixels, then
      // persist the bump — a later resume must not reuse the old take.
      // S112 — the bump is a scene-content change: it lands as an immutable
      // revision (origin "storyboard-reroll") in the same transaction as
      // the row write. The art file itself becomes a tracked artifact in
      // Stage 2 (provenance); the take counter is the row's honest record.
      scene.seedVariant = Math.min((scene.seedVariant ?? 0) + 1, 999);
      await commitSceneChanges({
        video,
        beforeScenes,
        beforeDoc: parseTimeline(video.timeline),
        afterScenes: scenes,
        afterDoc: parseTimeline(video.timeline),
        kind: "edit",
        origin: "storyboard-reroll",
      });
      await generateSceneImage({ videoId, scene, character: await castOptsFor(video) });
    }
    // S113 — scene-scoped invalidation: a one-scene art change kills ONLY
    // this scene's clip (+ the video-level renders — the union), not every
    // scene's. The render reuses cached clips (ensureSceneClip), so the
    // other scenes' paid i2v generations survive.
    await invalidateRenderedArtifacts(videoId, { slidePngs: true, sceneIndex });
    await db.video.update({
      where: { id: videoId },
      data: {
        hasStoryboard: await storyboardComplete(videoId, scenes),
        hasVideo: false,
        videoDuration: null,
        error: null,
      },
    });
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "storyboard",
        message:
          mode === "edit"
            ? `Scene ${sceneIndex} "${scene.title}" AI-edited: ${instruction.slice(0, 80)}`
            : `Scene ${sceneIndex} "${scene.title}" re-rolled`,
      },
    });
    // S79 — the targeted re-check: the repaint made every verdict that
    // judged the OLD art obsolete for THIS scene. Re-judge just it and
    // merge into the prior report — never the full pass (§7: that would
    // re-judge every host scene, double VLM spend for repainters).
    // The payload carries the scene so a RESUME re-lands targeted too.
    // S80 — gated by the user's consistencyCheck preference ("auto" only).
    const checkMode = normalizeConsistencyCheckMode(
      await getUserSetting("consistencyCheck").catch(() => null)
    );
    if (checkMode === "auto") {
      await startJob(
        videoId,
        "consistency",
        () => runConsistencyJob(videoId, "repaint", sceneIndex),
        { payload: { sceneIndex } }
      ).catch(() => {
        /* fail-open — the manual Check button is the fallback */
      });
    }
  } catch (err) {
    const message = errorText(err, "Scene edit failed");
    // S136 — the S135 ORDER REPAIR, ported to the scene lane (the receipt
    // guard: video row FIRST with a bounded retry, Activity best-effort).
    const writeFailureState = () =>
      db.video
        .update({ where: { id: videoId }, data: { error: message } })
        .catch(async () => {
          await new Promise((r) => setTimeout(r, 500));
          return db.video.update({ where: { id: videoId }, data: { error: message } }).catch(() => {});
        });
    await writeFailureState();
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "storyboard",
        level: "error",
        message: `Scene ${sceneIndex} ${mode === "edit" ? "edit" : "re-roll"} failed: ${message}`,
      },
    }).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// render

export interface RenderJobOptions {
  mode?: "kenburns" | "animated" | "stock" | "slides";
  subtitles?: boolean;
  smartCaptions?: boolean;
  music?: boolean;
  sceneLimit?: number;
  /** S114 — Scene-Level Editing, Stage 3: render ONE scene as
   *  scene-preview-NN.mp4 (mutually exclusive with sceneLimit; the route
   *  refuses a body carrying both). The preview touches nothing else: no
   *  other scene's artifacts, no final/preview, no row flags, no QC. */
  sceneIndex?: number;
  /** S116 — Scene-Level Editing, Stage 5: render a BOUNDARY PAIR — scenes
   *  boundaryAfter and boundaryAfter+1 with their seam — as
   *  scene-boundary-NN.mp4, the media the recheck's boundary lens measures.
   *  Mutually exclusive with sceneIndex and sceneLimit (the route refuses
   *  combinations). Same preview semantics: no row flags, no QC, no srt —
   *  and NOTHING outside the pair is read-for-modification. */
  boundaryAfter?: number;
  /** Stage 6 (T-6.8) — per-render aspect override ("16:9"|"9:16"|"1:1").
   *  When unset, the job falls back to the video row's `aspectRatio`. */
  aspectRatio?: "16:9" | "9:16" | "1:1";
  /** Stage 6 (T-6.8) — per-render frame-rate override (24|30|60).
   *  When unset, the job falls back to the video row's `frameRate`, then 30. */
  frameRate?: 24 | 30 | 60;
  /** Stage 6 (T-6.10) — per-scene duration overrides from the assembled
   *  timeline (the Editing Studio's trims survive the render). When absent,
   *  the job reads `Video.timeline` itself; an explicit empty array
   *  disables timeline consumption (the route uses this when the user
   *  clicks "render without timeline"). */
  sceneDurationsSec?: number[];
  /** S3 — delivery encode tier (draft | standard | high). When unset, the
   *  job falls back to the timeline doc's renderPrefs, then standard. */
  quality?: ExportQuality;
}

/**
 * S45 — PURE: the DB patch a preview render writes for its QC evidence.
 * The invariant, pinned here and unit-tested both ways:
 *   • no full render stands (hasVideo false) → the preview report is the
 *     standing evidence (or an explicit null when the probes crashed — no
 *     stale scene-1 evidence may survive a newer preview);
 *   • a full render stands → the final report OWNS the field; preview
 *     evidence never downgrades it (the export gate must never judge
 *     final.mp4 on a scene-1 file).
 */
export function previewQcPatch(
  hasVideo: boolean,
  report: QcReport | null
): { hasPreview: boolean; error: null; qcReport?: string | null } {
  if (hasVideo) return { hasPreview: true, error: null };
  return { hasPreview: true, error: null, qcReport: report ? JSON.stringify(report) : null };
}

/** Render the final/preview MP4 (+ the QC battery — full scope on final
 * renders, scoped preview evidence on previews; see previewQcPatch). */
/** S114 — the scene-preview job: render ONE scene through the same
 *  segment machinery, land scene-preview-NN.mp4, register it as a preview
 *  artifact carrying the revision it was built from (the stale check:
 *  artifact.revisionVersion ≠ the scene's current head ⇒ labeled stale).
 *  Deliberately lighter than the full render: no music resolution (the
 *  preview checks the visual + timing look; the bed is a project-level
 *  decision), no timeline composition plan (every story-lane mode's visual
 *  kind is the mode's own — whiteboard videos routed to their engine lane
 *  above, which has had per-scene previews since S67), burned captions ON
 *  (checking the caption look is half the point), the row's aspect/fps.
 *  NO row flags, NO project QC, NO srt export — and no other scene's
 *  artifact is read-for-modification, let alone deleted. */
async function runScenePreviewJob(
  videoId: string,
  video: Video,
  scenes: Scene[],
  sceneIndex: number,
  opts: RenderJobOptions
): Promise<void> {
  const pos = scenes.findIndex((s) => s.index === sceneIndex);
  if (pos < 0) throw new Error(`Scene ${sceneIndex} does not exist`);
  const scene = scenes[pos];

  const mode = ["animated", "stock", "slides"].includes(opts.mode ?? "")
    ? (opts.mode as "animated" | "stock" | "slides")
    : "kenburns";
  const aspect: "16:9" | "9:16" | "1:1" =
    mode === "slides"
      ? "9:16"
      : video.aspectRatio === "9:16" || video.aspectRatio === "1:1" || video.aspectRatio === "16:9"
        ? video.aspectRatio
        : "16:9";
  const frameRate = video.frameRate === 24 || video.frameRate === 60 ? video.frameRate : 30;
  // The doc's per-scene settings for THIS scene only (aligned by position).
  const timeline = parseTimeline(video.timeline);
  const docScenes =
    timeline && timeline.scenes.length === scenes.length
      ? docSceneSettings(timeline, scenes.length)?.slice(pos, pos + 1) ?? null
      : null;

  // S154 — the preview renders the SAME channel the final will: the rig
  // pair rides (a rigged scene's preview shows the character, not the KB
  // fallback the final would never play). The full render's fetch, mirrored.
  const rigCharacter = video.characterId
    ? await db.character.findUnique({
        where: { id: video.characterId },
        select: { hasPortrait: true, rigDoc: true, parts: true },
      })
    : null;

  const result = await renderVideo({
    videoId,
    scenes: [scene],
    mode,
    character: rigCharacter
      ? {
          hasPortrait: rigCharacter.hasPortrait,
          rigDoc: rigCharacter.rigDoc,
          parts: rigCharacter.parts,
        }
      : null,
    burnSubtitles: mode !== "slides",
    smartCaptions: true,
    music: false, // the preview checks the scene, not the score
    sfx: await getSfxEnabled(),
    scenePreview: { sceneIndex },
    aspectRatio: aspect,
    frameRate,
    quality: opts.quality,
    docScenes,
    motion: sanitizeMotion({
      mode: video.motionMode,
      intensity: video.motionIntensity,
      curve: video.motionCurve,
      vary: video.motionVary,
    }),
    motionContext: { tone: video.tone, niche: video.niche },
    topic: video.topic,
    transition: resolveTransition(video, mode),
    transitionDurationExplicit: video.transitionDuration != null,
    brand: null,
    onProgress: (current, total, label) => {
      if (isJobCancelled(videoId, "render")) throw new JobCancelledError();
      setJobProgress(videoId, "render", current, total, label);
    },
  });

  // The provenance row: type preview, built-from revision recorded so the
  // stale check (revisionVersion ≠ head) can label it in the artifacts feed.
  await registerSceneArtifact({
    video,
    sceneIndex,
    type: "preview",
    storageKey: `${videoId}/scene-preview-${String(sceneIndex).padStart(2, "0")}.mp4`,
    input: `scene-preview|narration=${scene.narration}|visual=${scene.visual}|camera=${scene.camera}|mood=${scene.mood}|variant=${scene.seedVariant ?? 0}|mode=${mode}`,
    prompt: scene.visual,
    bytes: result.fileBytes,
  });

  await db.activity.create({
    data: {
      organizationId: video.organizationId,
      videoId,
      stage: "render",
      message: `Scene ${sceneIndex} preview rendered (${result.durationSec.toFixed(1)}s, ${(result.fileBytes / 1024).toFixed(0)} KB) — the full render is untouched`,
    },
  });
}

/** S116 — the boundary-pair job: scenes N and N+1 through the SAME segment +
 *  transition machinery, landing scene-boundary-NN.mp4 — the media the
 *  recheck's boundary lens measures. THE FAITHFULNESS LAW: the pair must
 *  cut the seam EXACTLY as the full render would — the doc's per-scene
 *  durations for the pair (the same slice rule the full render's
 *  sceneDurationsSec consumption uses) and the seam's own transition (the
 *  incoming scene's doc transitionIn over the video-level default, read by
 *  renderVideo's own boundary loop). Preview semantics, each deliberate:
 *  no music (the seam is a visual + timing question), burned captions ON
 *  (a cue crossing the seam is exactly the defect the lens hunts), no row
 *  flags, no project QC, no srt — and no scene outside the pair is
 *  read-for-modification, let alone deleted. */
async function runBoundaryPreviewJob(
  videoId: string,
  video: Video,
  scenes: Scene[],
  afterScene: number,
  opts: RenderJobOptions
): Promise<void> {
  const pos = scenes.findIndex((s) => s.index === afterScene);
  if (pos < 0 || pos + 1 >= scenes.length)
    throw new Error(`Boundary after scene ${afterScene} does not exist (needs scenes ${afterScene} and ${afterScene + 1})`);
  const pair = [scenes[pos], scenes[pos + 1]];

  const mode = ["animated", "stock", "slides"].includes(opts.mode ?? "")
    ? (opts.mode as "animated" | "stock" | "slides")
    : "kenburns";
  const aspect: "16:9" | "9:16" | "1:1" =
    mode === "slides"
      ? "9:16"
      : video.aspectRatio === "9:16" || video.aspectRatio === "1:1" || video.aspectRatio === "16:9"
        ? video.aspectRatio
        : "16:9";
  const frameRate = video.frameRate === 24 || video.frameRate === 60 ? video.frameRate : 30;
  // The doc's settings + durations for the PAIR only (aligned by position —
  // the same slice the scene-preview lane takes, extended to two). The
  // durations ride sceneDurationsSec so the fold consumes the doc's picks
  // exactly as the full render would.
  const timeline = parseTimeline(video.timeline);
  const docAligned = timeline != null && timeline.scenes.length === scenes.length;
  const docScenes = docAligned ? docSceneSettings(timeline, scenes.length)?.slice(pos, pos + 2) ?? null : null;
  const sceneDurationsSec = docAligned
    ? pair.map((_, k) => timeline.scenes[pos + k]?.durationSec).map((d) =>
        typeof d === "number" && Number.isFinite(d) && d > 0 ? d : Number.NaN
      )
    : undefined;

  // S154 — the boundary preview rides the rig too (the pair must cut the
  // seam EXACTLY as the full render would — including the rig channel).
  const rigCharacter = video.characterId
    ? await db.character.findUnique({
        where: { id: video.characterId },
        select: { hasPortrait: true, rigDoc: true, parts: true },
      })
    : null;

  const result = await renderVideo({
    videoId,
    scenes: pair,
    mode,
    character: rigCharacter
      ? {
          hasPortrait: rigCharacter.hasPortrait,
          rigDoc: rigCharacter.rigDoc,
          parts: rigCharacter.parts,
        }
      : null,
    burnSubtitles: mode !== "slides",
    smartCaptions: true,
    music: false, // the pair checks the seam, not the score
    sfx: await getSfxEnabled(),
    boundaryPreview: { afterScene },
    aspectRatio: aspect,
    frameRate,
    quality: opts.quality,
    docScenes,
    sceneDurationsSec,
    motion: sanitizeMotion({
      mode: video.motionMode,
      intensity: video.motionIntensity,
      curve: video.motionCurve,
      vary: video.motionVary,
    }),
    motionContext: { tone: video.tone, niche: video.niche },
    topic: video.topic,
    transition: resolveTransition(video, mode),
    transitionDurationExplicit: video.transitionDuration != null,
    brand: null,
    onProgress: (current, total, label) => {
      if (isJobCancelled(videoId, "render")) throw new JobCancelledError();
      setJobProgress(videoId, "render", current, total, label);
    },
  });

  // The provenance row: type preview, the seam's own artifact (sceneIndex =
  // the scene the seam comes after).
  await registerSceneArtifact({
    video,
    sceneIndex: afterScene,
    type: "preview",
    storageKey: `${videoId}/scene-boundary-${String(afterScene).padStart(2, "0")}.mp4`,
    input: `scene-boundary|after=${afterScene}|a=${pair[0].visual}|b=${pair[1].visual}|aVariant=${pair[0].seedVariant ?? 0}|bVariant=${pair[1].seedVariant ?? 0}|mode=${mode}`,
    prompt: `${pair[0].visual} -> ${pair[1].visual}`,
    bytes: result.fileBytes,
  });

  await db.activity.create({
    data: {
      organizationId: video.organizationId,
      videoId,
      stage: "render",
      message: `Boundary ${afterScene}|${afterScene + 1} pair rendered (${result.durationSec.toFixed(1)}s, ${(result.fileBytes / 1024).toFixed(0)} KB) — the seam's media for the scene recheck; the full render is untouched`,
    },
  });
}

/**
 * S143 (Stage X-full, the audit's F5) — the MIXED-ENGINE DISPATCHER.
 *
 * The pre-S143 dispatch was by VIDEO MODE: a whiteboard video routes whole
 * to the whiteboard lane, a graphics video whole to the graphics lane, and
 * the compositor's wall refused ANY plan carrying an engine kind — a mixed
 * doc (scene 1 board, scene 2 video) could never render at all. Stage
 * X-full completes the per-scene dispatch: the plan's ENGINE-kind scenes
 * render through their own lanes as single-scene full-quality artifacts
 * (the engine's own clock, own surface, own audio — VO only, no bed: the
 * video-wide bed rides the compositor's finalize), the compositor-kind
 * scenes keep the existing segment builders, and the compositor stages the
 * engine artifacts through the S143 transcode (engineSegmentVerdict is the
 * admission law).
 *
 * The engine scene mapping law: the scaffold names engine scenes
 * `scene-<index>` after the STORY scene index (voFilesFor's documented
 * contract) — the plan's scene at position i carries sceneIndex, and the
 * engine scene with that id renders. An engine-kind plan scene whose
 * engine doc/project doesn't carry the scene refuses loudly (a data bug,
 * not a render input problem). S167 — the 3D doc is per-video SINGULAR
 * (Video.scene3d): every 3d-kind plan scene renders through THE doc, each
 * into its own outDir (its own artifact, the compositor patches its own
 * clock into the composition windows).
 *
 * Cancellation rides the render job's own guard kind; progress reports
 * through the caller's onProgress (the job's setJobProgress seam).
 */
async function buildEngineSegments(
  video: { id: string; whiteboardProject: string | null; graphicsDoc: string | null; scene3d: string | null },
  renderScenes: { index: number }[],
  plan: CompositionPlan,
  onProgress: (current: number, total: number, label: string) => void
): Promise<(string | null)[]> {
  const segDir = path.join(videoDir(video.id), "engine-segs");
  fs.rmSync(segDir, { recursive: true, force: true });
  fs.mkdirSync(segDir, { recursive: true });
  const total = renderScenes.length;
  const out: (string | null)[] = renderScenes.map(() => null);
  const kindAt = (i: number): PlanVisualKind => plan.scenes[i]?.kind ?? "video";

  // ---- the whiteboard scenes: one full-quality single-scene render each ----
  const wbIdx = renderScenes.map((_, i) => i).filter((i) => kindAt(i) === "whiteboard");
  if (wbIdx.length > 0) {
    const doc = parseWhiteboardDoc(video.whiteboardProject);
    if (!doc) {
      throw new Error(
        `the plan carries ${wbIdx.length} whiteboard-kind scene(s) but the video has no whiteboard project — scaffold one in the Whiteboard Studio (Stage X-full: the compositor consumes engine segments, it cannot draw engine ink itself)`
      );
    }
    const { project, uploadedAssets } = await loadValidatedProject(doc, video.id);
    const voFiles = voFilesFor(project.scenes, video.id);
    for (const i of wbIdx) {
      const sceneIndex = plan.scenes[i]?.sceneIndex ?? renderScenes[i]?.index ?? i + 1;
      const sceneId = `scene-${sceneIndex}`;
      const engineScene = project.scenes.find((s) => s.id === sceneId);
      if (!engineScene) {
        throw new Error(
          `the plan's scene ${sceneIndex} is whiteboard-kind but the project carries no "${sceneId}" — the scaffold names engine scenes scene-<index>; re-scaffold or fix the plan's kinds`
        );
      }
      if (isJobCancelled(video.id, "render")) throw new JobCancelledError();
      onProgress(Math.min(i + 1, total), total, `Drawing scene ${sceneIndex} through the whiteboard engine`);
      const one: WhiteboardProject = { ...project, scenes: [engineScene] };
      const res = await renderWhiteboard(one, {
        outDir: path.join(segDir, `wb-scene-${sceneIndex}`),
        voFiles,
        asrAnchors: true,
        uploadedAssets,
        onProgress: (label, fraction) => {
          if (isJobCancelled(video.id, "render")) throw new JobCancelledError();
          setJobProgress(video.id, "render", Math.max(1, Math.round(fraction * total)), total, `${label} (scene ${sceneIndex})`);
        },
      });
      const file = res.scenes[0]?.file ?? null;
      if (!file || !fs.existsSync(file)) {
        throw new Error(`the whiteboard engine returned no artifact for scene ${sceneIndex}`);
      }
      out[i] = file;
    }
  }

  // ---- the graphics scenes: the SAME treatment through the graphics lane ----
  const gxIdx = renderScenes.map((_, i) => i).filter((i) => kindAt(i) === "graphics");
  if (gxIdx.length > 0) {
    const doc = parseGraphicsDoc(video.graphicsDoc);
    if (!doc) {
      throw new Error(
        `the plan carries ${gxIdx.length} graphics-kind scene(s) but the video has no graphics doc — scaffold one in the Graphics Studio (Stage X-full: the compositor consumes engine segments, it cannot draw engine ink itself)`
      );
    }
    // S126 — the import lane's one-seam resolution (the SAME call the
    // graphics lane's own job makes): missing sprites refuse fail-closed.
    const referencedKeys = doc.scenes
      .flatMap((s) => s.elements.filter((el) => el.kind === "sprite" && el.sprite !== undefined).map((el) => el.sprite?.assetKey ?? ""))
      .filter(Boolean);
    const { assets: spriteAssets, missing: missingImports } = await resolveSpriteAssets(video.id, referencedKeys);
    if (missingImports.length > 0) {
      throw new Error(`unresolved sprite imports (${missingImports.join(", ")}) — re-upload or remove the sprites before rendering`);
    }
    const voFiles = voFilesFor(doc.scenes, video.id);
    for (const i of gxIdx) {
      const sceneIndex = plan.scenes[i]?.sceneIndex ?? renderScenes[i]?.index ?? i + 1;
      const sceneId = `scene-${sceneIndex}`;
      const engineScene = doc.scenes.find((s) => s.id === sceneId);
      if (!engineScene) {
        throw new Error(
          `the plan's scene ${sceneIndex} is graphics-kind but the doc carries no "${sceneId}" — the scaffold names engine scenes scene-<index>; re-scaffold or fix the plan's kinds`
        );
      }
      if (isJobCancelled(video.id, "render")) throw new JobCancelledError();
      onProgress(Math.min(i + 1, total), total, `Composing scene ${sceneIndex} through the graphics engine`);
      const scoped = { ...doc, scenes: [engineScene] };
      const res = await renderGraphics(scoped, {
        outDir: path.join(segDir, `gx-scene-${sceneIndex}`),
        voFiles,
        spriteAssets,
        onProgress: (label, fraction) => {
          if (isJobCancelled(video.id, "render")) throw new JobCancelledError();
          setJobProgress(video.id, "render", Math.max(1, Math.round(fraction * total)), total, `${label} (scene ${sceneIndex})`);
        },
      });
      const file = res.scenes[0]?.file ?? null;
      if (!file || !fs.existsSync(file)) {
        throw new Error(`the graphics engine returned no artifact for scene ${sceneIndex}`);
      }
      out[i] = file;
    }
  }

  // ---- the 3D scenes (S167): the scene-story engine's rasterized clip
  // joins assembly — the recorded Part 0.3 gap ("scene-3d.mp4 is never
  // assembled") closes here, the S143 way. The video's scene3d doc IS the
  // engine scene (per-video singular); a missing doc refuses loudly.
  const d3Idx = renderScenes.map((_, i) => i).filter((i) => kindAt(i) === "3d");
  if (d3Idx.length > 0) {
    const doc = parseScene3D(video.scene3d);
    if (!doc) {
      throw new Error(
        `the plan carries ${d3Idx.length} 3d-kind scene(s) but the video has no 3D scene doc — scaffold one in the 3D panel (S167: the compositor consumes engine segments, it cannot rasterize 3D ink itself)`
      );
    }
    for (const i of d3Idx) {
      const sceneIndex = plan.scenes[i]?.sceneIndex ?? renderScenes[i]?.index ?? i + 1;
      if (isJobCancelled(video.id, "render")) throw new JobCancelledError();
      onProgress(Math.min(i + 1, total), total, `Rasterizing scene ${sceneIndex} through the 3D engine`);
      const res = await renderScene3D(doc, {
        outDir: path.join(segDir, `3d-scene-${sceneIndex}`),
        onProgress: (label, fraction) => {
          if (isJobCancelled(video.id, "render")) throw new JobCancelledError();
          setJobProgress(video.id, "render", Math.max(1, Math.round(fraction * total)), total, `${label} (scene ${sceneIndex})`);
        },
      });
      if (!fs.existsSync(res.file)) {
        throw new Error(`the 3D engine returned no artifact for scene ${sceneIndex}`);
      }
      out[i] = res.file;
    }
  }

  return out;
}

/** S154 — the liveliness ledger's durable summary: the per-scene notes
 *  (what actually played and why) appended to the completion Activity
 *  message. Capped at six notes — the feed stays readable; a deck of
 *  identical decisions carries ONE representative note. Empty → "" (the
 *  message is byte-identical when nothing degraded). */
function buildLedgerNotes(ledger: LivelinessDecision[] | undefined): string {
  if (!ledger || ledger.length === 0) return "";
  const noted = ledger.filter((d) => d.reason && d.reason.length > 0);
  if (noted.length === 0) return "";
  const picked =
    noted.length <= 6
      ? noted
      : [...noted.slice(0, 5), noted[noted.length - 1]];
  const suffix = noted.length > 6 ? ` (+${noted.length - 6} more)` : "";
  return ` — per-scene: ${picked.map((d) => `s${d.sceneIndex} ${d.reason.slice(0, 80)}`).join("; ")}${suffix}`;
}

/** 2026-11 truth fix — the render gate's voiceover refusal heals the row's
 *  stale flag. PURE (message in, patch out) so the unit suite pins the
 *  contract: ONLY the per-scene WAV refusal (the one message that means
 *  "the files are genuinely gone") clears hasVoiceover + audioDuration;
 *  every other render failure keeps the row's voiceover truth untouched.
 *  The repair path is one click: the UI's "Generate voice" card reads the
 *  same flag, and the voiceover stage republishes every read to storage. */
export function voiceoverGateFailurePatch(
  message: string
): { error: string; hasVoiceover?: false; audioDuration?: null } {
  if (/Scene \d+ has no voiceover/.test(message))
    return { error: message, hasVoiceover: false, audioDuration: null };
  return { error: message };
}

export async function runRenderJob(
  videoId: string,
  opts: RenderJobOptions = {}
): Promise<void> {
  const ctx = assertCtx("runRenderJob");
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return;
  if (video.format !== "story") return;

  // S87 slice 3 — the shared path: POST /render routes whiteboard videos to
  // their engine lane (peer at the engine level, unified at the contract
  // level), and a stale durable replay or a bypassed caller that reaches
  // THIS entry DELEGATES rather than refusing — the S67 refusal is retired.
  // runWhiteboardJob quietly no-ops when the mode flipped back (the
  // symmetric mode-drift law), so a replay honors the row's latest truth.
  // S123 — the graphics lane rides the SAME shared path (the engine lanes
  // are a set, not a case).
  if (video.renderMode === "whiteboard") {
    return runWhiteboardJob(videoId);
  }
  if (video.renderMode === "graphics") {
    return runGraphicsJob(videoId);
  }

  const scenes = parseScenes(video.scenes);
  if (scenes.length === 0)
    throw new Error("Video has no scenes — generate the scene script first");

  // S114 — the scene-preview lane: ONE scene, the same segment machinery,
  // scene-preview-NN.mp4. Nothing else moves — the preview is a LOOK at
  // one scene, not a certified output (the proposal's law: "a scene preview
  // is not a certified final video").
  if (Number.isInteger(opts.sceneIndex) && (opts.sceneIndex as number) >= 1) {
    return runScenePreviewJob(videoId, video, scenes, opts.sceneIndex as number, opts);
  }

  // S116 — the boundary-pair lane: scenes N + N+1 with their seam, the
  // media the scene recheck's boundary lens measures. Same law: nothing
  // else moves, nothing is certified.
  if (Number.isInteger(opts.boundaryAfter) && (opts.boundaryAfter as number) >= 1) {
    return runBoundaryPreviewJob(videoId, video, scenes, opts.boundaryAfter as number, opts);
  }

  // Same defaults the route applies to a missing body field, so a payload-less
  // crash resume renders what the user saw on the button they clicked.
  const mode = ["animated", "stock", "slides"].includes(opts.mode ?? "")
    ? (opts.mode as "animated" | "stock" | "slides")
    : "kenburns";
  // Stage 6 (T-6.8): per-RENDER override wins; else the per-PROJECT default
  // (Video.burnCaptions — null/undefined = follow the mode's natural default:
  // slides mode burns no captions; everything else burns).
  const projectBurn = video.burnCaptions === true || video.burnCaptions === false ? video.burnCaptions : null;
  const subtitles =
    opts.subtitles ?? (projectBurn !== null ? projectBurn : mode !== "slides"); // slides default: no burned captions
  const smartCaptions = opts.smartCaptions !== false; // default: ASR-synced cues
  const sceneLimit =
    Number.isInteger(opts.sceneLimit) && (opts.sceneLimit as number) >= 1
      ? Math.min(opts.sceneLimit as number, scenes.length)
      : undefined;

  // S117 — THE ASSEMBLY: what a FINAL may consume per scene (the latest
  // APPROVED revision; nothing approved → the v1 baseline; no history →
  // the row). Draft edits never leak into a final. Scene previews and
  // boundary pairs deliberately bypass the assembly — they are LOOKS at
  // the working draft. `changed` false = the row verbatim (every
  // never-edited video takes the fast path).
  const assembly = await resolveRenderAssembly(video);
  const isPreviewRender = sceneLimit != null && sceneLimit < scenes.length;
  const renderScenes = isPreviewRender ? scenes : assembly.scenes;
  // Stage 6 (T-6.8) — per-render override > per-project default > 30.
  // Slides mode always renders 9:16 (keynote deck geometry); an explicit
  // 1:1 is honored only for non-slides modes.
  const aspect: "16:9" | "9:16" | "1:1" =
    mode === "slides"
      ? "9:16"
      : opts.aspectRatio ??
        (video.aspectRatio === "9:16" || video.aspectRatio === "1:1" || video.aspectRatio === "16:9"
          ? video.aspectRatio
          : "16:9");
  const frameRate = opts.frameRate ?? (video.frameRate === 24 || video.frameRate === 60 ? video.frameRate : 30);

  // Stage 6 (T-6.10) — per-scene duration overrides from the assembled timeline.
  // Precedence: per-render opts.sceneDurationsSec > Video.timeline (per-scene
  // durationSec) > measured WAV durations (the render's own default). An
  // explicit empty array on opts disables timeline consumption (the route
  // uses this when the user clicks "render without timeline"). The render's
  // own safety clamps (MIN_SEG_SEC + 3× the measured narration) still apply.
  let sceneDurationsSec: number[] | undefined;
  // S2 — the doc's edited projection (per-scene transitions, audio levels,
  // captions) rides along whenever the doc is aligned. "Render without
  // timeline" (explicit empty durations) drops it with the durations.
  let docScenes: DocSceneSettings[] | null = null;
  // S3 — delivery quality: the render button's explicit pick wins; the
  // timeline doc's renderPrefs (the export-preset card saves there) is the
  // fallback; standard otherwise.
  let docQuality: ExportQuality | undefined;
  // S6 — the doc's caption-style pick (the studio's caption look). Resolved
  // with the SAME aligned-doc condition as the durations: a doc that is not
  // trusted for timing is not trusted for looks either.
  let docCaptionStyle: string | null = null;
  // S7 — the doc's music pick (the studio's score: auto/mood/pinned/off).
  // Same aligned-doc condition; "off" mutes the bed outright (true silence —
  // not the drone fallback a null resolver result would produce).
  let docMusic: MusicPick | null = null;
  // S87 slice 2 — the composition plan rides the render whenever the doc
  // is aligned: schema-2 docs read the TRACKS projection (origin "tracks"
  // — the compositor's contract read), v1 docs and misaligned-tracks docs
  // read the scenes list (fail-open, never a half-read plan). The plan
  // owns the composition clock (windows, boundary transitions, per-scene
  // visual kind + asset source); the settings projection (docScenes) keeps
  // owning levels/captions/creative in both paths.
  let timelinePlan: CompositionPlan | null = null;
  if (Array.isArray(opts.sceneDurationsSec)) {
    sceneDurationsSec = opts.sceneDurationsSec;
  } else {
    // S117 — finals read the ASSEMBLY's timeline (revision doc-scenes
    // swapped in — the union slice's doc half); previews read the row's
    // (drafts are what previews are for).
    const timeline = parseTimeline(
      isPreviewRender ? (video.timeline ?? null) : (assembly.timeline ?? null)
    );
    if (timeline && timeline.scenes.length === scenes.length) {
      timelinePlan = compositionPlan(timeline, scenes.length);
      if (timelinePlan) {
        const ds = timelinePlan.scenes.map((s) => s.durationSec);
        // Only honor when every entry is a positive finite number — a single
        // bad value falls back to the WAV-derived durations for ALL scenes
        // (a half-overridden timeline would produce a broken render). The
        // plan's derivations already validate this; the guard stays as the
        // one law at the feed boundary.
        if (ds.every((d) => typeof d === "number" && Number.isFinite(d) && d > 0)) {
          sceneDurationsSec = ds;
        }
      }
      docScenes = docSceneSettings(timeline, scenes.length);
      docQuality = timeline.renderPrefs?.quality ?? undefined;
      docCaptionStyle = timeline.renderPrefs?.captionStyle ?? null;
      docMusic = docMusicPick(timeline.renderPrefs);
    }
  }

  if (!video.hasStoryboard && mode !== "slides")
    throw new Error("Generate the storyboard first — there is no scene art yet");
  if (!video.hasVoiceover)
    throw new Error("Generate the voiceover first — narration drives the scene timing");

  // Resolve the library track (null → synthesized drone fallback in render.ts).
  // Module E — the APPROVED plan's audio direction: music mood + ducking
  // feed the music resolver (manual per-video overrides still win); pacing
  // was already applied at voiceover synthesis time.
  const planAudio = await getApprovedAudioMap(videoId);
  // S7 (audit) — one flag truth (musicBedActive): the body option can force
  // silence, the doc pick re-tops the chain ("off" → true silence — the
  // FLAG, not a resolver null, is what switches the finalizer's drone
  // fallback off; any other pick overrides the row/Settings chain), and
  // with no pick the pre-S7 chain decides. Until this audit the Settings
  // master switch never actually silenced a render: its resolver null was
  // conflated with "no match" and the finalizer droned anyway — now the
  // flag honors isMusicEnabledForVideo's own documented contract.
  const music =
    opts.music !== false &&
    musicBedActive(docMusic, await isMusicEnabledForVideo(video));
  const resolved = music ? await resolveMusicForVideo(video, planAudio.musicMood, docMusic) : null;
  const duckFallback = music ? await resolveDuckingForVideo(video, planAudio.ducking) : "standard";
  const sfx = await getSfxEnabled();
  const musicTrack = resolved
    ? {
        filePath: trackAbsolutePath(resolved.track),
        gain: resolved.gain,
        fadeInSec: resolved.fadeInSec,
        fadeOutSec: resolved.fadeOutSec,
        duckIntensity: resolved.duckIntensity,
      }
    : null;

  // Scene transitions: per-video override (null = built-in crossfade 0.5s;
  // a slides row with no pick hard-cuts — S15's shared resolveTransition is
  // the one law the studio picker shows too).
  const transition = resolveTransition(video, mode);

  // Brand kit (keynote slides): accent recolor + corner logo badge.
  const brand = mode === "slides" ? await slideBrandFor(videoId, video.brandAccent, video.brandLogoOn) : null;

  // S93 — the character rig's eligibility: a portrait-backed cast character
  // (the rig reads nothing else — the identity anchors stay untouched).
  // S125 (K1) — the raw rig columns ride along (additive; render.ts parses
  // them — junk/null = no rig, the byte-identical legacy path).
  const rigCharacter = video.characterId
    ? await db.character.findUnique({
        where: { id: video.characterId },
        select: { hasPortrait: true, rigDoc: true, parts: true },
      })
    : null;

  try {
    // S143 (Stage X-full, the audit's F5) — the mixed-engine dispatch: a plan
    // carrying ENGINE kinds collects each engine scene's artifact BEFORE the
    // compositor runs (the engine lane draws its ink — the S87 slice-3 law;
    // the compositor only stages the artifact). A pure-compositor plan (every
    // doc the engines write today) never enters the dispatcher — the
    // pre-S143 path rides byte-identical. A misaligned plan (length ≠ the
    // rendered scene list) falls to null: the wall's verdict then refuses
    // any engine kind, fail-closed.
    const engineSegments =
      timelinePlan &&
      timelinePlan.scenes.length === renderScenes.length &&
      timelinePlan.scenes.some((s) => s.kind === "whiteboard" || s.kind === "graphics" || s.kind === "3d")
        ? await buildEngineSegments(
            { id: videoId, whiteboardProject: video.whiteboardProject, graphicsDoc: video.graphicsDoc, scene3d: video.scene3d },
            renderScenes,
            timelinePlan,
            (current, total, label) => {
              if (isJobCancelled(videoId, "render")) throw new JobCancelledError();
              setJobProgress(videoId, "render", current, total, label);
            }
          )
        : null;
    const result = await renderVideo({
      videoId,
      scenes: renderScenes,
      mode,
      character: rigCharacter
        ? {
            hasPortrait: rigCharacter.hasPortrait,
            rigDoc: rigCharacter.rigDoc,
            parts: rigCharacter.parts,
          }
        : null,
      burnSubtitles: subtitles,
      smartCaptions,
      music,
      musicNiche: video.niche,
      musicTrack,
      musicDuck: duckFallback,
      sfx,
      sceneLimit,
      aspectRatio: aspect,
      frameRate,
      quality: opts.quality ?? docQuality,
      captionStyleId: docCaptionStyle,
      sceneDurationsSec,
      docScenes,
      timelinePlan,
      stagedEngineSegments: engineSegments ?? undefined,
      motion: sanitizeMotion({
        mode: video.motionMode,
        intensity: video.motionIntensity,
        curve: video.motionCurve,
        vary: video.motionVary,
      }),
      motionContext: { tone: video.tone, niche: video.niche },
      topic: video.topic,
      transition,
      brand,
      onProgress: (current, total, label) => {
        if (isJobCancelled(videoId, "render")) throw new JobCancelledError();
        setJobProgress(videoId, "render", current, total, label);
      },
    });

    if (result.fileName === "final.mp4") {
      setJobProgress(videoId, "render", scenes.length + 1, scenes.length + 1, "Running quality checks");
      // Stage 5 pacing gate: only an APPROVED plan shaped this render, so only
      // an approved plan may be judged by it. Render-mode blanket exemptions:
      // "animated" (i2v) and "stock" move every scene whatever the plan says.
      const approvedPlan =
        video.directorState === "approved" ? parsePlan(video.shotList) : null;
      // S49 (L4) — under a restricted content policy, the restricted-visual
      // scan runs on the rendered file BEFORE the battery emits its report;
      // runRestrictedVisualScan never throws (a crashed scan reports
      // "unmeasured", which the gate holds — fail-closed, never silently
      // clean). Standard policy: no scan, no check, exactly as before.
      //
      // S53 — the advanced visual lenses join the same seam, on the same
      // materialized final.mp4: textScan on EVERY final render (AI imagery
      // is the product; gibberish pseudo-text is its classic defect — the
      // judge excludes deliberate burned captions), subjectScan only for a
      // recurring cast with an identity anchor (the S51 benchmark's
      // color-under-lighting finding lands here as a note, never a false
      // fail). Both never-throw; unmeasured is the honest state.
      const finalPath = await (await import("./storage")).materialize(`${videoId}/final.mp4`);
      const restrictedScan =
        resolveContentPolicy(video.contentPolicy) === "islamic-history"
          ? await runRestrictedVisualScan({
              mp4Path: finalPath,
              durationSec: result.durationSec,
            })
          : undefined;
      const textScan = await runTextArtifactScan({
        mp4Path: finalPath,
        durationSec: result.durationSec,
      });
      let subjectScan:
        | { status: "pass" | "fail" | "unmeasured"; value: string; detail?: string }
        | undefined;
      if (video.characterId) {
        const character = await db.character.findUnique({
          where: { id: video.characterId },
          select: { name: true, identityAnchor: true },
        });
        if (character?.identityAnchor) {
          subjectScan = await runSubjectContinuityScan({
            mp4Path: finalPath,
            durationSec: result.durationSec,
            characterName: character.name,
            anchor: character.identityAnchor,
          });
        }
      }
      const report = await qcForVideo(
        videoId,
        result.durationSec,
        video.audioDuration,
        result.blackWindows,
        aspect,
        approvedPlan,
        {
          i2vEverywhere: mode === "animated",
          stockEverywhere: mode === "stock",
        },
        // S36 — the render just computed the continuity expectation from the
        // exact durations + boundaries it stitched; hold the pixels to it.
        result.expectedCuts ?? null,
        frameRate,
        restrictedScan,
        subjectScan,
        textScan
      );
      await db.video.update({
        where: { id: videoId },
        data: {
          hasVideo: true,
          videoDuration: Math.round(result.durationSec * 10) / 10,
          qcReport: JSON.stringify(report),
          // S117 — the manifest: the exact revision set this final was
          // assembled from. renderStaleness compares it against the current
          // assembly sources; the export/publish gates refuse a stale or
          // unprovable final.
          renderManifest: JSON.stringify(manifestOf(assembly, mode)),
          error: null,
        },
      });
      await db.activity.create({
        data: {
          organizationId: video.organizationId,
          userId: ctx.userId,
          videoId,
          stage: "render",
          level: report.passed ? "info" : "warn",
          message:
            `Video rendered (${mode === "animated" ? "full AI animation" : mode === "stock" ? "stock b-roll" : mode === "slides" ? "keynote slides" : "Ken Burns"}, ` +
            `${Math.round(result.durationSec)}s) — ` +
            `${music ? (resolved ? `music: ${resolved.why}` : "music: synthesized bed") : "no music"}, ` +
            `${music && resolved ? `ducking ${resolved.duckIntensity}, ` : ""}` +
            `${transitionSummary(transition.style, transition.durationSec)}, ` +
            `QC ${report.passed ? "passed" : "flagged " + report.checks.filter((c) => !c.pass).length + " check(s)"}` +
            // S40 — the ship verdict at the moment the render lands, so the
            // operator learns about a hold HERE, not at export time.
            (applyQcPolicy(report, { mode: qcEnforcementMode() }).blocked
              ? " — EXPORT ON HOLD (blocking finding; see QC card)"
              : "") +
            // S154 — THE LIVELINESS LEDGER, PERSISTED. The S35 contract says
            // "the degradation is VISIBLE, never silent" — but the ledger was
            // computed and dropped: a rig/i2v/kinetic fallback lived only in
            // the transient progress label. The durable record rides the
            // completion Activity row (the feed the operator actually reads).
            buildLedgerNotes(result.liveliness),
        },
      });

      // Stage 7 (T-7.5 wiring) — record the render spend. Per-second of the
      // final video (RENDER_MICRO_PER_SEC); the note carries the measured
      // duration so the reconciliation can re-derive the cost. Full renders
      // only — previews are free (the user is iterating on scene 1).
      //
      // Stage 7.1: recordCreditSpend (not spendCredits) — the cost ALREADY
      // happened, so this is accounting truth, not enforcement; it must
      // never be rejected or the ledger would under-report real provider
      // costs (overspend is prevented at the render route's pre-gate).
      // The subscriptionId is auto-resolved by the ledger writer (the old
      // explicit null left every render spend unlinked from its
      // subscription, hiding it from the balance).
      try {
        const billing = await import("./billing");
        await billing.recordCreditSpend({
          userId: ctx.userId,
          kind: "render_minute",
          microCredits: Math.max(1, Math.round(result.durationSec * billing.RENDER_MICRO_PER_SEC)),
          note: `render ${Math.round(result.durationSec)}s ${mode} (qc ${report.passed ? "pass" : "flagged"})`,
        });
      } catch {
        /* billing write is best-effort */
      }
    } else {
      // S45 — preview renders persist their own SCOPED QC evidence. The old
      // branch wrote only hasPreview, so the badge said "not run" over a
      // playable artifact (the S37 live finding). Rules, pinned by
      // previewQcPatch below: preview evidence persists ONLY while no full
      // render stands (a standing final report is never downgraded to
      // scene-1 evidence), and the report carries scope "preview" so the
      // ship gate refuses it as certification of final.mp4. QC itself never
      // fails the render — a crashed battery leaves the preview shippable
      // as a preview (the artifact exists whatever the probes say).
      setJobProgress(videoId, "render", scenes.length + 1, scenes.length + 1, "Running quality checks");
      const approvedPlan =
        video.directorState === "approved" ? parsePlan(video.shotList) : null;
      let previewReport: QcReport | null = null;
      try {
        previewReport = await qcForPreview(
          videoId,
          result.durationSec,
          result.blackWindows,
          aspect,
          approvedPlan,
          {
            i2vEverywhere: mode === "animated",
            stockEverywhere: mode === "stock",
          },
          result.expectedCuts ?? null,
          frameRate
        );
      } catch {
        previewReport = null; // probes crashed — evidence stays absent, never stale
      }
      await db.video.update({
        where: { id: videoId },
        data: previewQcPatch(video.hasVideo, previewReport),
      });
      await db.activity.create({
        data: {
          organizationId: video.organizationId,
          userId: ctx.userId,
          videoId,
          stage: "render",
          message:
            `Preview rendered (scene 1, ${mode === "animated" ? "animated" : "Ken Burns"})` +
            (previewReport
              ? ` — QC ${previewReport.passed ? "passed" : `flagged ${previewReport.checks.filter((c) => c.status !== "pass").length} check(s) (preview scope)`}`
              : ""),
        },
      });
    }
  } catch (err) {
    if (err instanceof JobCancelledError) {
      await db.video.update({ where: { id: videoId }, data: { error: null } });
      await db.activity.create({
        data: {
          organizationId: video.organizationId,
          userId: ctx.userId,
          videoId,
          stage: "render",
          message: "Render cancelled — completed scenes kept, run render again to restart",
        },
      });
      throw err;
    }
    const message = errorText(err, "Render failed");
    // S136 — the S135 ORDER REPAIR, ported to the render lane: the video
    // row's failure state lands FIRST (bounded 500ms-retried second
    // attempt), the Activity row is best-effort AFTER it — the old
    // unguarded order could lose both writes to the post-timeout SQLite
    // writer lock and leave a "rendering" row with no error.
    // 2026-11 truth fix — when the render gate refuses because a scene's
    // voiceover file is genuinely gone (scratch wiped, storage empty), the
    // row's stale hasVoiceover flag is THE lie that keeps the operator
    // clicking Render instead of Generate voice. The refusal heals the flag:
    // the UI flips to the honest "Generate voice" state, the export bundle's
    // chip stops showing a green checkmark for a file that does not exist.
    const writeFailureState = () =>
      db.video
        .update({ where: { id: videoId }, data: voiceoverGateFailurePatch(message) })
        .catch(async () => {
          await new Promise((r) => setTimeout(r, 500));
          return db.video
            .update({ where: { id: videoId }, data: voiceoverGateFailurePatch(message) })
            .catch(() => {});
        });
    await writeFailureState();
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "render",
        level: "error",
        message: `Render failed: ${message}`,
      },
    }).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// short / convert / verify / comments

/** S10 — the short's moment: the doc's standing pick as a scene index the
 * cut centers on; null = the hook heuristic (pickBestScene) decides, the
 * pre-S10 behavior. PURE (doc pick + row scenes in, index-or-null out) so
 * the short job and the probe read the same truth:
 *   • doc pick {mode:"scene", sceneIndex} → that index, WHEN the scene
 *     exists;
 *   • junk, out-of-range, absent or "auto" → null — a hostile index can
 *     only ever fall back to the heuristic, never select a path or crash;
 *   • non-story format → null (the route already refuses those).
 */
export function shortSceneIndexFor(video: {
  format: string;
  scenes: string | null;
  timeline: string | null;
}): number | null {
  if (video.format !== "story") return null;
  const pick: ShortPick | null = docShortPick(
    parseTimeline(video.timeline)?.renderPrefs ?? null
  );
  if (pick?.mode === "scene" && typeof pick.sceneIndex === "number") {
    const exists = parseScenes(video.scenes).some((s) => s.index === pick.sceneIndex);
    if (exists) return pick.sceneIndex;
    // an index the doc can't back falls down to the heuristic — never a crash
  }
  return null;
}

/** Cut the 9:16 vertical Short. The moment resolves body > doc > hook:
 * opts.sceneIndex (an explicit this-request override, the detail dialog's
 * channel) > the doc's standing pick (shortSceneIndexFor) > the hook
 * heuristic inside renderShort. */
export async function runShortJob(
  videoId: string,
  opts: { sceneIndex?: number | null } = {}
): Promise<void> {
  const ctx = assertCtx("runShortJob");
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return;
  if (video.format !== "story") return;

  const scenes = parseScenes(video.scenes);
  if (scenes.length === 0) throw new Error("This video has no scenes");

  // Storage seam (T-3.7): ffmpeg needs the master on local disk.
  const finalPath = await materialize(`${videoId}/final.mp4`);
  if (!fs.existsSync(finalPath))
    throw new Error("Render the final video first — Shorts are cut from the rendered master");

  const sceneIndex =
    Number.isInteger(opts.sceneIndex) && (opts.sceneIndex as number) >= 1
      ? (opts.sceneIndex as number)
      : shortSceneIndexFor(video);
  const source: "body" | "doc" | "auto" =
    sceneIndex != null && opts.sceneIndex === sceneIndex
      ? "body"
      : sceneIndex != null
        ? "doc"
        : "auto";

  try {
    // S70 CI-3 — when the self-containment heuristic picks the moment, the
    // clip's first caption line gets rewritten for cold-start viewers (a
    // garnish, never a dependency: a gateway hiccup keeps the narration's
    // own opening). User-pinned scenes keep their words verbatim. The pick
    // is re-derived through the SAME pure seam renderShort uses (filter +
    // pickBestScene) — same input, same output, no drift.
    let openerOverride: string | null = null;
    if (source === "auto") {
      const candidates = scenes.filter((s) => s.narration && s.visual);
      const autoScene = pickBestScene(candidates);
      if (autoScene) {
        openerOverride = await draftColdStartOpener({
          topic: video.topic,
          sceneNarration: autoScene.narration,
        });
      }
    }
    const result = await renderShort({
      videoId,
      scenes,
      sceneIndex,
      openerOverride,
      motion: sanitizeMotion({
        mode: video.motionMode,
        intensity: video.motionIntensity,
        curve: video.motionCurve,
        vary: video.motionVary,
      }),
      transition: { style: video.transitionStyle, durationSec: video.transitionDuration },
      onProgress: (label) => setJobProgress(videoId, "short", 1, 2, label),
    });

    await db.video.update({
      where: { id: videoId },
      data: {
        hasShort: true,
        shortScene: result.sceneIndex,
        shortDuration: result.durationSec,
        error: null,
      },
    });

    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "short",
        message: `Vertical Short cut from scene ${result.sceneIndex}${
          source === "body"
            ? " (picked this run)"
            : source === "doc"
              ? " (the studio's pick)"
              : result.autoPicked
                ? " (auto-picked)"
                : ""
        } — ${result.durationSec.toFixed(1)}s 9:16`,
      },
    });
  } catch (err) {
    const message = errorText(err, "Short render failed");
    // S136 — the S135 receipt guard, ported to the short lane. The
    // voiceover-gate healing rides along: a short refuses on the same
    // per-scene WAV truth the full render does.
    const writeFailureState = () =>
      db.video
        .update({ where: { id: videoId }, data: voiceoverGateFailurePatch(message) })
        .catch(async () => {
          await new Promise((r) => setTimeout(r, 500));
          return db.video
            .update({ where: { id: videoId }, data: voiceoverGateFailurePatch(message) })
            .catch(() => {});
        });
    await writeFailureState();
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "short",
        level: "error",
        message: `Short render failed: ${message}`,
      },
    }).catch(() => {});
    throw err;
  }
}

/** Upgrade a narration-script video to a scene-based story video. */
export async function runConvertJob(videoId: string): Promise<void> {
  const ctx = assertCtx("runConvertJob");
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return;
  if (video.format === "story") return; // already converted while queued
  if (!video.script || video.script.trim().length < 80)
    throw new Error("Generate the script first — there is nothing to split into scenes");

  try {
    await convertClassicToScenes({ videoId });
  } catch (err) {
    const message = errorText(err, "Conversion failed");
    // S136 — the S135 receipt guard, ported to the convert lane.
    const writeFailureState = () =>
      db.video
        .update({ where: { id: videoId }, data: { error: message } })
        .catch(async () => {
          await new Promise((r) => setTimeout(r, 500));
          return db.video.update({ where: { id: videoId }, data: { error: message } }).catch(() => {});
        });
    await writeFailureState();
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "convert",
        level: "error",
        message: `Scene conversion failed: ${message}`,
      },
    }).catch(() => {});
    throw err;
  }
}

/** ASR-verify the narration against the script. */
export async function runVerifyJob(videoId: string): Promise<void> {
  const ctx = assertCtx("runVerifyJob");
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return;

  try {
    await verifyNarration(videoId);
  } catch (err) {
    const message = errorText(err, "Narration check failed");
    await db.video.update({ where: { id: videoId }, data: { error: message } });
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "verify",
        level: "error",
        message: `Narration check failed: ${message}`,
      },
    });
    throw err;
  }
}

/** Generate the launch-day engagement kit. */
export async function runCommentsJob(videoId: string): Promise<void> {
  const ctx = assertCtx("runCommentsJob");
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: {
      channel: { select: { name: true } },
      character: { select: { name: true } },
    },
  });
  if (!video) return;
  if (!video.script)
    throw new Error("Write the script first — the kit references the video's content");

  try {
    await generateEngagementKit({
      videoId,
      title: video.title ?? video.topic,
      topic: video.topic,
      niche: video.niche,
      tone: video.tone,
      scriptExcerpt: (video.script ?? "").slice(0, 1200),
      channelName: video.channel?.name ?? null,
      characterName: video.character?.name ?? null,
    });
  } catch (err) {
    const message = errorText(err, "Engagement kit failed");
    await db.video.update({ where: { id: videoId }, data: { error: message } });
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "comments",
        level: "error",
        message: `Engagement kit failed: ${message}`,
      },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Stage 5 — AI Director

/** LLM shot-list pass → Video.shotList with directorState "proposed".
 *  The route closure AND the durable-queue handler both call this.
 *  M1 — `profile` selects a production profile (default narrative); the
 *  pass persists `profile: <id>` on the plan. */
export async function runDirectorJob(
  videoId: string,
  opts?: { profile?: string }
): Promise<void> {
  const ctx = assertCtx("runDirectorJob");
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return;
  try {
    await runDirectorPass(videoId, opts);
  } catch (err) {
    const message = errorText(err, "AI Director pass failed");
    await db.video.update({
      where: { id: videoId },
      data: { error: message, directorState: null },
    });
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "director",
        level: "error",
        message: `AI Director pass failed: ${message}`,
      },
    });
    throw err;
  }
}

/** VLM per-scene continuity check → Video.consistency report. */
export async function runContinuityJob(videoId: string): Promise<void> {
  const ctx = assertCtx("runContinuityJob");
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return;
  try {
    await runContinuityCheck(videoId);
  } catch (err) {
    const message = errorText(err, "Continuity check failed");
    await db.video.update({ where: { id: videoId }, data: { error: message } });
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "continuity",
        level: "error",
        message: `Continuity check failed: ${message}`,
      },
    });
    throw err;
  }
}

/**
 * S77 — the Visual Consistency Engine job body: identity (reused) + style
 * batches + the deterministic style contract + repair proposals, one V2
 * report on Video.consistency. `triggered` records HOW the run started
 * (storyboard auto-chain / manual / queue resume) in the report's ledger.
 * S79 — `sceneIndex` routes to the TARGETED re-check: after a single-scene
 * repaint only that scene is re-judged and merged into the prior report.
 */
export async function runConsistencyJob(
  videoId: string,
  triggered: string = "manual",
  sceneIndex?: number
): Promise<void> {
  const ctx = assertCtx("runConsistencyJob");
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return;
  try {
    if (Number.isInteger(sceneIndex) && (sceneIndex as number) >= 1) {
      await runTargetedRecheck(videoId, sceneIndex as number, { triggered });
    } else {
      await runConsistencyEngine(videoId, { triggered });
    }
  } catch (err) {
    const message = errorText(err, "Consistency check failed");
    await db.video.update({ where: { id: videoId }, data: { error: message } });
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "consistency",
        level: "error",
        message: `Consistency check failed: ${message}`,
      },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// thumbnail + variants

/** S9 — the poster's subject: the ONE scene the cover art derives from.
 * PURE (doc pick + row scenes in, scene out) so the thumbnail job, the
 * variants job and the probe all read the same truth:
 *   • doc pick {mode:"scene", sceneIndex} → that row scene, WHEN it exists;
 *   • junk, out-of-range, absent or "auto" → scene 1 (the pre-S9 hook-first
 *     doctrine) — a hostile index can only ever fall back, never select a
 *     path or crash;
 *   • non-story format → null (the concept derives from topic/script).
 */
export function posterSceneFor(video: {
  format: string;
  scenes: string | null;
  timeline: string | null;
}): Scene | null {
  if (video.format !== "story") return null;
  const scenes = parseScenes(video.scenes);
  if (scenes.length === 0) return null;
  const pick: PosterPick | null = docPosterPick(
    parseTimeline(video.timeline)?.renderPrefs ?? null
  );
  if (pick?.mode === "scene" && typeof pick.sceneIndex === "number") {
    const picked = scenes.find((s) => s.index === pick.sceneIndex);
    if (picked) return picked;
    // an index the doc can't back falls down to scene 1 — never a crash
  }
  return scenes[0];
}

/** Concept for the cover art, derived from the CONTENT — S9: the scene the
 * studio PICKS (doc pick > scene 1), or the topic/script for classic
 * videos. */
export async function thumbnailConceptFor(video: {
  format: string;
  scenes: string | null;
  script: string | null;
  topic: string;
  timeline: string | null;
}): Promise<string> {
  const posterScene = posterSceneFor(video);
  if (posterScene)
    return `${posterScene.visual}. Mood: ${posterScene.mood || "cinematic"}`;
  return deriveThumbnailConcept({ topic: video.topic, script: video.script });
}

/** Generate the primary thumbnail (script-matched concept + VLM gate). */
export async function runThumbnailJob(videoId: string): Promise<void> {
  const ctx = assertCtx("runThumbnailJob");
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: {
      character: {
        select: { id: true, name: true, identityAnchor: true, appearance: true, hasPortrait: true },
      },
    },
  });
  if (!video) return;
  if (!video.title)
    throw new Error("Video has no title yet — generate the script first");
  const title = video.title;

  try {
    const concept = await thumbnailConceptFor(video);

    await runQualityGate({
      kind: "thumbnail",
      videoId,
      imagePath: path.join(videoDir(videoId), "thumbnail.png"),
      context: `YouTube thumbnail (${video.thumbStyle} style) for the video "${video.title}" — it should depict: ${concept}`,
      generate: () =>
        generateThumbnail({
          title,
          topic: video.topic,
          style: video.thumbStyle,
          videoId: video.id,
          concept,
          character: video.character ?? null,
        }),
    });

    const fresh = await db.video.findUnique({ where: { id: videoId } });
    const nextStatus = deriveStatus(video, {
      hasThumbnail: true,
      hasVoiceover: fresh?.hasVoiceover ?? video.hasVoiceover,
    });

    await db.video.update({
      where: { id: videoId },
      data: { hasThumbnail: true, status: nextStatus, error: null },
    });

    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "thumbnail",
        message: `Thumbnail generated from the script content (${video.thumbStyle} style${
          (() => {
            const ps = posterSceneFor(video);
            return ps && ps.index !== 1 ? `, scene ${ps.index} “${ps.title}”` : "";
          })()
        })${
          video.character ? ` featuring ${video.character.name}` : ""
        } for "${video.title}"`,
      },
    });
  } catch (err) {
    const message = errorText(err, "Thumbnail failed");
    await db.video.update({
      where: { id: videoId },
      data: { status: "failed", error: message },
    });
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "thumbnail",
        level: "error",
        message: `Thumbnail failed: ${message}`,
      },
    });
    throw err;
  }
}

/** Generate the A/B thumbnail set (same concept, three styles). */
export async function runVariantsJob(videoId: string): Promise<void> {
  const ctx = assertCtx("runVariantsJob");
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return;
  if (!video.title)
    throw new Error("Video has no title yet — generate the script first");
  const title = video.title;

  try {
    const styles = pickVariantStyles(video.thumbStyle, 3);

    // One concept per set — every variant paints the SAME story moment in a
    // different style, so A/B testing compares style, not subject. S9: the
    // moment is the one the studio PICKS (doc pick > scene 1) — the same
    // posterSceneFor truth the primary thumbnail job reads.
    const posterScene = posterSceneFor(video);
    const concept = posterScene
      ? `${posterScene.visual}. Mood: ${posterScene.mood || "cinematic"}`
      : await deriveThumbnailConcept({ topic: video.topic, script: video.script });

    for (const style of styles) {
      await generateThumbnail({
        title,
        topic: video.topic,
        style,
        videoId: video.id,
        variant: true,
        concept,
      });
      // Ensure a primary thumbnail exists — promote the first variant
      if (!(await readMedia(video.id, "thumbnail.png"))) {
        await promoteVariant(video.id, style);
      }
    }

    const nextStatus = deriveStatus(video, { hasThumbnail: true });
    await db.video.update({
      where: { id: videoId },
      data: { hasThumbnail: true, status: nextStatus, error: null },
    });

    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "thumbnail",
        message: `A/B thumbnail set generated for "${video.title}" (${styles.length} styles${
          (() => {
            const ps = posterSceneFor(video);
            return ps && ps.index !== 1 ? `, from scene ${ps.index} “${ps.title}”` : "";
          })()
        })`,
      },
    });
  } catch (err) {
    const message = errorText(err, "Variant generation failed");
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "thumbnail",
        level: "error",
        message: `A/B thumbnail set failed: ${message}`,
      },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// keynote slides (single-slide re-roll)

/**
 * Re-design ONE keynote slide. entityId is "<videoId>#slide<N>" — the durable
 * encoding the route already uses, so the payload needs nothing.
 */
export async function runSlideJob(entityId: string): Promise<void> {
  const ctx = assertCtx("runSlideJob");
  const [videoId, suffix] = splitEntityId(entityId, "#slide");
  const sceneIndex = suffix !== null ? Number(suffix) : NaN;
  if (!Number.isInteger(sceneIndex) || sceneIndex < 1)
    throw new Error("Slide job has no valid scene index");

  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return;
  if (video.format !== "story") return;

  const scenes = parseScenes(video.scenes);
  if (scenes.length === 0) return;
  const scene = scenes.find((s) => s.index === sceneIndex);
  if (!scene) return;
  const position = scenes.findIndex((s) => s.index === sceneIndex);

  try {
    // 1) Ensure a deck exists — a video can be re-rolled before its first
    //    slides render (the deck would otherwise only appear at render time).
    let deck = loadSlideDeck(videoId);
    if (!deck || deck.length < scenes.length) {
      const planned = await planSlides(videoId, scenes, {
        topic: video.topic,
        niche: video.niche,
        tone: video.tone,
      });
      deck = planned.specs;
    }
    const previous = deck[position] ?? null;

    // 2) Fresh design for exactly this slide.
    const hasArt = fs.existsSync(
      path.join(videoDir(videoId), `scene-${String(sceneIndex).padStart(2, "0")}.png`)
    );
    const { spec, source } = await rerollSlideSpec(
      scene,
      { topic: video.topic, niche: video.niche, tone: video.tone },
      previous,
      { hasImage: hasArt }
    );
    saveSlideSpecAt(videoId, position, spec);

    // 3) Re-screenshot just this slide with the brand kit applied.
    const brand = await slideBrandFor(videoId, video.brandAccent, video.brandLogoOn);
    await renderSlidePngs(videoId, [{ scene, spec }], { force: true, brand });

    // 4) The rendered video embeds the old slide — it is stale now. S113:
    // scene-scoped — only THIS scene's clip (+ the video-level renders)
    // dies; the other slides' clips survive.
    await invalidateRenderedArtifacts(videoId, { sceneIndex });
    await db.video.update({
      where: { id: videoId },
      data: { hasVideo: false, videoDuration: null, error: null },
    });
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "storyboard",
        message: `Slide ${sceneIndex} re-designed (${source === "llm" ? "fresh AI take" : "deterministic fallback"}): "${spec.headline.slice(0, 60)}"`,
      },
    });
  } catch (err) {
    const message = errorText(err, "Slide redesign failed");
    await db.video.update({ where: { id: videoId }, data: { error: message } });
    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "storyboard",
        level: "error",
        message: `Slide ${sceneIndex} redesign failed: ${message}`,
      },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// S67 — the Whiteboard Engine (E9 Phase A): full renders + scene previews.
//
// entityId contract (the `#`-split the scene/slide jobs use):
//   `<videoId>`              — full render: every scene, project fps + size,
//                              narration WAVs when present, the house music
//                              bed when enabled; artifact = the STANDARD
//                              `${videoId}/final.mp4` (the player, the QC
//                              battery, and the ship gate work unchanged),
//                              per-scene encodes under `whiteboard/`.
//   `<videoId>#wb<sceneId>`  — single-scene preview: 720p/24fps, no music
//                              bed; artifact `whiteboard/preview-<sceneId>.mp4`,
//                              sets `hasPreview` (the T-3.7 flag).
//
// $0 native rendering (design §1 law 5): no generation API is touched — no
// spend is recorded, unlike the compositor render job.
// ---------------------------------------------------------------------------

/** Load + validate the doc's project against the LIVE merged library
 *  (built-ins + this video's uploads, S69). Returns the normalized project
 *  + the upload assets (the renderer needs them — its own loadLibrary
 *  merges the same list) or throws with the validator's verbatim errors
 *  (the design §4 law: no second error vocabulary). */
async function loadValidatedProject(
  doc: WhiteboardDoc,
  videoId: string
): Promise<{ project: WhiteboardProject; uploadedAssets: WhiteboardAsset[] }> {
  const { lib, uploadedAssets } = await loadVideoLibrary(videoId);
  const { project, errors } = validateWhiteboardProject(doc.project, lib.libraryIndex);
  if (!project) {
    throw new Error(
      `The whiteboard project is invalid — open the Whiteboard Studio to fix it: ${errors.slice(0, 3).join(" · ")}`
    );
  }
  return { project, uploadedAssets: [...uploadedAssets.values()] };
}

/** The narration WAVs that actually exist, keyed by engine scene id — the
 *  ONE mapping law both engine lanes ride (the S123 no-private-copies
 *  generalization: the graphics doc's scaffold scenes carry the same
 *  `scene-<n>` ids). The scaffold names scenes `scene-<index>` after the
 *  story scene index — the only mapping the WAV layout (sceneWavFile)
 *  supports; hand-authored scene ids ride the narration estimate
 *  (documented Phase A degradation). */
function voFilesFor(scenes: readonly { id: string }[], videoId: string): Map<string, string> {
  const voFiles = new Map<string, string>();
  for (const scene of scenes) {
    const m = /^scene-(\d+)$/.exec(scene.id);
    if (!m) continue;
    const index = Number(m[1]);
    if (!Number.isInteger(index) || index < 1 || index > 999) continue;
    const wav = path.join(videoDir(videoId), sceneWavFile(index));
    if (fs.existsSync(wav)) voFiles.set(scene.id, wav);
  }
  return voFiles;
}

/** Progress → the jobs surface, with the cancellation checkpoint. Throwing
 *  JobCancelledError from onProgress aborts the engine between frames;
 *  scene granularity is what the design promises and what lands. The
 *  engine lanes share ONE guard (S123: the graphics lane rides the same
 *  contract, not a copy). */
function engineProgressGuard(entityId: string, kind: "whiteboard" | "graphics") {
  return (label: string, fraction: number): void => {
    if (isJobCancelled(entityId, kind)) throw new JobCancelledError();
    setJobProgress(entityId, kind, Math.round(fraction * 100), 100, label);
  };
}

export async function runWhiteboardJob(
  entityId: string,
  opts: { sceneId?: string } = {}
): Promise<void> {
  const ctx = assertCtx("runWhiteboardJob");
  const [videoId, wbSuffix] = splitEntityId(entityId, "#wb");
  const sceneId = opts.sceneId ?? wbSuffix ?? null;

  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return; // deleted while queued — end quietly
  if (video.renderMode !== "whiteboard") return; // mode changed while queued
  const doc = parseWhiteboardDoc(video.whiteboardProject);
  if (!doc) {
    throw new Error(
      "No whiteboard project on this video yet — open the Whiteboard Studio and scaffold one first"
    );
  }
  const { project, uploadedAssets } = await loadValidatedProject(doc, videoId);

  const outDir = path.join(videoDir(videoId), "whiteboard");
  fs.mkdirSync(outDir, { recursive: true });

  try {
    if (sceneId !== null) {
      // ---- single-scene preview: 720p/24fps, no music bed (design §4) ----
      const scene = project.scenes.find((s) => s.id === sceneId);
      if (!scene) {
        throw new Error(`Whiteboard scene "${sceneId}" does not exist in this project`);
      }
      const scale = 720 / project.height;
      const previewProject: WhiteboardProject = {
        ...project,
        width: Math.max(320, Math.round((project.width * scale) / 2) * 2),
        height: 720,
        fps: 24,
        scenes: [scene],
      };
      const voFiles = voFilesFor(previewProject.scenes, videoId);
      const result = await renderWhiteboard(previewProject, {
        outDir,
        voFiles,
        asrAnchors: true,
        onProgress: engineProgressGuard(entityId, "whiteboard"),
        uploadedAssets,
      });
      const key = `${videoId}/whiteboard/preview-${sceneId}.mp4`;
      await putFromPath(key, result.file);
      // S68 — the STANDARD preview key too: hasPreview/previewUrl is the
      // product-wide contract, and the mp4 route streams `${videoId}/
      // preview.mp4` (statVideoFile), exactly like the story lane. Writing
      // only the namespaced copy left the DTO advertising a 404 — a lying
      // badge the S68 e2e caught live. The copy re-reads the LANDED
      // object: putFromPath RENAMES the render output into the namespaced
      // key when both live in the same directory (its zero-copy fast
      // path), so a second putFromPath on result.file would stat a
      // renamed-away source — the exact ENOENT the S68 driver run pinned
      // on 2026-11-09. The namespaced copy stays for per-scene history;
      // invalidateRenderedArtifacts already deletes BOTH keys on the next
      // doc edit (the sweep pattern predates this), and both keys occupy
      // org bytes, so both are quota-attributed like any other put.
      await put(`${videoId}/preview.mp4`, await get(key));
      await db.video.update({ where: { id: videoId }, data: { hasPreview: true, error: null } });
      await db.activity.create({
        data: {
          organizationId: video.organizationId,
          userId: ctx.userId,
          videoId,
          stage: "render",
          message: `Whiteboard preview rendered — scene "${sceneId}" (720p, ${voFiles.size > 0 ? "with narration" : "silent draft"})`,
        },
      });
      return;
    }

    // ---- full render: the project's own size/fps, VO + the music bed ----
    const voFiles = voFilesFor(project.scenes, videoId);
    let musicPath: string | null = null;
    let musicWhy = "no music";
    if (await isMusicEnabledForVideo(video)) {
      const planAudio = await getApprovedAudioMap(videoId);
      const resolved = await resolveMusicForVideo(video, planAudio.musicMood, null);
      if (resolved) {
        musicPath = trackAbsolutePath(resolved.track);
        musicWhy = `music: ${resolved.why}`;
      }
    }

    const result = await renderWhiteboard(project, {
      outDir,
      voFiles,
      musicPath: musicPath ?? undefined,
      asrAnchors: true,
      onProgress: engineProgressGuard(entityId, "whiteboard"),
      uploadedAssets,
    });

    // Probe the render BEFORE it lands: putFromPath's local-driver fast
    // path RENAMES the source into the storage key (the S68 receipt's
    // exact trap), so a probe AFTER the put stats a moved-away file and
    // the row records 0.0s — the E12 queue drill caught this live (the
    // recovery render landed, the duration probed 0). Under the S3 driver
    // the scratch copy stays, which is why production never saw it.
    // S136 — THE PROBE WALL (the Stabilisation Gate, gate 4's blind spot):
    // the old `?? 0` turned an unmeasurable file into a LANDED 0.0s
    // "playable" row — the exact failure shape that hid S130's
    // render-killer behind green flags. A render that cannot prove a
    // readable duration is a failed render: throw, and the catch path's
    // receipt records the honest error.
    const probedDuration = await probeDurationSec(result.file);
    if (probedDuration === null || probedDuration <= 0) {
      throw new Error(
        `the whiteboard render probed ${probedDuration === null ? "unreadable" : `${probedDuration}s`} — ffprobe found no playable duration; refusing to land a 0.0s "playable" row (the S136 wall)`
      );
    }
    const durationSec = probedDuration;

    // The standard key — the existing player route, QC battery and ship gate
    // never learn whiteboard exists (the design's "peer MODE" law).
    await putFromPath(`${videoId}/final.mp4`, result.file);
    // Per-scene encodes (design §2.3) — Phase B's scene re-render swaps one
    // of these and concats; Phase A stores them so that path is honest.
    // S113 — each encode registers as a scene artifact (type video, the
    // whiteboard lane's provenance: the doc slice it was rendered from is
    // the input of record). $0 local encodes — no cost attribution rides.
    for (let i = 0; i < result.scenes.length; i++) {
      const key = `${videoId}/whiteboard/scene-${i + 1}.mp4`;
      await putFromPath(key, result.scenes[i].file);
      await registerSceneArtifact({
        video,
        sceneIndex: i + 1,
        type: "video",
        storageKey: key,
        input: `whiteboard-encode|scene=${i + 1}|doc=${video.whiteboardProject ?? ""}`,
        prompt: null,
        bytes: null,
      });
    }

    await db.video.update({
      where: { id: videoId },
      data: {
        hasVideo: true,
        videoDuration: Math.round(durationSec * 10) / 10,
        error: null,
        // W6 — the whiteboard final now records the S117 manifest (it
        // never did — a latent staleness gap: a whiteboard video with
        // revision history could not PROVE its assembly), and each entry
        // stamps the board policy the render consumed (additive field).
        renderManifest: JSON.stringify(
          manifestOf(await resolveRenderAssembly(video), "whiteboard", result.boardModes)
        ),
      },
    });

    // The QC battery rides the standing final.mp4 (runQcJob re-derives
    // everything from the row). A crashed battery never fails the render —
    // the artifact exists whatever the probes say (the S45 law).
    try {
      await runQcJob(videoId);
    } catch {
      /* QC evidence stays absent — never stale */
    }

    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "render",
        message: `Whiteboard rendered (${project.scenes.length} scene${project.scenes.length === 1 ? "" : "s"}, ${Math.round(durationSec)}s, ${voFiles.size > 0 ? "narrated" : "silent draft"}, ${musicWhy})`,
      },
    });
  } catch (err) {
    if (err instanceof JobCancelledError) {
      await db.video.update({ where: { id: videoId }, data: { error: null } });
      await db.activity
        .create({
          data: {
            organizationId: video.organizationId,
            userId: ctx.userId,
            videoId,
            stage: "render",
            message: "Whiteboard render cancelled — completed scenes kept, run it again to restart",
          },
        })
        .catch(() => {});
      throw err;
    }
    const message = errorText(err, "Whiteboard render failed");
    await db.video.update({ where: { id: videoId }, data: { error: message } });
    await db.activity
      .create({
        data: {
          organizationId: video.organizationId,
          userId: ctx.userId,
          videoId,
          stage: "render",
          level: "error",
          message: `Whiteboard render failed: ${message}`,
        },
      })
      .catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// S123 (G1) P3 — the graphics engine lane. Mirror of the whiteboard lane's
// job shape: the SAME artifacts (the STANDARD `${videoId}/final.mp4` — the
// player, the QC battery and the ship gate never learn graphics exists,
// the peer-MODE law), per-scene encodes under `graphics/`, labelled
// drafts that certify NOTHING.
//
//   `<videoId>`               — full render: the doc's own surface/fps, VO
//                              slots (the WAV mapping, voFilesFor) when
//                              present, the house music bed when enabled;
//                              artifact = the STANDARD final.mp4 + the S117
//                              manifest (mode "graphics").
//   `<videoId>#g<sceneId>`    — single-scene DRAFT at a viewport scale
//                              (default 0.5×): the b6 draft law — labelled
//                              non-reviewable, `inherited_review_credit:
//                              false`, artifact
//                              `graphics/draft-scene-<id>-<scale>.mp4`.
//                              Never touches hasVideo/final/manifest — a
//                              draft can never certify or shadow.
//   `<videoId>` + draft body  — the whole-doc look at a scale (payload
//                              { draft: true, scale }) — same law, artifact
//                              `graphics/draft-full-<scale>.mp4`.
//
// $0 native rendering (design §1 law 5): no generation API is touched —
// no spend is recorded, unlike the compositor render job. The preflight
// wall (the DELIVERED frame arithmetic at doc.fps, R-1) fires inside
// renderGraphics BEFORE chromium launches — a refused budget never
// reaches the rasterizer.
// ---------------------------------------------------------------------------

export interface GraphicsJobOptions {
  /** The scene id for a single-scene draft (the #g suffix is the durable
   *  truth; the payload is the tolerant resume path). */
  sceneId?: string;
  /** The draft viewport scale (∈ {0.5, 0.75, 1.0}); default 0.5. */
  scale?: number;
  /** True = the whole-doc look (no scene id needed). */
  draft?: boolean;
}

export async function runGraphicsJob(
  entityId: string,
  opts: GraphicsJobOptions = {}
): Promise<void> {
  const ctx = assertCtx("runGraphicsJob");
  const [videoId, gSuffix] = splitEntityId(entityId, "#g");
  const sceneId = opts.sceneId ?? gSuffix ?? null;
  const isDraft = opts.draft === true || sceneId !== null;
  const scale = isGraphicsDraftScale(opts.scale) ? opts.scale : 0.5;

  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return; // deleted while queued — end quietly
  if (video.renderMode !== "graphics") return; // mode changed while queued
  const doc = parseGraphicsDoc(video.graphicsDoc);
  if (!doc) {
    throw new Error(
      "No graphics doc on this video yet — scaffold one in the Graphics Studio first"
    );
  }

  const outDir = path.join(videoDir(videoId), "graphics");
  fs.mkdirSync(outDir, { recursive: true });

  // S126 — the import lane's one-seam resolution: the doc's referenced
  // sprite keys resolve through the import store (data URIs for the compose
  // ctx). Missing keys surface from the resolver and the render REFUSES
  // fail-closed (the G1-IMP lens's enforcement half — a silently missing
  // sprite would ship a lie).
  const referencedKeys = doc.scenes.flatMap((s) =>
    s.elements.filter((el) => el.kind === "sprite" && el.sprite !== undefined).map((el) => el.sprite?.assetKey ?? "")
  ).filter(Boolean);
  const { assets: spriteAssets, missing: missingImports } = await resolveSpriteAssets(videoId, referencedKeys);
  if (missingImports.length > 0) {
    throw new Error(
      `unresolved sprite imports (${missingImports.join(", ")}) — re-upload or remove the sprites before rendering`
    );
  }

  try {
    if (isDraft) {
      // ---- the labelled draft: a LOOK at the working doc, never a
      // reviewable render (the b6 viewport law). One renderer: the scaled
      // doc rides the SAME renderGraphics — same clock, same frame truth,
      // same applier; only the surface differs. ----
      const target = sceneId !== null ? doc.scenes.find((s) => s.id === sceneId) : null;
      if (sceneId !== null && !target) {
        throw new Error(`Graphics scene "${sceneId}" does not exist in this doc`);
      }
      const draftDoc = graphicsDraftDoc(doc, scale);
      if (!draftDoc) {
        throw new Error(`"${String(opts.scale)}" is not a legal draft scale (0.5 | 0.75 | 1.0)`);
      }
      const scoped = sceneId !== null && target ? { ...draftDoc, scenes: [target] } : draftDoc;
      const voFiles = voFilesFor(scoped.scenes, videoId);
      const result = await renderGraphics(scoped, {
        outDir: path.join(outDir, `draft-${scale}`),
        voFiles,
        spriteAssets,
        // The look-rate: every OTHER frame at its exact doc time (the
        // draft lever that closes acceptance criterion 7 with the 0.5×
        // surface — see RenderGraphicsOptions.frameStep).
        frameStep: 2,
        onProgress: engineProgressGuard(entityId, "graphics"),
      });
      const key = graphicsDraftKey(videoId, scale, sceneId);
      if (!key) throw new Error("the draft key refused its scale — an engine bug");
      await putFromPath(key, result.file);
      await db.activity.create({
        data: {
          organizationId: video.organizationId,
          userId: ctx.userId,
          videoId,
          stage: "render",
          message: `Graphics draft rendered — ${sceneId !== null ? `scene "${sceneId}"` : "full doc"} @ ${scale}× (non-reviewable look; no review credit, no certification)`,
        },
      });
      return;
    }

    // ---- full render: the doc's own surface/fps, VO + the music bed ----
    const voFiles = voFilesFor(doc.scenes, videoId);
    let musicPath: string | null = null;
    let musicWhy = "no music";
    if (await isMusicEnabledForVideo(video)) {
      const planAudio = await getApprovedAudioMap(videoId);
      const resolved = await resolveMusicForVideo(video, planAudio.musicMood, null);
      if (resolved) {
        musicPath = trackAbsolutePath(resolved.track);
        musicWhy = `music: ${resolved.why}`;
      }
    }

    const result = await renderGraphics(doc, {
      outDir,
      voFiles,
      musicPath: musicPath ?? undefined,
      spriteAssets,
      onProgress: engineProgressGuard(entityId, "graphics"),
    });

    // Probe the render BEFORE it lands (the E12 receipt: putFromPath's
    // local-driver fast path RENAMES the source — a probe after the put
    // stats a moved-away file and the row records 0.0s).
    // S136 — THE PROBE WALL (mirrors the whiteboard lane): an unmeasurable
    // render is a FAILED render, never a landed 0.0s "playable" row.
    const probedDuration = await probeDurationSec(result.file);
    if (probedDuration === null || probedDuration <= 0) {
      throw new Error(
        `the graphics render probed ${probedDuration === null ? "unreadable" : `${probedDuration}s`} — ffprobe found no playable duration; refusing to land a 0.0s "playable" row (the S136 wall)`
      );
    }
    const durationSec = probedDuration;

    // The standard key — the existing player route, QC battery and ship
    // gate never learn graphics exists (the peer-MODE law).
    await putFromPath(`${videoId}/final.mp4`, result.file);
    // Per-scene encodes — each registers as a scene artifact (type video,
    // the graphics lane's provenance). $0 local encodes — no cost
    // attribution rides.
    for (let i = 0; i < result.scenes.length; i++) {
      const key = `${videoId}/graphics/scene-${i + 1}.mp4`;
      await putFromPath(key, result.scenes[i].file);
      await registerSceneArtifact({
        video,
        sceneIndex: i + 1,
        type: "video",
        storageKey: key,
        input: `graphics-encode|scene=${i + 1}|doc=${video.graphicsDoc ?? ""}`,
        prompt: null,
        bytes: null,
      });
    }

    await db.video.update({
      where: { id: videoId },
      data: {
        hasVideo: true,
        videoDuration: Math.round(durationSec * 10) / 10,
        error: null,
        // S117 — the graphics final records the manifest too (the SAME
        // approved-only assembly the story and whiteboard lanes prove
        // themselves with; mode "graphics"). boardModes stays absent —
        // the graphics doc has no board policy, and the additive field
        // reads both shapes.
        renderManifest: JSON.stringify(
          manifestOf(await resolveRenderAssembly(video), "graphics")
        ),
      },
    });

    // The QC battery rides the standing final.mp4 (runQcJob re-derives
    // everything from the row — including the graphics lane's designed
    // holds). A crashed battery never fails the render (the S45 law).
    try {
      await runQcJob(videoId);
    } catch {
      /* QC evidence stays absent — never stale */
    }

    await db.activity.create({
      data: {
        organizationId: video.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "render",
        message: `Motion graphics rendered (${doc.scenes.length} scene${doc.scenes.length === 1 ? "" : "s"}, ${Math.round(durationSec)}s, ${voFiles.size > 0 ? "narrated" : "silent draft"}, ${musicWhy})`,
      },
    });
  } catch (err) {
    if (err instanceof JobCancelledError) {
      await db.video.update({ where: { id: videoId }, data: { error: null } });
      await db.activity
        .create({
          data: {
            organizationId: video.organizationId,
            userId: ctx.userId,
            videoId,
            stage: "render",
            message: "Graphics render cancelled — completed scenes kept, run it again to restart",
          },
        })
        .catch(() => {});
      throw err;
    }
    const message = errorText(err, "Graphics render failed");
    await db.video.update({ where: { id: videoId }, data: { error: message } });
    await db.activity
      .create({
        data: {
          organizationId: video.organizationId,
          userId: ctx.userId,
          videoId,
          stage: "render",
          level: "error",
          message: `Graphics render failed: ${message}`,
        },
      })
      .catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// helpers

/**
 * Split "<videoId>#scene<N>" / "<videoId>#slide<N>" entity ids into
 * [videoId, N-as-string]. Composite ids are the DURABLE encoding of which
 * sub-entity a job targets — parsing them (instead of trusting a payload
 * number) keeps the crash-recovery path honest even when the payload was
 * written by an older route version.
 */
export function splitEntityId(
  entityId: string,
  marker: "#scene" | "#slide" | "#wb" | "#g"
): [string, string | null] {
  const idx = entityId.indexOf(marker);
  if (idx === -1) return [entityId, null];
  const suffix = entityId.slice(idx + marker.length);
  // #scene/#slide suffixes are numeric scene indexes; #wb/#g carry an
  // ENGINE SCENE ID (the engine's charset-legal id — "scene-3", a
  // hand-authored id). Validating it with the id-charset law keeps a
  // corrupt composite id from silently degrading a preview job into a
  // full-render one (suffix null = full render downstream).
  if (marker === "#wb") return [entityId.slice(0, idx), validWhiteboardId(suffix) ? suffix : null];
  if (marker === "#g") return [entityId.slice(0, idx), validGraphicsId(suffix) ? suffix : null];
  return [entityId.slice(0, idx), /^\d+$/.test(suffix) ? suffix : null];
}

// ---------------------------------------------------------------------------
// Stage 6 — qc re-run + youtube publish

/** Durable publish payload — the route enqueues this so a restart resumes
 *  the upload with the SAME title/description/privacy the user picked. */
export interface PublishJobOptions {
  title: string;
  description: string;
  tags: string[];
  /** Storage key for a custom thumbnail (e.g. "videos/<id>/thumb-variant-2.png").
   *  null/undefined → use the video's primary thumbnail.png when present. */
  thumbnailStorageKey?: string | null;
  /** "public" | "unlisted" | "private" — falls back to the account default. */
  privacyStatus?: string;
  /** ISO date for scheduled publishing (YouTube's publishAt). Null = now. */
  publishAt?: string | null;
}

/** S123 (G1) — the graphics lane's designed hold windows for the battery
 *  (absolute seconds, the doc's legal post-motion freezes). Other lanes:
 *  undefined — the pre-S123 judgment verbatim. S152 — the windows derive
 *  from the MEASURED narration clock (the WAV truth the render delivered),
 *  not the estimate — the battery judges the delivered timeline. */
function graphicsLaneQc(video: Video): [number, number][] | undefined {
  if (video.renderMode !== "graphics") return undefined;
  const doc = parseGraphicsDoc(video.graphicsDoc);
  if (!doc) return undefined;
  const voMs = measureGraphicsVoMs(videoDir(video.id), doc);
  return graphicsHoldWindows(doc, voMs).map((w) => [w.startSec, w.endSec] as [number, number]);
}

/**
 * T-6.2 — re-run the QC battery against the existing final.mp4 without
 * re-rendering. Useful after the user manually edits a scene's narration or
 * caption and wants a fresh report. Crashes here surface on the video row
 * (same contract as every other kind); a missing final.mp4 throws a readable
 * error so the user knows to render first.
 */
export async function runQcJob(videoId: string): Promise<void> {
  const ctx = assertCtx("runQcJob");
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return; // deleted while queued — end quietly
  if (!video.hasVideo || video.videoDuration == null) {
    throw new Error("Cannot re-run QC — render the video first");
  }

  try {
    setJobProgress(videoId, "qc", 0, 1, "Re-running QC battery");
    const approvedPlan =
      video.directorState === "approved" ? parsePlan(video.shotList) : null;
    const aspect = (video.aspectRatio === "9:16" ? "9:16" : "16:9") as
      | "16:9"
      | "9:16";
    // S36 — rebuild the continuity expectation from the timeline doc the way
    // the render built it: doc durations + per-boundary transitionIn wins
    // over the video-level default. Doc-less videos have nothing to align
    // against — the check then reports "unmeasured", never clean.
    // S123 (G1) — the graphics lane derives its expectation from the DOC
    // clock instead (the doc clock IS the graphics timeline): hard cuts at
    // the frame-quantized scene boundaries; the story-timeline doc below
    // is not what a graphics final was cut on.
    const graphicsDoc =
      video.renderMode === "graphics" ? parseGraphicsDoc(video.graphicsDoc) : null;
    const timeline = parseTimeline(video.timeline);
    // S152 — the graphics cut expectation reads the MEASURED narration
    // clock (the WAV truth the render extended its scenes to hold), so
    // the delivered boundaries and the expectation agree by construction.
    const graphicsVoMs =
      graphicsDoc !== null ? measureGraphicsVoMs(videoDir(videoId), graphicsDoc) : undefined;
    let expectedCuts: ExpectedCuts | null =
      graphicsDoc !== null ? graphicsExpectedCuts(graphicsDoc, graphicsVoMs) : null;
    if (graphicsDoc === null && timeline && timeline.scenes.length > 0) {
      const docDur = timeline.scenes.map(
        (s) => (typeof s.durationSec === "number" && Number.isFinite(s.durationSec) && s.durationSec > 0 ? s.durationSec : 0)
      );
      if (docDur.every((d) => d > 0)) {
        const def = resolveTransition(video, video.renderMode);
        const docSettings = docSceneSettings(timeline, timeline.scenes.length);
        const settings: TransitionSettings[] = [];
        for (let b = 0; b + 1 < docDur.length; b++) {
          const docStyle = docSettings?.[b + 1]?.transitionIn ?? null;
          settings.push({
            style:
              docStyle != null && TRANSITION_IDS.has(docStyle as never)
                ? sanitizeTransitionStyle(docStyle)
                : def.style,
            durationSec: def.durationSec,
          });
        }
        expectedCuts = expectedCutsForTimeline(docDur, settings);
      }
    }
    // S49 (L4) — the QC re-run honors the content policy exactly like the
    // post-render battery: restricted policy → the visual scan re-runs on the
    // standing final.mp4 (fail-closed on any scan failure).
    // S53 — the advanced visual lenses re-run too (same applicability laws
    // as the render path: text always, subject when cast + anchor exist).
    const finalPath = await (await import("./storage")).materialize(`${videoId}/final.mp4`);
    const restrictedScan =
      resolveContentPolicy(video.contentPolicy) === "islamic-history"
        ? await runRestrictedVisualScan({
            mp4Path: finalPath,
            durationSec: video.videoDuration ?? 1,
          })
        : undefined;
    const textScan = await runTextArtifactScan({
      mp4Path: finalPath,
      durationSec: video.videoDuration ?? 1,
    });
    let subjectScan:
      | { status: "pass" | "fail" | "unmeasured"; value: string; detail?: string }
      | undefined;
    if (video.characterId) {
      const character = await db.character.findUnique({
        where: { id: video.characterId },
        select: { name: true, identityAnchor: true },
      });
      if (character?.identityAnchor) {
        subjectScan = await runSubjectContinuityScan({
          mp4Path: finalPath,
          durationSec: video.videoDuration ?? 1,
          characterName: character.name,
          anchor: character.identityAnchor,
        });
      }
    }
    const report = await qcForVideo(
      videoId,
      video.videoDuration,
      video.audioDuration,
      [], // no designed black windows stored — any detected black reads as "unexplained"
      aspect,
      approvedPlan,
      {
        i2vEverywhere: video.renderMode === "animated",
        stockEverywhere: video.renderMode === "stock",
      },
      expectedCuts,
      video.frameRate === 24 || video.frameRate === 60 ? video.frameRate : 30,
      restrictedScan,
      subjectScan,
      textScan,
      // S123 (G1) — the graphics lane's QC group: the designed hold
      // windows for the sampled static lens + the hard-cut expectation
      // derived from the DOC clock (NOT the story timeline — the doc
      // clock IS the graphics timeline) + the dead-compositor freeze
      // semantics (the P5 proof's recorded noise-floor finding). Absent
      // doc / other lanes: undefined, byte-identical.
      graphicsLaneQc(video),
      video.renderMode === "graphics",
      // The graphics lane's scene-cut calibration — the format's subtle
      // background-tone cuts sit far below the story lanes' 0.40 (the P5
      // proof's recorded finding).
      video.renderMode === "graphics" ? 0.025 : undefined
    );
    await db.video.update({
      where: { id: videoId },
      data: { qcReport: JSON.stringify(report) },
    });
    setJobProgress(videoId, "qc", 1, 1, report.passed ? "QC passed" : "QC failed");
    await db.activity.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "qc",
        message:
          report.passed
            ? `QC re-run passed — ${report.checks.length} checks clean`
            : `QC re-run flagged ${report.checks.filter((c) => c.status !== "pass").length} issue(s)` +
              // S40 — same ship verdict as the render path: a hold surfaces
              // the moment the measurement lands.
              (applyQcPolicy(report, { mode: qcEnforcementMode() }).blocked
                ? " — EXPORT ON HOLD (blocking finding; accept findings in the QC card to ship anyway)"
                : ""),
      },
    });
  } catch (err) {
    if (err instanceof JobCancelledError) throw err;
    const message = errorText(err, "QC re-run failed");
    await db.video.update({ where: { id: videoId }, data: { error: message } }).catch(() => {});
    await db.activity
      .create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          videoId,
          stage: "qc",
          level: "error",
          message: `QC re-run failed: ${message}`,
        },
      })
      .catch(() => {});
    throw err;
  }
}

/**
 * T-6.3 — YouTube publish job. Wires the dead `uploadToYouTube` scaffolding
 * (D-06, D-07). Loads the final.mp4 + thumbnail from storage, calls the
 * existing resumable upload path, and on success writes `Video.youtubeUrl`
 * + `Video.publishedAt` + flips `Video.status` to "published". An
 * `invalid_grant` (revoked refresh token) is already handled inside
 * `getAccessToken` (the YouTubeAccount row is wiped, surfacing a
 * "reconnect in Settings" error); a transient failure retries with the
 * queue's exponential backoff.
 */
export async function runUploadJob(
  videoId: string,
  opts: PublishJobOptions
): Promise<void> {
  const ctx = assertCtx("runUploadJob");
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return; // deleted while queued — end quietly
  if (video.youtubeUrl) {
    // Already published (a resumed job after a partial success). Idempotent.
    await db.activity
      .create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          videoId,
          stage: "upload",
          message: "Already published — skipping",
        },
      })
      .catch(() => {});
    return;
  }
  if (!video.hasVideo) {
    throw new Error("Cannot publish — render the video first");
  }

  try {
    setJobProgress(videoId, "upload", 0, 1, "Materializing video + thumbnail");

    // Materialize from the storage driver — local: returns the uploads path;
    // s3: downloads to a temp scratch file. fs.readFile works on both.
    const mp4Path = await materialize(`${videoId}/final.mp4`);
    let thumbnailPath: string | null = null;
    if (opts.thumbnailStorageKey) {
      thumbnailPath = await materialize(opts.thumbnailStorageKey);
    } else if (video.hasThumbnail) {
      // Default to the project's primary thumbnail if one was generated.
      thumbnailPath = await materialize(`${videoId}/thumbnail.png`).catch(() => null);
    }

    const fs = await import("fs");
    const fileSize = fs.statSync(mp4Path).size;

    setJobProgress(videoId, "upload", 0, 1, "Uploading to YouTube");

    const result = await uploadToYouTube({
      title: opts.title,
      description: opts.description,
      tags: opts.tags,
      filePath: mp4Path,
      fileSize,
      thumbnailPath,
      publishAt: opts.publishAt,
    });

    await db.video.update({
      where: { id: videoId },
      data: {
        youtubeUrl: result.url,
        publishedAt: new Date(),
        status: "published",
        error: null,
      },
    });
    setJobProgress(videoId, "upload", 1, 1, "Published");
    await db.activity.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        videoId,
        stage: "upload",
        message: `Published to YouTube${result.thumbnailSet ? " (custom thumbnail set)" : ""}`,
      },
    });

    // Note: materialize() returns either the uploads/ path (local driver —
    // the source of truth, never deleted) or an etag-pinned cache file (s3
    // driver — the cache manages its own lifecycle). No cleanup needed here.
  } catch (err) {
    if (err instanceof JobCancelledError) throw err;
    const message = errorText(err, "YouTube publish failed");
    await db.video
      .update({
        where: { id: videoId },
        data: { status: "publish-failed", error: message },
      })
      .catch(() => {});
    await db.activity
      .create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          videoId,
          stage: "upload",
          level: "error",
          message: `Publish failed: ${message}`,
        },
      })
      .catch(() => {});
    throw err;
  }
}

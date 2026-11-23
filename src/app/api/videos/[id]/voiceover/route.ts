import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/ibismuh/tenant-db";
import { requireUser } from "@/lib/ibismuh/tenant";
import { stat as statObject, presign, materialize } from "@/lib/ibismuh/storage";
import fs from "node:fs";
import { Readable } from "node:stream";
import { parseScenes } from "@/lib/ibismuh/story";
import { MAX_AUDIO_BYTES, isValidAudioUrl } from "@/lib/ibismuh/voice";
import { startJob, isJobRunning } from "@/lib/ibismuh/jobs";
import { serializeVideo } from "@/lib/ibismuh/serialize";
import { put, remove } from "@/lib/ibismuh/storage";
import { runVoiceoverJob, type VoiceoverJobSource } from "@/lib/ibismuh/video-jobs";
import {
  UploadConcurrencyError,
  UploadTooLargeError,
  enforceAudioMagicBytes,
  enforceFileSize,
  enforceQuotaHeadroom,
  enforceRequestContentLength,
  withUploadSlot,
} from "@/lib/ibismuh/upload-limits";

type Ctx = { params: Promise<{ id: string }> };

// Mirrors voice.ts AUDIO_EXT_RE — keeps the staged source extension demuxer-friendly.
const AUDIO_EXT = /\.(mp3|wav|wave|m4a|aac|ogg|oga|opus|flac|webm|mp4|m4b|wma|aiff?|amr)$/i;

/** POST — (re)generate the voiceover as a background job (returns 202 immediately).
 * Long synchronous requests were killed by the gateway with 502; the job runs
 * in-process and the client polls GET /api/videos/[id] for completion.
 *
 * Three modes:
 *   default / JSON {mode:"tts"}            → built-in TTS voices (scene videos get per-scene TTS)
 *   multipart/form-data (field "file")     → bring-your-own-voice: use an uploaded audio file
 *   JSON {mode:"url", url}                 → bring-your-own-voice: download audio from an internet link
 *
 * The job body is runVoiceoverJob (video-jobs.ts) — the SAME function the
 * durable queue's crash-recovery handler runs, so a restart resumes the
 * stage. Uploaded bytes are staged into object storage BEFORE enqueueing (a
 * request buffer cannot survive a restart; a storage key can) and cleaned up
 * after the ingest (win or lose the dedupe race).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });

  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });

  // ----- Parse the request into a voiceover mode -----
  const contentType = req.headers.get("content-type") ?? "";

  type Mode =
    | { kind: "tts" }
    | { kind: "upload"; buffer: Buffer; filename: string }
    | { kind: "url"; url: string; label?: string };

  let mode: Mode = { kind: "tts" };

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0)
      return NextResponse.json(
        { error: "Attach an audio file in the 'file' field" },
        { status: 400 }
      );
    const label = (form?.get("label") as string | null)?.trim() || file.name || "uploaded audio";
    // Upload admission: request wall (Content-Length) + file wall (the
    // parsed File's size) + magic bytes — the old path size-checked but
    // still trusted the container; a renamed text file now dies at the
    // signature, and a concurrent-upload ceiling protects the workers.
    try {
      enforceRequestContentLength(req, MAX_AUDIO_BYTES + 256 * 1024, "The audio file");
      enforceFileSize(file, MAX_AUDIO_BYTES, "The audio file");
      await enforceQuotaHeadroom(auth.ctx.organizationId, file.size, "The audio file");
      const staged = await withUploadSlot(auth.ctx.organizationId, async () => {
        const buffer = Buffer.from(await file.arrayBuffer());
        enforceAudioMagicBytes(buffer, "The audio file");
        return buffer;
      });
      mode = {
        kind: "upload",
        buffer: staged,
        filename: label,
      };
    } catch (err) {
      if (err instanceof UploadTooLargeError)
        return NextResponse.json({ error: err.message }, { status: 413 });
      if (err instanceof UploadConcurrencyError)
        return NextResponse.json({ error: err.message }, { status: 429 });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "The audio file was rejected" },
        { status: 400 },
      );
    }
  } else if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as {
      mode?: string;
      url?: string;
      label?: string;
    };
    if (body.mode === "url") {
      const url = (body.url ?? "").trim();
      if (!url)
        return NextResponse.json({ error: "Provide an audio URL" }, { status: 400 });
      if (!isValidAudioUrl(url))
        return NextResponse.json(
          { error: "That is not a valid http(s) audio link" },
          { status: 400 }
        );
      mode = { kind: "url", url, label: body.label?.trim() };
    }
    // body.mode "tts" or absent → TTS path below
  }

  const custom = mode.kind !== "tts";
  const scenes = video.format === "story" ? parseScenes(video.scenes) : [];
  if (!custom && video.format === "story" && scenes.length === 0)
    return NextResponse.json(
      { error: "Scene video has no scenes — regenerate the scene script" },
      { status: 400 }
    );
  if (!custom && !video.script)
    return NextResponse.json(
      { error: "Video has no script yet — generate the script first" },
      { status: 400 }
    );

  // Stage interlock: rendering while the voiceover is being regenerated would
  // mix OLD scene WAVs (already re-spoken) with NEW ones mid-write — the
  // same class of bug as reading a stale hasVoiceover flag.
  if (isJobRunning(id, "render"))
    return NextResponse.json(
      { error: "A render is still running on this video — wait for it to finish before regenerating the voiceover" },
      { status: 409 }
    );

  // Clear any stale error from a previous failed attempt before polling starts.
  // ALSO drop the stale hasVoiceover/audioDuration flags UPFRONT: this job
  // rewrites every scene WAV, and clients polling for "hasVoiceover" would
  // otherwise report completion from the PREVIOUS run while the new audio is
  // still being spoken (which lets a render start mid-rewrite on half-old,
  // half-new narration — observed live in the E2E re-cert).
  await db.video.update({
    where: { id },
    data: { error: null, hasVoiceover: false, audioDuration: null },
  });

  // Durable source spec — uploaded bytes go to storage FIRST so the crash-
  // recovery handler can re-read them; URL mode just carries the URL.
  let source: VoiceoverJobSource | null = null;
  if (custom && mode.kind === "upload") {
    const extMatch = mode.filename.toLowerCase().match(AUDIO_EXT);
    const ext = extMatch ? extMatch[0] : ".bin";
    const storageKey = `${id}/voice-source${ext}`;
    await put(storageKey, mode.buffer);
    source = { kind: "upload", storageKey, label: mode.filename };
  } else if (custom && mode.kind === "url") {
    source = { kind: "url", url: mode.url, label: mode.label };
  }

  const accepted = await startJob(
    id,
    "voiceover",
    () => runVoiceoverJob(id, { source }),
    { payload: { source } }
  );

  // Lost the dedupe race — nothing will consume the staged upload; drop it.
  if (!accepted && source?.kind === "upload") {
    await remove(source.storageKey).catch(() => {});
  }

  // 202 Accepted — job already running (dedupe) or just started. The response
  // mirrors the CLEARED state so no client ever sees the stale flags.
  const cleared = { ...video, hasVoiceover: false, audioDuration: null };
  return NextResponse.json(
    {
      video: await serializeVideo(cleared, null, { includeScenes: true }),
      accepted: true,
      generating: true,
    },
    { status: 202 }
  );
}

/** GET — stream the voiceover WAV file.
 *
 * F-04 (memory safety): long narrations produce WAVs far beyond what should
 * ever be buffered per request — the old whole-buffer NextResponse multiplied
 * memory use under concurrent downloads. Delivery now follows the MP4
 * route's law: presigned redirect on the s3 driver (bytes flow
 * CDN→client, never through the app) and bounded-memory Range streaming on
 * the local driver. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  const { id } = await ctx.params;
  // Scoped lookup FIRST — uploads/<id>/voiceover.wav is only streamed after
  // the row is proven to belong to the caller's organization.
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const key = `${id}/voiceover.wav`;
  const info = await statObject(key);
  if (!info)
    return NextResponse.json({ error: "No voiceover yet" }, { status: 404 });

  const baseHeaders: Record<string, string> = {
    "Content-Type": "audio/wav",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };

  // s3 driver — presigned redirect; bytes never transit the app.
  const signed = await presign(key, 300);
  if (signed) return NextResponse.redirect(signed, 302);

  // local driver — bounded-memory Range streaming.
  const filePath = await materialize(key);
  const total = info.size;
  const streamRange = (start: number, end: number) =>
    Readable.toWeb(fs.createReadStream(filePath, { start, end })) as unknown as ReadableStream<Uint8Array>;

  const range = req.headers.get("range");
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
      if (start <= end && start < total) {
        return new NextResponse(streamRange(start, end), {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(end - start + 1),
          },
        });
      }
      return new NextResponse(null, {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${total}` },
      });
    }
  }

  return new NextResponse(streamRange(0, total - 1), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(total) },
  });
}

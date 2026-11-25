"use client";

// preview-player.tsx — the canvas preview renderer + transport controls.
//
// Driven ENTIRELY by the plan envelope from the server: plan.timeline.ops,
// plan.beats, the lane doc scenes, and the asset list. The player owns the
// clock; the timeline strip and scene rail read it through the transport
// store and request seeks back through it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pause, Play, Repeat, SkipBack, Video, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectState } from "@/lib/ibismuh/api-dto";
import { ASPECT_GEOMETRY, type AspectId } from "@/lib/ibismuh/studio-catalogs";
import { drawFrame, imageCache, preloadImages, totalDurationMs, type FrameRenderCtx } from "./lane-renderer";
import { useStudioTransport } from "./studio-store";

/** mm:ss.d — tabular monospace clock format. */
export function formatTimeMs(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const tenths = Math.floor((total % 1000) / 100);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

const DISPLAY_MAX_WIDTH: Record<AspectId, number> = {
  "16:9": 960,
  "9:16": 340,
  "1:1": 480,
};

interface PreviewPlayerProps {
  state: ProjectState;
  accentHex: string;
}

export function PreviewPlayer({ state, accentHex }: PreviewPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const loopRef = useRef(false);
  const audioEnabledRef = useRef(true);
  const capturingRef = useRef(false);
  const captureRef = useRef<{ recorder: MediaRecorder; chunks: Blob[] } | null>(null);
  const restoredRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [imageSettled, setImageSettled] = useState(0);
  const [capturing, setCapturing] = useState(false);

  const plan = state.planRevision?.plan ?? null;
  const aspect = (plan?.aspect ?? state.project.aspect) as AspectId;
  const geometry = ASPECT_GEOMETRY[aspect] ?? ASPECT_GEOMETRY["16:9"];
  const internal = plan
    ? { w: plan.width, h: plan.height }
    : { w: geometry.width, h: geometry.height };

  const seek = useStudioTransport((s) => s.seek);
  const captureRequest = useStudioTransport((s) => s.captureRequest);

  const totalMs = totalDurationMs(plan);
  const pendingImages = useMemo(() => {
    void imageSettled; // tick — re-derive when any image settles
    return state.assets.filter((a) => a.kind === "image" && !imageCache.get(a.url)?.complete).length;
  }, [state.assets, imageSettled]);

  const rc: FrameRenderCtx | null = useMemo(() => {
    if (!state.planRevision) return null;
    return {
      plan: state.planRevision.plan,
      lane: state.project.lane,
      scenes: state.planRevision.laneScenes,
      assets: state.assets,
      images: imageCache,
      accentHex,
    };
  }, [state.planRevision, state.project.lane, state.assets, accentHex]);

  const pushClock = useCallback(() => {
    const t = timeRef.current;
    if (clockRef.current) clockRef.current.textContent = formatTimeMs(t);
    if (sliderRef.current) {
      const max = Number(sliderRef.current.max) || 1;
      sliderRef.current.value = String(Math.min(t, max));
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (rc) {
      drawFrame(ctx, canvas.width, canvas.height, timeRef.current, rc);
    } else {
      ctx.fillStyle = "#0e0c0a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(244, 244, 245, 0.55)";
      ctx.font = `500 ${Math.round(canvas.height * 0.035)}px 'Geist Mono', ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("no plan compiled — compile the plan to see frames", canvas.width / 2, canvas.height / 2);
      ctx.textAlign = "left";
    }
    pushClock();
  }, [rc, pushClock]);

  // redraw whenever the documents change; restore the clock across remounts
  // (tab switches unmount the player — the transport store keeps the truth)
  useEffect(() => {
    const total = totalDurationMs(plan);
    if (!restoredRef.current) {
      restoredRef.current = true;
      const stored = useStudioTransport.getState().timeMs;
      if (stored > 0 && stored <= total) timeRef.current = stored;
    }
    if (timeRef.current > total) timeRef.current = 0;
    useStudioTransport.getState().setTimeMs(Math.min(timeRef.current, total));
    draw();
  }, [draw, plan]);

  // preload image assets into the shared frame cache — the settle callback
  // bumps a tick so the derived pending count re-renders
  useEffect(() => {
    const imageUrls = state.assets.filter((a) => a.kind === "image").map((a) => a.url);
    preloadImages(imageUrls, () => {
      setImageSettled((v) => v + 1);
      draw();
    });
  }, [state.assets, draw]);

  const seekTo = useCallback(
    (ms: number) => {
      const total = Math.max(1, totalDurationMs(plan));
      const t = Math.min(Math.max(0, ms), total);
      timeRef.current = t;
      const audio = audioRef.current;
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        try {
          audio.currentTime = Math.min(t / 1000, audio.duration - 0.01);
        } catch {
          // seek before metadata loaded — the rAF sync loop fixes drift later
        }
      }
      useStudioTransport.getState().setTimeMs(t);
      draw();
    },
    [draw, plan],
  );

  // consume seek requests from the timeline / scene rail / QC checks
  useEffect(() => {
    if (!seek) return;
    seekTo(seek.ms);
    if (seek.sceneRef) useStudioTransport.getState().setSelectedSceneRef(seek.sceneRef);
  }, [seek, seekTo]);

  // playback loop — rAF with real-time delta, audio kept in sync
  useEffect(() => {
    if (!playing) return;
    const audio = audioRef.current;
    if (audio && audioEnabledRef.current && state.narrationAssetId) {
      audio.play().catch(() => {
        // autoplay refusal — silent preview continues honestly
      });
    }
    playingRef.current = true;
    let last = performance.now();
    let lastStorePush = 0;
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      const total = Math.max(1, totalDurationMs(plan));
      let t = timeRef.current + dt;
      let ended = false;
      if (t >= total) {
        if (loopRef.current && !capturingRef.current) {
          t = t % total;
          if (audio) {
            try {
              audio.currentTime = t / 1000;
            } catch {
              // ignore
            }
          }
        } else {
          t = total;
          ended = true;
        }
      }
      timeRef.current = t;
      if (now - lastStorePush > 100) {
        lastStorePush = now;
        useStudioTransport.getState().setTimeMs(t);
      }
      if (audio && Math.abs(audio.currentTime * 1000 - t) > 250) {
        try {
          audio.currentTime = t / 1000;
        } catch {
          // ignore
        }
      }
      draw();
      if (ended) {
        setPlaying(false);
        if (capturingRef.current) {
          // let the final frame land in the stream before closing
          setTimeout(() => {
            capturingRef.current = false;
            captureRef.current?.recorder.stop();
          }, 150);
        }
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      playingRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audio?.pause();
    };
  }, [playing, draw, plan, state.narrationAssetId]);

  // pause when the tab is hidden — the clock stays honest
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && playingRef.current && !capturingRef.current) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // WebM capture — requested by the transport menu or the QC & Delivery panel
  const startCapture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rc) {
      toast.error("Nothing to capture", { description: "Compile a plan first — the capture renders the plan preview." });
      return;
    }
    if (typeof MediaRecorder === "undefined" || typeof canvas.captureStream !== "function") {
      toast.error("WebM capture is not supported in this browser");
      return;
    }
    try {
      const stream = canvas.captureStream(30);
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const slug = state.project.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "project";
        a.href = url;
        a.download = `ibismuh-${slug}-preview.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5_000);
        setCapturing(false);
        toast.success("Preview capture saved", {
          description: "Preview-quality WebM — parity with the plan; a production ffmpeg compositor is not attached in this sandbox.",
        });
      };
      captureRef.current = { recorder, chunks };
      capturingRef.current = true;
      setCapturing(true);
      seekTo(0);
      setLoop(false);
      loopRef.current = false;
      setPlaying(true);
      recorder.start(250);
    } catch (err) {
      capturingRef.current = false;
      setCapturing(false);
      toast.error("Capture failed", { description: err instanceof Error ? err.message : "unknown capture error" });
    }
  }, [rc, seekTo, state.project.title]);

  useEffect(() => {
    if (captureRequest > 0) {
      const id = setTimeout(() => startCapture(), 0);
      return () => clearTimeout(id);
    }
  }, [captureRequest, startCapture]);

  const togglePlay = useCallback(() => {
    if (!rc) return;
    if (!playing && timeRef.current >= totalDurationMs(plan)) seekTo(0);
    setPlaying((p) => !p);
  }, [playing, rc, plan, seekTo]);

  const onSpaceKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
    },
    [togglePlay],
  );

  const hasAudio = Boolean(state.narrationAssetId);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-3">
        <div className="flex justify-center">
          <div
            tabIndex={0}
            onKeyDown={onSpaceKey}
            aria-label="Preview player — press space to play or pause"
            className="relative outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 rounded-lg overflow-hidden border border-stone-800 bg-[#0e0c0a]"
            style={{ width: "100%", maxWidth: DISPLAY_MAX_WIDTH[aspect] }}
          >
            <canvas
              ref={canvasRef}
              width={internal.w}
              height={internal.h}
              onClick={togglePlay}
              aria-label="Video preview canvas"
              className="block w-full h-auto cursor-pointer"
              style={{ aspectRatio: `${internal.w} / ${internal.h}` }}
            />
            {pendingImages > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
                <span className="flex items-center gap-2 text-sm text-zinc-200 tf-mono">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  loading frames…
                </span>
              </div>
            )}
            {capturing && (
              <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-full bg-red-950/80 border border-red-800 px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden />
                <span className="text-[11px] tf-mono text-red-200">capturing preview…</span>
              </div>
            )}
            {!rc && (
              <div className="absolute inset-x-0 bottom-0 border-t border-stone-800 bg-black/70 px-3 py-1.5">
                <span className="text-[11px] text-zinc-400">
                  No plan yet — write a brief and press Compile plan. The preview renders the compiled plan only.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* transport */}
        <div className="flex flex-wrap items-center gap-2 studio-panel border border-stone-800 rounded-lg px-3 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 border-stone-700"
                aria-label="Back to start"
                onClick={() => seekTo(0)}
              >
                <SkipBack className="h-4 w-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to start</TooltipContent>
          </Tooltip>

          <Button
            size="default"
            className="h-11 min-w-[104px] bg-amber-500 text-stone-950 hover:bg-amber-400 font-semibold"
            aria-label={playing ? "Pause preview" : "Play preview"}
            disabled={!rc}
            onClick={togglePlay}
          >
            {playing ? <Pause className="h-4 w-4 mr-1.5" aria-hidden /> : <Play className="h-4 w-4 mr-1.5" aria-hidden />}
            {playing ? "Pause" : "Play"}
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`h-11 w-11 border-stone-700 ${loop ? "bg-amber-500/15 text-amber-400 border-amber-600/50" : ""}`}
                aria-label={loop ? "Looping enabled" : "Looping disabled"}
                aria-pressed={loop}
                onClick={() => {
                  const next = !loop;
                  setLoop(next);
                  loopRef.current = next;
                }}
              >
                <Repeat className="h-4 w-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Loop playback</TooltipContent>
          </Tooltip>

          {hasAudio && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 border-stone-700"
                  aria-label={muted ? "Unmute narration" : "Mute narration"}
                  aria-pressed={muted}
                  onClick={() => {
                    const next = !muted;
                    setMuted(next);
                    audioEnabledRef.current = !next;
                    if (audioRef.current) audioRef.current.muted = next;
                  }}
                >
                  {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{muted ? "Narration muted" : "Narration audible"}</TooltipContent>
            </Tooltip>
          )}

          <input
            ref={sliderRef}
            type="range"
            min={0}
            max={Math.max(1, totalMs)}
            step={50}
            defaultValue={0}
            aria-label="Seek preview time"
            className="studio-scroll h-11 flex-1 min-w-[140px] accent-amber-500 cursor-pointer"
            onChange={(e) => seekTo(Number(e.target.value))}
          />

          <span ref={clockRef} className="tf-num text-sm text-zinc-300 min-w-[74px] text-right" aria-live="off">
            {formatTimeMs(0)}
          </span>
          <span className="tf-num text-xs text-zinc-500" aria-hidden>
            / {formatTimeMs(totalMs)}
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-11 border-stone-700 gap-1.5"
                aria-label="Capture preview as WebM video"
                disabled={!rc || capturing}
                onClick={startCapture}
              >
                {capturing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Video className="h-4 w-4" aria-hidden />}
                Capture WebM
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Preview-quality capture — parity with the plan; a production ffmpeg compositor is not attached in this sandbox.
            </TooltipContent>
          </Tooltip>

          {!hasAudio && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center rounded-full border border-dashed border-amber-600/70 bg-amber-950/40 px-3 py-1.5 text-[11px] text-amber-300 cursor-help"
                  aria-label="Silent preview — no measured narration"
                >
                  silent preview — no measured narration
                </span>
              </TooltipTrigger>
              <TooltipContent>
                No narration has been generated for this project. Generate narration to get measured audio timing.
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {hasAudio && (
          <audio
            ref={audioRef}
            src={`/api/assets/${state.narrationAssetId}`}
            preload="auto"
            className="hidden"
            aria-hidden
          />
        )}
      </div>
    </TooltipProvider>
  );
}

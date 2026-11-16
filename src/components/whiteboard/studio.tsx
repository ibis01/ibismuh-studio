"use client";

/**
 * Whiteboard Studio — interactive front-end for the whiteboard
 * animation pipeline ported from masihsultani/whiteboard-animator (MIT).
 *
 * The analysis engine runs in the browser for instant feedback; the
 * same engine backs POST /api/whiteboard/analyze for headless use, and
 * scenes persist through /api/whiteboard/scenes (Prisma/SQLite).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Download,
  Eraser,
  ImagePlus,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Save,
  Server,
  Trash2,
  Video,
} from "lucide-react";
import {
  analyzeWhiteboard,
  type PlanEntry,
  type WhiteboardAnalysis,
} from "@/lib/whiteboard/schedule";
import { decodeToRgb } from "@/lib/whiteboard/client";
import {
  RevealRenderer,
  drawMarkerSprite,
} from "@/lib/whiteboard/renderer";

interface SceneSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  stats: string;
  createdAt: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "decoding" }
  | { kind: "analyzing" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

const SAMPLE_URL = "/samples/sketch.png";

export default function WhiteboardStudio() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [sourceName, setSourceName] = useState<string>("");
  const [sourceDataUrl, setSourceDataUrl] = useState<string>("");
  const [analysis, setAnalysis] = useState<WhiteboardAnalysis | null>(null);
  const [rgbRef, setRgbRef] = useState<Uint8Array | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  // Playback
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState("1");
  const [loop, setLoop] = useState(true);
  const [showMarker, setShowMarker] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Options
  const [sceneDuration, setSceneDuration] = useState(8);
  const [fadeDuration, setFadeDuration] = useState(0.12);
  const [drawFraction, setDrawFraction] = useState(0.7);

  // Persistence
  const [scenes, setScenes] = useState<SceneSummary[]>([]);
  const [saveName, setSaveName] = useState("");
  const [busyScene, setBusyScene] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<RevealRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const exportingRef = useRef<MediaRecorder | null>(null);

  const busy = status.kind === "decoding" || status.kind === "analyzing";
  const total = analysis?.totalDuration ?? 8;

  // ------------------------------------------------------------------
  // Analysis
  // ------------------------------------------------------------------

  const runAnalysis = useCallback(
    async (rgb: Uint8Array, w: number, h: number, opts: {
      sceneDuration: number;
      fadeDuration: number;
      drawFraction: number;
    }) => {
      setStatus({ kind: "analyzing" });
      // Yield a frame so the UI paints the analyzing state first.
      await new Promise((r) => setTimeout(r, 30));
      try {
        const result = analyzeWhiteboard(new Uint8Array(rgb), w, h, {
          sceneDuration: opts.sceneDuration,
          fadeDuration: opts.fadeDuration,
          drawFraction: opts.drawFraction,
        });
        setAnalysis(result);
        setRgbRef(rgb);
        setDims({ w, h });
        rendererRef.current = new RevealRenderer({
          width: w,
          height: h,
          rgb,
          timing: result.timing,
          fadeDuration: opts.fadeDuration,
        });
        setStatus({ kind: "ready" });
        timeRef.current = 0;
        setTime(0);
        setPlaying(true);
        playingRef.current = true;
        if (result.warnings.length > 0) {
          toast.warning("Analysis finished with warnings", {
            description: result.warnings[0],
          });
        }
      } catch (err) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "analysis failed",
        });
      }
    },
    [],
  );

  const loadImage = useCallback(
    async (input: File | Blob | string, name: string) => {
      setPlaying(false);
      playingRef.current = false;
      setStatus({ kind: "decoding" });
      try {
        const decoded = await decodeToRgb(input);
        setSourceName(name);
        setSourceDataUrl(decoded.dataUrl);
        await runAnalysis(decoded.rgb, decoded.width, decoded.height, {
          sceneDuration,
          fadeDuration,
          drawFraction,
        });
      } catch (err) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "failed to load image",
        });
        toast.error("Could not load image", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [drawFraction, fadeDuration, runAnalysis, sceneDuration],
  );

  // Re-run analysis when timing options change (image already loaded).
  const optionsKey = `${sceneDuration}|${fadeDuration}|${drawFraction}`;
  const prevOptionsKey = useRef(optionsKey);
  useEffect(() => {
    if (
      rgbRef &&
      dims &&
      status.kind === "ready" &&
      prevOptionsKey.current !== optionsKey
    ) {
      prevOptionsKey.current = optionsKey;
      void runAnalysis(rgbRef, dims.w, dims.h, {
        sceneDuration,
        fadeDuration,
        drawFraction,
      });
    }
  }, [optionsKey, dims, rgbRef, runAnalysis, sceneDuration, fadeDuration, drawFraction, status.kind]);

  // ------------------------------------------------------------------
  // Playback loop
  // ------------------------------------------------------------------

  useEffect(() => {
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const renderer = rendererRef.current;
      const canvas = canvasRef.current;
      if (!renderer || !canvas) return;

      const last = lastFrameRef.current ?? now;
      const dt = Math.min((now - last) / 1000, 0.1);
      lastFrameRef.current = now;

      if (playingRef.current) {
        let next = timeRef.current + dt * Number(speed);
        const end = renderer.drawEnd > 0 ? total : 0.001;
        if (next >= end) {
          if (exportingRef.current) {
            next = end;
            playingRef.current = false;
            setPlaying(false);
            stopExport();
          } else if (loop) {
            next = 0;
          } else {
            next = end;
            playingRef.current = false;
            setPlaying(false);
          }
        }
        timeRef.current = next;
        setTime(next);
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (!imageDataCache.current || imageDataCache.current.width !== renderer.width) {
        imageDataCache.current = ctx.createImageData(renderer.width, renderer.height);
      }
      const t = timeRef.current;
      renderer.renderAt(t, imageDataCache.current);
      ctx.putImageData(imageDataCache.current, 0, 0);

      if (showMarker) {
        const front = renderer.frontAt(t);
        if (front) {
          const scale = Math.max(canvas.width / 900, 0.55);
          drawMarkerSprite(ctx, front.x, front.y, scale);
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loop, showMarker, speed, total]);

  const imageDataCache = useRef<ImageData | null>(null);

  // ------------------------------------------------------------------
  // Export (WebM) + snapshot
  // ------------------------------------------------------------------

  const stopExport = useCallback(() => {
    const rec = exportingRef.current;
    exportingRef.current = null;
    if (rec && rec.state !== "inactive") rec.stop();
    setExporting(false);
  }, []);

  const exportWebM = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    if (typeof MediaRecorder === "undefined") {
      toast.error("MediaRecorder unavailable in this browser");
      return;
    }
    const mime =
      ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
        (m) => MediaRecorder.isTypeSupported(m),
      ) ?? "";
    if (!mime) {
      toast.error("No WebM encoder available in this browser");
      return;
    }
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 6_000_000,
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(sourceName || "whiteboard").replace(/\.[a-z0-9]+$/i, "")}-whiteboard.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("WebM export ready", {
        description: `${(blob.size / 1024 / 1024).toFixed(1)} MB saved to downloads`,
      });
    };
    exportingRef.current = rec;
    setExporting(true);
    timeRef.current = 0;
    setTime(0);
    playingRef.current = true;
    setPlaying(true);
    rec.start(250);
  }, [sourceName]);

  const snapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(sourceName || "whiteboard").replace(/\.[a-z0-9]+$/i, "")}-frame.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  }, [sourceName]);

  // ------------------------------------------------------------------
  // Scenes persistence
  // ------------------------------------------------------------------

  const refreshScenes = useCallback(async () => {
    try {
      const res = await fetch("/api/whiteboard/scenes");
      const json = await res.json();
      if (res.ok) setScenes(json.scenes ?? []);
    } catch {
      // Non-fatal: the studio works without persistence.
    }
  }, []);

  useEffect(() => {
    void refreshScenes();
  }, [refreshScenes]);

  const saveScene = useCallback(async () => {
    if (!sourceDataUrl || !analysis) return;
    setBusyScene(true);
    try {
      const res = await fetch("/api/whiteboard/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName || sourceName || "Untitled sketch",
          dataUrl: sourceDataUrl,
          width: analysis.width,
          height: analysis.height,
          options: { sceneDuration, fadeDuration, drawFraction },
          stats: analysis.stats,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "save failed");
      toast.success("Scene saved");
      setSaveName("");
      void refreshScenes();
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusyScene(false);
    }
  }, [analysis, drawFraction, fadeDuration, refreshScenes, saveName, sceneDuration, sourceDataUrl, sourceName]);

  const loadScene = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/whiteboard/scenes/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "load failed");
        const scene = json.scene;
        const opts = JSON.parse(scene.options || "{}");
        setSceneDuration(Number(opts.sceneDuration) || 8);
        setFadeDuration(Number(opts.fadeDuration) || 0.12);
        setDrawFraction(Number(opts.drawFraction) || 0.7);
        await loadImage(scene.imageData, scene.name);
      } catch (err) {
        toast.error("Load failed", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [loadImage],
  );

  const deleteScene = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/whiteboard/scenes/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("delete failed");
        void refreshScenes();
        toast.success("Scene deleted");
      } catch (err) {
        toast.error("Delete failed", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refreshScenes],
  );

  // ------------------------------------------------------------------
  // Server pipeline check
  // ------------------------------------------------------------------

  const verifyOnServer = useCallback(async () => {
    if (!sourceDataUrl) return;
    const id = toast.loading("Running server pipeline...");
    try {
      const res = await fetch("/api/whiteboard/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: sourceDataUrl,
          options: { sceneDuration, fadeDuration, drawFraction },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "server analysis failed");
      const s = json.stats;
      toast.success("Server pipeline OK", {
        id,
        description: `${s.components} components (strokes ${s.strokes} / fills ${s.fills} / text ${s.text}) — ${(s.analyzeMs / 1000).toFixed(2)}s server-side`,
      });
    } catch (err) {
      toast.error("Server analysis failed", {
        id,
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }, [drawFraction, fadeDuration, sceneDuration, sourceDataUrl]);

  // ------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------

  const stats = analysis?.stats;
  const planTop = useMemo(() => analysis?.plan ?? [], [analysis]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) void loadImage(file, file.name);
    },
    [loadImage],
  );

  const seek = (v: number) => {
    timeRef.current = v;
    setTime(v);
  };

  const togglePlay = () => {
    if (!analysis) return;
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
    } else {
      if (timeRef.current >= total - 0.01) seek(0);
      playingRef.current = true;
      setPlaying(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Toaster position="bottom-right" richColors />

      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-4 flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Eraser className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">
              Whiteboard Studio
            </h1>
            <p className="text-sm text-muted-foreground">
              Turn any whiteboard-style sketch into a hand-drawn animation —
              deterministic reveal-time pipeline ported from{" "}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://github.com/masihsultani/whiteboard-animator"
                target="_blank"
                rel="noreferrer noopener"
              >
                whiteboard-animator
              </a>{" "}
              (MIT)
            </p>
          </div>
          <Badge variant="secondary" className="ml-auto shrink-0">
            skeleton strokes · junction pairing · brush fills
          </Badge>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
          {/* ---------------- Controls ---------------- */}
          <section className="space-y-6" aria-label="Controls">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Sketch</CardTitle>
                <CardDescription>
                  Ink on white works best — marker-style drawings, flat
                  colors, no photos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors hover:bg-accent/40"
                  role="button"
                  tabIndex={0}
                  aria-label="Upload a sketch image"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      document.getElementById("wb-file-input")?.click();
                    }
                  }}
                >
                  <ImagePlus className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    Drop a PNG/JPG here
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => document.getElementById("wb-file-input")?.click()}
                    disabled={busy}
                  >
                    Choose file
                  </Button>
                  <input
                    id="wb-file-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void loadImage(file, file.name);
                      e.target.value = "";
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => void loadImage(SAMPLE_URL, "sample-sketch.png")}
                  disabled={busy}
                >
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  Load sample sketch
                </Button>
                {sourceName && (
                  <p className="truncate text-xs text-muted-foreground" title={sourceName}>
                    Current: {sourceName}
                    {dims && ` (${dims.w}×${dims.h})`}
                  </p>
                )}
                {status.kind === "error" && (
                  <p className="text-sm text-destructive">{status.message}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Timing</CardTitle>
                <CardDescription>
                  Changes re-run the deterministic pipeline instantly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="dur">Scene duration</Label>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {sceneDuration}s
                    </span>
                  </div>
                  <Slider
                    id="dur"
                    min={2}
                    max={30}
                    step={1}
                    value={[sceneDuration]}
                    onValueChange={([v]) => setSceneDuration(v)}
                    disabled={!rgbRef}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="frac">Draw window</Label>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {Math.round(drawFraction * 100)}% of scene
                    </span>
                  </div>
                  <Slider
                    id="frac"
                    min={0.3}
                    max={1}
                    step={0.05}
                    value={[drawFraction]}
                    onValueChange={([v]) => setDrawFraction(v)}
                    disabled={!rgbRef}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="fade">Pixel fade-in</Label>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {fadeDuration.toFixed(2)}s
                    </span>
                  </div>
                  <Slider
                    id="fade"
                    min={0.02}
                    max={0.4}
                    step={0.02}
                    value={[fadeDuration]}
                    onValueChange={([v]) => setFadeDuration(v)}
                    disabled={!rgbRef}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="marker" className="text-sm">Marker sprite</Label>
                    <p className="text-xs text-muted-foreground">
                      Pen follows the drawing front
                    </p>
                  </div>
                  <Switch
                    id="marker"
                    checked={showMarker}
                    onCheckedChange={setShowMarker}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="loop" className="text-sm">Loop playback</Label>
                    <p className="text-xs text-muted-foreground">
                      Restart after the hold
                    </p>
                  </div>
                  <Switch id="loop" checked={loop} onCheckedChange={setLoop} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pipeline &amp; storage</CardTitle>
                <CardDescription>
                  The API runs the same engine server-side; scenes persist in
                  SQLite.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => void verifyOnServer()}
                    disabled={!sourceDataUrl || busy}
                  >
                    <Server className="h-4 w-4" aria-hidden="true" />
                    Verify on server
                  </Button>
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Input
                    placeholder="Scene name"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    aria-label="Scene name"
                    maxLength={120}
                  />
                  <Button
                    size="sm"
                    onClick={() => void saveScene()}
                    disabled={!sourceDataUrl || busyScene}
                    aria-label="Save scene"
                  >
                    {busyScene ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                {scenes.length > 0 && (
                  <ScrollArea className="max-h-56 pr-2">
                    <ul className="space-y-2">
                      {scenes.map((scene) => (
                        <li
                          key={scene.id}
                          className="flex items-center gap-2 rounded-md border p-2"
                        >
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => void loadScene(scene.id)}
                            aria-label={`Load scene ${scene.name}`}
                          >
                            <span className="block truncate text-sm font-medium">
                              {scene.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {scene.width}×{scene.height} ·{" "}
                              {new Date(scene.createdAt).toLocaleString()}
                            </span>
                          </button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => void deleteScene(scene.id)}
                            aria-label={`Delete scene ${scene.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </section>

          {/* ---------------- Stage ---------------- */}
          <section className="space-y-4" aria-label="Preview">
            <Card className="overflow-hidden">
              <CardContent className="p-4">
                <div className="relative flex items-center justify-center rounded-lg border bg-white">
                  {analysis && dims ? (
                    <canvas
                      ref={canvasRef}
                      width={dims.w}
                      height={dims.h}
                      className="max-h-[560px] w-auto max-w-full object-contain"
                      aria-label="Whiteboard animation preview"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 text-center">
                      {busy ? (
                        <>
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
                          <p className="text-sm text-muted-foreground">
                            {status.kind === "decoding"
                              ? "Decoding image..."
                              : "Tracing strokes, scheduling the hand..."}
                          </p>
                        </>
                      ) : (
                        <>
                          <Eraser className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                          <p className="max-w-xs text-sm text-muted-foreground">
                            Load a sketch to watch it draw itself — outlines
                            first, then fills, text written word by word.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  {exporting && (
                    <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-destructive px-3 py-1 text-xs font-medium text-white">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                      Recording WebM…
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <Button
                  size="icon"
                  onClick={togglePlay}
                  disabled={!analysis || exporting}
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? (
                    <Pause className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => seek(0)}
                  disabled={!analysis || exporting}
                  aria-label="Restart"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div className="flex min-w-[160px] flex-1 items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={total}
                    step={0.01}
                    value={time}
                    onChange={(e) => seek(Number(e.target.value))}
                    className="w-full accent-primary"
                    disabled={!analysis || exporting}
                    aria-label="Seek"
                  />
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                    {time.toFixed(1)} / {total.toFixed(1)}s
                  </span>
                </div>
                <Select
                  value={speed}
                  onValueChange={setSpeed}
                  disabled={exporting}
                >
                  <SelectTrigger className="w-24" aria-label="Playback speed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5">0.5×</SelectItem>
                    <SelectItem value="1">1×</SelectItem>
                    <SelectItem value="1.5">1.5×</SelectItem>
                    <SelectItem value="2">2×</SelectItem>
                    <SelectItem value="4">4×</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={snapshot}
                  disabled={!analysis}
                  aria-label="Save current frame as PNG"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Frame
                </Button>
                <Button
                  variant="secondary"
                  onClick={exportWebM}
                  disabled={!analysis || exporting}
                  aria-label="Export animation as WebM"
                >
                  <Video className="h-4 w-4" aria-hidden="true" />
                  Export WebM
                </Button>
              </CardContent>
            </Card>
          </section>

          {/* ---------------- Stats & plan ---------------- */}
          <section className="space-y-6" aria-label="Analysis details">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                {stats ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Stat label="Components" value={stats.components} />
                      <Stat label="Strokes" value={stats.strokes} />
                      <Stat label="Fills" value={stats.fills} />
                      <Stat label="Text blocks" value={stats.text} />
                      <Stat label="Ink pixels" value={stats.inkPixels.toLocaleString()} />
                      <Stat label="Draw ends" value={`${analysis?.drawEnd.toFixed(2)}s`} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Analyzed in {stats.analyzeMs} ms · deterministic
                      (geometry-seeded RNG)
                    </p>
                    {analysis && analysis.warnings.length > 0 && (
                      <p className="text-xs text-amber-600">
                        {analysis.warnings.join(" ")}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No analysis yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Draw order</CardTitle>
                <CardDescription>
                  How the hand would draw it — containers first, reading
                  order, text last.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {planTop.length > 0 ? (
                  <ScrollArea className="max-h-96 pr-2 [&>[data-radix-scroll-area-viewport]]:max-h-96 [&>[data-radix-scroll-area-viewport]>div]:min-w-0">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card text-muted-foreground">
                        <tr>
                          <th className="py-1.5 pr-2 text-left font-medium">#</th>
                          <th className="py-1.5 pr-2 text-left font-medium">Type</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Start</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Dur</th>
                          <th className="py-1.5 text-right font-medium">Area</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {planTop.map((entry) => (
                          <tr key={entry.index} className="text-foreground">
                            <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
                              {entry.index}
                            </td>
                            <td className="py-1.5 pr-2">
                              <PlanBadge type={entry.type} failures={entry.failures} />
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">
                              {entry.start.toFixed(2)}s
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">
                              {entry.duration.toFixed(2)}s
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                              {entry.area.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The draw order appears here after analysis.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      <footer className="mt-auto border-t bg-card">
        <div className="mx-auto max-w-7xl px-4 py-4 text-center text-sm text-muted-foreground">
          Whiteboard Studio · deterministic reveal-time engine · TypeScript
          port of{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href="https://github.com/masihsultani/whiteboard-animator"
            target="_blank"
            rel="noreferrer noopener"
          >
            masihsultani/whiteboard-animator
          </a>{" "}
          (MIT)
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PlanBadge({
  type,
  failures,
}: {
  type: PlanEntry["type"];
  failures: number;
}) {
  const variant =
    type === "fill"
      ? "default"
      : type === "text"
        ? "secondary"
        : type === "group"
          ? "outline"
          : "outline";
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={variant} className="capitalize">
        {type}
      </Badge>
      {failures > 0 && (
        <span className="text-amber-600" title={`${failures} pixels backfilled`}>
          ⚠
        </span>
      )}
    </span>
  );
}

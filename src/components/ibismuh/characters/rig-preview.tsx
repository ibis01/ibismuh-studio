"use client";

// S125 (K1) — the rig preview: the playback seam (the graphics-canvas law,
// mirrored onto the rig contract). The component plays the rig by calling
// the engine's PURE frame truth (rig-frame.ts poseAt) and applying it with
// THE SAME page-side applier (rig-compose.ts APPLY_RIG_FRAME_FN) inside a
// same-origin srcdoc iframe — the exact composition (composeRigScene) and
// the exact per-frame DOM contract the chromium renderer uses. Scrubbable
// playback is correct BY CONSTRUCTION: what the preview shows at t=2.3s is
// what the MP4 will contain at t=2.3s. There is no second animation
// implementation to drift.
//
// THE COMPILE-ONLY STRIP: the pose timeline + mouth schedule below the
// canvas are compiled CLIENT-SIDE by the same pure planner the renderer
// uses (rig-director.ts planRigTimeline) — beats are a planning artifact,
// shown here so the author can SEE the gestures and mouth beats land inside
// their word spans. The scope claim rides every strip: BEAT-SYNC, not
// phoneme lip-sync (the §6 honesty law, in the UI too).
//
// Viewport law (the wb-canvas S68 receipt): the iframe is laid out at the
// STAGE's real pixel size and scaled to fit with a CSS transform — the SVG
// never clips inside a smaller viewport.
import { useCallback, useEffect, useRef, useState } from "react";

import { APPLY_RIG_FRAME_FN, composeRigScene, rigFramePayload } from "@/lib/ibismuh/characters/rig-compose";
import { planRigTimeline } from "@/lib/ibismuh/characters/rig-director";
import { poseAt } from "@/lib/ibismuh/characters/rig-frame";
import type { CharacterRigDoc, RigPartArt } from "@/lib/ibismuh/characters/rig2d";

export interface RigPreviewProps {
  doc: CharacterRigDoc;
  parts: RigPartArt[];
  narration: string;
  durationMs?: number;
}

/** The compiled plan shape the strip reads (kept local — a display type). */
interface StripWindow {
  kind: "pose" | "mouth";
  label: string;
  startMs: number;
  endMs: number;
}

export default function RigPreview({ doc, parts, narration, durationMs }: RigPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const tRef = useRef(0);
  const applyRef = useRef<((tMs: number) => void) | null>(null);
  const setupRef = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);
  const [tMs, setTMs] = useState(0);

  const totalMs = Math.max(1200, durationMs ?? 4000);
  const frameDurMs = 1000 / doc.fps;
  const viewScale = Math.min(320 / doc.width, 320 / doc.height);

  // The compile — the renderer's own planner, client-side, deterministic.
  const plan = planRigTimeline({ narration, rig: doc, durationMs: totalMs, anchors: null });

  // The apply + setup closures (rebuilt when the doc/parts change).
  useEffect(() => {
    const applyFrame = (t: number): void => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      const frame = poseAt(doc, plan.timeline, Math.max(0, Math.min(t, totalMs)), plan.speech);
      (win as unknown as { __rApply?: (p: string) => boolean }).__rApply?.(rigFramePayload(frame));
    };
    const setup = (): void => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const docd = iframe.contentDocument;
      if (!docd || !docd.body) return;
      const script = docd.createElement("script");
      script.textContent = `window.__rApply = (${APPLY_RIG_FRAME_FN});`;
      docd.body.appendChild(script);
      applyFrame(tRef.current);
    };
    applyRef.current = applyFrame;
    setupRef.current = setup;
  }, [doc, plan, totalMs]);

  // The srcdoc — the deterministic rest frame (one compose per doc).
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = composeRigScene(doc, parts).html;
  }, [doc, parts]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => setupRef.current?.();
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, []);

  // The playback loop: rAF drives the scene clock at doc.fps.
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const step = (): void => {
      tRef.current += frameDurMs;
      const t = Math.min(tRef.current, totalMs);
      applyRef.current?.(t);
      setTMs(t);
      if (tRef.current >= totalMs) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, frameDurMs, totalMs]);

  const scrub = useCallback(
    (t: number) => {
      tRef.current = t;
      setTMs(t);
      applyRef.current?.(t);
    },
    []
  );

  // The strip windows — pose holds + mouth-open beats (the compiled truth).
  const windows: StripWindow[] = [];
  for (let i = 0; i < plan.timeline.rows.length; i++) {
    const row = plan.timeline.rows[i];
    const next = plan.timeline.rows[i + 1];
    const end = next ? next.tMs : totalMs;
    if (row.poseId) {
      windows.push({ kind: "pose", label: row.poseId, startMs: row.tMs, endMs: Math.max(end, row.tMs + 1) });
    }
  }
  for (const seg of plan.speech.segments) {
    windows.push({ kind: "mouth", label: seg.variant, startMs: seg.startMs, endMs: seg.endMs });
  }
  windows.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const reset = () => {
    setPlaying(false);
    queueMicrotask(() => {
      tRef.current = 0;
      setTMs(0);
      applyRef.current?.(0);
    });
  };

  const togglePlay = () => {
    if (!playing && tRef.current >= totalMs) {
      tRef.current = 0;
      setTMs(0);
    }
    setPlaying(!playing);
  };

  return (
    <div className="space-y-2.5">
      <div
        className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-black/30 flex items-center justify-center"
        style={{ height: 320 }}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: `translate(-50%, -50%) scale(${viewScale})` }}
        >
          <iframe
            ref={iframeRef}
            title="Rig preview"
            sandbox="allow-same-origin allow-scripts"
            style={{
              width: doc.width,
              height: doc.height,
              border: "none",
              background: doc.background,
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium hover:bg-white/10"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium hover:bg-white/10"
        >
          Reset
        </button>
        <input
          type="range"
          min={0}
          max={totalMs}
          step={frameDurMs}
          value={tMs}
          onChange={(e) => scrub(Number(e.target.value))}
          aria-label="Scrub the rig preview"
          className="h-1.5 flex-1 cursor-pointer accent-violet-400"
        />
        <span className="w-12 text-right text-[10px] text-muted-foreground tabular-nums">
          {(tMs / 1000).toFixed(1)}s
        </span>
      </div>

      {/* The pose-timeline strip — gestures + mouth beats on the scene clock */}
      <div>
        <div className="relative h-7 rounded-md border border-white/10 bg-white/5 overflow-hidden">
          {windows.map((w, i) => (
            <div
              key={`${w.kind}-${i}`}
              title={`${w.kind === "pose" ? "gesture" : "mouth"} ${w.label} — ${(w.startMs / 1000).toFixed(2)}s..${(w.endMs / 1000).toFixed(2)}s`}
              className={
                w.kind === "pose"
                  ? "absolute top-0 bottom-0 rounded-[3px] bg-violet-500/35 border border-violet-400/50"
                  : "absolute bottom-0 h-3 rounded-[3px] bg-emerald-500/40 border border-emerald-400/40"
              }
              style={{
                left: `${(w.startMs / totalMs) * 100}%`,
                width: `${Math.max(0.5, ((w.endMs - w.startMs) / totalMs) * 100)}%`,
              }}
            />
          ))}
          <div
            className="absolute top-0 bottom-0 w-px bg-white/70"
            style={{ left: `${(tMs / totalMs) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
          <span className="text-violet-300">Violet</span> = gesture holds ·{" "}
          <span className="text-emerald-300">green</span> = mouth-open beats
          inside their word spans. Beat-sync, not phoneme lip-sync — the honest
          claim (K1 §6).
        </p>
      </div>
    </div>
  );
}

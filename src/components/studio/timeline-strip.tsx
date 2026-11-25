"use client";

// timeline-strip.tsx — §6.4 the four-row timeline: audio, scenes, ops,
// markers — with a playhead across all rows. Click anywhere to seek.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectState } from "@/lib/ibismuh/api-dto";
import type { TimelineOp } from "@/lib/ibismuh/timeline-ops";
import { totalDurationMs } from "./lane-renderer";
import { formatTimeMs } from "./preview-player";
import { useStudioTransport } from "./studio-store";

const OP_FAMILY_COLORS: Record<string, string> = {
  showAsset: "#d98f3e",
  hideAsset: "#8a6a3f",
  cameraMove: "#e8b64c",
  drawPath: "#4ec9b0",
  writeText: "#a58fd8",
  fillRegion: "#5fbf77",
  poseCharacter: "#c77dba",
  revealSlide: "#a58fd8",
  caption: "#8d8983",
  transition: "#c9c5c0",
  hold: "#57534e",
  sfxCue: "#e8b64c",
};

interface TimelineStripProps {
  state: ProjectState;
  accentHex: string;
}

export function TimelineStrip({ state, accentHex }: TimelineStripProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(960);

  const timeMs = useStudioTransport((s) => s.timeMs);
  const requestSeek = useStudioTransport((s) => s.requestSeek);
  const selectedSceneRef = useStudioTransport((s) => s.selectedSceneRef);
  const setSelectedSceneRef = useStudioTransport((s) => s.setSelectedSceneRef);

  const plan = state.planRevision?.plan ?? null;
  const total = Math.max(1, totalDurationMs(plan) || state.audioReceipt?.durationMs || 0);
  const hasPlan = Boolean(plan);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setViewportW(Math.max(320, entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // <= 120s fits the viewport width; longer videos scroll at 120s-per-viewport
  const scale = viewportW / (total <= 120_000 ? total : 120_000);
  const contentW = Math.max(viewportW, total * scale);
  const playheadX = Math.min(timeMs, total) * scale;

  const beats = useMemo(() => plan?.beats ?? [], [plan]);
  const scenes = plan ? (state.planRevision?.laneScenes ?? []) : [];

  const sceneWindow = useCallback(
    (sceneRef: string): { startMs: number; endMs: number } | null => {
      const beat = beats.find((b) => b.sceneRef === sceneRef || b.id === sceneRef);
      return beat ? beat.narrationWindow : null;
    },
    [beats],
  );

  // audio bars: sentence spans when measured, beat windows otherwise
  const audioBars = useMemo(() => {
    const spans = state.audioReceipt?.sentenceSpans?.length
      ? state.audioReceipt.sentenceSpans.map((s) => ({ startMs: s.startMs, endMs: s.endMs }))
      : beats.length
        ? beats.map((b) => ({ startMs: b.narrationWindow.startMs, endMs: b.narrationWindow.endMs }))
        : [];
    return spans
      .filter((s) => s.endMs > s.startMs)
      .map((s) => ({
        left: s.startMs * scale,
        width: Math.max(2, (s.endMs - s.startMs) * scale - 2),
      }));
  }, [state.audioReceipt, beats, scale]);

  const ops: TimelineOp[] = plan?.timeline.ops ?? [];

  const markers = useMemo(() => {
    const list: Array<{ x: number; color: string; label: string }> = [];
    for (const check of state.qc?.checks ?? []) {
      if (check.pass || !check.sceneRef) continue;
      const win = sceneWindow(check.sceneRef);
      if (!win) continue;
      list.push({
        x: win.startMs * scale,
        color: check.severity === "fail" ? "#ef4444" : "#f59e0b",
        label: `QC ${check.severity}: ${check.title} — ${check.message}`,
      });
    }
    const repairEvents = state.events.filter((e) => e.level === "warn" || e.level === "error");
    repairEvents.forEach((e, i) => {
      const x = e.sceneRef ? (sceneWindow(e.sceneRef)?.startMs ?? ((i + 1) * total) / (repairEvents.length + 1)) * scale : ((i + 1) * total) / (repairEvents.length + 1) * scale;
      list.push({
        x,
        color: e.level === "error" ? "#ef4444" : "#f59e0b",
        label: `${e.stage}: ${e.message}`,
      });
    });
    return list;
  }, [state.qc, state.events, sceneWindow, scale, total]);

  // seek on click / drag anywhere in the rows area
  const seekFromPointer = useCallback(
    (clientX: number, target: HTMLElement) => {
      const rect = target.getBoundingClientRect();
      const ms = Math.min(Math.max(0, clientX - rect.left), total) / scale;
      requestSeek(ms * 1);
    },
    [requestSeek, scale, total],
  );

  const draggingRef = useRef(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasPlan) return;
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    seekFromPointer(e.clientX, e.currentTarget);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !hasPlan) return;
    seekFromPointer(e.clientX, e.currentTarget);
  };
  const onPointerUp = () => {
    draggingRef.current = false;
  };

  return (
    <div className="studio-scroll overflow-x-auto overflow-y-hidden h-full" ref={wrapRef}>
      <div
        className="relative h-full select-none touch-pan-y"
        style={{ width: contentW, minWidth: "100%" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="slider"
        aria-label="Timeline — click or drag to seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(timeMs)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") requestSeek(Math.min(total, timeMs + 500));
          if (e.key === "ArrowLeft") requestSeek(Math.max(0, timeMs - 500));
        }}
      >
        {!hasPlan ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            Compile a plan to see the timeline — narration windows, scene blocks, and ops appear here.
          </div>
        ) : (
          <div className="flex h-full flex-col gap-px py-1">
            {/* row 1 — audio */}
            <div className="relative h-8 shrink-0 rounded bg-stone-900/80 overflow-hidden" aria-label="Narration audio row">
              {audioBars.map((bar, i) => (
                <div
                  key={`ab-${i}`}
                  className="absolute top-0 bottom-0 rounded-[2px] bg-stone-600/70"
                  style={{ left: bar.left, width: bar.width }}
                />
              ))}
              {audioBars.length === 0 && (
                <div className="flex h-full w-full items-center px-3 text-xs text-zinc-500 tf-mono">
                  no measured audio — estimate timing
                </div>
              )}
              {audioBars.length > 0 && (
                <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: playheadX }} aria-hidden>
                  {audioBars.map((bar, i) => (
                    <div
                      key={`abp-${i}`}
                      className="absolute top-0 bottom-0 rounded-[2px]"
                      style={{ left: bar.left, width: bar.width, background: accentHex, opacity: 0.85 }}
                    />
                  ))}
                </div>
              )}
              <span className="absolute right-2 top-0.5 text-xs tf-mono text-zinc-500 uppercase tracking-wide pointer-events-none">
                audio
              </span>
            </div>

            {/* row 2 — scenes */}
            <div className="relative min-h-9 flex-1 rounded bg-stone-900/80 overflow-hidden" aria-label="Scenes row">
              {beats.map((beat) => {
                const selected = Boolean(beat.sceneRef && beat.sceneRef === selectedSceneRef);
                return (
                  <button
                    key={beat.id}
                    type="button"
                    aria-label={`Select scene ${beat.sceneRef ?? beat.id}`}
                    className={`absolute top-1 bottom-1 rounded border text-left overflow-hidden transition-colors ${
                      selected ? "border-amber-400" : "border-stone-700 hover:border-stone-500"
                    }`}
                    style={{
                      left: beat.narrationWindow.startMs * scale,
                      width: Math.max(6, (beat.narrationWindow.endMs - beat.narrationWindow.startMs) * scale - 2),
                      background: selected ? `${accentHex}55` : `${accentHex}2e`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSceneRef(beat.sceneRef ?? beat.id);
                      requestSeek(beat.narrationWindow.startMs + 40, beat.sceneRef ?? beat.id);
                    }}
                  >
                    <span className="block px-1.5 pt-0.5 text-xs leading-tight text-zinc-200 truncate tf-mono">
                      {beat.sceneRef ?? beat.id}
                    </span>
                    <span className="hidden sm:block px-1.5 text-xs leading-tight text-zinc-400 truncate">
                      {beat.visualIntent}
                    </span>
                  </button>
                );
              })}
              <span className="absolute right-2 top-0.5 text-xs tf-mono text-zinc-500 uppercase tracking-wide pointer-events-none">
                scenes · {scenes.length || beats.length}
              </span>
            </div>

            {/* row 3 — ops */}
            <div className="relative h-6 shrink-0 rounded bg-stone-900/80 overflow-hidden" aria-label="Operations row">
              {ops.map((op) => {
                const color = OP_FAMILY_COLORS[op.op] ?? "#8d8983";
                return (
                  <span
                    key={op.id}
                    title={`${op.op} · ${op.sceneRef ?? ""} · ${op.startMs}–${op.endMs}ms`}
                    className="absolute top-1 bottom-1 rounded-[1px]"
                    style={{
                      left: op.startMs * scale,
                      width: Math.max(2, (op.endMs - op.startMs) * scale),
                      background: color,
                      opacity: 0.75,
                    }}
                  />
                );
              })}
              <span className="absolute right-2 top-0.5 text-xs tf-mono text-zinc-500 uppercase tracking-wide pointer-events-none">
                ops · {ops.length}
              </span>
            </div>

            {/* row 4 — markers */}
            <div className="relative h-5 shrink-0 rounded bg-stone-900/80 overflow-hidden" aria-label="QC and repair markers row">
              {markers.map((m, i) => (
                <span
                  key={`mk-${i}`}
                  title={m.label}
                  className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border border-stone-950"
                  style={{ left: m.x - 6, background: m.color }}
                />
              ))}
              {markers.length === 0 && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs tf-mono text-zinc-600">
                  no QC or repair markers
                </span>
              )}
            </div>

            {/* playhead across all rows */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-amber-400 pointer-events-none"
              style={{ left: playheadX }}
              aria-hidden
            >
              <span className="absolute -top-0 -left-[5px] h-2.5 w-3 bg-amber-400" style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
            </div>
            <span
              className="absolute top-0 ml-2 text-xs tf-num text-amber-300/90 pointer-events-none"
              style={{ left: playheadX }}
              aria-hidden
            >
              {formatTimeMs(timeMs)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

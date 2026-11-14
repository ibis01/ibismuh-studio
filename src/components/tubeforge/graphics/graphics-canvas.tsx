"use client";

/**
 * S123 (G1) — the graphics preview canvas (P4, spec §7 #7): plays the doc's
 * OWN frame truth through the ONE applier — `frameAt` (graphics/frame.ts,
 * the pure ms clock) → `graphicsFramePayload` → `APPLY_GRAPHICS_FRAME_FN`
 * (graphics/compose.ts) inside a same-origin srcdoc iframe, the EXACT
 * mechanics the renderer runs inside chromium (one compose, one applier,
 * two callers — the wb-canvas seam law, mirrored).
 *
 * Client-safe by construction: frame.ts/compose.ts are pure modules (no
 * fs, no clock, no randomness), and the effective clock (VO fill) comes
 * from the SAME effectiveGraphicsDoc the renderer uses — the preview and
 * the render cannot disagree about timing (one clock end to end).
 *
 * No CSS animation, no layout reads per frame, no randomness — every write
 * is an absolute set on a static skeleton node (the applier's own law).
 * The doc's geometry scales ONCE per page build (an SVG transform on the
 * board, the same mechanism the renderer's draft raster uses) — never per
 * frame.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  APPLY_GRAPHICS_FRAME_FN,
  composeGraphicsScene,
  graphicsFramePayload,
} from "@/lib/tubeforge/graphics/compose";
import {
  effectiveGraphicsDoc,
  frameAt,
  graphicsSceneDurationsMs,
} from "@/lib/tubeforge/graphics/frame";
import type { GraphicsDoc } from "@/lib/tubeforge/graphics/types";

export interface GraphicsCanvasProps {
  doc: GraphicsDoc;
  /** Which scene the canvas is showing (the studio's scene selector). */
  sceneIndex: number;
  playing: boolean;
  /** Measured narration per scene id (the GET's voMs) — the effective
   *  clock's VO fill, the same math the render runs. */
  voMs?: Record<string, number>;
  /** Playback clock reports (scene-local ms, throttled to ~10 Hz). */
  onTime?: (tMs: number) => void;
  /** Fired when the scene's clock runs past its duration. */
  onEnded?: () => void;
  /** The studio's scrubber position (scene-local ms) — taken over when it
   *  changes by intent (paused, or moved > 250 ms). */
  tMs?: number;
  className?: string;
}

export default function GraphicsCanvas({
  doc,
  sceneIndex,
  playing,
  voMs,
  onTime,
  onEnded,
  tMs = 0,
  className,
}: GraphicsCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const tRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastReportRef = useRef(0);
  const applyRef = useRef<((tMs: number) => void) | null>(null);

  // The effective doc (VO fill) — ONE derivation with the renderer.
  const voMap = useMemo(() => new Map(Object.entries(voMs ?? {})), [voMs]);
  const effective = useMemo(() => effectiveGraphicsDoc(doc, voMap), [doc, voMap]);
  const sceneDurations = useMemo(() => graphicsSceneDurationsMs(effective), [effective]);
  const scene = effective.scenes[sceneIndex] ?? null;
  const durationMs = sceneDurations[sceneIndex] ?? 0;

  // The static skeleton: the composed scene html (pure — same input,
  // byte-identical output; the srcdoc swap only happens on doc/scene
  // change, never per frame).
  const composed = useMemo(
    () => (scene ? composeGraphicsScene(scene, effective) : null),
    [scene, effective]
  );

  // Clock truth lives in refs so the playback loop never re-renders React
  // per frame; the reported time (throttled) is the studio's state. The
  // latest-value refs assign in effects, never during render (React's ref
  // rules; the loop reads them at frame time — the wb-canvas law).
  const clockRef = useRef({ sceneStartMs: 0, durationMs, fps: effective.fps });
  useEffect(() => {
    clockRef.current = {
      sceneStartMs: sceneDurations.slice(0, sceneIndex).reduce((a, b) => a + b, 0),
      durationMs,
      fps: effective.fps,
    };
  }, [sceneDurations, sceneIndex, durationMs, effective.fps]);
  const cbsRef = useRef({ onTime, onEnded });
  useEffect(() => {
    cbsRef.current = { onTime, onEnded };
  }, [onTime, onEnded]);

  const applyFrame = (sceneLocalMs: number) => {
    const win = iframeRef.current?.contentWindow as
      | (Window & { __gfxApply?: (payloadJson: string) => void })
      | null
      | undefined;
    if (!win?.__gfxApply) return;
    const frame = frameAt(effective, clockRef.current.sceneStartMs + sceneLocalMs);
    win.__gfxApply(graphicsFramePayload(frame));
  };

  // Rebuild the page when the scene or the doc changes; reset the clock.
  // (No ready state — the wb-canvas law: the applier no-ops until the page
  // injects __gfxApply, so the playback loop can start before the load.)
  const prevSceneRef = useRef(-1);
  useEffect(() => {
    const sceneChanged = prevSceneRef.current !== sceneIndex;
    prevSceneRef.current = sceneIndex;
    if (sceneChanged) tRef.current = 0;
    const iframe = iframeRef.current;
    if (!iframe || !composed) return;

    const setup = () => {
      const docEl = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!docEl || !win) return;
      // The applier, injected once per page build — the page then drives it
      // exactly like the renderer's page.evaluate does (one applier, two
      // callers).
      const script = docEl.createElement("script");
      script.textContent = `window.__gfxApply = (${APPLY_GRAPHICS_FRAME_FN});`;
      docEl.body.appendChild(script);
      // The board fits the preview viewport ONCE (the renderer's draft
      // scale mechanism): the svg's own coordinate system scales to the
      // iframe's size; the frame truth is untouched.
      const board = docEl.getElementById("board");
      if (board) {
        const k = Math.min(
          docEl.documentElement.clientWidth / effective.width,
          docEl.documentElement.clientHeight / effective.height
        );
        if (Number.isFinite(k) && k > 0) {
          board.setAttribute("transform", `scale(${k})`);
          board.setAttribute("transform-origin", "0 0");
        }
      }
      applyRef.current?.(tRef.current);
    };
    applyRef.current = applyFrame;
    iframe.srcdoc = composed.html;
    iframe.addEventListener("load", setup, { once: true });
    return () => iframe.removeEventListener("load", setup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composed, sceneIndex]);

  // The playback loop: rAF drives the clock at the doc's own frame rate;
  // the frame truth applies per frame (never CSS, never a clock in the
  // page — the doc clock IS the timeline). The applier no-ops until the
  // page is loaded (the wb-canvas law).
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const step = (now: number) => {
      const clock = clockRef.current;
      const frameDurMs = 1000 / clock.fps;
      tRef.current += frameDurMs;
      applyRef.current?.(Math.min(tRef.current, clock.durationMs));
      if (now - lastReportRef.current > 100) {
        lastReportRef.current = now;
        cbsRef.current.onTime?.(Math.min(tRef.current, clock.durationMs));
      }
      if (tRef.current >= clock.durationMs + frameDurMs * 2) {
        cbsRef.current.onEnded?.();
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing]);

  // Scrub: a changed external tMs re-positions the clock and repaints the
  // frame. Our own playback reports echo back through the same prop — the
  // studio throttles them and passes them verbatim, so the tolerance here
  // is generous (anything under a quarter second is the loop's own echo).
  const lastAppliedRef = useRef(0);
  useEffect(() => {
    if (playing) return; // the loop owns the clock while playing
    if (Math.abs(tMs - lastAppliedRef.current) < 250) return;
    lastAppliedRef.current = tMs;
    tRef.current = tMs;
    applyRef.current?.(tMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tMs]);

  return (
    <div
      className={className}
      style={{
        aspectRatio: `${effective.width} / ${effective.height}`,
        maxHeight: "100%",
        maxWidth: "100%",
        margin: "0 auto",
        position: "relative",
        overflow: "hidden",
        borderRadius: 8,
        background: "#0a0a0a",
      }}
    >
      <iframe
        ref={iframeRef}
        title={`graphics scene ${sceneIndex + 1} preview`}
        style={{
          border: "0",
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />
    </div>
  );
}

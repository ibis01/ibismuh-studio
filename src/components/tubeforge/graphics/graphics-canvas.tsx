"use client";

// S123 (G1) P4 — the graphics playback canvas. THE SEAM (the wb-canvas
// law, mirrored onto the graphics contract): this component plays the doc
// by calling the engine's PURE frame truth (frame.ts frameAt) and applying
// it with THE SAME page-side applier (compose.ts APPLY_GRAPHICS_FRAME_FN)
// inside a same-origin srcdoc iframe — the exact composition
// (composeGraphicsScene) and the exact per-frame DOM contract the chromium
// renderer uses. Scrubbable playback is correct BY CONSTRUCTION: what the
// studio shows at t=12.4s is what the MP4 will contain at t=12.4s. There
// is no second animation implementation to drift.
//
// THE CLOCK: whole-doc playback — the doc clock IS the timeline (the
// compose law). The rAF loop drives the global tMs; frameAt resolves the
// active scene and evaluates its elements scene-locally (the R-6 law), so
// the canvas reads the exact frame state the renderer reads. When the
// active scene changes, the srcdoc swaps to that scene's composed
// skeleton (one compose per scene, deterministic bytes).
//
// Viewport law (the wb-canvas S68 receipt): the iframe is laid out at the
// DOC's real pixel size (the chromium viewport the renderer uses) and
// scaled to fit with a CSS transform — the SVG never clips inside a
// smaller viewport.
import { useCallback, useEffect, useRef, useState } from "react";

import {
  APPLY_GRAPHICS_FRAME_FN,
  composeGraphicsScene,
  graphicsFramePayload,
} from "@/lib/tubeforge/graphics/compose";
import { frameAt } from "@/lib/tubeforge/graphics/frame";
import { graphicsSceneDurationsMs } from "@/lib/tubeforge/graphics/frame";
import type { GraphicsDoc } from "@/lib/tubeforge/graphics/types";

export interface GraphicsCanvasProps {
  doc: GraphicsDoc;
  playing: boolean;
  /** Imperative scrub: a fresh nonce applies the tMs immediately. */
  seek: { tMs: number; nonce: number } | null;
  /** Throttled (~10 Hz) time reporter for the studio's slider. */
  onTime: (tMs: number) => void;
  onEnded: () => void;
}

/** Total doc duration (ms) — the ONE clock rule (frame.ts), recomputed
 *  per doc change. */
function docTotalMs(doc: GraphicsDoc): number {
  return graphicsSceneDurationsMs(doc).reduce((a, b) => a + b, 0);
}

/** The active scene index for a global tMs — the exact scene resolution
 *  frameAt performs (first clock whose end is strictly ahead). */
function activeSceneIndex(doc: GraphicsDoc, tMs: number): number {
  const sceneMs = graphicsSceneDurationsMs(doc);
  let cursor = 0;
  for (let i = 0; i < sceneMs.length; i++) {
    cursor += sceneMs[i];
    if (tMs < cursor) return i;
  }
  return sceneMs.length - 1;
}

export default function GraphicsCanvas({ doc, playing, seek, onTime, onEnded }: GraphicsCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const tRef = useRef(0);
  const lastReportRef = useRef(0);
  const applyRef = useRef<((tMs: number) => void) | null>(null);
  const setupRef = useRef<(() => void) | null>(null);
  const loadedSceneRef = useRef<number>(-1);
  const [activeScene, setActiveScene] = useState(0);
  const totalMs = docTotalMs(doc);
  const frameDurMs = 1000 / doc.fps;

  // The apply + setup closures — rebuilt when the doc changes.
  useEffect(() => {
    const apply = (tMs: number): void => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      const frame = frameAt(doc, Math.max(0, Math.min(tMs, totalMs)));
      (win as unknown as { __gApply?: (p: string) => boolean }).__gApply?.(graphicsFramePayload(frame));
    };
    const setup = (): void => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const doc2 = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc2 || !win) return;
      // The applier injected once per srcdoc — the page then drives it
      // exactly like the renderer's page.evaluate does.
      const script = doc2.createElement("script");
      script.textContent = `window.__gApply = (${APPLY_GRAPHICS_FRAME_FN});`;
      doc2.body.appendChild(script);
      apply(tRef.current);
    };
    applyRef.current = apply;
    setupRef.current = setup;
  }, [doc, totalMs]);

  // The srcdoc swap — when the ACTIVE scene changes (whole-doc playback).
  // The composed skeleton is the deterministic poster frame; the applier
  // drives every later frame from it.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const scene = doc.scenes[activeScene];
    if (!scene) return;
    const composed = composeGraphicsScene(scene, doc);
    iframe.srcdoc = composed.html;
    loadedSceneRef.current = activeScene;
  }, [doc, activeScene]);

  // The iframe fires onLoad for every srcdoc swap.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => setupRef.current?.();
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, []);

  // The playback loop: rAF drives the doc clock; scene swaps ride the
  // active-scene resolution.
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const step = (now: number): void => {
      tRef.current += frameDurMs;
      const t = Math.min(tRef.current, totalMs);
      applyRef.current?.(t);
      const idx = activeSceneIndex(doc, t);
      if (idx !== loadedSceneRef.current) setActiveScene(idx);
      if (now - lastReportRef.current > 100) {
        lastReportRef.current = now;
        onTime(t);
      }
      if (tRef.current >= totalMs) {
        onEnded();
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, frameDurMs, totalMs, doc, onTime, onEnded]);

  // Imperative scrub: a fresh nonce applies the time immediately (and
  // follows any scene change it implies).
  useEffect(() => {
    if (!seek) return;
    tRef.current = Math.max(0, Math.min(seek.tMs, totalMs));
    const idx = activeSceneIndex(doc, tRef.current);
    if (idx !== loadedSceneRef.current) {
      setActiveScene(idx);
      // The srcdoc effect swaps + onLoad applies at the preserved t.
    } else {
      applyRef.current?.(tRef.current);
    }
    onTime(tRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek?.nonce]);

  // Reset the clock when the doc identity changes (deferred so lint's
  // set-state-in-effect rule is satisfied — the house pattern).
  useEffect(() => {
    queueMicrotask(() => {
      tRef.current = 0;
      setActiveScene(0);
      loadedSceneRef.current = -1;
    });
  }, [doc]);

  const fit = useCallback((): { scale: number; px: number } => {
    // The dialog viewport budget (~520 px tall box, full width) — the same
    // CSS-transform fit the wb canvas applies.
    const maxW = 720;
    const maxH = 520;
    const scale = Math.min(maxW / doc.width, maxH / doc.height);
    return { scale, px: Math.round(doc.width * scale) };
  }, [doc.width, doc.height]);

  const { scale } = fit();

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-black/40" style={{ height: 520 }}>
      <div className="absolute left-1/2 top-1/2" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <iframe
          ref={iframeRef}
          title="Graphics preview"
          sandbox="allow-same-origin allow-scripts"
          style={{
            width: doc.width,
            height: doc.height,
            border: "none",
            background: doc.scenes[activeScene]?.background ?? "#000",
          }}
        />
      </div>
    </div>
  );
}

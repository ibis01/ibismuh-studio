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
//
// S124 — the element editor (the Layout mode). The component stays the
// pure playback seam unless `editable` is armed; the overlay is a
// HOST-page layer INSIDE the scaled wrapper (its units ARE doc units) —
// the iframe itself is never polluted, the composed page remains the
// exact render contract. The laws (docs/design/s124-graphics-element-
// editor.md):
//   edit mode plays the PLACED state (compose.ts placedGraphicsFrame —
//     the poster's own truth) through the ONE applier; nothing else
//     writes the DOM.
//   bounds/hit-testing read the composed page's OWN #ge-{id} rects (the
//     contract's geometry, not a second estimator); claimed children are
//     excluded (they ride their group's transform).
//   drag/scale math rides the PURE editor module (movedPlacement /
//     scaledPlacement); the gesture previews through the applier and
//     COMMITS once, to the studio's working buffer (the validated PUT is
//     the wall — this component never writes a doc).
//   the scale anchor is the placement point (the composer's translate… 
//     scale semantics), the handle is a distance-ratio gesture.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  APPLY_GRAPHICS_FRAME_FN,
  composeGraphicsScene,
  graphicsFramePayload,
  graphicsGroupClaims,
  placedGraphicsFrame,
} from "@/lib/ibismuh/graphics/compose";
import { frameAt } from "@/lib/ibismuh/graphics/frame";
import { graphicsSceneDurationsMs } from "@/lib/ibismuh/graphics/frame";
import {
  movedPlacement,
  scaledPlacement,
  topmostElementAt,
  type ElementBounds,
} from "@/lib/ibismuh/graphics/editor";
import type { Placement } from "@/lib/ibismuh/whiteboard/svg";
import type { GraphicsDoc } from "@/lib/ibismuh/graphics/types";

export interface GraphicsCanvasProps {
  doc: GraphicsDoc;
  playing: boolean;
  /** Imperative scrub: a fresh nonce applies the tMs immediately. */
  seek: { tMs: number; nonce: number } | null;
  /** Throttled (~10 Hz) time reporter for the studio's slider. */
  onTime: (tMs: number) => void;
  onEnded: () => void;
  /** S152 — the measured narration durations (scene id → ms, the GET
   *  route's WAV truth): the canvas plays the DELIVERED clock (explicit >
   *  VO + tail > estimate — the render's precedence, frame.ts). Absent =
   *  the estimate-only shape. */
  voMsBySceneId?: Record<string, number>;
  /** S126 — the resolved import bytes (assetKey → per-frame data URIs);
   *  the same resolution the render job runs (the one-seam law). Absent =
   *  spriteless preview (byte-identical to the pre-S126 compose). */
  spriteAssets?: Map<string, string[]>;
  /** S124 — arm the element editor (the studio's Layout mode). Playback
   *  is suspended while armed; the placed state + the overlay take over. */
  editable?: boolean;
  /** The selected element id (the studio owns selection). */
  selectedId?: string | null;
  /** Selection reported by the canvas (a hit, or null on empty space). */
  onSelect?: (id: string | null) => void;
  /** A committed gesture — the studio patches its working buffer; the
   *  validated PUT is the wall. `preview` phases are canvas-local and
   *  never leave this component. */
  onPlacement?: (sceneIndex: number, elId: string, at: Placement, phase: "preview" | "commit") => void;
}

/** Handle box ≈ 12 screen px, expressed in doc units at the view scale. */
const HANDLE_PX = 12;
/** Hit-test slop (doc units) — zero-area geometry (a bare <line>) stays
 *  grabbable along its length. */
const HIT_SLOP = 8;

/** Total doc duration (ms) — the ONE clock rule (frame.ts), recomputed
 *  per doc change. S152 — the measured map rides along (the delivered
 *  clock), absent → the estimate shape. */
function docTotalMs(doc: GraphicsDoc, voMs?: Map<string, number>): number {
  return graphicsSceneDurationsMs(doc, voMs).reduce((a, b) => a + b, 0);
}

/** The active scene index for a global tMs — the exact scene resolution
 *  frameAt performs (first clock whose end is strictly ahead). */
function activeSceneIndex(doc: GraphicsDoc, tMs: number, voMs?: Map<string, number>): number {
  const sceneMs = graphicsSceneDurationsMs(doc, voMs);
  let cursor = 0;
  for (let i = 0; i < sceneMs.length; i++) {
    cursor += sceneMs[i];
    if (tMs < cursor) return i;
  }
  return sceneMs.length - 1;
}

type Gesture = {
  mode: "drag" | "scale";
  id: string;
  sceneIndex: number;
  startAt: Placement;
  startPx: number;
  startPy: number;
  anchor: { x: number; y: number };
  startDist: number;
  bounds: ElementBounds;
  at: Placement;
};

export default function GraphicsCanvas({
  doc,
  playing,
  seek,
  onTime,
  onEnded,
  voMsBySceneId,
  spriteAssets,
  editable = false,
  selectedId = null,
  onSelect,
  onPlacement,
}: GraphicsCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const tRef = useRef(0);
  const lastReportRef = useRef(0);
  const applyRef = useRef<((tMs: number) => void) | null>(null);
  const setupRef = useRef<(() => void) | null>(null);
  const loadedSceneRef = useRef<number>(-1);
  const editableRef = useRef(editable);
  const gestureRef = useRef<Gesture | null>(null);
  const [activeScene, setActiveScene] = useState(0);
  const [bounds, setBounds] = useState<ElementBounds[]>([]);
  /** The live outline during a gesture — written by the pointer handlers
   *  (event boundaries), never computed from a ref during render. */
  const [liveOutline, setLiveOutline] = useState<ElementBounds | null>(null);
  // S152 — the delivered clock: the measured narration map threaded
  // through the SAME pure rule the renderer reads (one clock, editor and
  // engine).
  const voMsMap = useMemo(
    () => (voMsBySceneId ? new Map(Object.entries(voMsBySceneId)) : undefined),
    [voMsBySceneId]
  );
  const totalMs = docTotalMs(doc, voMsMap);
  const frameDurMs = 1000 / doc.fps;
  const viewScale = Math.min(720 / doc.width, 520 / doc.height);

  // The editable mirror — read by the setup closure at iframe-load time
  // (an event boundary, never render).
  useEffect(() => {
    editableRef.current = editable;
  }, [editable]);

  // The apply + setup closures — rebuilt when the doc or the active scene
  // changes (the placed-frame arm reads the active scene).
  useEffect(() => {
    const applyFrame = (tMs: number): void => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      const frame = frameAt(doc, Math.max(0, Math.min(tMs, totalMs)), voMsMap);
      (win as unknown as { __gApply?: (p: string) => boolean }).__gApply?.(graphicsFramePayload(frame));
    };
    const applyPlaced = (): void => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      const scene = doc.scenes[loadedSceneRef.current >= 0 ? loadedSceneRef.current : 0];
      if (!scene) return;
      (win as unknown as { __gApply?: (p: string) => boolean }).__gApply?.(
        graphicsFramePayload(placedGraphicsFrame(scene))
      );
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
      // Edit mode rides the placed state (the poster's own truth);
      // playback rides the scrub position exactly as before.
      if (editableRef.current) applyPlaced();
      else applyFrame(tRef.current);
    };
    applyRef.current = applyFrame;
    setupRef.current = setup;
  }, [doc, totalMs, voMsMap]);

  // The srcdoc swap — when the ACTIVE scene changes (whole-doc playback).
  // The composed skeleton is the deterministic poster frame; the applier
  // drives every later frame from it. S150 (C1): a doc carrying a webfont
  // face gains the same-origin URL @font-face (the srcdoc iframe inherits
  // the app origin; CSP font-src 'self' data: allows both routes — the
  // RENDERER's data-URI form lives in render.ts, this is the editor's).
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const scene = doc.scenes[activeScene];
    if (!scene) return;
    const composed = composeGraphicsScene(scene, doc, spriteAssets ? { spriteAssets } : undefined);
    iframe.srcdoc = composed.html;
    loadedSceneRef.current = activeScene;
  }, [doc, activeScene, spriteAssets]);

  // The iframe fires onLoad for every srcdoc swap.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => setupRef.current?.();
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, []);

  // S124 — the bounds truth: the composed page's OWN rects, read for the
  // unclaimed elements in doc order (topmost = last). Zero-area boxes are
  // KEPT (a bare line is grabbable along its length through the hit slop);
  // only non-finite reads are dropped.
  const refreshBounds = useCallback((): void => {
    const iframe = iframeRef.current;
    const scene = doc.scenes[activeScene];
    if (!iframe || !scene) return;
    const docd = iframe.contentDocument;
    if (!docd) return;
    const claims = graphicsGroupClaims(scene);
    const out: ElementBounds[] = [];
    for (const el of scene.elements) {
      if (claims.has(el.id)) continue;
      const g = docd.getElementById("ge-" + el.id);
      if (!g) continue;
      const r = g.getBoundingClientRect();
      if (!Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.width) || !Number.isFinite(r.height)) continue;
      out.push({ id: el.id, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    setBounds(out);
  }, [doc, activeScene]);

  // Edit mode (armed + paused): the placed state + a bounds refresh. This
  // effect re-fires on every doc/scene change, so a committed edit (new
  // buffer) re-arms the placed state and the fresh bounds without any
  // second applier.
  useEffect(() => {
    if (!editable || playing) return;
    const win = iframeRef.current?.contentWindow;
    const scene = doc.scenes[activeScene];
    if (!win || !scene) return;
    (win as unknown as { __gApply?: (p: string) => boolean }).__gApply?.(
      graphicsFramePayload(placedGraphicsFrame(scene))
    );
    const raf = requestAnimationFrame(() => refreshBounds());
    return () => cancelAnimationFrame(raf);
  }, [editable, playing, doc, activeScene, refreshBounds]);

  // The playback loop: rAF drives the doc clock; scene swaps ride the
  // active-scene resolution. Edit mode suspends the loop (defense in
  // depth — the studio forces pause too).
  useEffect(() => {
    if (!playing || editableRef.current) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const step = (now: number): void => {
      tRef.current += frameDurMs;
      const t = Math.min(tRef.current, totalMs);
      applyRef.current?.(t);
      const idx = activeSceneIndex(doc, t, voMsMap);
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
  }, [playing, frameDurMs, totalMs, doc, onTime, onEnded, voMsMap]);

  // Imperative scrub: a fresh nonce applies the time immediately (and
  // follows any scene change it implies). In edit mode the placed state
  // applies instead (the mode's own truth) — the seek still moves the
  // clock, so the slider navigates scenes.
  useEffect(() => {
    if (!seek) return;
    tRef.current = Math.max(0, Math.min(seek.tMs, totalMs));
    const idx = activeSceneIndex(doc, tRef.current, voMsMap);
    if (idx !== loadedSceneRef.current) {
      setActiveScene(idx);
      // The srcdoc effect swaps + onLoad applies at the preserved t.
    } else if (editableRef.current) {
      const win = iframeRef.current?.contentWindow;
      const scene = doc.scenes[idx];
      if (win && scene) {
        (win as unknown as { __gApply?: (p: string) => boolean }).__gApply?.(
          graphicsFramePayload(placedGraphicsFrame(scene))
        );
      }
    } else {
      applyRef.current?.(tRef.current);
    }
    onTime(tRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek?.nonce]);

  // Reset the clock when the doc identity changes (deferred so lint's
  // set-state-in-effect rule is satisfied — the house pattern). A fresh
  // doc also ends any live gesture and rebuilds the bounds truth.
  useEffect(() => {
    queueMicrotask(() => {
      tRef.current = 0;
      setActiveScene(0);
      loadedSceneRef.current = -1;
      gestureRef.current = null;
      setBounds([]);
      setLiveOutline(null);
    });
  }, [doc]);

  // ---- S124 gesture plumbing (doc-space pointer math over the overlay) ----

  const docPointOf = (e: React.PointerEvent): { px: number; py: number } | null => {
    const overlay = overlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      px: ((e.clientX - rect.left) / rect.width) * doc.width,
      py: ((e.clientY - rect.top) / rect.height) * doc.height,
    };
  };

  const onOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!editable || playing) return;
    const pt = docPointOf(e);
    const overlay = overlayRef.current;
    const scene = doc.scenes[activeScene];
    if (!pt || !overlay || !scene) return;
    // The scale handle of the current selection wins over a re-hit.
    const selBounds = selectedId ? bounds.find((b) => b.id === selectedId) : undefined;
    const selEl = selectedId ? scene.elements.find((el) => el.id === selectedId) : undefined;
    if (selectedId && selBounds && selEl) {
      const hs = HANDLE_PX / Math.max(viewScale, 1e-6);
      const hx = selBounds.x + selBounds.w;
      const hy = selBounds.y + selBounds.h;
      if (pt.px >= hx - hs && pt.px <= hx + hs && pt.py >= hy - hs && pt.py <= hy + hs) {
        const d = Math.hypot(pt.px - selEl.at.x, pt.py - selEl.at.y);
        if (d > 1e-6) {
          overlay.setPointerCapture(e.pointerId);
          gestureRef.current = {
            mode: "scale",
            id: selectedId,
            sceneIndex: activeScene,
            startAt: selEl.at,
            startPx: pt.px,
            startPy: pt.py,
            anchor: { x: selEl.at.x, y: selEl.at.y },
            startDist: d,
            bounds: selBounds,
            at: selEl.at,
          };
          setLiveOutline(selBounds);
          e.preventDefault();
          return;
        }
      }
    }
    // Hit-test: the topmost unclaimed element under the point.
    const hit = topmostElementAt(bounds, pt.px, pt.py, HIT_SLOP);
    onSelect?.(hit);
    if (!hit) {
      gestureRef.current = null;
      setLiveOutline(null);
      return;
    }
    const el = scene.elements.find((x) => x.id === hit);
    const b = bounds.find((x) => x.id === hit);
    if (!el || !b) return;
    overlay.setPointerCapture(e.pointerId);
    gestureRef.current = {
      mode: "drag",
      id: hit,
      sceneIndex: activeScene,
      startAt: el.at,
      startPx: pt.px,
      startPy: pt.py,
      anchor: { x: el.at.x, y: el.at.y },
      startDist: 0,
      bounds: b,
      at: el.at,
    };
    setLiveOutline(b);
    e.preventDefault();
  };

  const onOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const g = gestureRef.current;
    if (!g) return;
    const pt = docPointOf(e);
    if (!pt) return;
    if (g.mode === "drag") {
      g.at = movedPlacement(g.startAt, pt.px - g.startPx, pt.py - g.startPy);
    } else {
      const d = Math.hypot(pt.px - g.anchor.x, pt.py - g.anchor.y);
      g.at = scaledPlacement(g.startAt, d / g.startDist);
    }
    // Live preview through the ONE applier: the placed frame with the
    // dragged element's geometry overridden. Nothing else writes the DOM.
    const win = iframeRef.current?.contentWindow;
    const scene = doc.scenes[g.sceneIndex];
    if (win && scene) {
      const state = placedGraphicsFrame(scene);
      state.elements = state.elements.map((el) =>
        el.id === g.id
          ? { ...el, x: g.at.x, y: g.at.y, scale: g.at.scale, rotateDeg: g.at.rotateDeg }
          : el
      );
      (win as unknown as { __gApply?: (p: string) => boolean }).__gApply?.(graphicsFramePayload(state));
    }
    // The outline rides the same math (drag translates the start bounds;
    // scale grows the offsets around the anchor — exact for unrotated
    // content, a visual aid when rotated; the COMMIT truth always rides
    // the placement).
    const b = g.bounds;
    if (g.mode === "drag") {
      setLiveOutline({ id: b.id, x: b.x + (g.at.x - g.startAt.x), y: b.y + (g.at.y - g.startAt.y), w: b.w, h: b.h });
    } else {
      const f = g.startAt.scale > 0 ? g.at.scale / g.startAt.scale : 1;
      setLiveOutline({
        id: b.id,
        x: g.anchor.x + (b.x - g.anchor.x) * f,
        y: g.anchor.y + (b.y - g.anchor.y) * f,
        w: b.w * f,
        h: b.h * f,
      });
    }
    e.preventDefault();
  };

  const onOverlayPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const g = gestureRef.current;
    if (!g) return;
    gestureRef.current = null;
    setLiveOutline(null); // the committed doc re-arms the placed state + fresh bounds
    const moved =
      g.mode === "drag"
        ? g.at.x !== g.startAt.x || g.at.y !== g.startAt.y
        : g.at.scale !== g.startAt.scale;
    // A click (no move) commits nothing — selection already rode pointerdown.
    if (moved) onPlacement?.(g.sceneIndex, g.id, g.at, "commit");
    e.preventDefault();
  };

  // The overlay outline: the gesture's live bounds while a gesture runs,
  // else the selected element's cached bounds (refreshed with every doc
  // change by the placed-state effect).
  const outline = liveOutline ?? (selectedId ? bounds.find((b) => b.id === selectedId) ?? null : null);
  const handleDoc = HANDLE_PX / Math.max(viewScale, 1e-6);
  const strokeDoc = 1.5 / Math.max(viewScale, 1e-6);

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
        {editable && !playing && (
          <div
            ref={overlayRef}
            className="absolute inset-0 touch-none select-none"
            style={{ width: doc.width, height: doc.height, cursor: "crosshair" }}
            onPointerDown={onOverlayPointerDown}
            onPointerMove={onOverlayPointerMove}
            onPointerUp={onOverlayPointerUp}
            onPointerCancel={onOverlayPointerUp}
            data-testid="graphics-edit-overlay"
          >
            <svg width={doc.width} height={doc.height} viewBox={`0 0 ${doc.width} ${doc.height}`} style={{ display: "block" }}>
              {outline && (
                <rect
                  x={outline.x}
                  y={outline.y}
                  width={Math.max(outline.w, strokeDoc)}
                  height={Math.max(outline.h, strokeDoc)}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity={0.75}
                  strokeWidth={strokeDoc}
                />
              )}
              {outline && (
                <rect
                  x={outline.x + outline.w - handleDoc / 2}
                  y={outline.y + outline.h - handleDoc / 2}
                  width={handleDoc}
                  height={handleDoc}
                  fill="#ffffff"
                  stroke="#000000"
                  strokeWidth={Math.max(strokeDoc / 2, strokeDoc)}
                  data-testid="graphics-scale-handle"
                />
              )}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

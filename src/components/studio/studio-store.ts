"use client";

// studio-store.ts — the tiny cross-component transport store.
//
// The preview player owns the clock; the timeline strip, scene rail, QC
// panel, and lane workspaces all need to READ it (playhead) and sometimes
// WRITE it (seek). Lifting that through studio-app props would re-render
// the whole shell at playhead framerate — a zustand store lets only the
// playhead subscribers tick.

import { create } from "zustand";

interface SeekRequest {
  ms: number;
  nonce: number;
  /** When set, the seek also selects this scene in the lane editor. */
  sceneRef?: string;
}

interface StudioTransportState {
  /** Playhead time in ms (throttled ~10fps updates from the player). */
  timeMs: number;
  setTimeMs: (ms: number) => void;

  /** Seek requests consumed by the preview player (nonce breaks identity). */
  seek: SeekRequest | null;
  requestSeek: (ms: number, sceneRef?: string) => void;
  clearSeek: () => void;

  /** The selected scene/beat ref (scene rail, QC checks, lane editor). */
  selectedSceneRef: string | null;
  setSelectedSceneRef: (ref: string | null) => void;

  /** Monotonic counter the QC panel bumps to ask the player for a WebM capture. */
  captureRequest: number;
  requestCapture: () => void;
}

export const useStudioTransport = create<StudioTransportState>((set) => ({
  timeMs: 0,
  setTimeMs: (ms) => set({ timeMs: ms }),

  seek: null,
  requestSeek: (ms, sceneRef) =>
    set((s) => ({ seek: { ms, nonce: (s.seek?.nonce ?? 0) + 1, sceneRef } })),
  clearSeek: () => set({ seek: null }),

  selectedSceneRef: null,
  setSelectedSceneRef: (ref) => set({ selectedSceneRef: ref }),

  captureRequest: 0,
  requestCapture: () => set((s) => ({ captureRequest: s.captureRequest + 1 })),
}));

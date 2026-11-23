"use client";

import { create } from "zustand";

// 2026-11 law (the operator's words: "every feature must have its page, bold
// and clear, not cramped into another page"): the five production-workspace
// areas are FIRST-CLASS views. Director, Storyboard, Canvas, Timeline Studio
// and Inspector each own a page with its own hash, its own header and its own
// sidebar entry — nothing rides as a strip under anything else.
export type WorkspaceAreaId =
  | "director"
  | "storyboard"
  | "canvas"
  | "timeline"
  | "inspector";

export const WORKSPACE_AREA_IDS: WorkspaceAreaId[] = [
  "director",
  "storyboard",
  "canvas",
  "timeline",
  "inspector",
];

export function isWorkspaceArea(v: ViewId): v is WorkspaceAreaId {
  return (WORKSPACE_AREA_IDS as string[]).includes(v);
}

export type ViewId =
  | "dashboard"
  | "assets"
  | "insights"
  | "analytics"
  | "research"
  | "create"
  | "library"
  | "workspace"
  | "director"
  | "storyboard"
  | "canvas"
  | "timeline"
  | "inspector"
  | "cast"
  | "world"
  | "voice"
  | "calendar"
  | "channels"
  | "settings";

interface AppState {
  view: ViewId;
  setView: (v: ViewId) => void;

  /** Monotonic counter — bump to trigger data refresh across views */
  refreshKey: number;
  bumpRefresh: () => void;

  /** Video id used to open the production workspace (B3) — set alongside
   *  setView("workspace") by every entry point (Projects cards, Home continue
   *  row, palette, Create, Topic Radar, Calendar, Analytics, Cast). */
  focusVideoId: string | null;
  setFocusVideoId: (id: string | null) => void;

  /** The project the workspace is currently hosting (2026-11). focusVideoId is
   *  a one-shot jump payload the workspace consumes on load; activeVideoId is
   *  the standing anchor the URL hash rides so #/timeline/<id> and friends
   *  survive a reload while the operator moves between the five area pages. */
  activeVideoId: string | null;
  setActiveVideoId: (id: string | null) => void;

  /** Topic prefill when jumping from another view into Create */
  prefillTopic: string | null;
  setPrefillTopic: (t: string | null) => void;

  /** Stage 5 (module A) — research sources riding the topic prefill (the
   * radar idea's web grounding follows it into the created video). */
  prefillSources: import("./ibismuh/types").ResearchSource[] | null;
  setPrefillSources: (s: import("./ibismuh/types").ResearchSource[] | null) => void;

  /** Slot date prefill when jumping into Calendar */
  prefillSlotDate: string | null;
  setPrefillSlotDate: (d: string | null) => void;

  /** Video to preselect in the Calendar "new slot" dialog */
  scheduleVideoId: string | null;
  setScheduleVideoId: (id: string | null) => void;

  /** Stage 4a — ⌘K command palette open state (page-level singleton) */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "dashboard",
  setView: (v) => set({ view: v }),

  refreshKey: 0,
  bumpRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),

  focusVideoId: null,
  setFocusVideoId: (id) => set({ focusVideoId: id }),

  activeVideoId: null,
  setActiveVideoId: (id) => set({ activeVideoId: id }),

  prefillTopic: null,
  setPrefillTopic: (t) => set({ prefillTopic: t }),

  prefillSources: null,
  setPrefillSources: (s) => set({ prefillSources: s }),

  prefillSlotDate: null,
  setPrefillSlotDate: (d) => set({ prefillSlotDate: d }),

  scheduleVideoId: null,
  setScheduleVideoId: (id) => set({ scheduleVideoId: id }),

  paletteOpen: false,
  setPaletteOpen: (open) => set({ paletteOpen: open }),
}));

// ---------------------------------------------------------------------------
// URL-anchored views — reload keeps you where you were.
//
// The store alone is memory: every reload rebooted the studio on Home no
// matter how deep the operator was — mid-workspace, mid-settings, anywhere.
// The law now: setView/setFocusVideoId stay pure state writes; the page shell
// (src/app/page.tsx) mirrors (view, focusVideoId) into the URL hash via
// replaceState and restores it on boot + hashchange. The hash is the
// persistence medium — no server round-trip, no rewrite rules on any host
// (Vercel / fly / static), it survives the 401 auto-reload, and every surface
// becomes deep-linkable (paste /#/settings and the other side lands there).
// Prefills (topic/sources/slot/schedule) stay ephemeral BY DESIGN: replaying
// a stale jump payload on reload would re-trigger a jump nobody asked for.
export const VIEW_IDS = [
  "dashboard",
  "assets",
  "insights",
  "analytics",
  "research",
  "create",
  "library",
  "workspace",
  "director",
  "storyboard",
  "canvas",
  "timeline",
  "inspector",
  "cast",
  "world",
  "voice",
  "calendar",
  "channels",
  "settings",
] as const satisfies readonly ViewId[];

/** The hash for a view state — "" for Home so "/" stays the bare entry URL.
 *  The workspace and its five area pages anchor the hosted project's id so a
 *  reload (or a pasted deep link) reopens the same production. */
export function viewToHash(view: ViewId, videoId: string | null): string {
  if (view === "dashboard") return "";
  const anchorsProject =
    videoId && (view === "workspace" || isWorkspaceArea(view));
  return anchorsProject ? `#/${view}/${videoId}` : `#/${view}`;
}

/** Apply a URL hash to the store (boot restore + hashchange deep links).
 *  Returns false when the hash carries no valid view — the caller leaves the
 *  app on Home and normalizes the URL instead. */
export function restoreViewFromHash(
  hash: string = typeof window === "undefined" ? "" : window.location.hash
): boolean {
  const m = /^#\/([a-z]+)(?:\/([A-Za-z0-9_-]+))?$/.exec(hash);
  if (!m || !VIEW_IDS.includes(m[1] as ViewId)) return false;
  const s = useAppStore.getState();
  const view = m[1] as ViewId;
  // The workspace and its five area pages all carry the hosted project id.
  if ((view === "workspace" || isWorkspaceArea(view)) && m[2] && m[2] !== s.focusVideoId)
    s.setFocusVideoId(m[2]);
  if (view !== s.view) s.setView(view);
  return true;
}

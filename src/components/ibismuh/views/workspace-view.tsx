"use client";

// WorkspaceView — the per-project host for the B3 production workspace
// (docs/design/B3_PRODUCTION_WORKSPACE_SPEC.md).
//
// 2026-11 law — "every feature must have its page, bold and clear": the five
// workspace areas (Director, Storyboard, Canvas, Timeline Studio, Inspector)
// are FIRST-CLASS views. This component is the single host instance — the
// page shell keeps it mounted across area changes and passes the active area
// as a prop, so moving between the pages never remounts the production engine
// or loses the loaded project. The bare "workspace" view (every entry point
// lands there) normalizes to a concrete area page once the project loads:
// a watchable project opens Timeline Studio, everything else the Director.

import { useEffect, useState } from "react";
import { useAppStore, isWorkspaceArea, type ViewId, type WorkspaceAreaId } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ibismuh/shared";
import { ProductionWorkspace } from "@/components/ibismuh/production-workspace";
import { Library as LibraryIcon, Wand2 } from "lucide-react";
import type { VideoDTO } from "@/lib/ibismuh/types";

export function WorkspaceView({ area }: { area: ViewId }) {
  const focusVideoId = useAppStore((s) => s.focusVideoId);
  const setFocusVideoId = useAppStore((s) => s.setFocusVideoId);
  const setActiveVideoId = useAppStore((s) => s.setActiveVideoId);
  const setView = useAppStore((s) => s.setView);
  const refreshKey = useAppStore((s) => s.refreshKey);
  const bumpRefresh = useAppStore((s) => s.bumpRefresh);

  const [video, setVideo] = useState<VideoDTO | null>(null);

  // The store's focus id decides which project the workspace hosts. It is
  // consumed on load — the fetched DTO becomes local state, so refreshes of
  // the SAME project don't re-trigger the focus pipeline. Loading derives
  // from the unconsumed id (a pending focus id IS the loading state) — no
  // setState dances inside the effect body.
  useEffect(() => {
    if (!focusVideoId) return;
    let cancelled = false;
    fetch(`/api/videos/${focusVideoId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setVideo(d?.video ?? null);
      })
      .catch(() => {
        if (!cancelled) setVideo(null);
      })
      .finally(() => {
        if (!cancelled) setFocusVideoId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [focusVideoId, setFocusVideoId]);

  // The standing project anchor — the URL hash rides this so #/timeline/<id>,
  // #/director/<id> … survive a reload while the operator moves between the
  // five area pages. Cleared when the host loses its project.
  useEffect(() => {
    setActiveVideoId(video?.id ?? null);
    return () => setActiveVideoId(null);
  }, [video?.id, setActiveVideoId]);

  // Entry normalization: the bare "workspace" view is a transient landing —
  // once the project is known it resolves to the concrete area page (a
  // watchable project opens Timeline Studio, everything else the Director),
  // so the page header, the sidebar light and the hash all speak the truth.
  useEffect(() => {
    if (area !== "workspace" || !video) return;
    setView(video.hasVideo || video.hasVoiceover ? "timeline" : "director");
  }, [area, video, setView]);

  // Keep the standing DTO truthful: when any engine bumps the global refresh
  // (a render finishing elsewhere, a publish, a QC run), re-pull the project.
  useEffect(() => {
    if (!video?.id || refreshKey === 0) return;
    let cancelled = false;
    fetch(`/api/videos/${video.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.video) setVideo(d.video);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refreshKey, video?.id]);

  const loading = Boolean(focusVideoId);

  if (loading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading workspace">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-24 rounded-lg bg-white/5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/3 bg-white/5" />
            <Skeleton className="h-3.5 w-1/3 bg-white/5" />
          </div>
        </div>
        <Skeleton className="h-24 rounded-2xl bg-white/5" />
        <Skeleton className="h-10 w-full max-w-md rounded-lg bg-white/5" />
        <Skeleton className="h-64 rounded-2xl bg-white/5" />
      </div>
    );
  }

  if (!video) {
    return (
      <EmptyState
        icon={LibraryIcon}
        title="No project open"
        hint="The workspace hosts one project at a time — open one from Projects, or start something new."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              onClick={() => setView("library")}
              variant="outline"
              className="border-white/15 bg-white/4"
            >
              <LibraryIcon className="h-4 w-4" />
              Browse projects
            </Button>
            <Button
              onClick={() => setView("create")}
              className="bg-brand-gradient hover:opacity-90 font-medium"
            >
              <Wand2 className="h-4 w-4" />
              New project
            </Button>
          </div>
        }
      />
    );
  }

  // Controlled areas: an explicit area view (director/storyboard/canvas/
  // timeline/inspector) drives the workspace's active page from the store;
  // the transient "workspace" landing lets the engine seed itself, then the
  // normalization above hands control to the store.
  const controlledArea: WorkspaceAreaId | null = isWorkspaceArea(area)
    ? area
    : null;

  return (
    <ProductionWorkspace
      video={video}
      area={controlledArea}
      onAreaChange={(a) => setView(a)}
      onClose={() => setView("library")}
      onChanged={(v) => {
        setVideo(v);
        bumpRefresh();
      }}
      onDeleted={() => {
        setVideo(null);
        bumpRefresh();
        setView("library");
      }}
    />
  );
}

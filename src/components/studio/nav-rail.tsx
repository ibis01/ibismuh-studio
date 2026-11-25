"use client";

// nav-rail.tsx — the left navigation: logo, lane picker (the create flow),
// and the project list. Rendered as a fixed rail on md+ and inside a Sheet
// on smaller screens (studio-app decides).

import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BarChart3, Clapperboard, FileText, PenTool, PersonStanding, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectSummary } from "@/lib/ibismuh/api-dto";
import { LANE_ORDER, LANE_UI_META, type VideoType } from "@/lib/ibismuh/studio-lanes";
import { projectStatusTone } from "./capability-badges";
import { formatTimeMs } from "./preview-player";

const ICON_BY_NAME: Record<string, LucideIcon> = {
  FileText,
  Clapperboard,
  PenTool,
  BarChart3,
  PersonStanding,
  Presentation,
};

interface NavRailProps {
  projects: ProjectSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewProject: (lane: VideoType | null) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  variant?: "rail" | "sheet";
}

export function NavRail({
  projects,
  selectedId,
  onSelect,
  onNewProject,
  collapsed = false,
  onToggleCollapsed,
  variant = "rail",
}: NavRailProps) {
  const showDetail = variant === "sheet" || !collapsed;

  return (
    <TooltipProvider delayDuration={150}>
      <div className={`flex h-full min-h-0 flex-col studio-panel ${variant === "sheet" ? "" : "studio-line border-r"}`}>
        {/* logo */}
        <div className="flex items-center gap-2 border-b border-stone-800 px-3 py-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500 text-stone-950 font-bold text-sm tf-mono"
            aria-hidden
          >
            ib
          </span>
          {showDetail && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight text-zinc-100">Ibismuh Studio</span>
              <span className="block text-xs text-zinc-500 tf-mono">six-lane production</span>
            </span>
          )}
          {variant === "rail" && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-11 w-11 shrink-0 text-zinc-400 hover:text-zinc-200"
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              onClick={onToggleCollapsed}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
            </Button>
          )}
        </div>

        {/* new project */}
        <div className="px-2.5 pt-3">
          {showDetail ? (
            <Button
              className="h-11 w-full justify-start gap-2 bg-amber-500 text-stone-950 hover:bg-amber-400 font-semibold"
              onClick={() => onNewProject(null)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New project
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 border-stone-700 bg-amber-500 text-stone-950 hover:bg-amber-400 hover:text-stone-950"
                  aria-label="New project"
                  onClick={() => onNewProject(null)}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New project</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="studio-scroll mt-3 min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
          {/* lanes — the create flow */}
          <p className={`mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500 ${showDetail ? "" : "text-center"}`}>
            {showDetail ? "Lanes" : "Lanes"}
          </p>
          <ul className="mb-4 space-y-1" aria-label="Video lanes">
            {LANE_ORDER.map((lane) => {
              const meta = LANE_UI_META[lane];
              const Icon = ICON_BY_NAME[meta.icon] ?? FileText;
              return (
                <li key={lane}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={`flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-stone-800/80 hover:text-zinc-100 transition-colors ${
                          showDetail ? "" : "justify-center"
                        }`}
                        aria-label={`New ${meta.title} project`}
                        onClick={() => onNewProject(lane)}
                      >
                        <Icon className="h-4 w-4 shrink-0" style={{ color: meta.accentHex }} aria-hidden />
                        {showDetail && (
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] leading-tight">{meta.title}</span>
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    {showDetail && <TooltipContent className="max-w-64">{meta.desc}</TooltipContent>}
                  </Tooltip>
                </li>
              );
            })}
          </ul>

          {/* projects */}
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
            {showDetail ? `Projects (${projects.length})` : "Projects"}
          </p>
          {projects.length === 0 ? (
            <p className={`text-xs text-zinc-500 ${showDetail ? "" : "hidden"}`}>
              No projects yet — pick a lane to start.
            </p>
          ) : (
            <ul className="space-y-1" aria-label="Projects">
              {projects.map((p) => {
                const tone = projectStatusTone(p.status);
                const meta = LANE_UI_META[p.lane as VideoType];
                const active = p.id === selectedId;
                return (
                  <li key={p.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={`flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                            active ? "bg-stone-800 ring-1 ring-amber-600/50" : "hover:bg-stone-800/60"
                          }`}
                          aria-label={`Open project ${p.title}`}
                          aria-current={active ? "true" : undefined}
                          onClick={() => onSelect(p.id)}
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta?.accentHex ?? "#8d8983" }} aria-hidden />
                          {showDetail ? (
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] leading-tight text-zinc-200">{p.title}</span>
                              <span className="flex items-center gap-1.5 pt-0.5 text-xs leading-tight text-zinc-500">
                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tone.dot}`} aria-hidden />
                                <span className="truncate">{p.status}</span>
                                {p.durationMs != null && (
                                  <span className="ml-auto shrink-0 tf-num">{formatTimeMs(p.durationMs)}</span>
                                )}
                              </span>
                            </span>
                          ) : (
                            <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                          )}
                        </button>
                      </TooltipTrigger>
                      {!showDetail && <TooltipContent>{p.title}</TooltipContent>}
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

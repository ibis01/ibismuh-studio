"use client";

// project-header.tsx — §6.1 the status header: editable title, lane badge,
// plan revision chip, saved state, render/QC chips, geometry, voice + timing
// source, and publish readiness.

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectState } from "@/lib/ibismuh/api-dto";
import { LANE_UI_META, type VideoType } from "@/lib/ibismuh/studio-lanes";
import { jobStateTone } from "./capability-badges";
import { formatTimeMs } from "./preview-player";

function timingLabel(source: string | undefined): string {
  switch (source) {
    case "manual":
      return "measured · manual";
    case "word-timestamps":
      return "measured · word";
    case "sentence-timestamps":
      return "measured · sentence";
    case "estimate":
      return "estimated — declared";
    default:
      return "timing —";
  }
}

interface ProjectHeaderProps {
  state: ProjectState;
  briefDirty: boolean;
  onPatchTitle: (title: string) => Promise<void>;
  onOpenNav: () => void;
}

export function ProjectHeader({ state, briefDirty, onPatchTitle, onOpenNav }: ProjectHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [seenServerTitle, setSeenServerTitle] = useState(state.project.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // render-time adjustment: when the server title changes, drop any stale override
  if (state.project.title !== seenServerTitle) {
    setSeenServerTitle(state.project.title);
    setTitleOverride(null);
  }
  const draft = titleOverride ?? state.project.title;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = useCallback(async () => {
    const next = draft.trim();
    setEditing(false);
    setTitleOverride(null);
    if (!next || next === state.project.title) {
      return;
    }
    await onPatchTitle(next);
  }, [draft, onPatchTitle, state.project.title]);

  const lane = state.project.lane as VideoType;
  const meta = LANE_UI_META[lane];
  const job = state.job;
  const renderState = job?.state ?? state.project.renderState;
  const qcOverall = state.qc?.overall ?? state.project.qcOverall;
  const ready =
    (qcOverall === "pass" || state.project.status === "ready") && (renderState === "ready" || state.project.status === "ready");

  return (
    <header className="studio-panel studio-line border-b px-3 py-2.5 md:px-4" aria-label="Project header">
      <div className="flex items-center gap-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 md:hidden shrink-0 text-zinc-300"
          aria-label="Open navigation"
          onClick={onOpenNav}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </Button>

        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setTitleOverride(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") {
                setTitleOverride(null);
                setEditing(false);
              }
            }}
            aria-label="Project title"
            className="min-w-0 flex-1 bg-transparent text-base md:text-lg font-semibold text-zinc-100 outline-none border-b border-amber-500/70 pb-0.5"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Rename project ${state.project.title}`}
            className="min-w-0 flex-1 text-left group"
          >
            <h1 className="truncate text-base md:text-lg font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors">
              {state.project.title}
            </h1>
          </button>
        )}

        <TooltipProvider delayDuration={150}>
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto studio-scroll max-w-[68vw] md:max-w-none">
            {/* lane badge */}
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 px-2.5 py-1 text-[11px] text-zinc-300"
              title={meta?.title ?? lane}
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: meta?.accentHex ?? "#8d8983" }} aria-hidden />
              {meta?.title ?? lane}
            </span>

            {/* plan revision chip */}
            {state.planRevision ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-stone-700 bg-stone-900 px-2.5 py-1 text-[11px] text-zinc-300 tf-mono">
                    rev {state.planRevision.revision}
                    <span className="text-zinc-500">{state.planRevision.fingerprint.slice(0, 8)}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-80 tf-mono text-[10px] break-all">
                  fingerprint {state.planRevision.fingerprint}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="inline-flex shrink-0 items-center rounded-full border border-dashed border-stone-700 px-2.5 py-1 text-[11px] text-zinc-500">
                no plan
              </span>
            )}

            {/* saved state */}
            {briefDirty && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-600/60 bg-amber-950/40 px-2.5 py-1 text-[11px] text-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />
                Unsaved
              </span>
            )}

            {/* render state chip */}
            {renderState && (
              <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] ${jobStateTone(renderState)}`}>
                render: {renderState}
              </span>
            )}

            {/* QC chip */}
            {qcOverall && (
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] ${
                  qcOverall === "pass"
                    ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-300"
                    : qcOverall === "warn"
                      ? "border-amber-600/60 bg-amber-950/40 text-amber-300"
                      : "border-red-700/60 bg-red-950/40 text-red-300"
                }`}
              >
                QC {qcOverall}
              </span>
            )}

            {/* publish readiness */}
            {ready ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-700/60 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Ready
              </span>
            ) : null}

            {/* geometry */}
            <span className="inline-flex shrink-0 items-center rounded-full border border-stone-800 bg-stone-950/60 px-2.5 py-1 text-[11px] text-zinc-400 tf-mono">
              {state.project.aspect} · {state.project.fps}fps
            </span>

            {/* voice + timing */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0 items-center rounded-full border border-stone-800 bg-stone-950/60 px-2.5 py-1 text-[11px] text-zinc-400">
                  {state.project.voice} · {timingLabel(state.timingSource?.source)}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">
                {state.timingSource?.reason ?? "No timing decision recorded yet."}
              </TooltipContent>
            </Tooltip>

            {/* duration */}
            {state.project.durationMs != null && (
              <span className="inline-flex shrink-0 items-center rounded-full border border-stone-800 bg-stone-950/60 px-2.5 py-1 text-[11px] text-zinc-400 tf-num">
                {formatTimeMs(state.project.durationMs)}
              </span>
            )}
          </div>
        </TooltipProvider>
      </div>
    </header>
  );
}

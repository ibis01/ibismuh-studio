"use client";

// capability-badges.tsx — §6.5 honesty badges: capability truth, declared
// lane modes, and the timing source badge. Everything unavailable is shown,
// never hidden — a capability that is not attached is declared, not silent.

import { CheckCircle2, AlertTriangle, MinusCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CapabilityFlag } from "@/lib/ibismuh/api-dto";
import { LANE_REGISTRY, type VideoType } from "@/lib/ibismuh/studio-lanes";

interface CapabilityBadgesProps {
  capabilities: CapabilityFlag[];
  lane: VideoType;
  timingSource: { source: string; reason: string } | null;
}

export function CapabilityBadges({ capabilities, lane, timingSource }: CapabilityBadgesProps) {
  const modes = LANE_REGISTRY[lane]?.modes ?? [];
  const isMeasured = timingSource?.source === "manual" || timingSource?.source === "word-timestamps" || timingSource?.source === "sentence-timestamps";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-2.5">
        {timingSource && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                  isMeasured
                    ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-300"
                    : "border-dashed border-amber-600/70 bg-amber-950/40 text-amber-300"
                }`}
              >
                {isMeasured ? <Clock className="h-3.5 w-3.5" aria-hidden /> : <MinusCircle className="h-3.5 w-3.5" aria-hidden />}
                {isMeasured ? "Measured timing" : "Estimated timing"}
                <span className="text-[10px] opacity-70 tf-mono">{timingSource.source}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">{timingSource.reason}</TooltipContent>
          </Tooltip>
        )}

        {modes.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Declared lane modes">
            {modes.map((mode) => (
              <Tooltip key={mode.id}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center rounded-full border border-stone-700 bg-stone-900 px-2.5 py-1 text-[11px] text-zinc-300">
                    {mode.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-72">{mode.when}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        {capabilities.length === 0 ? (
          <p className="text-xs text-zinc-500">No capability flags reported for this project yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5" aria-label="Capability truth">
            {capabilities.map((cap) =>
              cap.available ? (
                <Tooltip key={cap.id}>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="gap-1.5 border-emerald-800/70 bg-emerald-950/30 text-emerald-300 font-normal py-1 px-2.5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      {cap.id}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72">{cap.detail}</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip key={cap.id}>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="gap-1.5 border-dashed border-amber-600/70 bg-amber-950/40 text-amber-300 font-normal py-1 px-2.5"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      {cap.id}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72">{cap.detail}</TooltipContent>
                </Tooltip>
              ),
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

/** The timing-source badge on its own (inspector receipt section reuses it). */
export function TimingBadge({ timingSource }: { timingSource: { source: string; reason: string } | null }) {
  const isMeasured =
    timingSource?.source === "manual" || timingSource?.source === "word-timestamps" || timingSource?.source === "sentence-timestamps";
  if (!timingSource) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] cursor-help ${
              isMeasured
                ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-300"
                : "border-dashed border-amber-600/70 bg-amber-950/40 text-amber-300"
            }`}
          >
            {isMeasured ? <Clock className="h-3.5 w-3.5" aria-hidden /> : <MinusCircle className="h-3.5 w-3.5" aria-hidden />}
            {isMeasured ? "Measured timing" : "Estimated timing"}
            <span className="text-[10px] opacity-70 tf-mono">{timingSource.source}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">{timingSource.reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Shared status → color mapping (nav rail dots + header chips). */
export function projectStatusTone(status: string): { dot: string; text: string } {
  switch (status) {
    case "ready":
    case "assets-ready":
    case "narration-ready":
      return { dot: "bg-emerald-500", text: "text-emerald-300" };
    case "planned":
      return { dot: "bg-amber-400", text: "text-amber-300" };
    case "rendering":
      return { dot: "bg-amber-400 animate-pulse", text: "text-amber-300" };
    case "needs-repair":
    case "failed":
      return { dot: "bg-red-500", text: "text-red-300" };
    case "draft":
    default:
      return { dot: "bg-zinc-500", text: "text-zinc-400" };
  }
}

/** JobState → chip tone (the header render chip + render panel). */
export function jobStateTone(state: string): string {
  if (state === "ready") return "border-emerald-700/60 bg-emerald-950/40 text-emerald-300";
  if (state === "queued" || state === "leased" || state === "running" || state === "validating" || state === "retry" || state === "retryable-failure") {
    return "border-amber-600/60 bg-amber-950/40 text-amber-300 animate-pulse";
  }
  if (state === "needs-repair" || state === "quality-failure" || state === "failed") return "border-red-700/60 bg-red-950/40 text-red-300";
  return "border-stone-700 bg-stone-900 text-zinc-400";
}

"use client";

// render-panel.tsx — the Pipeline tab: prep actions (assets + narration with
// lane-aware gating), the render job state machine, stage list, progress, and
// the events log. Live updates come from the studio-app query polling.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Circle,
  CircleDot,
  Download,
  Image as ImageIcon,
  ImageOff,
  Loader2,
  Mic,
  Play,
  RotateCcw,
  SkipForward,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectState, StageRunStatus } from "@/lib/ibismuh/api-dto";
import { ApiClientError, generateAssets, generateNarration, renderAction } from "./api-client";

const IMAGE_LANES = new Set(["classic", "story", "character"]);
const ACTIVE_JOB_STATES = new Set(["queued", "leased", "running", "validating", "retry", "retryable-failure"]);

const STATE_STEPS = ["queued", "leased", "running", "validating", "ready"] as const;

function StageStatusIcon({ status }: { status: StageRunStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" aria-hidden />;
    case "cache-hit":
      return <SkipForward className="h-3.5 w-3.5 text-amber-400" aria-hidden />;
    case "done":
      return <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />;
    case "skipped":
      return <X className="h-3.5 w-3.5 text-zinc-500" aria-hidden />;
    case "failed":
      return <X className="h-3.5 w-3.5 text-red-400" aria-hidden />;
    default:
      return <Circle className="h-3.5 w-3.5 text-zinc-600" aria-hidden />;
  }
}

interface RenderPanelProps {
  state: ProjectState;
}

export function RenderPanel({ state }: RenderPanelProps) {
  const queryClient = useQueryClient();
  const lane = state.project.lane;
  const job = state.job;
  const active = job ? ACTIVE_JOB_STATES.has(job.state) : false;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["project", state.project.id] });
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const assetsMutation = useMutation({
    mutationFn: () => generateAssets(state.project.id),
    onSuccess: (data) => {
      toast.success("Assets generated", {
        description: `${data.assets.filter((a) => a.kind === "image").length} image asset(s) bound to the plan.`,
      });
      void invalidate();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) toast.error(err.message, { description: err.detail });
      else toast.error("Asset generation failed", { description: String(err) });
    },
  });

  const narrationMutation = useMutation({
    mutationFn: () => generateNarration(state.project.id),
    onSuccess: (data) => {
      toast.success("Narration generated", {
        description: `Measured ${data.audioReceipt.durationMs}ms of audio (${data.audioReceipt.sentenceSpans.length} sentence spans).`,
      });
      void invalidate();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) toast.error(err.message, { description: err.detail });
      else toast.error("Narration generation failed", { description: String(err) });
    },
  });

  const renderMutation = useMutation({
    mutationFn: (action: "start" | "cancel" | "resume" | "retry") => renderAction(state.project.id, { action }),
    onSuccess: (data, action) => {
      toast.success(`Render ${action === "start" ? "started" : action}`, { description: `Job ${data.job.id} — state ${data.job.state}.` });
      void invalidate();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) toast.error(err.message, { description: err.detail });
      else toast.error("Render action failed", { description: String(err) });
    },
  });

  const busy = assetsMutation.isPending || narrationMutation.isPending || renderMutation.isPending;
  const lastEvents = state.events.slice(0, 12);

  return (
    <div className="grid gap-3">
      {/* prep actions */}
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">Prep — provider passes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {IMAGE_LANES.has(lane) ? (
            <Button
              variant="outline"
              className="h-11 gap-1.5 border-stone-700"
              disabled={busy}
              onClick={() => assetsMutation.mutate()}
              aria-label="Generate scene art with the image provider"
            >
              {assetsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ImageIcon className="h-4 w-4" aria-hidden />
              )}
              {assetsMutation.isPending ? "Generating art…" : "Generate assets"}
            </Button>
          ) : (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex h-11 items-center gap-1.5 rounded-md border border-dashed border-stone-700 px-3 text-sm text-zinc-500 cursor-help">
                    <ImageOff aria-hidden className="h-4 w-4" />
                    image-free lane
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  This lane renders from vectors and typography — no image provider is used, so there is nothing to generate.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <Button
            variant="outline"
            className="h-11 gap-1.5 border-stone-700"
            disabled={busy}
            onClick={() => narrationMutation.mutate()}
            aria-label="Generate narration audio with the voice provider"
          >
            {narrationMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : state.narrationAssetId ? (
              <Volume2 className="h-4 w-4" aria-hidden />
            ) : (
              <Mic className="h-4 w-4" aria-hidden />
            )}
            {narrationMutation.isPending ? "Synthesizing…" : state.narrationAssetId ? "Regenerate narration" : "Generate narration"}
          </Button>

          {state.narrationAssetId && state.audioReceipt && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-800 bg-stone-950/60 px-2.5 py-1 text-[11px] text-zinc-400 tf-num">
              measured {state.audioReceipt.durationMs}ms · {state.audioReceipt.sentenceSpans.length} sentences
            </span>
          )}
        </CardContent>
      </Card>

      {/* render controls */}
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">Render job</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {/* state machine steps */}
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Job state machine">
            {STATE_STEPS.map((step, i) => {
              const current = job?.state === step;
              const passed =
                job != null &&
                STATE_STEPS.findIndex((s) => s === job.state) > i &&
                !["retryable-failure", "quality-failure", "needs-repair", "failed", "cancelled"].includes(job.state);
              return (
                <span key={step} className="flex items-center gap-1.5">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] tf-mono ${
                      current
                        ? "border-amber-500 bg-amber-500/15 text-amber-300"
                        : passed
                          ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-400"
                          : "border-stone-800 bg-stone-950/60 text-zinc-500"
                    }`}
                  >
                    {step}
                  </span>
                  {i < STATE_STEPS.length - 1 && <span className="text-zinc-700" aria-hidden>→</span>}
                </span>
              );
            })}
            {job && ["retryable-failure", "quality-failure", "needs-repair", "failed", "cancelled"].includes(job.state) && (
              <span className="rounded-full border border-red-800/60 bg-red-950/40 px-2.5 py-1 text-[11px] text-red-300 tf-mono">
                {job.state}
                {job.failureClass ? ` · ${job.failureClass}` : ""}
              </span>
            )}
            {!job && <span className="text-[11px] text-zinc-500">no render job yet</span>}
          </div>

          {/* progress */}
          {job && active && (
            <div className="grid gap-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>{job.label ?? "working…"}</span>
                <span className="tf-num">{Math.round((job.progress ?? 0) * 100)}%</span>
              </div>
              <Progress value={(job.progress ?? 0) * 100} className="h-2 bg-stone-800" aria-label="Render progress" />
            </div>
          )}
          {job && !active && job.label && <p className="text-[11px] text-zinc-500">{job.label}</p>}
          {job?.failureDetail && (
            <p className="rounded border border-red-900/50 bg-red-950/30 px-2.5 py-1.5 text-[12px] text-red-200">
              {job.failureDetail}
            </p>
          )}

          {/* controls */}
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11 gap-1.5 bg-amber-500 font-semibold text-stone-950 hover:bg-amber-400"
              disabled={!state.planRevision || active || busy}
              onClick={() => renderMutation.mutate("start")}
              aria-label="Start render"
            >
              {renderMutation.isPending && renderMutation.variables === "start" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              Start render
            </Button>
            <Button
              variant="outline"
              className="h-11 border-stone-700"
              disabled={!active || busy}
              onClick={() => renderMutation.mutate("cancel")}
              aria-label="Cancel render — completed stages are preserved"
            >
              <X className="mr-1.5 h-4 w-4" aria-hidden />
              Cancel
            </Button>
            <Button
              variant="outline"
              className="h-11 border-stone-700"
              disabled={!job || (job.state !== "cancelled" && job.state !== "needs-repair") || busy}
              onClick={() => renderMutation.mutate("resume")}
              aria-label="Resume render from preserved stages"
            >
              <SkipForward className="mr-1.5 h-4 w-4" aria-hidden />
              Resume
            </Button>
            <Button
              variant="outline"
              className="h-11 border-stone-700"
              disabled={!job || (job.state !== "retryable-failure" && job.state !== "failed") || busy}
              onClick={() => renderMutation.mutate("retry")}
              aria-label="Retry the render job"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
              Retry
            </Button>
          </div>
          {job && job.retryCount > 0 && (
            <p className="text-[11px] text-zinc-500 tf-num">retry count: {job.retryCount}</p>
          )}
        </CardContent>
      </Card>

      {/* stage list */}
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">Stages</CardTitle>
        </CardHeader>
        <CardContent>
          {!job || job.stages.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No stage runs yet — stages appear here with their fingerprints once a render job starts (cache hits are declared,
              never hidden).
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {job.stages.map((stage) => (
                <li key={stage.stage} className="flex items-center gap-2 rounded border border-stone-800/80 bg-stone-950/50 px-2 py-1.5">
                  <StageStatusIcon status={stage.status} />
                  <span className="text-[12px] text-zinc-200 tf-mono">{stage.stage}</span>
                  {stage.status === "cache-hit" && (
                    <span className="rounded-full border border-amber-700/60 bg-amber-950/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-300">
                      cached
                    </span>
                  )}
                  {stage.status === "skipped" && (
                    <span className="rounded-full border border-stone-700 bg-stone-900 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-400">
                      skipped
                    </span>
                  )}
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="ml-auto text-[10px] text-zinc-500 tf-mono">{stage.fingerprint.slice(0, 10)}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-80 break-all tf-mono text-[10px]">
                        {stage.fingerprint}
                        {stage.detail ? <span className="block pt-1 text-zinc-400">{stage.detail}</span> : null}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* events log */}
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm text-zinc-200">
            <CircleDot className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
            Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lastEvents.length === 0 ? (
            <p className="text-xs text-zinc-500">No events yet.</p>
          ) : (
            <div className="studio-scroll max-h-40 overflow-y-auto rounded border border-stone-800/80 bg-stone-950/70 p-2" role="log" aria-label="Pipeline events">
              {lastEvents.map((e) => (
                <p key={e.id} className="text-[11px] leading-relaxed tf-mono">
                  <span className="text-zinc-600">[{e.stage}]</span>{" "}
                  <span className={e.level === "error" ? "text-red-400" : e.level === "warn" ? "text-amber-400" : "text-zinc-400"}>
                    {e.message}
                  </span>
                </p>
              ))}
            </div>
          )}
          <p className="mt-2 flex items-center gap-1 text-[10px] text-zinc-600">
            <Download className="h-3 w-3" aria-hidden />
            The manifest export (QC & Delivery) carries the full event history.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

// qc-panel.tsx — QC checks + delivery: run QC, the overall banner, the checks
// list (clicking a failed check seeks the preview + selects the scene), the
// publish readiness checklist, and the export actions.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  FileJson,
  FileText,
  Info,
  Loader2,
  PlayCircle,
  ShieldCheck,
  Video,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectState, QcCheck } from "@/lib/ibismuh/api-dto";
import { ApiClientError, exportManifest, exportSrt, runQc } from "./api-client";
import { useStudioTransport } from "./studio-store";

function CheckRow({ check, onSelectScene }: { check: QcCheck; onSelectScene: (ref: string) => void }) {
  const icon =
    check.severity === "fail" ? (
      <XCircle className={`h-4 w-4 shrink-0 ${check.pass ? "text-zinc-500" : "text-red-400"}`} aria-hidden />
    ) : check.severity === "warn" ? (
      <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${check.pass ? "border-zinc-600" : "border-amber-400 bg-amber-400/30"}`} aria-hidden />
    ) : (
      <Info className={`h-4 w-4 shrink-0 ${check.pass ? "text-zinc-500" : "text-teal-400"}`} aria-hidden />
    );
  return (
    <li className="flex items-start gap-2.5 rounded border border-stone-800/80 bg-stone-950/50 px-2.5 py-2">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-zinc-200">
          {check.title}
          {!check.pass && <span className="ml-2 text-xs uppercase tracking-wide text-red-400">{check.severity}</span>}
        </span>
        <span className="block text-[12px] text-zinc-400">{check.message}</span>
      </span>
      {check.sceneRef && !check.pass && (
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0 border-stone-700 text-xs"
          aria-label={`Inspect scene ${check.sceneRef}`}
          onClick={() => onSelectScene(check.sceneRef as string)}
        >
          <PlayCircle className="mr-1 h-3.5 w-3.5" aria-hidden />
          {check.sceneRef}
        </Button>
      )}
    </li>
  );
}

interface QcPanelProps {
  state: ProjectState;
}

export function QcPanel({ state }: QcPanelProps) {
  const queryClient = useQueryClient();
  const requestSeek = useStudioTransport((s) => s.requestSeek);
  const setSelectedSceneRef = useStudioTransport((s) => s.setSelectedSceneRef);
  const requestCapture = useStudioTransport((s) => s.requestCapture);

  const qcMutation = useMutation({
    mutationFn: () => runQc(state.project.id),
    onSuccess: (data) => {
      toast.success(`QC complete — ${data.overall}`, {
        description: `${data.checks.filter((c) => !c.pass).length} check(s) did not pass, profile ${data.qcProfile}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["project", state.project.id] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => {
      if (err instanceof ApiClientError) toast.error(err.message, { description: err.detail });
      else toast.error("QC failed", { description: String(err) });
    },
  });

  const download = async (kind: "manifest" | "srt") => {
    try {
      if (kind === "manifest") await exportManifest(state.project.id);
      else await exportSrt(state.project.id);
      toast.success(kind === "manifest" ? "Manifest downloading" : "Captions (SRT) downloading");
    } catch (err) {
      if (err instanceof ApiClientError) toast.error(err.message, { description: err.detail });
      else toast.error("Export failed", { description: String(err) });
    }
  };

  const selectScene = (ref: string) => {
    setSelectedSceneRef(ref);
    const beat = state.planRevision?.plan.beats.find((b) => b.sceneRef === ref);
    if (beat) requestSeek(beat.narrationWindow.startMs + 40, ref);
  };

  const overall = state.qc?.overall ?? null;
  const checks = state.qc?.checks ?? [];

  const checklist = [
    { label: "Plan compiled", ok: Boolean(state.planRevision) },
    { label: "Narration measured", ok: Boolean(state.narrationAssetId && state.audioReceipt) },
    { label: "QC pass", ok: overall === "pass" },
    { label: "Render ready", ok: (state.job?.state ?? state.project.renderState) === "ready" || state.project.status === "ready" },
  ];

  return (
    <div className="grid gap-3">
      <Card className="studio-panel border-stone-800">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm text-zinc-200">Quality control</CardTitle>
          <Button
            className="h-11 gap-1.5 bg-amber-500 font-semibold text-stone-950 hover:bg-amber-400"
            disabled={qcMutation.isPending || !state.planRevision}
            onClick={() => qcMutation.mutate()}
            aria-label="Run quality control checks"
          >
            {qcMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            {qcMutation.isPending ? "Running QC…" : "Run QC"}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2.5">
          {!state.qc ? (
            <p className="text-xs text-zinc-500">
              No QC report yet — run QC to grade the plan and assets against the {state.planRevision?.plan.qcProfile ?? "lane"} profile.
            </p>
          ) : (
            <>
              <div
                className={`rounded-lg border px-3 py-2.5 ${
                  overall === "pass"
                    ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-200"
                    : overall === "warn"
                      ? "border-amber-600/60 bg-amber-950/40 text-amber-200"
                      : "border-red-700/60 bg-red-950/40 text-red-200"
                }`}
                role="status"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {overall === "pass" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
                  Overall: {overall}
                </span>
                <span className="mt-0.5 block text-xs opacity-80 tf-mono">
                  profile {state.qc.qcProfile} · plan {state.qc.planFingerprint?.slice(0, 8) ?? "—"} · ran {new Date(state.qc.ranAt).toLocaleTimeString()}
                </span>
              </div>
              {checks.length === 0 ? (
                <p className="text-xs text-zinc-500">The report carries no checks.</p>
              ) : (
                <ul className="grid gap-1.5">
                  {checks.map((check) => (
                    <CheckRow key={check.id} check={check} onSelectScene={selectScene} />
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">Delivery</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ul className="grid gap-1.5" aria-label="Publish readiness checklist">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-[13px]">
                {item.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                ) : (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    <span className="h-3 w-3 rounded-full border-2 border-stone-600" aria-hidden />
                  </span>
                )}
                <span className={item.ok ? "text-zinc-200" : "text-zinc-500"}>{item.label}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 gap-1.5 border-stone-700"
                    disabled={!state.planRevision}
                    onClick={requestCapture}
                    aria-label="Capture preview as WebM"
                  >
                    <Video className="h-4 w-4" aria-hidden />
                    Capture preview (WebM)
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-72">
                  Preview-quality capture — parity with the plan; a production ffmpeg compositor is not attached in this
                  sandbox. Plays the plan once in realtime and saves a WebM.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="outline"
              className="h-11 gap-1.5 border-stone-700"
              disabled={!state.planRevision}
              onClick={() => void download("manifest")}
              aria-label="Download render manifest JSON"
            >
              <FileJson className="h-4 w-4" aria-hidden />
              Download manifest (JSON)
            </Button>
            <Button
              variant="outline"
              className="h-11 gap-1.5 border-stone-700"
              disabled={!state.planRevision}
              onClick={() => void download("srt")}
              aria-label="Download captions SRT"
            >
              <FileText className="h-4 w-4" aria-hidden />
              Download captions (SRT)
            </Button>
          </div>

          <p className="flex items-start gap-1.5 text-xs text-zinc-500">
            <Download className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            The manifest carries the full verified plan envelope, asset provenance, the audio receipt, the declared timing
            source, and the latest QC report. The SRT is built from the plan beats.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

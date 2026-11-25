"use client";

// inspector-rail.tsx — the right-hand inspector: plan envelope truth,
// capability badges, the asset list with thumbnails and provenance, story
// bible + continuity (story lanes), the narration receipt, and the scoped
// repair bench (one declared op bound to one scene, never silent).

import { useMemo, useState } from "react";
import { FileText, Image as ImageIcon, Layers, Music, ScrollText, Wrench } from "lucide-react";
import type { AssetDTO, ProjectState } from "@/lib/ibismuh/api-dto";
import { LANE_REGISTRY, type VideoType } from "@/lib/ibismuh/studio-lanes";
import { CapabilityBadges, TimingBadge } from "./capability-badges";
import { repairProject } from "./api-client";
import { formatTimeMs } from "./preview-player";
import { useToast } from "@/hooks/use-toast";

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-stone-800/80 px-3.5 py-3 last:border-b-0" aria-label={title}>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function MonoRow({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-[11px] text-zinc-500">{label}</span>
      <span className="min-w-0 truncate text-[11px] text-zinc-300 tf-mono" title={tooltip ?? value}>
        {value}
      </span>
    </div>
  );
}

function AssetRow({ asset }: { asset: AssetDTO }) {
  return (
    <div className="flex items-center gap-2 rounded border border-stone-800/80 bg-stone-950/50 p-2">
      {asset.kind === "image" ? (
        <img
          src={asset.url}
          alt={asset.sceneRef ? `Generated art for scene ${asset.sceneRef}` : "Generated art"}
          className="h-10 w-14 shrink-0 rounded border border-stone-800 object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded border border-stone-800 bg-stone-900" aria-hidden>
          <Music className="h-4 w-4 text-teal-400" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] text-zinc-300 tf-mono">
          {asset.kind} · {asset.sourceKind}
          {asset.sceneRef ? ` · ${asset.sceneRef}` : ""}
        </span>
        <span className="block truncate text-[10px] text-zinc-500">
          {asset.provider ?? "builtin"} · {asset.license}
        </span>
        <span className="block truncate text-[10px] text-zinc-600 tf-mono" title={asset.contentHash}>
          sha {asset.contentHash.slice(0, 8)}
          {asset.bytes ? ` · ${(asset.bytes / 1024).toFixed(0)}KB` : ""}
        </span>
      </span>
    </div>
  );
}

interface InspectorRailProps {
  state: ProjectState;
  accentHex: string;
  onRepaired?: () => void;
  selectedSceneRef?: string | null;
}

/** The per-op instruction placeholder (honest copy, no pretending). */
const REPAIR_PLACEHOLDERS: Record<string, string> = {
  "beat-visual": "Describe what this beat's frame must show…",
  "scene-art": "Describe the replacement art for this scene…",
  "beat-caption": "The corrected caption text (max 90 chars)…",
  "beat-timing": "The rewritten narration for this beat…",
  "scene-narration": "The rewritten narration for this scene…",
  "slide-content": "The corrected slide title…",
  "component-doc": "The corrected headline text…",
};

function RepairBench({ state, onRepaired, selectedSceneRef }: { state: ProjectState; onRepaired?: () => void; selectedSceneRef?: string | null }) {
  const { toast } = useToast();
  const lane = LANE_REGISTRY[state.project.lane as VideoType];
  const scenes = state.planRevision?.laneScenes ?? [];
  const [sceneRef, setSceneRef] = useState<string>(selectedSceneRef ?? scenes[0]?.id ?? "");
  const [op, setOp] = useState<string>(lane?.repairOperations[0] ?? "");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const activeScene = scenes.find((s) => s.id === sceneRef) ?? null;

  if (!lane) return null;

  async function submit() {
    if (!instruction.trim()) return;
    setBusy(true);
    try {
      const result = await repairProject(state.project.id, { op, sceneRef, instruction });
      toast({
        title: `Repair applied — rev ${result.planRevision.revision}`,
        description: `Changed ${result.changedScene ?? "—"}${result.affectedAssets.length ? `, regenerated ${result.affectedAssets.join(", ")}` : ""}. Stages to rerun: ${result.invalidatedStages.length}.`,
      });
      setInstruction("");
      onRepaired?.();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Repair failed",
        description: err instanceof Error && "detail" in err ? String((err as { detail?: string }).detail) : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-1.5">
        <label className="grid gap-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">op (registry)</span>
          <select
            value={op}
            onChange={(e) => setOp(e.target.value)}
            className="h-8 rounded border border-stone-700 bg-stone-950 px-1.5 text-[11px] text-zinc-200 tf-mono"
            aria-label="Repair operation"
          >
            {lane.repairOperations.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">scene (scope)</span>
          <select
            value={sceneRef}
            onChange={(e) => setSceneRef(e.target.value)}
            className="h-8 rounded border border-stone-700 bg-stone-950 px-1.5 text-[11px] text-zinc-200 tf-mono"
            aria-label="Repair scene scope"
          >
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      {activeScene && (
        <p className="text-[10px] leading-snug text-zinc-500" title={activeScene.visualIntent}>
          scoped to <span className="tf-mono text-zinc-400">{activeScene.id}</span> — current intent: “{activeScene.visualIntent.slice(0, 70)}…”
        </p>
      )}
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={REPAIR_PLACEHOLDERS[op] ?? "The repair instruction…"}
        rows={2}
        className="min-h-[44px] rounded border border-stone-700 bg-stone-950 px-2 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-600"
        aria-label="Repair instruction"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy || !instruction.trim() || scenes.length === 0}
        className="flex h-9 items-center justify-center gap-1.5 rounded border border-amber-700/60 bg-amber-950/40 text-[12px] font-medium text-amber-300 transition-colors hover:bg-amber-900/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Wrench className="h-3.5 w-3.5" aria-hidden />
        {busy ? "Applying repair — new revision…" : "Apply repair (new revision)"}
      </button>
      <p className="text-[10px] leading-snug text-zinc-600">
        A repair creates a new linked revision — the amended plan is recompiled, never silently rewritten; unrelated scenes keep their assets.
      </p>
    </div>
  );
}

export function InspectorRail({ state, accentHex, onRepaired, selectedSceneRef }: InspectorRailProps) {
  const plan = state.planRevision?.plan ?? null;
  const rev = state.planRevision;
  const imageAssets = useMemo(() => state.assets.filter((a) => a.kind === "image"), [state.assets]);
  const audioAssets = useMemo(() => state.assets.filter((a) => a.kind === "audio"), [state.assets]);
  const bible = rev?.storyBible ?? null;

  return (
    <div className="studio-scroll h-full overflow-y-auto studio-panel">
      <div className="flex items-center gap-2 border-b border-stone-800 px-3.5 py-2.5">
        <Layers className="h-4 w-4 text-amber-400/80" aria-hidden />
        <span className="text-[12px] font-semibold text-zinc-200">Inspector</span>
        <span className="ml-auto h-2 w-2 rounded-full" style={{ background: accentHex }} aria-hidden />
      </div>

      {/* plan envelope */}
      <Section icon={<FileText className="h-3.5 w-3.5" aria-hidden />} title="Plan envelope">
        {rev && plan ? (
          <div className="grid gap-1.5">
            <MonoRow label="revision" value={`rev ${rev.revision}${rev.parentRevision ? ` ← ${rev.parentRevision}` : ""}`} />
            <MonoRow label="fingerprint" value={plan.fingerprint.slice(0, 16) + "…"} tooltip={plan.fingerprint} />
            <MonoRow label="briefHash" value={plan.briefHash.slice(0, 12) + "…"} tooltip={plan.briefHash} />
            <MonoRow label="planner" value={rev.plannerMeta.planner} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-500">llm pass</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                  rev.plannerMeta.llmPass === "full"
                    ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-300"
                    : rev.plannerMeta.llmPass === "partial"
                      ? "border-amber-600/60 bg-amber-950/40 text-amber-300"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400"
                }`}
              >
                {rev.plannerMeta.llmPass}
              </span>
            </div>
            <div className="rounded border border-stone-800/80 bg-stone-950/50 px-2 py-1.5">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">fallback decision — declared</span>
              <p className="mt-0.5 text-[11px] text-zinc-300 tf-mono">{plan.fallback.mode}</p>
              <p className="text-[10px] leading-snug text-zinc-500">{plan.fallback.reason}</p>
              {plan.fallback.perScene && plan.fallback.perScene.length > 0 && (
                <ul className="mt-1 grid gap-0.5">
                  {plan.fallback.perScene.map((ps) => (
                    <li key={ps.sceneRef} className="text-[10px] text-zinc-400 tf-mono">
                      {ps.sceneRef}: {ps.mode}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <MonoRow label="qc profile" value={plan.qcProfile} />
            <MonoRow label="renderer" value={plan.rendererVersion} />
            {rev.plannerMeta.note && <p className="text-[10px] leading-snug text-zinc-500">{rev.plannerMeta.note}</p>}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No plan compiled yet — write the brief and compile the plan.</p>
        )}
      </Section>

      {/* capability truth */}
      <Section icon={<Layers className="h-3.5 w-3.5" aria-hidden />} title="Capability truth">
        <CapabilityBadges capabilities={state.capabilities} lane={state.project.lane} timingSource={state.timingSource} />
      </Section>

      {/* assets */}
      <Section icon={<ImageIcon className="h-3.5 w-3.5" aria-hidden />} title={`Assets (${state.assets.length})`}>
        {state.assets.length === 0 ? (
          <p className="text-xs text-zinc-500">No assets yet — image lanes generate art per scene; every lane generates narration.</p>
        ) : (
          <div className="grid gap-1.5">
            {imageAssets.map((a) => (
              <AssetRow key={a.id} asset={a} />
            ))}
            {audioAssets.map((a) => (
              <AssetRow key={a.id} asset={a} />
            ))}
          </div>
        )}
      </Section>

      {/* story bible + continuity */}
      {(state.project.lane === "story" || state.project.lane === "character") && (
        <Section icon={<ScrollText className="h-3.5 w-3.5" aria-hidden />} title="Story bible & continuity">
          {bible ? (
            <div className="grid gap-2">
              <div>
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">characters</span>
                <ul className="mt-0.5 grid gap-0.5">
                  {bible.characters.map((c) => (
                    <li key={c.id} className="text-[11px] text-zinc-300">
                      <span className="text-zinc-200">{c.name}</span> — {c.description}
                    </li>
                  ))}
                  {bible.characters.length === 0 && <li className="text-[11px] text-zinc-500">none declared</li>}
                </ul>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">locations</span>
                <ul className="mt-0.5 grid gap-0.5">
                  {bible.locations.map((l) => (
                    <li key={l.id} className="text-[11px] text-zinc-300">
                      <span className="text-zinc-200">{l.name}</span> — {l.description}
                    </li>
                  ))}
                  {bible.locations.length === 0 && <li className="text-[11px] text-zinc-500">none declared</li>}
                </ul>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">palette</span>
                <div className="mt-1 flex gap-1">
                  {bible.palette.map((hex, i) => (
                    <span key={`${hex}-${i}`} className="h-4 w-4 rounded-sm border border-stone-700" style={{ background: hex }} title={hex} aria-label={hex} />
                  ))}
                </div>
              </div>
              {rev && rev.continuity.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500">continuity</span>
                  <ul className="mt-0.5 grid gap-1">
                    {rev.continuity.slice(0, 6).map((issue, i) => (
                      <li key={`${issue.sceneRef}-${i}`} className="flex items-start gap-1.5 text-[11px] text-zinc-300">
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${issue.severity === "warn" ? "bg-amber-400" : "bg-zinc-500"}`}
                          aria-hidden
                        />
                        <span>
                          {issue.message} <span className="tf-mono text-zinc-600">{issue.sceneRef}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">No story bible on this revision.</p>
          )}
        </Section>
      )}

      {/* narration receipt */}
      <Section icon={<Music className="h-3.5 w-3.5" aria-hidden />} title="Narration receipt">
        {state.audioReceipt ? (
          <div className="grid gap-1.5">
            <MonoRow label="duration" value={formatTimeMs(state.audioReceipt.durationMs)} />
            <MonoRow label="sample rate" value={`${(state.audioReceipt.sampleRate / 1000).toFixed(1)}kHz`} />
            <MonoRow label="provider" value={state.audioReceipt.provider ?? "—"} />
            <MonoRow label="sentences" value={String(state.audioReceipt.sentenceSpans.length)} />
            {state.audioReceipt.wordSpans && (
              <MonoRow label="word anchors" value={String(state.audioReceipt.wordSpans.length)} />
            )}
            <MonoRow label="normalization" value={state.audioReceipt.normalization.applied ? state.audioReceipt.normalization.target ?? "applied" : "not applied"} />
            <div className="pt-1">
              <TimingBadge timingSource={state.timingSource} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No measured audio — generate narration to measure real timing.</p>
        )}
      </Section>

      {/* scoped repair bench */}
      {state.planRevision && (
        <Section icon={<Wrench className="h-3.5 w-3.5" aria-hidden />} title="Repair bench">
          <RepairBench state={state} onRepaired={onRepaired} selectedSceneRef={selectedSceneRef} />
        </Section>
      )}
    </div>
  );
}

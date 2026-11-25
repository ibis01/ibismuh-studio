"use client";

// lane-workspaces.tsx — the six lane-specific workspaces (§6.2) + the shared
// scene rail. Editing scope is honest: inline text edits write the PATCH
// brief draft (then the creator recompiles the plan); per-scene structural
// edits (camera, transitions, rig assignment) are DECLARED as repair-flow
// operations, not silently faked here.

import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AssetDTO, ProjectState } from "@/lib/ibismuh/api-dto";
import type { LaneScene } from "@/lib/ibismuh/planner-types";
import { drawFrame, type FrameRenderCtx } from "./lane-renderer";

// ---------- shared types ----------

export type SceneField = "narration" | "visualIntent" | "caption";

export interface SceneDraftApi {
  value: (sceneRef: string, field: SceneField) => string;
  set: (sceneRef: string, field: SceneField, value: string) => void;
  dirty: (sceneRef: string, field: SceneField) => boolean;
}

export interface WorkspaceProps {
  state: ProjectState;
  rc: FrameRenderCtx | null;
  selectedRef: string | null;
  windows: Record<string, { startMs: number; endMs: number }>;
  accentHex: string;
  drafts: SceneDraftApi;
}

// ---------- shared scene rail ----------

interface SceneRailProps {
  scenes: LaneScene[];
  assets: AssetDTO[];
  windows: Record<string, { startMs: number; endMs: number }>;
  selectedRef: string | null;
  onSelect: (ref: string) => void;
  accentHex: string;
  badge?: (scene: LaneScene) => string | null;
  imageFree?: boolean;
}

export function SceneRail({ scenes, assets, windows, selectedRef, onSelect, accentHex, badge, imageFree = false }: SceneRailProps) {
  return (
    <div className="studio-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="listbox" aria-label="Scenes">
      {scenes.map((scene) => {
        const win = windows[scene.id];
        const hasArt = assets.some((a) => a.kind === "image" && a.sceneRef === scene.id);
        const selected = scene.id === selectedRef;
        return (
          <button
            key={scene.id}
            role="option"
            aria-selected={selected}
            className={`min-h-[64px] w-44 shrink-0 rounded-lg border p-2.5 text-left transition-colors ${
              selected ? "border-amber-400 bg-amber-500/10" : "border-stone-800 bg-stone-900/60 hover:border-stone-600"
            }`}
            onClick={() => onSelect(scene.id)}
          >
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accentHex }} aria-hidden />
              <span className="text-xs font-medium text-zinc-200 tf-mono">{scene.id}</span>
              <span
                className={`ml-auto h-2 w-2 rounded-full ${imageFree ? "bg-teal-400/70" : hasArt ? "bg-emerald-500" : "bg-amber-400"}`}
                title={imageFree ? "image-free lane" : hasArt ? "art generated" : "art missing — gradient board fallback"}
                aria-label={imageFree ? "image-free lane" : hasArt ? "art generated" : "art missing"}
              />
            </span>
            <span className="mt-1 block truncate text-xs text-zinc-400" title={scene.caption ?? scene.visualIntent}>
              {scene.caption ?? scene.visualIntent}
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500 tf-num">
              {win ? `${((win.endMs - win.startMs) / 1000).toFixed(1)}s` : `${(scene.estimatedDurationMs / 1000).toFixed(1)}s est`}
              {badge ? <span className="ml-1.5 text-amber-300/80">{badge(scene)}</span> : null}
            </span>
          </button>
        );
      })}
      {scenes.length === 0 && (
        <div className="flex h-16 w-full items-center justify-center rounded-lg border border-dashed border-stone-800 text-xs text-zinc-500">
          No scenes yet — compile the plan first.
        </div>
      )}
    </div>
  );
}

// ---------- shared static frame (board / slide stills) ----------

function StaticFrame({ tMs, rc, className }: { tMs: number; rc: FrameRenderCtx | null; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const internal = rc
    ? { w: rc.plan.width, h: rc.plan.height }
    : { w: 1280, h: 720 };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rc) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFrame(ctx, canvas.width, canvas.height, tMs, rc);
  }, [tMs, rc, internal.w, internal.h]);
  return (
    <canvas
      ref={canvasRef}
      width={internal.w}
      height={internal.h}
      aria-label={`Static frame at ${Math.round(tMs)}ms`}
      className={`block w-full h-auto rounded-md border border-stone-800 bg-[#0e0c0a] ${className ?? ""}`}
    />
  );
}

function sceneMidMs(windows: Record<string, { startMs: number; endMs: number }>, ref: string | null): number {
  const win = ref ? windows[ref] : undefined;
  if (!win) return 0;
  return Math.round((win.startMs + win.endMs) / 2);
}

function ReadOnlyField({
  label,
  value,
  dirty,
  hint,
}: {
  label: string;
  value: string;
  dirty?: boolean;
  hint?: string;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-zinc-400">
        {label}
        {dirty && <span className="ml-1.5 text-amber-300">· unsaved</span>}
      </span>
      <Textarea
        readOnly
        value={value}
        aria-label={`${label} (read-only)`}
        className="min-h-[64px] resize-none border-stone-800 bg-stone-950/70 text-[13px] text-zinc-300 cursor-default"
      />
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </div>
  );
}

function EditableField({
  label,
  value,
  dirty,
  onChange,
  hint,
  rows = 3,
}: {
  label: string;
  value: string;
  dirty?: boolean;
  onChange: (v: string) => void;
  hint?: string;
  rows?: number;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-zinc-400">
        {label}
        {dirty && <span className="ml-1.5 text-amber-300">· unsaved</span>}
      </span>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        rows={rows}
        className="resize-none border-stone-800 bg-stone-950/70 text-[13px] text-zinc-200"
      />
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </div>
  );
}

function FocalRects({ scene }: { scene: LaneScene | null }) {
  const cam = scene?.camera;
  if (!cam) {
    return <p className="text-xs text-zinc-500">No Smart Motion camera declared for this scene.</p>;
  }
  const box = (rect: { x: number; y: number; w: number; h: number }, label: string, color: string) => (
    <div className="relative h-20 flex-1 rounded border border-stone-800 bg-stone-950/80 overflow-hidden" aria-label={label}>
      <div
        className="absolute rounded-sm border-2"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.w * 100}%`,
          height: `${rect.h * 100}%`,
          borderColor: color,
          background: `${color}22`,
        }}
      />
      <span className="absolute bottom-0.5 left-1 text-xs tf-mono" style={{ color }}>
        {label}
      </span>
    </div>
  );
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          {box(cam.start, "start", "#e8b64c")}
          {box(cam.end, "end", "#c77dba")}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 tf-mono">
          <span>start x{cam.start.x.toFixed(2)} y{cam.start.y.toFixed(2)} w{cam.start.w.toFixed(2)} h{cam.start.h.toFixed(2)}</span>
          <span aria-hidden>→</span>
          <span>end x{cam.end.x.toFixed(2)} y{cam.end.y.toFixed(2)} w{cam.end.w.toFixed(2)} h{cam.end.h.toFixed(2)}</span>
          <span className="text-zinc-600">easing: {cam.easing}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="w-fit text-xs text-zinc-500 underline decoration-dotted cursor-help">
              camera edits ride the repair flow (beat-camera), not the brief
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Camera poses are plan documents, not brief fields — request a beat-camera repair to change them. Displayed here
            read-only by design.
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

// ---------- classic ----------

export function ClassicWorkspace({ state, selectedRef, drafts }: WorkspaceProps) {
  const scenes = state.planRevision?.laneScenes ?? [];
  const scene = scenes.find((s) => s.id === selectedRef) ?? null;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">
            Beat editor {scene ? <span className="tf-mono text-amber-300">· {scene.id}</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ReadOnlyField label="Narration (from the plan)" value={scene?.narration ?? ""} hint="Narration is plan truth — request a scene-narration repair to change it." />
          <EditableField
            label="Visual intent (brief draft)"
            value={selectedRef ? drafts.value(selectedRef, "visualIntent") : ""}
            dirty={selectedRef ? drafts.dirty(selectedRef, "visualIntent") : false}
            onChange={(v) => selectedRef && drafts.set(selectedRef, "visualIntent", v)}
            hint="Saves into the brief — recompile the plan to regenerate art."
          />
        </CardContent>
      </Card>
      <div className="grid content-start gap-3">
        <Card className="studio-panel border-stone-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-200">Camera pose</CardTitle>
          </CardHeader>
          <CardContent>
            <FocalRects scene={scene} />
          </CardContent>
        </Card>
        <Card className="studio-panel border-stone-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-200">Captions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {scenes.map((s) => (
              <div key={s.id} className="flex items-start gap-2 rounded border border-stone-800/80 bg-stone-950/50 px-2 py-1.5">
                <span className="text-xs tf-mono text-zinc-500 pt-0.5">{s.id}</span>
                <span className="text-[12px] text-zinc-300">{s.caption ?? "—"}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------- story ----------

export function StoryWorkspace({ state, rc, selectedRef, windows, drafts }: WorkspaceProps) {
  const scenes = state.planRevision?.laneScenes ?? [];
  const scene = scenes.find((s) => s.id === selectedRef) ?? null;
  const bible = state.planRevision?.storyBible ?? null;
  const continuity = state.planRevision?.continuity ?? [];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">
            Scene editor {scene ? <span className="tf-mono text-amber-300">· {scene.id}</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <EditableField
            label="Narration (brief draft)"
            value={selectedRef ? drafts.value(selectedRef, "narration") : ""}
            dirty={selectedRef ? drafts.dirty(selectedRef, "narration") : false}
            onChange={(v) => selectedRef && drafts.set(selectedRef, "narration", v)}
          />
          <EditableField
            label="Visual intent (brief draft)"
            value={selectedRef ? drafts.value(selectedRef, "visualIntent") : ""}
            dirty={selectedRef ? drafts.dirty(selectedRef, "visualIntent") : false}
            onChange={(v) => selectedRef && drafts.set(selectedRef, "visualIntent", v)}
            hint="Saves into the brief — recompile the plan to regenerate art."
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-stone-800 bg-stone-950/50 p-2">
              <span className="text-xs uppercase tracking-wide text-zinc-500">transitionIn</span>
              <p className="text-[13px] text-zinc-300 tf-mono">{scene?.transitionIn ?? "cut"}</p>
            </div>
            <div className="rounded border border-stone-800 bg-stone-950/50 p-2">
              <span className="text-xs uppercase tracking-wide text-zinc-500">window</span>
              <p className="text-[13px] text-zinc-300 tf-num">
                {scene && windows[scene.id]
                  ? `${((windows[scene.id].endMs - windows[scene.id].startMs) / 1000).toFixed(1)}s`
                  : "—"}
              </p>
            </div>
          </div>
          <FocalRects scene={scene} />
        </CardContent>
      </Card>
      <div className="grid content-start gap-3">
        <Card className="studio-panel border-stone-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-200">Story bible</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5">
            {bible ? (
              <>
                {bible.characters.length > 0 && (
                  <div>
                    <span className="text-xs uppercase tracking-wide text-zinc-500">Characters</span>
                    <ul className="mt-1 space-y-1">
                      {bible.characters.map((c) => (
                        <li key={c.id} className="rounded border border-stone-800/80 bg-stone-950/50 px-2 py-1.5">
                          <span className="text-[12px] font-medium text-zinc-200">{c.name}</span>
                          <span className="block text-xs text-zinc-500">
                            {c.description} · wardrobe: {c.wardrobe}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {bible.locations.length > 0 && (
                  <div>
                    <span className="text-xs uppercase tracking-wide text-zinc-500">Locations</span>
                    <ul className="mt-1 space-y-1">
                      {bible.locations.map((l) => (
                        <li key={l.id} className="rounded border border-stone-800/80 bg-stone-950/50 px-2 py-1.5 text-[12px] text-zinc-300">
                          <span className="font-medium text-zinc-200">{l.name}</span> — {l.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <span className="text-xs uppercase tracking-wide text-zinc-500">Palette</span>
                  <div className="mt-1 flex gap-1.5">
                    {bible.palette.map((hex, i) => (
                      <Tooltip key={`${hex}-${i}`}>
                        <TooltipTrigger asChild>
                          <span className="h-6 w-6 rounded border border-stone-700" style={{ background: hex }} aria-label={hex} />
                        </TooltipTrigger>
                        <TooltipContent className="tf-mono text-xs">{hex}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-zinc-500">Style: {bible.style}</p>
              </>
            ) : (
              <p className="text-xs text-zinc-500">No story bible — this plan was compiled without one.</p>
            )}
          </CardContent>
        </Card>
        <Card className="studio-panel border-stone-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-200">Continuity report</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {continuity.length === 0 ? (
              <p className="text-xs text-zinc-500">No continuity issues found between adjacent scenes.</p>
            ) : (
              continuity.map((issue, i) => (
                <div key={`${issue.sceneRef}-${i}`} className="flex items-start gap-2 rounded border border-stone-800/80 bg-stone-950/50 px-2 py-1.5">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${issue.severity === "warn" ? "bg-amber-400" : "bg-zinc-400"}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="text-[12px] text-zinc-300">{issue.message}</span>
                    <span className="ml-1.5 text-xs tf-mono text-zinc-500">
                      {issue.sceneRef} · {issue.kind}
                    </span>
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        {rc && (
          <Card className="studio-panel border-stone-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-200">Scene still</CardTitle>
            </CardHeader>
            <CardContent>
              <StaticFrame tMs={sceneMidMs(windows, selectedRef)} rc={rc} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---------- whiteboard ----------

export function WhiteboardWorkspace({ state, rc, selectedRef, windows }: WorkspaceProps) {
  const scenes = state.planRevision?.laneScenes ?? [];
  const scene = scenes.find((s) => s.id === selectedRef) ?? null;
  const paths = scene?.paths ?? [];
  const win = selectedRef ? windows[selectedRef] : undefined;
  const totalStroke = paths.reduce((acc, p) => acc + p.strokeMs, 0);
  const windowMs = win ? win.endMs - win.startMs : 0;
  const drawBudget = windowMs * 0.85;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">
            Board preview {scene ? <span className="tf-mono text-amber-300">· {scene.id}</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {rc ? (
            <StaticFrame tMs={sceneMidMs(windows, selectedRef)} rc={rc} />
          ) : (
            <p className="text-xs text-zinc-500">Compile the plan to render board stills.</p>
          )}
          <div className="flex flex-wrap gap-1.5 text-xs tf-mono text-zinc-400">
            <span className="rounded-full border border-stone-700 bg-stone-900 px-2 py-0.5">strokes: {paths.length}</span>
            <span className="rounded-full border border-stone-700 bg-stone-900 px-2 py-0.5">calibrated: {totalStroke}ms</span>
            <span className="rounded-full border border-stone-700 bg-stone-900 px-2 py-0.5">window: {windowMs}ms</span>
            <span className="rounded-full border border-stone-700 bg-stone-900 px-2 py-0.5">
              speed: {windowMs > 0 ? `${Math.round((Math.min(totalStroke, drawBudget) / windowMs) * 100)}% of window` : "—"}
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Hand style: rounded pen, #1f2937 ink on #f7f4ed paper. Strokes reveal progressively in declared draw order; the pen
            cursor tracks the active stroke tip in the preview.
          </p>
        </CardContent>
      </Card>
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">Draw order ({paths.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {paths.length === 0 ? (
            <p className="text-xs text-zinc-500">This scene carries no drawable strokes.</p>
          ) : (
            <ol className="studio-scroll grid max-h-72 gap-1.5 overflow-y-auto pr-1">
              {paths
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded border border-stone-800/80 bg-stone-950/50 px-2 py-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-800 text-xs tf-mono text-zinc-300">
                      {p.order}
                    </span>
                    <span className="text-[12px] text-zinc-300">{p.role}</span>
                    <span className="text-xs text-zinc-500">· {p.semanticGroup}</span>
                    <span className="ml-auto text-xs tf-num text-zinc-400">{p.strokeMs}ms</span>
                  </li>
                ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- graphics2d ----------

function LayoutMiniViz({ layout }: { layout: { x: number; y: number; w: number; h: number } }) {
  return (
    <span className="relative inline-block h-8 w-12 shrink-0 rounded border border-stone-800 bg-stone-950/80" aria-label="Layout rect">
      <span
        className="absolute rounded-[1px] border border-emerald-500/70 bg-emerald-500/15"
        style={{
          left: `${layout.x * 100}%`,
          top: `${layout.y * 100}%`,
          width: `${Math.max(4, layout.w * 100)}%`,
          height: `${Math.max(4, layout.h * 100)}%`,
        }}
        aria-hidden
      />
    </span>
  );
}

export function GraphicsWorkspace({ state, selectedRef }: WorkspaceProps) {
  const scenes = state.planRevision?.laneScenes ?? [];
  const scene = scenes.find((s) => s.id === selectedRef) ?? null;
  const comps = scene?.components ?? [];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">
            Component tree {scene ? <span className="tf-mono text-amber-300">· {scene.id}</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {comps.length === 0 ? (
            <p className="text-xs text-zinc-500">This scene carries no components.</p>
          ) : (
            <ul className="grid gap-1.5">
              {comps.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded border border-stone-800/80 bg-stone-950/50 px-2 py-1.5">
                  <LayoutMiniViz layout={c.layout} />
                  <span className="min-w-0">
                    <span className="block text-[12px] text-zinc-200">
                      {c.kind} <span className="tf-mono text-xs text-zinc-500">{c.id}</span>
                    </span>
                    <span className="block text-xs text-zinc-500 tf-mono">
                      x{c.layout.x.toFixed(2)} y{c.layout.y.toFixed(2)} w{c.layout.w.toFixed(2)} h{c.layout.h.toFixed(2)}
                    </span>
                  </span>
                  {c.citation && (
                    <Badge variant="outline" className="ml-auto shrink-0 border-teal-700/60 bg-teal-950/40 text-teal-300 font-normal">
                      cited
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">Data inspector</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {comps.length === 0 ? (
            <p className="text-xs text-zinc-500">No component payloads.</p>
          ) : (
            comps.map((c) => (
              <div key={c.id} className="rounded border border-stone-800/80 bg-stone-950/60 p-2">
                <span className="text-xs uppercase tracking-wide text-zinc-500">
                  {c.kind}
                  {c.citation ? ` — citation: ${c.citation}` : ""}
                </span>
                <pre className="studio-scroll mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-snug text-zinc-300 tf-mono">
                  {JSON.stringify(c.props, null, 2)}
                </pre>
              </div>
            ))
          )}
          <p className="text-xs text-zinc-500">
            The declarative doc is the truth — repairs ride the component-doc operation. Pseudo-stats are never cited; only
            real numbers carry a citation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- character ----------

export function CharacterWorkspace({ state, selectedRef }: WorkspaceProps) {
  const scenes = state.planRevision?.laneScenes ?? [];
  const scene = scenes.find((s) => s.id === selectedRef) ?? null;
  const identity = scene?.pose?.identityAnchor ?? state.brief.characterName ?? "host-character";
  const fallbackScenes = scenes.filter((s) => (s.pose?.rigMode ?? s.mode) === "storyboard-fallback");
  const allFallback = fallbackScenes.length === scenes.length && scenes.length > 0;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {(fallbackScenes.length > 0 || allFallback) && (
        <div className="lg:col-span-2 flex items-start gap-2 rounded-lg border border-dashed border-amber-600/70 bg-amber-950/30 px-3 py-2.5" role="note">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
          <p className="text-[12px] text-amber-200/90">
            <span className="font-medium">Storyboard fallback declared for {fallbackScenes.length} of {scenes.length} scenes.</span>{" "}
            No valid rig for those scenes — storyboard art carries them, declared per scene, never silent. Attach a rigged
            character (description containing &quot;rigged&quot;) and recompile to use the native rig channel.
          </p>
        </div>
      )}
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">Cast</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="rounded border border-stone-800/80 bg-stone-950/50 p-2.5">
            <span className="text-xs uppercase tracking-wide text-zinc-500">identity anchor</span>
            <p className="text-[13px] text-zinc-200 tf-mono">{identity}</p>
            <p className="mt-1 text-xs text-zinc-500">{state.brief.characterDescription ?? "No character description in the brief."}</p>
          </div>
          <div className="overflow-hidden rounded border border-stone-800/80">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-stone-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-1.5 font-medium">scene</th>
                  <th className="px-2 py-1.5 font-medium">rig mode</th>
                  <th className="px-2 py-1.5 font-medium">lip sync</th>
                  <th className="px-2 py-1.5 font-medium">poses</th>
                </tr>
              </thead>
              <tbody>
                {scenes.map((s) => (
                  <tr key={s.id} className={`border-t border-stone-800/70 ${s.id === selectedRef ? "bg-amber-500/5" : ""}`}>
                    <td className="px-2 py-1.5 tf-mono text-zinc-300">{s.id}</td>
                    <td className="px-2 py-1.5">
                      <span className={((s.pose?.rigMode ?? s.mode) === "native-rig" ? "text-emerald-300" : "text-amber-300")}>
                        {s.pose?.rigMode ?? s.mode ?? "storyboard-fallback"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-zinc-400">{s.pose?.lipSync ?? "—"}</td>
                    <td className="px-2 py-1.5 tf-num text-zinc-400">{s.pose?.poses.length ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">Pose timeline {scene ? <span className="tf-mono text-amber-300">· {scene.id}</span> : null}</CardTitle>
        </CardHeader>
        <CardContent>
          {!scene?.pose || scene.pose.poses.length === 0 ? (
            <p className="text-xs text-zinc-500">No pose plan for this scene.</p>
          ) : (
            <div className="grid gap-2">
              {scene.pose.poses.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-xs tf-num text-zinc-400">{p.at}ms</span>
                  <span className="h-5 flex-1 rounded-sm border-l-[3px]" style={{ background: "#c77dba33", borderLeftColor: "#c77dba" }} />
                  <span className="w-32 shrink-0 text-right text-xs text-zinc-300 tf-mono">
                    {p.pose}
                    {p.viseme ? ` · ${p.viseme}` : ""}
                    {p.hold ? " · hold" : ""}
                  </span>
                </div>
              ))}
              <p className="text-xs text-zinc-500">
                Poses interpolate over 300ms; the mouth shape follows the declared viseme. Lip sync is {scene.pose.lipSync}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- slides ----------

export function SlidesWorkspace({ state, rc, selectedRef, windows }: WorkspaceProps) {
  const ops = useMemo(() => state.planRevision?.plan.timeline.ops ?? [], [state.planRevision]);
  const scenes = state.planRevision?.laneScenes ?? [];
  const scene = scenes.find((s) => s.id === selectedRef) ?? null;
  const slide = scene?.slide ?? null;
  const revealOps = useMemo(
    () => ops.filter((op) => op.sceneRef === selectedRef && op.op === "writeText" && op.role === "bullet"),
    [ops, selectedRef],
  );
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">
            Slide {scene ? <span className="tf-mono text-amber-300">· {scene.id}</span> : null}
            {slide && <Badge className="ml-2 border-stone-700 bg-stone-900 text-zinc-300 font-normal">{slide.template}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {rc ? (
            <StaticFrame tMs={sceneMidMs(windows, selectedRef)} rc={rc} />
          ) : (
            <p className="text-xs text-zinc-500">Compile the plan to render slide stills.</p>
          )}
          <div className="rounded border border-stone-800/80 bg-stone-950/50 p-2.5">
            <span className="text-xs uppercase tracking-wide text-zinc-500">template — read-only display</span>
            <p className="text-[13px] text-zinc-300 tf-mono">{slide?.template ?? "—"}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Template changes ride the slide-template repair operation; content changes ride slide-content.
            </p>
          </div>
          <div className="rounded border border-stone-800/80 bg-stone-950/50 p-2.5">
            <span className="text-xs uppercase tracking-wide text-zinc-500">speaker notes (narration)</span>
            <p className="mt-1 text-[12px] leading-snug text-zinc-300">{scene?.narration ?? "—"}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-200">Reveal timing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5">
          {revealOps.length === 0 ? (
            <p className="text-xs text-zinc-500">No staggered reveals — this slide presents as one unit.</p>
          ) : (
            revealOps.map((op) => (
              <div key={op.id} className="flex items-center gap-2 rounded border border-stone-800/80 bg-stone-950/50 px-2 py-1.5">
                {op.startMs > (windows[selectedRef ?? ""]?.startMs ?? 0) ? <ArrowUp className="h-3.5 w-3.5 text-zinc-500" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5 text-zinc-500" aria-hidden />}
                <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-300">{String(op.params?.text ?? "")}</span>
                <span className="shrink-0 text-xs tf-num text-zinc-500">
                  +{op.startMs - (windows[selectedRef ?? ""]?.startMs ?? 0)}ms
                </span>
              </div>
            ))
          )}
          {slide?.citation && (
            <p className="flex items-center gap-1.5 text-xs text-teal-300">
              <ImageOff className="h-3.5 w-3.5" aria-hidden />
              source: {slide.citation}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

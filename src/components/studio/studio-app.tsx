"use client";

// studio-app.tsx — the top-level client shell: data fetching, mutations,
// layout orchestration for the whole six-lane studio. The user only ever
// sees this route — everything is composed here.

import { useCallback, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { BriefSceneInput, StudioBrief } from "@/lib/ibismuh/planner-types";
import type { ProjectState } from "@/lib/ibismuh/api-dto";
import { VOICES, type AspectId } from "@/lib/ibismuh/studio-catalogs";
import { LANE_ORDER, LANE_REGISTRY, LANE_UI_META, type VideoType } from "@/lib/ibismuh/studio-lanes";
import {
  ApiClientError,
  compilePlan,
  getProject,
  listProjects,
  updateProject,
} from "./api-client";
import { imageCache } from "./lane-renderer";
import { CreateProjectDialog } from "./create-project-dialog";
import { InspectorRail } from "./inspector-rail";
import { LaneEditor } from "./lane-editor";
import type { SceneDraftApi } from "./lane-workspaces";
import { NavRail } from "./nav-rail";
import { PreviewPlayer } from "./preview-player";
import { ProjectHeader } from "./project-header";
import { QcPanel } from "./qc-panel";
import { RenderPanel } from "./render-panel";
import { TimelineStrip } from "./timeline-strip";
import { useStudioTransport } from "./studio-store";

const ACTIVE_JOB_STATES = new Set(["queued", "leased", "running", "validating", "retry", "retryable-failure"]);
const STORAGE_KEY = "ibismuh.selectedProject";

type TabId = "brief" | "editor" | "pipeline" | "delivery";

interface DraftState {
  title: string;
  aspect: AspectId;
  voice: string;
  brief: StudioBrief;
}

// ---------- brief tab ----------

function BriefTab({
  state,
  draft,
  setDraft,
  dirty,
  onSave,
  onCompile,
  savePending,
  compilePending,
}: {
  state: ProjectState;
  draft: DraftState;
  setDraft: (updater: (prev: DraftState) => DraftState) => void;
  dirty: boolean;
  onSave: () => void;
  onCompile: () => void;
  savePending: boolean;
  compilePending: boolean;
}) {
  const lane = state.project.lane as VideoType;
  const contract = LANE_REGISTRY[lane];
  const meta = LANE_UI_META[lane];
  const isCharacter = lane === "character";
  const aspects = contract.supportedAspects as readonly AspectId[];

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3 pb-6">
      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-zinc-200">
            Brief <span className="ml-1 text-xs font-normal text-zinc-500">· {meta.title} lane ({contract.format} format)</span>
          </CardTitle>
          <CardDescription className="text-[12px] leading-snug text-zinc-500">
            The brief is what you wrote — every byte of it feeds the plan fingerprint, so edits invalidate the compiled plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3.5">
          <div className="grid gap-1.5">
            <Label htmlFor="brief-topic">Topic</Label>
            <Textarea
              id="brief-topic"
              rows={2}
              value={draft.brief.topic}
              onChange={(e) => setDraft((p) => ({ ...p, brief: { ...p.brief, topic: e.target.value } }))}
              className="resize-none border-stone-700 bg-stone-950/60"
              aria-label="Brief topic"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="brief-script">Script — {lane === "classic" ? "the narration" : "optional"}</Label>
            <Textarea
              id="brief-script"
              rows={6}
              value={draft.brief.script ?? ""}
              placeholder={lane === "classic" ? "Paste your full narration script…" : "Leave empty and the AI planner drafts scenes"}
              onChange={(e) => setDraft((p) => ({ ...p, brief: { ...p.brief, script: e.target.value } }))}
              className="resize-none border-stone-700 bg-stone-950/60"
              aria-label="Brief script"
            />
          </div>

          {isCharacter && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="brief-char-name">Character name</Label>
                <Input
                  id="brief-char-name"
                  value={draft.brief.characterName ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, brief: { ...p.brief, characterName: e.target.value } }))}
                  className="h-11 border-stone-700 bg-stone-950/60"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="brief-char-desc">Character description</Label>
                <Input
                  id="brief-char-desc"
                  value={draft.brief.characterDescription ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, brief: { ...p.brief, characterDescription: e.target.value } }))}
                  className="h-11 border-stone-700 bg-stone-950/60"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="studio-panel border-stone-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-zinc-200">Delivery settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="brief-tone">Tone</Label>
            <Select
              value={draft.brief.tone ?? "informative"}
              onValueChange={(v) => setDraft((p) => ({ ...p, brief: { ...p.brief, tone: v } }))}
            >
              <SelectTrigger id="brief-tone" className="h-11 border-stone-700 bg-stone-950/60" aria-label="Tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["informative", "energetic", "calm", "cinematic"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="brief-aspect">Aspect</Label>
            <Select value={draft.aspect} onValueChange={(v) => setDraft((p) => ({ ...p, aspect: v as AspectId }))}>
              <SelectTrigger id="brief-aspect" className="h-11 border-stone-700 bg-stone-950/60" aria-label="Aspect ratio">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aspects.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                    {lane === "slides" ? " — deck geometry pinned" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lane === "slides" && <p className="text-xs text-zinc-500">The keynote deck geometry is pinned to 9:16.</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="brief-voice">Voice</Label>
            <Select value={draft.voice} onValueChange={(v) => setDraft((p) => ({ ...p, voice: v }))}>
              <SelectTrigger id="brief-voice" className="h-11 border-stone-700 bg-stone-950/60" aria-label="Voice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label} — {v.desc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          className="h-11 gap-1.5 border-stone-700"
          disabled={!dirty || savePending}
          onClick={onSave}
          aria-label="Save brief"
        >
          {savePending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {savePending ? "Saving…" : "Save brief"}
        </Button>
        <Button
          className="h-11 gap-1.5 bg-amber-500 font-semibold text-stone-950 hover:bg-amber-400"
          disabled={compilePending || dirty}
          onClick={onCompile}
          aria-label="Compile plan with the AI planner"
        >
          {compilePending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {compilePending ? "Compiling plan…" : state.planRevision ? "Recompile plan" : "Compile plan"}
        </Button>
        {compilePending && <span className="text-[12px] text-amber-300">AI planner is drafting scenes… this takes a moment</span>}
        {dirty && !compilePending && <span className="text-[12px] text-amber-300">Unsaved edits — save before recompiling.</span>}
        {state.planRevision && (
          <span className="ml-auto text-xs text-zinc-500 tf-mono">
            current plan: rev {state.planRevision.revision} · {state.planRevision.fingerprint.slice(0, 8)}
          </span>
        )}
      </div>

      {state.fallbackPolicy && (
        <p className="rounded-lg border border-dashed border-stone-700 bg-stone-950/40 px-3 py-2 text-xs leading-snug text-zinc-500">
          <span className="font-medium text-zinc-400">Declared fallback policy ({meta.title}):</span> {state.fallbackPolicy}
        </p>
      )}
    </div>
  );
}

// ---------- the shell ----------

function StudioShell() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>("editor");
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLane, setCreateLane] = useState<VideoType | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [_draftFor, setDraftFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>({ title: "", aspect: "16:9", voice: VOICES[0].id, brief: { topic: "" } });

  // Hydrate the persisted selection lazily — no setState-in-effect cascade.
  // The server never renders project rows (the list arrives async), so the
  // client-only initializer cannot diverge from the hydrated markup.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  // The EFFECTIVE selection is derived, never setState-in-effect: an
  // unknown/absent selection falls to the first project during render.
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const effectiveSelectedId = useMemo(() => {
    if (selectedId && projects.some((p) => p.id === selectedId)) return selectedId;
    return projects[0]?.id ?? null;
  }, [projects, selectedId]);

  const projectQuery = useQuery({
    queryKey: ["project", effectiveSelectedId],
    queryFn: () => getProject(effectiveSelectedId as string),
    enabled: Boolean(effectiveSelectedId),
    refetchInterval: (query) => {
      const data = query.state.data as ProjectState | undefined;
      return data?.job && ACTIVE_JOB_STATES.has(data.job.state) ? 1200 : false;
    },
  });

  const state: ProjectState | undefined = projectQuery.data;

  useEffect(() => {
    if (effectiveSelectedId) window.localStorage.setItem(STORAGE_KEY, effectiveSelectedId);
  }, [effectiveSelectedId]);

  // reset the transport when the VIEWED project changes (the effective
  // selection — not just the raw user choice)
  useEffect(() => {
    useStudioTransport.getState().setTimeMs(0);
    useStudioTransport.getState().setSelectedSceneRef(null);
    useStudioTransport.getState().clearSeek();
  }, [effectiveSelectedId]);

  // seed the selected scene once a plan exists
  useEffect(() => {
    if (!state?.planRevision) return;
    const scenes = state.planRevision.laneScenes;
    const current = useStudioTransport.getState().selectedSceneRef;
    if (scenes.length > 0 && (!current || !scenes.some((s) => s.id === current))) {
      useStudioTransport.getState().setSelectedSceneRef(scenes[0].id);
    }
  }, [state?.planRevision]);

  // draft sync: seed from the server per project + after saves — the
  // React-documented render-time adjustment pattern (guarded setState
  // during render), not a setState-in-effect cascade.
  const seedKey = state ? `${state.project.id}:${state.project.updatedAt}` : null;
  const [seededKey, setSeededKey] = useState<string | null>(null);
  if (seedKey !== seededKey) {
    setSeededKey(seedKey);
    setDraft(
      state
        ? {
            title: state.project.title,
            aspect: state.project.aspect as AspectId,
            voice: state.project.voice,
            brief: { ...state.brief },
          }
        : { title: "", aspect: "16:9", voice: VOICES[0].id, brief: { topic: "" } },
    );
    setDraftFor(state?.project.id ?? null);
  }

  const briefDirty = useMemo(() => {
    if (!state) return false;
    return (
      draft.title !== state.project.title ||
      draft.aspect !== state.project.aspect ||
      draft.voice !== state.project.voice ||
      JSON.stringify(draft.brief) !== JSON.stringify(state.brief)
    );
  }, [draft, state]);

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
    if (effectiveSelectedId) await queryClient.invalidateQueries({ queryKey: ["project", effectiveSelectedId] });
  }, [queryClient, effectiveSelectedId]);

  // The scene selected in the rail / timeline / QC markers — the repair
  // bench pre-scopes to it (read-only subscription; writes go through the store).
  const selectedScene = useStudioTransport((s) => s.selectedSceneRef);

  const patchMutation = useMutation({
    mutationFn: (body: { title?: string; brief?: Partial<StudioBrief>; aspect?: AspectId; voice?: string }) =>
      updateProject(effectiveSelectedId as string, body),
    onSuccess: (next) => {
      toast.success("Saved", { description: `${next.project.title} updated — recompile the plan to regenerate from the new brief.` });
      setDraftFor(null); // re-seed the draft from the fresh server state
      void invalidate();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) toast.error(err.message, { description: err.detail });
      else toast.error("Save failed", { description: String(err) });
    },
  });

  const compileMutation = useMutation({
    mutationFn: () => compilePlan(effectiveSelectedId as string),
    onSuccess: (data) => {
      toast.success("Plan compiled", {
        description: `Revision ${data.planRevision.revision} — ${data.planRevision.laneScenes.length} scene(s), planner ${data.planRevision.plannerMeta.planner} (llm ${data.planRevision.plannerMeta.llmPass}).`,
      });
      setDraftFor(null);
      void invalidate();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) toast.error(err.message, { description: err.detail });
      else toast.error("Plan compilation failed", { description: String(err) });
    },
  });

  const onPatchTitle = useCallback(
    async (title: string) => {
      setDraft((p) => ({ ...p, title }));
      try {
        await updateProject(effectiveSelectedId as string, { title });
        setDraftFor(null);
        await invalidate();
        toast.success("Title saved");
      } catch (err) {
        if (err instanceof ApiClientError) toast.error(err.message, { description: err.detail });
        else toast.error("Rename failed", { description: String(err) });
      }
    },
    [invalidate, effectiveSelectedId],
  );

  // per-scene draft edits ride the brief scenes array
  const draftsApi: SceneDraftApi = useMemo(() => {
    const serverScenes = state?.planRevision?.laneScenes ?? [];
    const sceneDraft = (ref: string) => draft.brief.scenes?.find((s) => s.id === ref);
    const serverScene = (ref: string) => serverScenes.find((s) => s.id === ref);
    return {
      value: (ref, field) => {
        const d = sceneDraft(ref);
        if (d && d[field] !== undefined) return d[field] as string;
        const s = serverScene(ref);
        if (field === "narration") return s?.narration ?? "";
        if (field === "visualIntent") return s?.visualIntent ?? "";
        return s?.caption ?? "";
      },
      set: (ref, field, value) => {
        const s = serverScene(ref);
        setDraft((p) => {
          const scenes: BriefSceneInput[] = [...(p.brief.scenes ?? [])];
          const idx = scenes.findIndex((sc) => sc.id === ref);
          const base: BriefSceneInput = idx >= 0
            ? { ...scenes[idx] }
            : { id: ref, narration: s?.narration ?? "", visualIntent: s?.visualIntent ?? "", caption: s?.caption };
          base[field] = value;
          if (idx >= 0) scenes[idx] = base;
          else scenes.push(base);
          return { ...p, brief: { ...p.brief, scenes } };
        });
      },
      dirty: (ref, field) => {
        const d = sceneDraft(ref);
        if (!d || d[field] === undefined) return false;
        const s = serverScene(ref);
        if (field === "narration") return d[field] !== (s?.narration ?? "");
        if (field === "visualIntent") return d[field] !== (s?.visualIntent ?? "");
        return d[field] !== (s?.caption ?? "");
      },
    };
  }, [state, draft]);

  const rc = useMemo(() => {
    if (!state?.planRevision) return null;
    const plan = state.planRevision.plan;
    const laneMeta = LANE_UI_META[state.project.lane as VideoType];
    return {
      plan,
      lane: state.project.lane,
      scenes: state.planRevision.laneScenes,
      assets: state.assets,
      images: imageCache,
      accentHex: laneMeta?.accentHex ?? "#e8b64c",
    };
  }, [state]);

  const accentHex = LANE_UI_META[state?.project.lane as VideoType]?.accentHex ?? "#e8b64c";

  const onNewProject = (lane: VideoType | null) => {
    setCreateLane(lane);
    setCreateOpen(true);
    setNavOpen(false);
  };

  if (!state) {
    return (
      <div className="studio-shell flex h-screen overflow-hidden">
        <aside className="hidden w-56 shrink-0 md:block studio-line border-r">
          <NavRail projects={projects} selectedId={effectiveSelectedId} onSelect={setSelectedId} onNewProject={onNewProject} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-stone-800 px-3 py-3 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-zinc-300"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
            >
              <span className="text-lg" aria-hidden>
                ☰
              </span>
            </Button>
            <span className="text-sm font-semibold text-zinc-200">Ibismuh Studio</span>
          </div>
          <div className="flex flex-1 items-center justify-center p-6">
            {projectsQuery.isLoading ? (
              <span className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                loading the studio…
              </span>
            ) : projects.length === 0 ? (
              <div className="grid max-w-md gap-3 text-center">
                <h2 className="text-lg font-semibold text-zinc-100">No projects yet — pick a lane to start</h2>
                <p className="text-sm text-zinc-500">
                  Six lanes, one production workspace: classic narration, scene story, whiteboard, motion graphics, character
                  animation, and keynote slides.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {LANE_ORDER.map((lane) => (
                    <button
                      key={lane}
                      type="button"
                      className="min-h-[64px] rounded-lg border border-stone-800 bg-stone-900/60 p-3 text-left text-[13px] text-zinc-200 hover:border-stone-500 transition-colors"
                      onClick={() => onNewProject(lane)}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: LANE_UI_META[lane].accentHex }} aria-hidden />
                        {LANE_UI_META[lane].title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <span className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                loading project…
              </span>
            )}
          </div>
        </main>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-72 border-stone-800 bg-stone-900 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <NavRail variant="sheet" projects={projects} selectedId={effectiveSelectedId} onSelect={(id) => { setSelectedId(id); setNavOpen(false); }} onNewProject={onNewProject} />
          </SheetContent>
        </Sheet>
        <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} defaultLane={createLane} onCreated={(s) => { setSelectedId(s.project.id); void invalidate(); }} />
      </div>
    );
  }

  return (
    <div className="studio-shell flex h-screen overflow-hidden">
      {/* nav rail (desktop) */}
      <aside
        className={`hidden shrink-0 transition-all duration-200 md:block studio-line border-r ${navCollapsed ? "w-14" : "w-56"}`}
      >
        <NavRail
          projects={projects}
          selectedId={effectiveSelectedId}
          onSelect={setSelectedId}
          onNewProject={onNewProject}
          collapsed={navCollapsed}
          onToggleCollapsed={() => setNavCollapsed((c) => !c)}
        />
      </aside>

      {/* main column */}
      <main className="flex min-w-0 flex-1 flex-col">
        <ProjectHeader state={state} briefDirty={briefDirty} onPatchTitle={onPatchTitle} onOpenNav={() => setNavOpen(true)} />

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabId)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="px-3 pt-2 md:px-4">
            <TabsList className="h-auto flex-wrap gap-1 bg-stone-900/80 p-1 border border-stone-800" aria-label="Workspace tabs">
              <TabsTrigger value="brief" className="min-h-11 px-3 text-[13px] data-[state=active]:bg-stone-800 data-[state=active]:text-amber-300">
                Brief
              </TabsTrigger>
              <TabsTrigger value="editor" className="min-h-11 px-3 text-[13px] data-[state=active]:bg-stone-800 data-[state=active]:text-amber-300">
                Lane editor
              </TabsTrigger>
              <TabsTrigger value="pipeline" className="min-h-11 px-3 text-[13px] data-[state=active]:bg-stone-800 data-[state=active]:text-amber-300">
                Pipeline
              </TabsTrigger>
              <TabsTrigger value="delivery" className="min-h-11 px-3 text-[13px] data-[state=active]:bg-stone-800 data-[state=active]:text-amber-300">
                QC &amp; Delivery
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="brief" forceMount className="studio-scroll mt-0 min-h-0 flex-1 overflow-y-auto px-3 py-3 data-[state=inactive]:hidden md:px-4">
            <BriefTab
              state={state}
              draft={draft}
              setDraft={setDraft}
              dirty={briefDirty}
              onSave={() => patchMutation.mutate({ title: draft.title, brief: draft.brief, aspect: draft.aspect, voice: draft.voice })}
              onCompile={() => compileMutation.mutate()}
              savePending={patchMutation.isPending}
              compilePending={compileMutation.isPending}
            />
          </TabsContent>

          <TabsContent value="editor" forceMount className="studio-scroll mt-0 min-h-0 flex-1 overflow-y-auto px-3 py-3 data-[state=inactive]:hidden md:px-4">
            <div className="grid gap-4 pb-6">
              <PreviewPlayer state={state} accentHex={accentHex} />
              <LaneEditor state={state} rc={rc} drafts={draftsApi} accentHex={accentHex} />
            </div>
          </TabsContent>

          <TabsContent value="pipeline" forceMount className="studio-scroll mt-0 min-h-0 flex-1 overflow-y-auto px-3 py-3 data-[state=inactive]:hidden md:px-4">
            <div className="mx-auto w-full max-w-3xl pb-6">
              <RenderPanel state={state} />
            </div>
          </TabsContent>

          <TabsContent value="delivery" forceMount className="studio-scroll mt-0 min-h-0 flex-1 overflow-y-auto px-3 py-3 data-[state=inactive]:hidden md:px-4">
            <div className="mx-auto w-full max-w-3xl pb-6">
              <QcPanel state={state} />
            </div>
          </TabsContent>
        </Tabs>

        {/* inspector — collapsible on < lg */}
        <Collapsible open={inspectorOpen} onOpenChange={setInspectorOpen} className="shrink-0 border-t border-stone-800 lg:hidden">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-2 bg-stone-900/60 px-3 text-[12px] text-zinc-300"
              aria-expanded={inspectorOpen}
            >
              Inspector
              {inspectorOpen ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="studio-scroll max-h-72 overflow-y-auto">
            <InspectorRail state={state} accentHex={accentHex} onRepaired={invalidate} selectedSceneRef={selectedScene} />
          </CollapsibleContent>
        </Collapsible>

        {/* timeline strip */}
        <div className="h-28 shrink-0 border-t border-stone-800 studio-panel md:h-40">
          <TimelineStrip state={state} accentHex={accentHex} />
        </div>
      </main>

      {/* inspector rail (desktop) */}
      <aside className="hidden w-72 shrink-0 lg:block studio-line border-l">
        <InspectorRail state={state} accentHex={accentHex} onRepaired={invalidate} selectedSceneRef={selectedScene} />
      </aside>

      {/* nav sheet (mobile) */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72 border-stone-800 bg-stone-900 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <NavRail
            variant="sheet"
            projects={projects}
            selectedId={effectiveSelectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setNavOpen(false);
            }}
            onNewProject={onNewProject}
          />
        </SheetContent>
      </Sheet>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultLane={createLane}
        onCreated={(s) => {
          setSelectedId(s.project.id);
          void invalidate();
        }}
      />
    </div>
  );
}

export function StudioApp() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <StudioShell />
    </QueryClientProvider>
  );
}

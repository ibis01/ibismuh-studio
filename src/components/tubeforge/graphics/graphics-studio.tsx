"use client";

/**
 * S123 (G1) — the Graphics Studio (P4, spec §7 #8): the whiteboard studio's
 * panel structure, mirrored for the graphics grammar — load (GET), scaffold
 * (native rule table / metered LLM), edit (scene-level fields + element
 * payloads in a validated buffer), save (rev advisory, 409-with-current),
 * preview (GraphicsCanvas — the doc's own frame truth through the ONE
 * applier) and render (full video / labelled non-reviewable scene draft).
 *
 * THE RENDER GUARD: renders use the SAVED doc — unsaved edits block the
 * render buttons with a readable message (the whiteboard studio's law).
 * The validator (pure) runs client-side before every save for instant
 * feedback; the server re-validates (one vocabulary, verbatim errors).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { validateGraphicsDoc, type GraphicsDoc, type GraphicsElement } from "@/lib/tubeforge/graphics/types";
import { effectiveGraphicsDoc, graphicsSceneDurationsMs } from "@/lib/tubeforge/graphics/frame";
import GraphicsCanvas from "./graphics-canvas";

interface GraphicsGetResponse {
  doc: GraphicsDoc | null;
  rev: number;
  voMs: Record<string, number>;
  grammar: {
    version: number;
    elementKinds: readonly string[];
    motionKinds: readonly string[];
    motionKindsByElement: Record<string, readonly string[]>;
    iconIds: string[];
  };
  budgets: Record<string, number>;
}

export interface GraphicsStudioProps {
  videoId: string;
  /** The video row's hasVideo — interface parity with the whiteboard
   *  studio's mount (the standing-render surface lives in the dialog's
   *  Video tab; the studio reads it through onRenderQueued refreshes). */
  hasVideo: boolean;
  /** Called after an accepted render enqueue so the dialog refreshes the DTO. */
  onRenderQueued: () => void;
}

const btn = "rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50";
const btnSolid = `${btn} bg-white text-black hover:bg-white/85`;
const btnGhost = `${btn} bg-white/10 hover:bg-white/20`;
const inputCls =
  "w-full rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/30";

export default function GraphicsStudio({ videoId, onRenderQueued }: GraphicsStudioProps) {
  const [data, setData] = useState<GraphicsGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The metered LLM scaffold is opt-in (the whiteboard's aiPlanner law).
  const [aiPlanner, setAiPlanner] = useState(false);

  // The working buffer: the doc-under-edit; `dirty` marks unsaved changes;
  // the canvas plays the BUFFER so edits preview live.
  const [buffer, setBuffer] = useState<GraphicsDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<{ rev: number; doc: GraphicsDoc } | null>(null);
  const [selElement, setSelElement] = useState<string | null>(null);

  // Playback state (the whiteboard studio's split: the studio owns the
  // clock state, the canvas owns the rAF loop).
  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tMs, setTMs] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/graphics`, { cache: "no-store" });
      const body = (await res.json()) as GraphicsGetResponse & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Failed to load the graphics doc");
        setData(null);
        setBuffer(null);
      } else {
        setData(body);
        setBuffer(body.doc);
        setDirty(false);
        setConflict(null);
        setSelElement(null);
        setSceneIndex(0);
        setTMs(0);
        setPlaying(false);
      }
    } catch {
      setError("Failed to load the graphics doc");
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    // Deferred so lint's set-state-in-effect rule is satisfied (the house
    // pattern): the fetch's first setState leaves the effect's sync stack.
    queueMicrotask(() => void load());
  }, [load]);

  const doc = buffer;
  const voMap = useMemo(() => new Map(Object.entries(data?.voMs ?? {})), [data?.voMs]);
  const sceneDurations = useMemo(
    () => (doc ? graphicsSceneDurationsMs(effectiveGraphicsDoc(doc, voMap)) : []),
    [doc, voMap]
  );
  const scene = doc?.scenes[sceneIndex] ?? null;
  const durationMs = sceneDurations[sceneIndex] ?? 0;

  // Client-side validation of the buffer (instant feedback; the server is
  // the gate — one vocabulary, verbatim strings).
  const clientErrors = useMemo(() => {
    if (!doc) return [];
    const { doc: ok, errors } = validateGraphicsDoc(doc);
    return ok ? [] : errors;
  }, [doc]);

  const patchScene = (index: number, patch: Partial<GraphicsDoc["scenes"][number]>) => {
    setBuffer((prev) => {
      if (!prev) return prev;
      const scenes = prev.scenes.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...prev, scenes };
    });
    setDirty(true);
  };

  const patchElement = (sceneIdx: number, elId: string, patch: Partial<GraphicsElement>) => {
    setBuffer((prev) => {
      if (!prev) return prev;
      const scenes = prev.scenes.map((s, i) =>
        i !== sceneIdx
          ? s
          : { ...s, elements: s.elements.map((e) => (e.id === elId ? { ...e, ...patch } : e)) }
      );
      return { ...prev, scenes };
    });
    setDirty(true);
  };

  const patchText = (sceneIdx: number, elId: string, text: string) => {
    setBuffer((prev) => {
      if (!prev) return prev;
      const scenes = prev.scenes.map((s, i) =>
        i !== sceneIdx
          ? s
          : {
              ...s,
              elements: s.elements.map((e) =>
                e.id === elId && e.text ? { ...e, text: { ...e.text, text } } : e
              ),
            }
      );
      return { ...prev, scenes };
    });
    setDirty(true);
  };

  const scaffold = async (force: boolean) => {
    setBusy("scaffold");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/graphics/scaffold`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force, planner: aiPlanner ? "llm" : "native" }),
      });
      const body = (await res.json()) as {
        error?: string;
        planner?: string;
        plannerReport?: { degraded?: boolean; servedScenes?: number; fallbackScenes?: number[] };
      };
      if (!res.ok) {
        setError(body.error ?? "Scaffold failed");
        return;
      }
      setNotice(
        body.planner === "llm"
          ? "Scaffolded with the LLM planner — review every element before rendering"
          : body.plannerReport?.degraded
            ? "Scaffolded with the native planner (the LLM pass degraded — the report names the reason)"
            : "Scaffolded with the native planner — $0, deterministic, yours to edit"
      );
      await load();
      onRenderQueued();
    } catch {
      setError("Scaffold failed");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!doc) return;
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/graphics`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doc, rev: data?.rev ?? 0 }),
      });
      const body = (await res.json()) as {
        rev?: number;
        doc?: GraphicsDoc;
        errors?: string[];
        error?: string;
        current?: { rev: number; doc: GraphicsDoc };
      };
      if (res.status === 409 && body.current) {
        setConflict(body.current);
        setError(body.error ?? "This graphics doc changed under you");
        return;
      }
      if (!res.ok) {
        setError(body.errors?.join(" · ") ?? body.error ?? "Save failed");
        return;
      }
      setData((prev) => (prev ? { ...prev, rev: body.rev ?? prev.rev } : prev));
      setDirty(false);
      setNotice("Graphics doc saved — rendered artifacts were invalidated");
    } catch {
      setError("Save failed");
    } finally {
      setBusy(null);
    }
  };

  const render = async (sceneId: string | null) => {
    if (dirty) {
      setError("Save your edits first — renders use the saved doc");
      return;
    }
    setBusy("render");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/graphics/render`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sceneId ? { sceneId } : {}),
      });
      const body = (await res.json()) as { accepted?: boolean; scope?: string; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Render failed");
        return;
      }
      if (body.accepted === false) {
        setNotice("A graphics render is already running");
      } else if (body.scope === "draft") {
        setNotice("Scene draft rendering — a labelled, non-reviewable look; it lands in the Video tab");
      } else {
        setNotice("Full render started — the video lands when the engine finishes");
      }
      onRenderQueued();
    } catch {
      setError("Render failed");
    } finally {
      setBusy(null);
    }
  };

  const acceptConflict = async () => {
    if (!conflict) return;
    setBuffer(conflict.doc);
    setData((prev) => (prev ? { ...prev, rev: conflict.rev } : prev));
    setDirty(false);
    setConflict(null);
    setNotice("Loaded the server's doc — your buffer was replaced");
  };

  if (loading) {
    return <div className="px-1 py-6 text-xs text-white/50">Loading the graphics doc…</div>;
  }

  if (!doc) {
    return (
      <div className="space-y-3 px-1 py-4">
        <p className="text-xs text-white/60">
          No graphics doc yet. Scaffold one from the story — the native planner is $0 and
          deterministic (keyword→archetype rule table: charts, counters, kinetic headlines),
          the LLM planner is metered and reviews per element.
        </p>
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={aiPlanner} onChange={(e) => setAiPlanner(e.target.checked)} />
          Use the LLM scaffold planner (metered)
        </label>
        <div className="flex gap-2">
          <button className={btnSolid} disabled={busy !== null} onClick={() => void scaffold(false)}>
            {busy === "scaffold" ? "Scaffolding…" : "Scaffold graphics doc"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  const selElement_ = scene?.elements.find((e) => e.id === selElement) ?? null;

  return (
    <div className="space-y-4 px-1 py-2">
      {notice && <p className="text-xs text-emerald-400">{notice}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {conflict && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          <p className="font-medium">This graphics doc changed under you.</p>
          <p className="mt-1 text-amber-200/70">
            Server rev {conflict.rev}. You can load the server&apos;s doc (your buffer is replaced) or
            save over it (last write wins).
          </p>
          <div className="mt-2 flex gap-2">
            <button className={btnGhost} onClick={() => void acceptConflict()}>
              Load the server&apos;s doc
            </button>
            <button className={btnGhost} onClick={() => setConflict(null)}>
              Keep mine and save
            </button>
          </div>
        </div>
      )}
      {clientErrors.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <p className="font-medium">The buffer is invalid — fix before saving:</p>
          <ul className="mt-1 list-disc pl-4">
            {clientErrors.slice(0, 4).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/50">
          {doc.scenes.length} scene{doc.scenes.length === 1 ? "" : "s"} · {doc.width}×{doc.height} ·{" "}
          {doc.fps} fps · rev {data?.rev ?? 0}
          {dirty ? " · UNSAVED" : ""}
        </span>
        <div className="ml-auto flex gap-2">
          <button className={btnGhost} disabled={busy !== null} onClick={() => void load()}>
            Reload
          </button>
          <button className={btnSolid} disabled={busy !== null || clientErrors.length > 0} onClick={() => void save()}>
            {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      {/* Preview + playback */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <GraphicsCanvas
          doc={doc}
          sceneIndex={sceneIndex}
          playing={playing}
          voMs={data?.voMs}
          tMs={tMs}
          onTime={setTMs}
          onEnded={() => setPlaying(false)}
          className="mx-auto max-w-full"
        />
        <div className="mt-2 flex items-center gap-2">
          <button className={btnGhost} onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "Play"}
          </button>
          <input
            aria-label="Scene scrubber"
            type="range"
            min={0}
            max={Math.max(1, durationMs)}
            value={Math.min(tMs, durationMs)}
            onChange={(e) => {
              setPlaying(false);
              setTMs(Number(e.target.value));
            }}
            className="h-1 flex-1 accent-white"
          />
          <span className="w-24 text-right text-[10px] tabular-nums text-white/50">
            {(tMs / 1000).toFixed(1)} / {(durationMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Scene selector */}
      <div className="flex flex-wrap gap-1">
        {doc.scenes.map((s, i) => (
          <button
            key={s.id}
            className={`${btn} ${i === sceneIndex ? "bg-white text-black" : "bg-white/10 hover:bg-white/20"}`}
            onClick={() => {
              setSceneIndex(i);
              setTMs(0);
              setPlaying(false);
              setSelElement(null);
            }}
          >
            {i + 1}. {s.id.replace(/^scene-/, "")}
          </button>
        ))}
      </div>

      {/* Scene editor */}
      {scene && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs font-medium text-white/70">Scene &ldquo;{scene.id}&rdquo;</p>
          <label className="block text-[10px] uppercase tracking-wide text-white/40">
            Narration (drives the estimated clock when no duration is set)
            <textarea
              className={`${inputCls} mt-1 min-h-16`}
              value={scene.narration}
              onChange={(e) => patchScene(sceneIndex, { narration: e.target.value })}
            />
          </label>
          <div className="flex items-center gap-3">
            <label className="text-[10px] uppercase tracking-wide text-white/40">
              Duration ms{" "}
              <input
                className="w-24 rounded-md border border-white/15 bg-black/30 px-1.5 py-0.5 text-xs tabular-nums text-white"
                type="number"
                min={0}
                step={100}
                placeholder="auto"
                value={scene.durationMs ?? ""}
                onChange={(e) => {
                  const v = e.target.value === "" ? undefined : Number(e.target.value);
                  patchScene(sceneIndex, { durationMs: v && v > 0 ? v : undefined });
                }}
              />
            </label>
            <label className="text-[10px] uppercase tracking-wide text-white/40">
              Background{" "}
              <input
                className="w-24 rounded-md border border-white/15 bg-black/30 px-1.5 py-0.5 text-xs text-white"
                type="text"
                value={scene.background}
                onChange={(e) => patchScene(sceneIndex, { background: e.target.value })}
              />
            </label>
            <span className="ml-auto text-[10px] text-white/40">
              plays {((sceneDurations[sceneIndex] ?? 0) / 1000).toFixed(1)}s
            </span>
          </div>

          {/* Element inspector */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-white/40">
              Elements ({scene.elements.length})
            </p>
            <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
              {scene.elements.map((el) => (
                <button
                  key={el.id}
                  className={`${btn} ${el.id === selElement ? "bg-white text-black" : "bg-white/10 hover:bg-white/20"}`}
                  onClick={() => setSelElement(el.id === selElement ? null : el.id)}
                >
                  {el.kind}
                </button>
              ))}
            </div>
            {selElement_ && (
              <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-2">
                <p className="text-[10px] text-white/50">
                  {selElement_.kind} · enter {selElement_.enter.kind} {selElement_.enter.durationMs}ms
                  {selElement_.exit ? ` · exit ${selElement_.exit.kind}` : ""}
                  {selElement_.emphasis ? ` · emphasis ${selElement_.emphasis.kind}` : ""}
                </p>
                {selElement_.text && (
                  <label className="block text-[10px] uppercase tracking-wide text-white/40">
                    Text
                    <textarea
                      className={`${inputCls} mt-1 min-h-10`}
                      value={selElement_.text.text}
                      onChange={(e) => patchText(sceneIndex, selElement_.id, e.target.value)}
                    />
                  </label>
                )}
                {selElement_.counter && (
                  <p className="text-[10px] text-white/50">
                    counter {selElement_.counter.from} → {selElement_.counter.to}
                    {selElement_.counter.unit ? ` ${selElement_.counter.unit}` : ""} (the engine tweens it)
                  </p>
                )}
                {selElement_.bar && (
                  <p className="text-[10px] text-white/50">
                    bars: {selElement_.bar.data.map((d) => `${d.label}=${d.value}`).join(", ")} (the
                    engine reveals them)
                  </p>
                )}
                <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-wide text-white/40">
                  {(["x", "y"] as const).map((axis) => (
                    <label key={axis}>
                      {axis}{" "}
                      <input
                        className="w-20 rounded-md border border-white/15 bg-black/30 px-1.5 py-0.5 text-xs tabular-nums text-white"
                        type="number"
                        value={selElement_.at[axis]}
                        onChange={(e) =>
                          patchElement(sceneIndex, selElement_.id, {
                            at: { ...selElement_.at, [axis]: Number(e.target.value) },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-white/30">
                  Motions are the engine&apos;s closed grammar — the validator refuses illegal
                  combinations, the composer animates the rest.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Render buttons */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <button
          className={btnSolid}
          disabled={busy !== null || dirty || clientErrors.length > 0}
          onClick={() => void render(null)}
          title="Full render — every scene at the doc's own geometry"
        >
          {busy === "render" ? "Queuing…" : "Render full video"}
        </button>
        <button
          className={btnGhost}
          disabled={busy !== null || dirty || !scene}
          onClick={() => scene && void render(scene.id)}
          title="Scene draft — a labelled, non-reviewable look at 0.5× (no QC, no review credit)"
        >
          Preview scene draft
        </button>
        {dirty && <span className="text-[10px] text-amber-400">Save first — renders use the saved doc</span>}
      </div>
    </div>
  );
}

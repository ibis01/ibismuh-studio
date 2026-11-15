"use client";

// S125 (K1) — the rig studio panel: the character surface's native-rig seat
// (roadmap §6: "extend the existing character surfaces (portrait/poses flow
// already exists) with the rig editor + pose-timeline strip").
//
// The panel rides the Character Studio dialog's identity column: an
// "auto-rig" action when the character has no rig (the parts pass — LLM
// authored, validator-gated), and the compiled preview + pose-timeline strip
// when it does. The heavy pose EDITOR is the follow-up slice; v1 ships the
// honest read view: what the rig IS, what the planner WILL do with a
// narration, and the scope claim in the UI.
import { useCallback, useEffect, useState } from "react";

import { Loader2, Wand2, RefreshCw, PersonStanding } from "lucide-react";
import { Button } from "@/components/ui/button";
import RigPreview from "@/components/tubeforge/characters/rig-preview";
import type { CharacterRigDoc, RigPartArt } from "@/lib/tubeforge/characters/rig2d";

export interface RigPanelProps {
  characterId: string;
  hasRig: boolean;
  onChanged: () => void;
}

interface RigGetResponse {
  hasRig: boolean;
  doc: CharacterRigDoc | null;
  parts: RigPartArt[] | null;
  errors: string[];
  warnings: string[];
}

const SAMPLE_NARRATION =
  "Imagine a tiny workshop where ideas take shape. Then the machine turns the crank. This is the crucial part!";

export default function RigPanel({ characterId, hasRig, onChanged }: RigPanelProps) {
  const [state, setState] = useState<RigGetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/characters/${characterId}/rig`);
      const data = (await res.json()) as RigGetResponse;
      if (!res.ok) throw new Error((data as unknown as { error?: string }).error ?? "the rig read failed");
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "the rig read failed");
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    // The house pattern (graphics-canvas): the read is deferred out of the
    // effect body so the state writes never ride the render cascade.
    queueMicrotask(() => {
      void load();
    });
  }, [load, hasRig]);

  const autoRig = async () => {
    if (autoBusy) return;
    setAutoBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/rig/auto`, { method: "POST" });
      const data = (await res.json()) as { error?: string; parts?: number; poses?: number; warnings?: string[] };
      if (!res.ok) throw new Error(data.error ?? "the parts pass failed");
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "the parts pass failed");
    } finally {
      setAutoBusy(false);
    }
  };

  if (!hasRig && !state?.hasRig) {
    return (
      <div className="rounded-xl border border-white/10 p-3 space-y-2.5">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <PersonStanding className="h-3.5 w-3.5 text-violet-300" />
          Native rig (K1)
        </p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Decompose this character into a 2D puppet rig — layered vector parts,
          FK poses, the five-shape mouth set. Rigged characters render their
          cast scenes natively at $0: real gestures, beat-synced mouth shapes,
          no paid video generation.
        </p>
        <Button
          onClick={autoRig}
          disabled={autoBusy || loading}
          variant="outline"
          size="sm"
          className="w-full border-white/15 bg-white/5"
        >
          {autoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          {autoBusy ? "Rigging…" : "Auto-rig this character"}
        </Button>
        {error && <p className="text-[10px] text-red-300 leading-relaxed">{error}</p>}
      </div>
    );
  }

  const doc = state?.doc ?? null;
  const parts = state?.parts ?? null;

  return (
    <div className="rounded-xl border border-white/10 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <PersonStanding className="h-3.5 w-3.5 text-violet-300" />
          Native rig (K1)
        </p>
        <button
          type="button"
          onClick={autoRig}
          disabled={autoBusy}
          title="Re-run the parts pass (replaces the rig)"
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {autoBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Re-rig
        </button>
      </div>
      {loading && !doc && (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {doc && parts ? (
        <>
          <RigPreview doc={doc} parts={parts} narration={SAMPLE_NARRATION} />
          <div className="flex flex-wrap gap-1">
            {doc.poses.slice(0, 10).map((p) => (
              <span
                key={p.id}
                title={p.name}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px]"
              >
                {p.id}
              </span>
            ))}
            {doc.poses.length === 0 && (
              <span className="text-[10px] text-muted-foreground">
                The pose sheet is empty — re-run the parts pass or author poses
                (the standard slots are named in the doc's warnings).
              </span>
            )}
          </div>
          {state?.warnings?.length ? (
            <p className="text-[10px] text-amber-300/80 leading-relaxed">
              {state.warnings.slice(0, 3).join(" · ")}
            </p>
          ) : null}
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Cast scenes (the host in frame) render through this rig when the
            video renders — native-first, before any paid animation channel.
          </p>
        </>
      ) : null}
      {error && <p className="text-[10px] text-red-300 leading-relaxed">{error}</p>}
    </div>
  );
}

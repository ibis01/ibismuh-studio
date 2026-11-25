"use client";

// lane-editor.tsx — the central lane editor: shared scene rail + per-lane
// workspace dispatch. Selecting a scene also seeks the preview player to
// that scene's narration window.

import { useMemo } from "react";
import type { ProjectState } from "@/lib/ibismuh/api-dto";
import type { FrameRenderCtx } from "./lane-renderer";
import {
  CharacterWorkspace,
  ClassicWorkspace,
  GraphicsWorkspace,
  SceneRail,
  SlidesWorkspace,
  StoryWorkspace,
  WhiteboardWorkspace,
  type SceneDraftApi,
} from "./lane-workspaces";
import { useStudioTransport } from "./studio-store";

interface LaneEditorProps {
  state: ProjectState;
  rc: FrameRenderCtx | null;
  drafts: SceneDraftApi;
  accentHex: string;
}

export function LaneEditor({ state, rc, drafts, accentHex }: LaneEditorProps) {
  const scenes = useMemo(() => state.planRevision?.laneScenes ?? [], [state.planRevision]);
  const selectedSceneRef = useStudioTransport((s) => s.selectedSceneRef);
  const setSelectedSceneRef = useStudioTransport((s) => s.setSelectedSceneRef);
  const requestSeek = useStudioTransport((s) => s.requestSeek);

  // scene windows from the plan beats (the truth), falling back to estimates
  const windows = useMemo(() => {
    const map: Record<string, { startMs: number; endMs: number }> = {};
    for (const beat of state.planRevision?.plan.beats ?? []) {
      if (beat.sceneRef) map[beat.sceneRef] = beat.narrationWindow;
    }
    if (Object.keys(map).length === 0) {
      let cursor = 0;
      for (const scene of scenes) {
        map[scene.id] = { startMs: cursor, endMs: cursor + scene.estimatedDurationMs };
        cursor += scene.estimatedDurationMs;
      }
    }
    return map;
  }, [state.planRevision, scenes]);

  const selectScene = (ref: string) => {
    setSelectedSceneRef(ref);
    const win = windows[ref];
    if (win) requestSeek(win.startMs + 40, ref);
  };

  const imageFree = state.project.lane === "whiteboard" || state.project.lane === "graphics2d" || state.project.lane === "slides";

  const workspaceProps = { state, rc, selectedRef: selectedSceneRef, windows, accentHex, drafts };

  return (
    <div className="grid gap-3">
      <SceneRail
        scenes={scenes}
        assets={state.assets}
        windows={windows}
        selectedRef={selectedSceneRef}
        onSelect={selectScene}
        accentHex={accentHex}
        imageFree={imageFree}
        badge={(scene) =>
          state.project.lane === "slides" && scene.slide ? scene.slide.template : null
        }
      />
      {state.planRevision == null ? (
        <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-stone-800 p-6 text-center">
          <p className="max-w-md text-sm text-zinc-500">
            No plan yet — the lane workspaces render the compiled plan. Write the brief and press Compile plan.
          </p>
        </div>
      ) : (
        <>
          {state.project.lane === "classic" && <ClassicWorkspace {...workspaceProps} />}
          {state.project.lane === "story" && <StoryWorkspace {...workspaceProps} />}
          {state.project.lane === "whiteboard" && <WhiteboardWorkspace {...workspaceProps} />}
          {state.project.lane === "graphics2d" && <GraphicsWorkspace {...workspaceProps} />}
          {state.project.lane === "character" && <CharacterWorkspace {...workspaceProps} />}
          {state.project.lane === "slides" && <SlidesWorkspace {...workspaceProps} />}
        </>
      )}
    </div>
  );
}

// S131 (PAE-3) — the event projection: scene-local cues onto the GLOBAL
// doc clock, in ONE pure accessor.
//
// The opuscar study's EV idea, nativized (the schema lives in types.ts).
// The projection is the SEAM the audio and QC consumers read: an event's
// global frame is the encoder-grid frame it lands on; its tSec is the
// 2-dp house clock. Deliberately NOT a timeline track kind — cues are not
// clips, and the tracks exist to hold composition truth (the two-clock
// pin); this projection is a sibling fact, not a third clock (it DERIVES
// from the same scene durations frame.ts's ONE clock rule produces).
//
// Frame indexing law: an event at ms lands on frame
// round(ms/1000 × fps) — the encoder's own arithmetic MINUS the ≥1 encode
// floor (frameCountOf's floor is an ENCODE law — a file needs at least
// one frame; an index legitimately starts at 0). Pure: no fs, no clock,
// no randomness (the S64 law generalizes).
import { quantizeClock } from "../anim/clock";
import { graphicsSceneDurationsMs } from "./frame";
import type { GraphicsDoc, GraphicsEventKind } from "./types";

/** One projected event slot — the global-clock fact a mixer or QC lens
 *  consumes. Key order stable; byte-identical for equal docs. */
export interface GraphicsEventSlot {
  /** The GLOBAL doc-clock frame the event lands on (the encoder's grid,
   *  0-based — scenes' delivered frames accumulate before the local
   *  index). */
  frame: number;
  /** The global doc-clock second, 2-dp quantized (the house clock). */
  tSec: number;
  kind: GraphicsEventKind;
  label?: string;
  sceneId: string;
}

/** The event index arithmetic — frameCountOf minus the ≥1 encode floor
 *  (an index starts at 0; a file cannot). ONE home, shared by every
 *  consumer of event frames. */
export function eventFrameAt(ms: number, fps: number): number {
  return Math.max(0, Math.round((ms / 1000) * fps));
}

/**
 * graphicsEventList — every scene's events projected onto the global doc
 * clock, in doc order. A doc with no events returns [] (never undefined —
 * shape-stable for consumers). PURE — same (doc, fps) → byte-identical
 * list. The caller passes a VALIDATED doc (the Part F law: the validator
 * has already bounded every event by its own scene's clock).
 */
export function graphicsEventList(doc: GraphicsDoc, fps: number): GraphicsEventSlot[] {
  const sceneMs = graphicsSceneDurationsMs(doc);
  const out: GraphicsEventSlot[] = [];
  let framesBefore = 0;
  let cursorMs = 0;
  doc.scenes.forEach((scene, i) => {
    for (const ev of scene.events ?? []) {
      const globalMs = cursorMs + ev.tMs;
      out.push({
        frame: framesBefore + eventFrameAt(ev.tMs, fps),
        tSec: quantizeClock(globalMs / 1000),
        kind: ev.kind,
        ...(ev.label !== undefined ? { label: ev.label } : {}),
        sceneId: scene.id,
      });
    }
    framesBefore += Math.round((sceneMs[i] / 1000) * fps);
    cursorMs += sceneMs[i];
  });
  return out;
}

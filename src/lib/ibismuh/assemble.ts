// assemble.ts — the lane→timeline assembler (master plan §4.2 + §4.4).
//
// Compiles a PlannerOutput plus the measured audio receipt into the shared
// plan vocabulary: narration-window beats and a sorted TimelineOpInput
// list ready for compileTimeline. Timing priority (§4.3): sentence spans
// from the receipt win — scene windows are allocated across the measured
// spans by narration word weight (1:1 when counts match); otherwise the
// declared deterministic estimates + 350ms inter-scene gaps. Every op
// carries a stable unique id (`<op>:<sceneRef>:<n>`) and the returned
// timeline is sorted by startMs (ties broken by deterministic build order).

import type { LaneScene, PlannerOutput } from "./planner-types";
import type { PlanBeat } from "./plan-envelope";
import type { TimelineOpInput } from "./timeline-ops";
import type { AudioReceipt } from "./audio-receipt";
import { resolveLane, type VideoType } from "./studio-lanes";
import { estimateNarrationMs } from "./planners/index";

export interface AssembleInput {
  lane: VideoType;
  plannerOutput: PlannerOutput;
  audioReceipt: AudioReceipt | null;
  width: number;
  height: number;
  fps: number;
}

export interface AssembleResult {
  beats: PlanBeat[];
  timeline: TimelineOpInput[];
  totalDurationMs: number;
  timingSource: "sentence-timestamps" | "estimate";
}

interface SceneWindow {
  scene: LaneScene;
  startMs: number;
  endMs: number;
}

// ---------- entry ----------

export function assembleLane(input: AssembleInput): AssembleResult {
  const lane = resolveLane(input.lane); // fail closed on unknown lanes
  const scenes = input.plannerOutput.scenes;
  const receipt = input.audioReceipt;

  if (scenes.length === 0) {
    const withSpans = receipt !== null && receipt.sentenceSpans.length > 0;
    return {
      beats: [],
      timeline: [],
      totalDurationMs: receipt?.durationMs ?? 0,
      timingSource: withSpans ? "sentence-timestamps" : "estimate",
    };
  }

  const useSpans = receipt !== null && receipt.sentenceSpans.length > 0;
  let windows: SceneWindow[];
  let totalDurationMs: number;
  let timingSource: AssembleResult["timingSource"];

  if (useSpans && receipt) {
    windows = allocateFromSpans(scenes, receipt);
    const lastEnd = windows.length > 0 ? windows[windows.length - 1].endMs : 0;
    totalDurationMs = Math.max(receipt.durationMs, lastEnd);
    timingSource = "sentence-timestamps";
  } else {
    windows = [];
    let cursor = 0;
    scenes.forEach((scene, i) => {
      const start = i === 0 ? 0 : cursor + 350; // 350ms declared gap between scenes
      const duration = scene.estimatedDurationMs > 0 ? scene.estimatedDurationMs : estimateNarrationMs(scene.narration);
      const end = start + Math.max(1200, duration);
      windows.push({ scene, startMs: start, endMs: end });
      cursor = end;
    });
    totalDurationMs = cursor;
    timingSource = "estimate";
  }

  const beats: PlanBeat[] = windows.map((w) => ({
    id: w.scene.id,
    narrationWindow: { startMs: w.startMs, endMs: w.endMs },
    visualIntent: w.scene.visualIntent,
    sceneRef: w.scene.id,
  }));

  const timeline = buildOps(lane.type, windows, totalDurationMs);

  return { beats, timeline, totalDurationMs, timingSource };
}

// ---------- window allocation from measured sentence spans ----------

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function allocateFromSpans(scenes: LaneScene[], receipt: AudioReceipt): SceneWindow[] {
  const spans = receipt.sentenceSpans;
  const durationMs = receipt.durationMs;
  const weights = scenes.map((s) => Math.max(1, wordCount(s.narration)));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const windows: SceneWindow[] = [];

  if (spans.length === scenes.length) {
    // 1:1 — scene i takes span i verbatim.
    scenes.forEach((scene, i) => {
      windows.push({ scene, startMs: spans[i].startMs, endMs: spans[i].endMs });
    });
  } else if (spans.length > scenes.length) {
    // Proportional integer assignment of spans to scenes (largest
    // remainder), corrected so every scene keeps at least one span.
    const raw = weights.map((w) => (w / totalWeight) * spans.length);
    const counts = raw.map((v) => Math.floor(v));
    const fracs = weights
      .map((_, i) => ({ i, frac: raw[i] - counts[i] }))
      .sort((a, b) => b.frac - a.frac);
    let remainder = spans.length - counts.reduce((a, b) => a + b, 0);
    for (const f of fracs) {
      if (remainder <= 0) break;
      counts[f.i]++;
      remainder--;
    }
    for (let i = 0; i < counts.length && remainder > 0; i++) {
      counts[i]++;
      remainder--;
    }
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] === 0) {
        const donor = counts.indexOf(Math.max(...counts));
        if (counts[donor] > 1) {
          counts[donor]--;
          counts[i] = 1;
        }
      }
    }
    let cursor = 0;
    scenes.forEach((scene, i) => {
      const from = cursor;
      cursor += counts[i];
      const slice = spans.slice(from, cursor);
      const start = slice.length > 0 ? slice[0].startMs : (spans[Math.min(from, spans.length - 1)]?.endMs ?? 0);
      const end = slice.length > 0 ? slice[slice.length - 1].endMs : start;
      windows.push({ scene, startMs: start, endMs: Math.max(start, end) });
    });
  } else {
    // Fewer spans than scenes — proportional windows across the measured
    // duration (weight-scaled), still derived from the receipt's facts.
    let cursor = 0;
    scenes.forEach((scene, i) => {
      const start = Math.round(cursor);
      cursor += (weights[i] / totalWeight) * durationMs;
      const end = i === scenes.length - 1 ? durationMs : Math.round(cursor);
      windows.push({ scene, startMs: Math.min(start, end), endMs: Math.max(end, start + 1) });
    });
  }

  // Clamp every window into the measured audio.
  return windows.map((w) => {
    const start = Math.max(0, Math.min(w.startMs, durationMs));
    const end = Math.max(start, Math.min(w.endMs, durationMs));
    return { scene: w.scene, startMs: start, endMs: end };
  });
}

// ---------- timeline compilation ----------

function truncateLocal(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function buildOps(lane: VideoType, windows: SceneWindow[], totalDurationMs: number): TimelineOpInput[] {
  const ops: TimelineOpInput[] = [];
  const counters = new Map<string, number>();
  const pushOp = (op: Omit<TimelineOpInput, "id">, sceneRef: string): void => {
    const key = `${op.op}:${sceneRef}`;
    const n = counters.get(key) ?? 0;
    counters.set(key, n + 1);
    ops.push({ ...op, id: `${op.op}:${sceneRef}:${n}` });
  };

  for (const w of windows) {
    const s = w.scene;
    const windowLen = Math.max(1, w.endMs - w.startMs);

    // ALL lanes: caption + transition.
    const captionText = s.caption && s.caption.length > 0 ? s.caption : truncateLocal(s.narration, 60);
    pushOp(
      {
        op: "caption",
        startMs: w.startMs,
        endMs: w.endMs,
        beatId: s.id,
        sceneRef: s.id,
        role: "caption",
        params: { text: captionText },
      },
      s.id,
    );
    pushOp(
      {
        op: "transition",
        startMs: w.startMs,
        endMs: w.startMs + 400,
        beatId: s.id,
        sceneRef: s.id,
        role: "transition",
        params: { style: s.transitionIn ?? "cut", durationMs: 400 },
      },
      s.id,
    );

    switch (lane) {
      case "classic":
      case "story": {
        pushOp(
          {
            op: "showAsset",
            startMs: w.startMs,
            endMs: w.endMs,
            beatId: s.id,
            sceneRef: s.id,
            assetRef: s.id, // the pipeline binds the real asset against this scene ref
            role: "board",
            params: { sceneRef: s.id },
          },
          s.id,
        );
        if (s.camera) {
          pushOp(
            {
              op: "cameraMove",
              startMs: w.startMs,
              endMs: w.endMs,
              beatId: s.id,
              sceneRef: s.id,
              role: "camera",
              params: {
                start: JSON.stringify(s.camera.start),
                end: JSON.stringify(s.camera.end),
                easing: s.camera.easing,
              },
            },
            s.id,
          );
        }
        break;
      }
      case "whiteboard": {
        // Sequential endpoint-aware strokes: scaled to fit ~85% of the
        // window (the remaining 15% holds the finished board).
        const paths = (s.paths ?? []).slice().sort((a, b) => a.order - b.order);
        const totalStroke = paths.reduce((acc, p) => acc + Math.max(1, p.strokeMs), 0);
        const drawBudget = Math.round(windowLen * 0.85);
        const scale = totalStroke > 0 ? drawBudget / totalStroke : 0;
        let cursor = w.startMs;
        for (const p of paths) {
          const dur = Math.max(1, Math.round(Math.max(1, p.strokeMs) * scale));
          const start = Math.min(cursor, w.startMs + drawBudget);
          pushOp(
            {
              op: "drawPath",
              startMs: start,
              endMs: start + dur,
              beatId: s.id,
              sceneRef: s.id,
              role: p.role,
              params: { d: p.d, role: p.role },
            },
            s.id,
          );
          cursor = start + dur;
        }
        const title = s.caption && s.caption.length > 0 ? s.caption : truncateLocal(s.narration, 48);
        pushOp(
          {
            op: "writeText",
            startMs: w.startMs,
            endMs: w.endMs,
            beatId: s.id,
            sceneRef: s.id,
            role: "title",
            params: { text: title },
          },
          s.id,
        );
        break;
      }
      case "graphics2d": {
        const comps = s.components ?? [];
        const revealFracs = [0, 0.3, 0.6];
        comps.forEach((c, k) => {
          const frac = revealFracs[Math.min(k, revealFracs.length - 1)];
          const start = w.startMs + Math.round(windowLen * frac);
          const isRegion = c.kind === "statistic" || c.kind === "chart";
          const params: Record<string, string | number | boolean> = {
            kind: c.kind,
            layout: JSON.stringify(c.layout),
          };
          for (const [pk, pv] of Object.entries(c.props)) params[pk] = pv;
          if (c.citation !== undefined) params.citation = c.citation;
          pushOp(
            {
              op: isRegion ? "fillRegion" : "writeText",
              startMs: start,
              endMs: w.endMs,
              beatId: s.id,
              sceneRef: s.id,
              role: c.kind,
              params,
            },
            s.id,
          );
        });
        break;
      }
      case "character": {
        const plan = s.pose;
        if (plan) {
          const poses = plan.poses.slice().sort((a, b) => a.at - b.at);
          poses.forEach((p, k) => {
            const rawStart = w.startMs + Math.max(0, p.at);
            const rawEnd = k + 1 < poses.length ? w.startMs + Math.max(0, poses[k + 1].at) : w.endMs;
            const start = Math.min(rawStart, w.endMs);
            const end = Math.max(start, Math.min(Math.max(rawStart, rawEnd), w.endMs));
            const params: Record<string, string | number | boolean> = {
              pose: p.pose,
              rigMode: plan.rigMode,
              lipSync: plan.lipSync,
            };
            if (p.viseme !== undefined) params.viseme = p.viseme;
            if (p.hold === true) params.hold = true;
            pushOp(
              {
                op: "poseCharacter",
                startMs: start,
                endMs: end,
                beatId: s.id,
                sceneRef: s.id,
                role: "character",
                params,
              },
              s.id,
            );
          });
          if (plan.rigMode === "storyboard-fallback") {
            pushOp(
              {
                op: "showAsset",
                startMs: w.startMs,
                endMs: w.endMs,
                beatId: s.id,
                sceneRef: s.id,
                assetRef: s.id,
                role: "board",
                params: { sceneRef: s.id },
              },
              s.id,
            );
          }
        }
        break;
      }
      case "slides": {
        const slide = s.slide;
        if (slide) {
          const params: Record<string, string | number | boolean> = {
            template: slide.template,
            title: slide.title,
            layout: "full",
          };
          if (slide.stat) {
            params.statValue = slide.stat.value;
            params.statLabel = slide.stat.label;
          }
          if (slide.quote) {
            params.quoteText = slide.quote.text;
            params.quoteAttribution = slide.quote.attribution;
          }
          if (slide.citation !== undefined) params.citation = slide.citation;
          pushOp(
            {
              op: "revealSlide",
              startMs: w.startMs,
              endMs: w.endMs,
              beatId: s.id,
              sceneRef: s.id,
              role: "slide",
              params,
            },
            s.id,
          );
          const bullets = slide.body ?? [];
          bullets.forEach((b, k) => {
            const frac = bullets.length === 1 ? 0.3 : 0.3 + (0.6 * k) / bullets.length;
            const start = w.startMs + Math.round(windowLen * Math.min(frac, 0.9));
            pushOp(
              {
                op: "writeText",
                startMs: start,
                endMs: w.endMs,
                beatId: s.id,
                sceneRef: s.id,
                role: "bullet",
                params: { text: b, index: k },
              },
              s.id,
            );
          });
        }
        break;
      }
    }
  }

  // One final hold when the timeline leaves a short tail before the end.
  const lastEnd = windows.length > 0 ? windows[windows.length - 1].endMs : 0;
  const tail = totalDurationMs - lastEnd;
  if (tail > 0 && tail < 500) {
    pushOp({ op: "hold", startMs: lastEnd, endMs: totalDurationMs, role: "outro" }, "outro");
  }

  // Deterministic order: sort by startMs, ties broken by build order.
  return ops
    .map((op, i) => ({ op, i }))
    .sort((a, b) => a.op.startMs - b.op.startMs || a.i - b.i)
    .map((x) => x.op);
}

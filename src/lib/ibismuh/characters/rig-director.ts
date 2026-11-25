// S125 (K1) — the rig director: the pure planner that turns narration + the
// pose sheet into a pose timeline (roadmap §6: "gesture beats from W2-style
// purpose classification: setup = welcoming pose, action = gesture on the
// action verb, emphasis = point/circle on the claim — reusing
// beat-plan.ts#classifySentence instead of duplicating it, one classifier,
// two consumers").
//
// COMPILE-ONLY (the whiteboard beat-plan law, decision §10.1): beats are a
// planning artifact. They never ride the doc, never reach the validator,
// never grow any grammar — they exist long enough to drive the renderer and
// die. The seniority law stays intact: the rig-director's compiled timeline
// is the K1 lane's motion truth; the S93 breath rig owns scenes whose
// character carries NO rig (the ladder: K1 rig > S93 breath > auto KB).
//
// THE GESTURE TABLE: purpose → candidate pose ids, tried in order, the
// first id PRESENT on the sheet wins (missing standard poses degrade to
// rest — the validator's warning is the planner's honest input). Action
// sentences alternate arms by sentence parity when both point poses exist
// — deterministic variety, no randomness (the S64 law). Support sentences
// gesture nothing: not every sentence earns a move.
//
// PURE — no fs, no clock, no randomness. Same inputs → the same timeline
// byte-for-byte.
import { classifySentence, splitSentences, words } from "../whiteboard/beat-plan";
import type { WordAnchors } from "../whiteboard/timing";
import {
  mouthSchedule,
  wordSpansFromAnchors,
  wordSpansFromEstimate,
  type MouthSchedule,
  type RigPoseTimeline,
  type RigPoseRow,
  type WordSpan,
} from "./rig-frame";
import { RIG_BUDGETS, type CharacterRigDoc } from "./rig2d";

/** The gesture table — purpose → candidate pose ids, in priority order. */
const GESTURE_CANDIDATES: Record<string, string[]> = {
  setup: ["welcoming", "arm-l-raise", "arm-r-raise"],
  subject: ["explaining", "brow-raise"],
  action: ["arm-r-point", "arm-l-point"],
  emphasis: ["arm-r-point", "arm-l-raise", "brow-raise"],
  support: [],
};

/** A gesture shorter than this never lands (a pose that flashes is noise). */
const MIN_GESTURE_MS = 240;

export interface RigDirectorInput {
  narration: string;
  rig: CharacterRigDoc;
  durationMs: number;
  /** W4 word anchors when the captions lane answered; null → the estimator. */
  anchors?: WordAnchors | null;
}

export interface RigDirectorPlan {
  timeline: RigPoseTimeline;
  speech: MouthSchedule;
}

/** Resolve the sentence windows: each sentence owns the envelope of its
 *  words' spans (the ONE span resolution — anchors first, estimator
 *  fallback, exactly the mouth schedule's ladder). */
function sentenceWindows(narration: string, durationMs: number, anchors: WordAnchors | null): { text: string; startMs: number; endMs: number }[] {
  const spans: WordSpan[] =
    wordSpansFromAnchors(narration, anchors, durationMs) ??
    wordSpansFromEstimate(narration, durationMs);
  if (spans.length === 0) return [];
  const sentences = splitSentences(narration);
  const out: { text: string; startMs: number; endMs: number }[] = [];
  let cursor = 0;
  for (const text of sentences) {
    const count = words(text).length;
    if (count === 0) continue; // a punctuation-only sentence owns no words
    const first = spans[cursor];
    const last = spans[Math.min(cursor + count - 1, spans.length - 1)];
    if (!first || !last) break;
    out.push({ text, startMs: first.startMs, endMs: Math.max(last.endMs, first.startMs + 1) });
    cursor += count;
    if (cursor >= spans.length) break;
  }
  return out;
}

/** The pose id for one sentence — the first candidate the sheet carries. */
function pickPose(sheet: ReadonlySet<string>, purpose: string, sentenceIndex: number): string | null {
  let candidates = GESTURE_CANDIDATES[purpose] ?? [];
  // Action sentences alternate arms when both exist (deterministic parity).
  if (purpose === "action" && sentenceIndex % 2 === 1 && sheet.has("arm-l-point")) {
    candidates = ["arm-l-point", "arm-r-point"];
  }
  for (const id of candidates) {
    if (sheet.has(id)) return id;
  }
  return null;
}

/** Compile the scene's pose timeline + mouth schedule. The renderer's ONLY
 *  planner entry — the timeline is consumed and discarded (compile-only). */
export function planRigTimeline(input: RigDirectorInput): RigDirectorPlan {
  const { narration, rig, durationMs } = input;
  const speech = mouthSchedule({ narration, anchors: input.anchors ?? null, durationMs });
  if (!narration.trim() || !(durationMs > 0)) {
    return { timeline: { durationMs: Math.max(0, durationMs), rows: [] }, speech };
  }
  const sheet = new Set(rig.poses.map((p) => p.id));
  const rows: RigPoseRow[] = [];
  for (const [i, win] of sentenceWindows(narration, durationMs, input.anchors ?? null).entries()) {
    if (rows.length + 2 > RIG_BUDGETS.timelineRows) break; // the compile wall
    if (win.endMs - win.startMs < MIN_GESTURE_MS) continue;
    const poseId = pickPose(sheet, classifySentence(win.text, i), i);
    if (!poseId) continue; // support (or an unwinnable purpose) — rest stays
    rows.push({ tMs: win.startMs, poseId });
    rows.push({ tMs: win.endMs, poseId: null }); // back to rest between gestures
  }
  rows.sort((a, b) => a.tMs - b.tMs);
  return { timeline: { durationMs, rows }, speech };
}

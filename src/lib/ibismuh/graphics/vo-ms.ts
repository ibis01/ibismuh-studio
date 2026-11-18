// S152 — the measured-narration clock's ONE server-side probe for the
// graphics lane: WAV header math on the standing scene WAVs, keyed by the
// `scene-<n>` mapping law (the same files voFilesFor picks — one mapping,
// no private copies). The renderer measures its own resolved slots; every
// OTHER clock reader (the admission routes' preflight walls, the GET
// route's evidence, the QC battery's lane lenses) measures through THIS
// helper so all readers answer with the same numbers the render delivers.
//
// The caller supplies the video's scratch/storage dir (videoDir(videoId)) —
// this module stays a leaf (fs + the WAV math + the WAV-name law only; it
// never imports the generation world). An unreadable or missing WAV simply
// omits its scene — the clock rule's ladder then rides the house estimate
// for that scene (the documented degradation, never a throw).
import fs from "node:fs";
import path from "node:path";
import { sceneWavFile } from "../story";
import { wavDurationSec } from "../wav";
import type { GraphicsDoc } from "./types";

/** The measured narration durations (scene id → ms) for a graphics doc:
 *  every scene whose `scene-<n>` id maps to an existing, readable
 *  scene WAV. Pure fs reads — no ffprobe, no chromium, no network. */
export function measureGraphicsVoMs(dir: string, doc: GraphicsDoc): Map<string, number> {
  const voMs = new Map<string, number>();
  for (const scene of doc.scenes) {
    const m = /^scene-(\d+)$/.exec(scene.id);
    if (!m) continue;
    const index = Number(m[1]);
    if (!Number.isInteger(index) || index < 1 || index > 999) continue;
    const wav = path.join(dir, sceneWavFile(index));
    if (!fs.existsSync(wav)) continue;
    try {
      const sec = wavDurationSec(fs.readFileSync(wav));
      if (sec > 0) voMs.set(scene.id, Math.round(sec * 1000));
    } catch {
      /* unreadable/odd header → the scene rides the estimate */
    }
  }
  return voMs;
}

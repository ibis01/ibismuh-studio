// S125 (K1) — the rig compose seam: the page skeleton + the ONE applier +
// the payload twin. The graphics compose.ts seam law, mirrored ("one compose,
// two callers — the wb-page.ts seam law"): the chromium renderer AND the
// studio editor read the same skeleton and drive the same applier, so the
// frame the author previews is the frame the renderer delivers.
//
// SECURITY POSTURE (whiteboard/graphics parity): every part's art fragment
// goes through the shared sanitizeSvg (first line) before it ever reaches a
// page; the renderer's chromium launches with all network routes aborted
// (second line). The page can only ever render markup this module wrote.
//
// THE APPLIER DISCIPLINE: every write is an ABSOLUTE set on a static
// skeleton node — the FK matrices arrive pre-composed by rig-frame.ts's
// poseAt (the math lives in ONE place), mouth visibility is an absolute
// display write, opacity is absolute. Apply twice ≡ once (idempotent, the
// graphics applier pin). No element creation, no layout reads, no wall
// clock, no randomness.
import { sanitizeSvg } from "../whiteboard/svg";
import type { RigFrameState, RigPartFrame } from "./rig-frame";
import type { CharacterRigDoc, RigPartArt } from "./rig2d";

export interface ComposedRigScene {
  html: string;
}

/** Wrap a stage-coordinate fragment in a root svg, sanitize, unwrap — the
 *  one sanitizer, two shapes (full documents and fragments). */
function sanitizeFragment(fragment: string): string {
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${fragment}</svg>`;
  const clean = sanitizeSvg(wrapped);
  const open = clean.indexOf(">");
  const close = clean.lastIndexOf("</svg>");
  if (open < 0 || close < 0) return "";
  return clean.slice(open + 1, close);
}

/** The scene skeleton: the stage background + z-ordered part groups
 *  (`#rp-{id}`), each carrying its sanitized art at rest (rest = identity —
 *  the applier's first frame write reproduces the skeleton exactly). Mouth
 *  parts start on the closed variant (the rest mouth); the applier's
 *  absolute display writes own the swap from there.
 *
 *  `canvas` (the renderer's video surface) contain-fits the stage into the
 *  target canvas — centered, no crop, no art rescale of COORDINATES (the
 *  svg scales as a whole; the FK math never knows the video's size). Absent
 *  canvas = the stage itself (the editor's preview). */
export function composeRigScene(
  rig: CharacterRigDoc,
  art: RigPartArt[],
  opts?: { canvas?: { width: number; height: number } }
): ComposedRigScene {
  const artById = new Map(art.map((a) => [a.id, a]));
  // Draw order: z-ascending, id tiebreak (the poseAt order law — the
  // skeleton's DOM order IS the draw order).
  const ordered = [...rig.parts].sort(
    (a, b) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  const groups = ordered.map((part) => {
    const row = artById.get(part.svgRef);
    const body = row ? sanitizeFragment(row.svg) : "";
    // The initial transform is the identity matrix (rest); the applier's
    // first write is a no-op on it (idempotence by construction).
    const display = part.slot === "mouth" && part.variant !== "closed" ? "none" : "";
    return (
      `<g id="rp-${part.id}" transform="matrix(1 0 0 1 0 0)" opacity="1"` +
      (display ? ` display="${display}"` : "") +
      `>${body}</g>`
    );
  });

  // The surface: the stage, contain-fit into the canvas when one is given.
  const canvas = opts?.canvas;
  const fit = canvas
    ? Math.min(canvas.width / rig.width, canvas.height / rig.height)
    : 1;
  const svgW = canvas ? Math.max(1, Math.round(rig.width * fit)) : rig.width;
  const svgH = canvas ? Math.max(1, Math.round(rig.height * fit)) : rig.height;
  const bg = canvas
    ? `<rect x="0" y="0" width="${canvas.width}" height="${canvas.height}" fill="${rig.background}"/>`
    : `<rect x="0" y="0" width="${rig.width}" height="${rig.height}" fill="${rig.background}"/>`;

  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:${rig.background};overflow:hidden}
body{display:flex;align-items:center;justify-content:center}
svg{display:block}
</style></head><body>
<svg id="board" width="${svgW}" height="${svgH}" viewBox="0 0 ${rig.width} ${rig.height}" xmlns="http://www.w3.org/2000/svg">
${bg}
${groups.join("\n")}
</svg></body></html>`;
  return { html };
}

// ---------------------------------------------------------------------------
// The payload + the ONE applier
// ---------------------------------------------------------------------------

/** The frame truth serialized for the page — poseAt's state, verbatim, in
 *  draw order. Key order stable; byte-identical for equal frames. */
export function rigFramePayload(frame: RigFrameState): string {
  return JSON.stringify({
    mouthVariant: frame.mouthVariant,
    speaking: frame.speaking,
    parts: frame.parts.map((p) => ({
      id: p.id,
      visible: p.visible,
      opacity: p.opacity,
      matrix: [p.matrix[0], p.matrix[1], p.matrix[2], p.matrix[3], p.matrix[4], p.matrix[5]],
    })),
  });
}

/** The ONE applier — shared by the renderer (page.evaluate) and the editor
 *  (in-page eval). IDEMPOTENT BY CONSTRUCTION: absolute matrix writes,
 *  absolute display writes, absolute opacity — apply twice ≡ once; it
 *  creates no elements, reads no layout, touches no wall clock. */
export const APPLY_RIG_FRAME_FN = `(payloadJson) => {
  const p = JSON.parse(payloadJson);
  for (const part of p.parts) {
    const g = document.getElementById("rp-" + part.id);
    if (!g) continue;
    const m = part.matrix;
    g.setAttribute("transform", "matrix(" + m[0] + " " + m[1] + " " + m[2] + " " + m[3] + " " + m[4] + " " + m[5] + ")");
    g.setAttribute("opacity", String(part.opacity));
    g.setAttribute("display", part.visible ? "" : "none");
  }
  return true;
}`;

/** The part id a frame row drives — exported so the editor and the pins read
 *  ONE id grammar (`rp-{partId}`). */
export function rigPartNodeId(partId: string): string {
  return `rp-${partId}`;
}

/** Type re-export for callers that pattern-match frame rows (the editor). */
export type { RigPartFrame };

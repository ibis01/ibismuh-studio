/**
 * Skeleton graph tracing for stroke animation.
 *
 * Port of the reference `skeleton_paths.py` (whiteboard-animator, MIT):
 * Zhang-Suen thinning replaces skimage.skeletonize; BFS, node/path
 * extraction and junction branch pairing are direct ports so multi-
 * branch line art (an X, a plus, a grid) draws one continuous pen
 * stroke after another instead of growing every branch at once.
 */

export interface SkelPath {
  /** Pixels (y,x) incl. node pixels on both ends, in walk order. */
  coords: Int32Array; // pairs: y, x
  core: Int32Array; // pixels strictly between the nodes
  startNode: number; // node id or -1
  endNode: number;
  startY: number;
  startX: number;
  endY: number;
  endX: number;
  startIsEndpoint: boolean;
  endIsEndpoint: boolean;
}

export interface PenStroke {
  /** Pixels (y,x) in draw order. */
  coords: Int32Array; // pairs: y, x
  count: number; // number of pixels
  weight: number;
}

/** 8-neighbor count minus self (cv2.filter2D parity). */
export function skeletonDegree(
  skel: Uint8Array,
  w: number,
  h: number,
): Int8Array {
  const degree = new Int8Array(skel.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!skel[p]) continue;
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      let n = 0;
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          if (yy === y && xx === x) continue;
          if (skel[row + xx]) n++;
        }
      }
      degree[p] = n;
    }
  }
  return degree;
}

/**
 * Zhang-Suen thinning (LUT-free direct implementation). Input: 0/1
 * mask; output: 1px-wide skeleton of the same dimensions.
 */
export function skeletonize(
  mask: Uint8Array,
  w: number,
  h: number,
): Uint8Array {
  let img = new Uint8Array(mask.length);
  let other = new Uint8Array(mask.length);
  img.set(mask);

  const neighbors = [
    [-1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, -1],
  ];

  const thinPass = (phase: 1 | 2): boolean => {
    other.fill(0);
    const toRemove: number[] = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (!img[p]) continue;
        // P2..P9 in clockwise order starting north.
        let n = 0;
        for (const [dy, dx] of neighbors) {
          if (img[(y + dy) * w + (x + dx)]) n++;
        }
        if (n < 2 || n > 6) continue;
        // A-p: 0->1 transitions in sequence P2,P3,...,P9,P2.
        let a = 0;
        for (let i = 0; i < 8; i++) {
          const cur = img[(y + neighbors[i][0]) * w + (x + neighbors[i][1])];
          const nxt =
            img[
              (y + neighbors[(i + 1) % 8][0]) * w + (x + neighbors[(i + 1) % 8][1])
            ];
          if (cur === 0 && nxt === 1) a++;
        }
        if (a !== 1) continue;
        const p2 = img[(y - 1) * w + x];
        const p3 = img[(y - 1) * w + x + 1];
        const p4 = img[y * w + x + 1];
        const p5 = img[(y + 1) * w + x + 1];
        const p6 = img[(y + 1) * w + x];
        const p7 = img[(y + 1) * w + x - 1];
        const p8 = img[y * w + x - 1];
        const p9 = img[(y - 1) * w + x - 1];
        if (phase === 1) {
          if (p2 && p4 && p6) continue; // north & east & south
          if (p4 && p6 && p8) continue; // east & south & west
        } else {
          if (p2 && p4 && p8) continue; // north & east & west
          if (p2 && p6 && p8) continue; // north & south & west
        }
        toRemove.push(p);
      }
    }
    for (const p of toRemove) other[p] = 1;
    for (const p of toRemove) img[p] = 0;
    return toRemove.length > 0;
  };

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = thinPass(1);
    changed = thinPass(2) || changed;
  }
  return img;
}

/** BFS distances along skeleton pixels from a start pixel. */
export function bfsSkeleton(
  skel: Uint8Array,
  w: number,
  h: number,
  startY: number,
  startX: number,
): Float32Array {
  const dists = new Float32Array(skel.length).fill(Infinity);
  if (
    startY < 0 ||
    startY >= h ||
    startX < 0 ||
    startX >= w ||
    !skel[startY * w + startX]
  ) {
    return dists;
  }
  const qx = new Int32Array(skel.length);
  const qy = new Int32Array(skel.length);
  let head = 0;
  let tail = 0;
  dists[startY * w + startX] = 0;
  qy[tail] = startY;
  qx[tail] = startX;
  tail++;
  while (head < tail) {
    const y = qy[head];
    const x = qx[head];
    head++;
    const nd = dists[y * w + x] + 1;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w || (dy === 0 && dx === 0)) continue;
        const q = ny * w + nx;
        if (skel[q] && dists[q] === Infinity) {
          dists[q] = nd;
          qy[tail] = ny;
          qx[tail] = nx;
          tail++;
        }
      }
    }
  }
  return dists;
}

/** Remove duplicate pixels while preserving first-seen order. */
function uniqueCoords(coords: number[]): Int32Array {
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < coords.length; i += 2) {
    const key = coords[i] * 0x40000000 + coords[i + 1]; // y * big + x
    if (!seen.has(key)) {
      seen.add(key);
      out.push(coords[i], coords[i + 1]);
    }
  }
  return new Int32Array(out);
}

/**
 * Extract skeleton paths between nodes (pixels whose degree != 2).
 * Port of `extract_skeleton_paths`; falls back to cycle extraction
 * when the skeleton has no nodes (a plain closed loop).
 */
export function extractSkeletonPaths(
  skel: Uint8Array,
  w: number,
  h: number,
): SkelPath[] {
  const degree = skeletonDegree(skel, w, h);
  const nodeMask = new Uint8Array(skel.length);
  for (let i = 0; i < skel.length; i++) {
    if (skel[i] && degree[i] !== 2) nodeMask[i] = 1;
  }
  // Label connected node-pixel groups.
  const { labels, count } = labelComponent(nodeMask, w, h);
  if (count === 0) return extractCyclePaths(skel, w, h);

  const nodePixels = new Map<number, number[]>(); // nodeId -> pixel indices
  const nodeCenters = new Map<number, [number, number]>();
  for (let i = 0; i < skel.length; i++) {
    const id = labels[i];
    if (id > 0 && nodeMask[i]) {
      let arr = nodePixels.get(id);
      if (!arr) {
        arr = [];
        nodePixels.set(id, arr);
      }
      arr.push(i);
    }
  }
  for (const [id, pixels] of nodePixels) {
    let sy = 0;
    let sx = 0;
    for (const p of pixels) {
      sy += (p / w) | 0;
      sx += p % w;
    }
    nodeCenters.set(id, [sy / pixels.length, sx / pixels.length]);
  }

  const visited = new Uint8Array(skel.length);
  const paths: SkelPath[] = [];
  const isNode = (p: number): boolean => nodeMask[p] === 1;

  for (const [nodeId, pixels] of nodePixels) {
    for (const p of pixels) {
      const py = (p / w) | 0;
      const px = p % w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue;
          const ny = py + dy;
          const nx = px + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (!skel[q] || nodeMask[q] || visited[q]) continue;
          const path = walkSkeletonPath(
            skel,
            nodeMask,
            labels,
            visited,
            isNode,
            nodeId,
            [py, px],
            [ny, nx],
            w,
            h,
          );
          if (path) {
            appendSkeletonPath(
              paths,
              path,
              nodeId,
              nodePixels,
              nodeCenters,
              degree,
              w,
            );
          }
        }
      }
    }
  }
  if (paths.length === 0) return extractCyclePaths(skel, w, h);
  return paths;
}

function labelComponent(
  mask: Uint8Array,
  w: number,
  h: number,
): { labels: Int32Array; count: number } {
  const labels = new Int32Array(mask.length);
  const stack = new Int32Array(mask.length);
  let count = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    count++;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = count;
    while (sp > 0) {
      const p = stack[--sp];
      const y = (p / w) | 0;
      const x = p % w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (mask[q] && !labels[q]) {
            labels[q] = count;
            stack[sp++] = q;
          }
        }
      }
    }
  }
  return { labels, count };
}

function walkSkeletonPath(
  skel: Uint8Array,
  nodeMask: Uint8Array,
  labels: Int32Array,
  visited: Uint8Array,
  isNode: (p: number) => boolean,
  startNode: number,
  prev: [number, number],
  curr: [number, number],
  w: number,
  h: number,
): { core: number[]; endNode: number } | null {
  const core: number[] = [];
  let endNode = -1;
  let py = prev[0];
  let px = prev[1];
  let cy = curr[0];
  let cx = curr[1];
  while (true) {
    const p = cy * w + cx;
    if (isNode(p)) {
      endNode = labels[p];
      break;
    }
    if (visited[p]) break;
    visited[p] = 1;
    core.push(p);
    // Next neighbor that isn't the previous pixel.
    let nextY = -1;
    let nextX = -1;
    let foundNode = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && dx === 0) continue;
        const ny = cy + dy;
        const nx = cx + dx;
        if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
        if (ny === py && nx === px) continue;
        const q = ny * w + nx;
        if (!skel[q]) continue;
        if (nodeMask[q]) {
          foundNode = labels[q];
          break;
        }
        if (!visited[q] && nextY < 0) {
          nextY = ny;
          nextX = nx;
        }
      }
      if (foundNode >= 0) break;
    }
    if (foundNode >= 0) {
      endNode = foundNode;
      break;
    }
    if (nextY < 0) break;
    py = cy;
    px = cx;
    cy = nextY;
    cx = nextX;
  }
  if (core.length < 2) return null;
  return { core, endNode };
}

function appendSkeletonPath(
  paths: SkelPath[],
  path: { core: number[]; endNode: number },
  startNode: number,
  nodePixels: Map<number, number[]>,
  nodeCenters: Map<number, [number, number]>,
  degree: Int8Array,
  w: number,
): void {
  const pieces: number[] = [];
  const startPixels = nodePixels.get(startNode) ?? [];
  for (const p of startPixels) pieces.push((p / w) | 0, p % w);
  for (const p of path.core) pieces.push((p / w) | 0, p % w);
  const endNode = path.endNode;
  const endPixels = endNode >= 0 ? nodePixels.get(endNode) ?? [] : [];
  for (const p of endPixels) pieces.push((p / w) | 0, p % w);

  const coords = uniqueCoords(pieces);
  const count = coords.length / 2;
  if (count < 2) return;

  let top = Infinity;
  let left = Infinity;
  for (let i = 0; i < coords.length; i += 2) {
    if (coords[i] < top) top = coords[i];
    if (coords[i + 1] < left) left = coords[i + 1];
  }

  const degreeStats = (nodeId: number): { deg1: boolean; deg3: boolean } => {
    const pixels = nodePixels.get(nodeId) ?? [];
    let deg1 = false;
    let deg3 = false;
    for (const p of pixels) {
      const d = degree[p];
      if (d === 1) deg1 = true;
      if (d >= 3) deg3 = true;
    }
    return { deg1, deg3 };
  };
  const sStats = degreeStats(startNode);
  const eStats = endNode >= 0 ? degreeStats(endNode) : { deg1: false, deg3: false };

  const startCenter = nodeCenters.get(startNode) ?? [0, 0];
  const endCenter =
    endNode >= 0 && nodeCenters.has(endNode)
      ? nodeCenters.get(endNode)!
      : [coords[coords.length - 4], coords[coords.length - 3]];

  paths.push({
    coords,
    core: new Int32Array(path.core),
    startNode,
    endNode,
    startY: startCenter[0],
    startX: startCenter[1],
    endY: endCenter[0],
    endX: endCenter[1],
    startIsEndpoint: sStats.deg1 && !sStats.deg3,
    endIsEndpoint: eStats.deg1 && !eStats.deg3,
  });
}

/**
 * Trace external boundary of each connected region as an ordered
 * pixel chain (Moore-neighbor tracing with Jacob's stopping criterion).
 * Replaces cv2.findContours(RETR_EXTERNAL, CHAIN_APPROX_NONE).
 * Coordinates returned as flat [y0, x0, y1, x1, ...] in walk order.
 */
export function traceExternalContours(
  mask: Uint8Array,
  w: number,
  h: number,
): Int32Array[] {
  const contours: Int32Array[] = [];
  const visitedStart = new Uint8Array(mask.length);
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const start = sy * w + sx;
      if (!mask[start] || visitedStart[start]) continue;
      // Only trace if this pixel is an outer boundary (has an
      // 8-neighbor background above-left chain start heuristic: any ink
      // pixel with a background 4-neighbor above qualifies).
      const above = sy === 0 ? 0 : mask[start - w];
      if (above === 1 && visitedStart[start] === 0) {
        // Interior pixel under ink — skip; outer boundary rows start
        // where the row above is background.
        continue;
      }
      visitedStart[start] = 1;
      const contour = traceOne(
        mask,
        w,
        h,
        sy,
        sx,
      );
      if (contour && contour.length >= 8) {
        contours.push(contour);
        // Mark all contour pixels visited so we don't re-trace.
        for (let i = 0; i < contour.length; i += 2) {
          visitedStart[contour[i] * w + contour[i + 1]] = 1;
        }
      }
    }
  }
  return contours;
}

function traceOne(
  mask: Uint8Array,
  w: number,
  h: number,
  sy: number,
  sx: number,
): Int32Array | null {
  // 8 directions clockwise starting East.
  const dirs = [
    [0, 1],
    [1, 1],
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, -1],
    [-1, 0],
    [-1, 1],
  ];
  const points: number[] = [];
  let y = sy;
  let x = sx;
  let dir = 7; // came from north (background above)
  const maxSteps = w * h * 2 + 8;
  let steps = 0;
  do {
    points.push(y, x);
    // Search clockwise from (dir + 6) % 8 — backtracking then rotating.
    let found = false;
    let nd = (dir + 6) % 8;
    for (let i = 0; i < 8; i++) {
      const tryDir = (nd + i) % 8;
      const ny = y + dirs[tryDir][0];
      const nx = x + dirs[tryDir][1];
      if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
      if (mask[ny * w + nx]) {
        // The new backtrack direction points at the pixel we came from.
        dir = (tryDir + 4) % 8;
        y = ny;
        x = nx;
        found = true;
        break;
      }
    }
    if (!found) break; // isolated pixel
    steps++;
    if (steps > maxSteps) break;
  } while (!(y === sy && x === sx));
  if (points.length < 8) return null;
  return new Int32Array(points);
}

/** Closed-loop fallback: external contours as cycle paths. */
function extractCyclePaths(
  skel: Uint8Array,
  w: number,
  h: number,
): SkelPath[] {
  const contours = traceExternalContours(skel, w, h);
  const paths: SkelPath[] = [];
  for (const c of contours) {
    const coords = uniqueCoords(Array.from(c));
    if (coords.length / 2 < 4) continue;
    paths.push({
      coords,
      core: coords,
      startNode: -1,
      endNode: -1,
      startY: coords[0],
      startX: coords[1],
      endY: coords[coords.length - 2],
      endX: coords[coords.length - 1],
      startIsEndpoint: false,
      endIsEndpoint: false,
    });
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Junction branch pairing → sequential pen strokes
// ---------------------------------------------------------------------------

function orientedCore(path: SkelPath, fromStart: boolean): Int32Array {
  const core = path.core.length >= 4 ? path.core : path.coords;
  if (core.length < 4) return path.coords;
  if (fromStart) return core;
  // Reverse pairs.
  const rev = new Int32Array(core.length);
  for (let i = 0; i < core.length; i += 2) {
    rev[i] = core[core.length - 2 - i];
    rev[i + 1] = core[core.length - 1 - i];
  }
  return rev;
}

function outwardDirection(
  path: SkelPath,
  fromStart: boolean,
): [number, number] {
  const coords = orientedCore(path, fromStart);
  if (coords.length < 4) return [0, 0];
  const lookahead = Math.min(5, coords.length / 2 - 1) * 2;
  const dy = coords[lookahead] - coords[0];
  const dx = coords[lookahead + 1] - coords[1];
  const norm = Math.hypot(dy, dx);
  if (norm <= 1e-6) return [0, 0];
  return [dy / norm, dx / norm];
}

interface Token {
  index: number; // path index
  fromStart: boolean;
}

function tokenPosition(path: SkelPath, token: Token): number {
  const endpoint = token.fromStart
    ? path.startIsEndpoint
    : path.endIsEndpoint;
  const y = token.fromStart ? path.startY : path.endY;
  const x = token.fromStart ? path.startX : path.endX;
  return (endpoint ? 0 : 1) * 1e9 + y * 100000 + x;
}

/**
 * Pair incident path ends into the straightest continuations so the
 * top/bottom arms of a plus become one stroke (port of
 * `_pair_junction_branches`).
 */
function pairJunctionBranches(paths: SkelPath[]): Map<string, Token> {
  const incident = new Map<number, Token[]>();
  paths.forEach((path, index) => {
    if (path.startNode >= 0) {
      const arr = incident.get(path.startNode) ?? [];
      arr.push({ index, fromStart: true });
      incident.set(path.startNode, arr);
    }
    if (path.endNode >= 0) {
      const arr = incident.get(path.endNode) ?? [];
      arr.push({ index, fromStart: false });
      incident.set(path.endNode, arr);
    }
  });

  const pairings = new Map<string, Token>();
  const key = (t: Token) => `${t.index}:${t.fromStart ? "s" : "e"}`;

  for (const tokens of incident.values()) {
    const available = new Set(tokens.map(key));
    const candidates: Array<{
      cosine: number;
      left: Token;
      right: Token;
    }> = [];
    for (let i = 0; i < tokens.length; i++) {
      const left = tokens[i];
      const ld = outwardDirection(paths[left.index], left.fromStart);
      if (ld[0] === 0 && ld[1] === 0) continue;
      for (let j = i + 1; j < tokens.length; j++) {
        const right = tokens[j];
        if (left.index === right.index) continue;
        const rd = outwardDirection(paths[right.index], right.fromStart);
        if (rd[0] === 0 && rd[1] === 0) continue;
        const cosine = ld[0] * rd[0] + ld[1] * rd[1];
        candidates.push({ cosine, left, right });
      }
    }
    candidates.sort((a, b) => a.cosine - b.cosine);
    for (const { left, right } of candidates) {
      const lk = key(left);
      const rk = key(right);
      if (!available.has(lk) || !available.has(rk)) continue;
      pairings.set(lk, right);
      pairings.set(rk, left);
      available.delete(lk);
      available.delete(rk);
    }
  }
  return pairings;
}

function appendTrail(
  firstToken: Token,
  paths: SkelPath[],
  pairings: Map<string, Token>,
  usedPaths: Set<number>,
  strokes: PenStroke[],
): void {
  const trail: Int32Array[] = [];
  let token: Token | null = firstToken;
  while (token !== null) {
    const pathIndex = token.index;
    if (usedPaths.has(pathIndex)) break;
    const path = paths[pathIndex];
    let coords: Int32Array;
    if (path.startNode < 0 && path.endNode < 0) {
      // Closed path: rotate to begin at top-left pixel.
      const c = path.coords;
      let best = 0;
      for (let i = 0; i < c.length; i += 2) {
        if (
          c[i] < c[best] ||
          (c[i] === c[best] && c[i + 1] < c[best + 1])
        ) {
          best = i;
        }
      }
      const rotated = new Int32Array(c.length);
      for (let i = 0; i < c.length; i += 2) {
        const src = (best + i) % c.length;
        rotated[i] = c[src];
        rotated[i + 1] = c[src + 1];
      }
      coords = rotated;
    } else {
      coords = orientedCore(path, token.fromStart);
    }
    if (coords.length >= 2) trail.push(coords);
    usedPaths.add(pathIndex);
    const exitKey = `${pathIndex}:${!token.fromStart ? "s" : "e"}`;
    token = pairings.get(exitKey) ?? null;
  }
  if (trail.length === 0) return;
  const all: number[] = [];
  for (const t of trail) for (const v of t) all.push(v);
  const coords = uniqueCoords(all);
  const count = coords.length / 2;
  if (count < 2) return;
  strokes.push({ coords, count, weight: count });
}

/**
 * Build sequential pen strokes from skeleton paths (port of
 * `build_line_art_strokes`): trails start at natural or unpaired ends
 * and follow junction pairings into complete endpoint-to-endpoint
 * strokes.
 */
export function buildLineArtStrokes(paths: SkelPath[]): PenStroke[] {
  const usable = paths.filter((p) => p.coords.length / 2 >= 2);
  if (usable.length === 0) return [];
  const pairings = pairJunctionBranches(usable);
  const usedPaths = new Set<number>();
  const strokes: PenStroke[] = [];

  const key = (t: Token) => `${t.index}:${t.fromStart ? "s" : "e"}`;

  const startTokens: Token[] = [];
  usable.forEach((path, index) => {
    for (const fromStart of [true, false]) {
      const token: Token = { index, fromStart };
      const hasNode = fromStart
        ? path.startNode >= 0
        : path.endNode >= 0;
      if (!hasNode || !pairings.has(key(token))) {
        startTokens.push(token);
      }
    }
  });
  startTokens.sort((a, b) => {
    return (
      tokenPosition(usable[a.index], a) - tokenPosition(usable[b.index], b)
    );
  });
  for (const token of startTokens) {
    appendTrail(token, usable, pairings, usedPaths, strokes);
  }

  // Closed graphs: every end paired — start any remaining trail.
  let guard = 0;
  while (usedPaths.size < usable.length && guard++ < usable.length * 2) {
    const choices: Token[] = [];
    usable.forEach((path, index) => {
      if (!usedPaths.has(index)) {
        choices.push({ index, fromStart: true });
        choices.push({ index, fromStart: false });
      }
    });
    if (choices.length === 0) break;
    choices.sort(
      (a, b) =>
        tokenPosition(usable[a.index], a) - tokenPosition(usable[b.index], b),
    );
    appendTrail(choices[0], usable, pairings, usedPaths, strokes);
  }
  return strokes;
}

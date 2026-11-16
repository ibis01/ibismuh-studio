/**
 * Deterministic RNG + geometry hashing.
 *
 * The reference engine (whiteboard-animator, MIT) seeds every stochastic
 * painter from component geometry so the same input always produces the
 * same animation. We port that contract: hash the bounding box + area,
 * then drive a mulberry32 PRNG from it.
 */

/** Fast 32-bit seeded PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable geometry hash (mirrors the reference's int-hash mixing). */
export function geometrySeed(
  top: number,
  bottom: number,
  left: number,
  right: number,
  area: number,
  salt = 0x9e3779b9,
): number {
  let h =
    ((top * 73856093) ^ (bottom * 19349663) ^ (left * 83492791) ^
      (right * 2654435761) ^ (area * 97531) ^ salt) >>> 0;
  // Final avalanche so small coordinate tweaks spread well.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Uniform in [lo, hi). */
export function randRange(rng: () => number, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

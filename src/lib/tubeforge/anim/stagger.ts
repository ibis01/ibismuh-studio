// MG-1 (S148) — the stagger primitive: the cascade delay as DATA, not a
// framework (docs/design/mg1-motion-quality.md §3).
//
// The graphics planner hand-coded its bullet cascade for years
// (`400 + 350 * Math.max(0, order)`); the audit's finding: the rhythm is a
// motion-quality decision that belongs in the shared substrate where every
// engine (and the Phase C studio picker) can read the SAME profiles.
//
// Laws: pure (no fs, no clock, no randomness); the profile is a named
// design-time constant — callers may not invent ad-hoc rhythms through this
// module (a new rhythm is a registered profile, like an easing curve is a
// table entry); the order clamp names the wall (the graphics
// elementsPerScene budget = 32 — the clamp never fires inside the planner,
// which keeps the adoption byte-identical, but a caller passing junk can
// never produce an unbounded delay).

/** The named wall: an order beyond this clamps — the graphics grammar's
 *  own elementsPerScene budget, so the cap is unreachable in real docs. */
export const STAGGER_ORDER_MAX = 32;

/** One registered cascade rhythm: base = the first item's delay, step =
 *  the per-item increment. Design-time constants, never parametric. */
export interface StaggerProfile {
  baseMs: number;
  stepMs: number;
}

/** The registered rhythms. `bullets` reproduces the graphics planner's
 *  hand-coded cascade byte-identically (400/350); `cards` is the second
 *  rhythm (250/280 — denser boards read faster). */
export const STAGGER_PROFILES: Readonly<
  Record<"bullets" | "cards", StaggerProfile>
> = Object.freeze({
  bullets: Object.freeze({ baseMs: 400, stepMs: 350 }),
  cards: Object.freeze({ baseMs: 250, stepMs: 280 }),
});

export type StaggerProfileName = keyof typeof STAGGER_PROFILES;

/** The cascade delay for item `order` (0-based): baseMs + stepMs·order,
 *  clamped to [0, STAGGER_ORDER_MAX]. Negative orders ride the base (the
 *  planner's old Math.max(0, …) law, preserved). Pure and total. */
export function staggerDelayMs(
  order: number,
  profile: StaggerProfileName = "bullets"
): number {
  const p = STAGGER_PROFILES[profile];
  const n = Math.max(0, Math.min(Number.isFinite(order) ? order : 0, STAGGER_ORDER_MAX));
  return p.baseMs + p.stepMs * n;
}

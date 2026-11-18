// S165 — the ready-gate named diagnostics (the audit's staging: "replace
// generic timeout errors with which-gate-is-stuck expressions").
//
// The render farm's failure mode is never a crash — it is a STUCK gate: a
// chromium page that never finished loading, an applier evaluate that
// never returned, a screenshot that never came back, an ffmpeg that never
// finished encoding. Every engine used to surface those as either a bare
// playwright "Timeout 30000ms exceeded" or a silent forever-hang — the
// operator could not tell WHICH gate wedged without a debugger on the
// worker. This module gives every awaited pipeline step a NAME and a
// budget: the six ready gates of the audit's staging
//
//   page-load · compose · apply · screenshot · encode · probe
//
// A gate that exceeds its budget throws `the <engine> renderer is STUCK
// at the <gate> gate ...` — honest (it names the wedge point), greppable
// (`STUCK at the` + the gate name), and actionable (the gate IS the
// diagnostic). A gate whose step FAILED with its own error re-throws that
// error prefixed with the gate label, so even an inner playwright/ffmpeg
// message reports which pipeline stage died.
//
// This module is INFRA, not frame truth: it reads no clock and no
// randomness into the render path — setTimeout budgets only, cleared the
// moment the step settles (the winner never pays for the loser's timer).

export type RenderGateName =
  | "launch"     // chromium/browser startup
  | "page-load"  // setContent / goto — the markup must be in the page
  | "compose"    // page-side composition: setup evaluates, index maps, image decode readiness
  | "apply"      // the per-frame applier evaluate
  | "screenshot" // the per-frame raster
  | "encode"     // every ffmpeg invocation (scene encode, window encode, VO normalize, SFX, assembly)
  | "probe";     // the rasterize-before-trust budget race

/** The gate budgets. Generous by design — these exist to name a WEDGE, not
 *  to rush a slow machine: a real frame applies in tens of ms, a scene
 *  encode runs minutes, so a gate blowing its budget means stuck, not busy.
 *  `encode` sits above proc.ts's own 600s runner timeout so the runner's
 *  stderr-bearing error wins inside the gate, prefixed by the gate label. */
export const RENDER_GATE_BUDGET_MS: Record<RenderGateName, number> = {
  launch: 120_000,
  "page-load": 60_000,
  compose: 120_000,
  apply: 60_000,
  screenshot: 60_000,
  encode: 660_000,
  probe: 30_000,
};

/** The stuck-gate error — the which-gate-is-stuck expression itself.
 *  Exported for the pins (the message shape IS the diagnostic contract). */
export function renderGateStuckError(
  engine: string,
  gate: RenderGateName,
  budgetMs: number,
  detail?: string,
): Error {
  const sec = Math.round(budgetMs / 1000);
  return new Error(
    `the ${engine} renderer is STUCK at the ${gate} gate` +
      (detail ? ` (${detail})` : "") +
      ` — over ${sec}s with no progress (render-gate timeout)`,
  );
}

/** The gate-labeled failure prefix — an inner step error still reports
 *  which pipeline stage died. Exported for the pins. */
export function renderGateFailure(
  engine: string,
  gate: RenderGateName,
  detail: string | undefined,
  inner: unknown,
): Error {
  const msg = inner instanceof Error ? inner.message : String(inner);
  return new Error(
    `the ${engine} renderer failed at the ${gate} gate` +
      (detail ? ` (${detail})` : "") +
      `: ${msg}`,
  );
}

/** Run one pipeline step under its named gate. Resolves with the step's
 *  value; on budget overrun throws the stuck-gate error; on step failure
 *  throws the gate-labeled failure. The step's timer is cleared the
 *  moment it settles — a fast frame never pays for its own watchdog. */
export async function withRenderGate<T>(
  opts: { engine: string; gate: RenderGateName; budgetMs?: number; detail?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const budgetMs = opts.budgetMs ?? RENDER_GATE_BUDGET_MS[opts.gate];
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(renderGateStuckError(opts.engine, opts.gate, budgetMs, opts.detail)),
      budgetMs,
    );
    fn().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(renderGateFailure(opts.engine, opts.gate, opts.detail, err));
      },
    );
  });
}

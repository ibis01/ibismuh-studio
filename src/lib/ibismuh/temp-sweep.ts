// Orphaned-temp sweeper — crash-recovery for scratch directories (2026-11-23).
//
// Per-operation cleanup uses try/finally (voice-clone's ibismuh-clone-*,
// the graphics import's ibismuh-import-*), which covers everything EXCEPT
// the process dying mid-operation (OOM, SIGKILL, deploy replacement): those
// finally blocks never run and the temp dirs linger forever.
//
// This module reclaims them at boot: any ibismuh-* scratch directory in the
// OS temp dir whose mtime is older than the grace window is presumed
// orphaned (no legitimate operation holds scratch for hours) and removed.
// Best-effort, never throws, unlogged failures — the next boot retries.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Scratch prefixes this app creates under the OS temp dir. */
const SCRATCH_PREFIXES = ["ibismuh-clone-", "ibismuh-import-", "ibismuh-scratch", "ibismuh-s3-cache"];

/** A scratch dir untouched for this long is orphaned (clone/import work
 *  finishes in minutes; the s3 cache is re-downloadable). */
const ORPHAN_GRACE_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface SweepResult {
  swept: number;
  freedBytes: number;
  skipped: number;
}

function dirSize(dir: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) total += dirSize(p);
      else {
        try {
          total += fs.statSync(p).size;
        } catch {
          /* raced away */
        }
      }
    }
  } catch {
    /* raced away */
  }
  return total;
}

/** Remove orphaned ibismuh-* scratch directories (call at boot; idempotent). */
export function sweepOrphanedTempDirs(
  maxAgeMs: number = ORPHAN_GRACE_MS,
): SweepResult {
  const result: SweepResult = { swept: 0, freedBytes: 0, skipped: 0 };
  const tmp = os.tmpdir();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(tmp, { withFileTypes: true });
  } catch {
    return result;
  }
  const cutoff = Date.now() - maxAgeMs;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!SCRATCH_PREFIXES.some((p) => entry.name.startsWith(p))) continue;
    const dir = path.join(tmp, entry.name);
    try {
      const mtime = fs.statSync(dir).mtimeMs;
      if (mtime > cutoff) {
        result.skipped += 1; // fresh — a live operation may own it
        continue;
      }
      result.freedBytes += dirSize(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      result.swept += 1;
    } catch {
      // busy/raced/permissions — the next boot retries
    }
  }
  return result;
}

/** Boot hook (never throws, logs the outcome). */
export async function sweepOrphanedTempAtBoot(): Promise<SweepResult> {
  const result = sweepOrphanedTempDirs();
  if (result.swept > 0 || result.freedBytes > 0) {
    const { log } = await import("./log");
    log.info("orphaned temp sweep", {
      sweptDirs: result.swept,
      freedBytes: result.freedBytes,
      skippedFresh: result.skipped,
    });
  }
  return result;
}

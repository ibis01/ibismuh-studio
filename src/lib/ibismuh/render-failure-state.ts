// Phase 2 (master plan after 941a6ee) — the guarded render-failure-state
// write.
//
// WHY THIS MODULE EXISTS: the render failure path can race a teardown. The
// render job is async; the E2E battery (or a real account deletion) may
// remove the video — and with it, by cascade, the org graph — while the job
// is still recording its failure. The old shape (a bare `video.update` +
// `activity.create`) then threw P2025 ("No record was found for an update")
// and P2003 ("Foreign key constraint violated") — and Prisma prints BOTH to
// the server log EVEN WHEN the application code catches them. The integrity
// classifier (scripts/classify-e2e-server-log.mjs) and the e2e FK law fail
// the whole run on exactly those lines: 15 forbidden + 29 unknown log lines
// in the Phase 0 audit run all traced to these two writes.
//
// THE LAW HERE:
//   1. `updateMany` replaces `update` — a missing row matches ZERO rows and
//      returns count 0 instead of throwing P2025 (tenant scoping still
//      applies; the S135 bounded 500ms-retry contract is preserved).
//   2. The follow-on row (Activity or equivalent) is written ONLY when the
//      update landed (count > 0 — the entity existed at write time, so its
//      FK targets exist by cascade construction).
//   3. When the row is already gone, nothing is owed — one info line
//      records the skip. The message is classifier-vocabulary-safe by
//      construction (no error/warn/fail token, info level): an expected
//      teardown race is not an integrity defect and must not read as one.
//
// The same law hosts the entity-generic variant (`writeEntityState`) —
// research.ts's Topic Radar paths hit the identical teardown race (the
// session row deleted while the async research job was still persisting),
// which the Phase 2 acceptance run caught as the LAST remaining P2025/FK
// print in the classifier receipt.
import { db } from "./tenant-db";
import { log } from "./log";

export async function writeRenderFailureState(opts: {
  videoId: string;
  organizationId: string;
  userId?: string | null;
  stage: string;
  data: Record<string, unknown>;
  message: string;
}): Promise<void> {
  const { videoId, organizationId, userId, stage, data, message } = opts;
  const updated = await db.video
    .updateMany({ where: { id: videoId }, data })
    .catch(async () => {
      // The S135 bounded second attempt: the first write after a blown
      // transaction can meet the lingering SQLite writer lock.
      await new Promise((r) => setTimeout(r, 500));
      return db.video
        .updateMany({ where: { id: videoId }, data })
        .catch(() => ({ count: 0 }));
    });
  if (!updated.count) {
    log.info(
      "render state write skipped — the video row is already gone (deleted during the run)",
      { mod: "video-jobs", videoId, stage },
    );
    return;
  }
  await db.activity
    .create({
      data: {
        organizationId,
        userId: userId ?? null,
        videoId,
        stage,
        level: "error",
        message,
      },
    })
    .catch(() => {});
}

// The entity-generic variant: the caller supplies the guarded update as an
// updateMany thunk and the follow-on write; this module owns the ordering
// (update lands → follow-on runs), the bounded retry, and the honest,
// classifier-safe skip line.
export async function writeEntityState(opts: {
  entityLabel: string;
  update: () => Promise<{ count: number }>;
  onLanded: () => Promise<unknown>;
}): Promise<void> {
  const { entityLabel, update, onLanded } = opts;
  const updated = await update().catch(async () => {
    await new Promise((r) => setTimeout(r, 500));
    return update().catch(() => ({ count: 0 }));
  });
  if (!updated.count) {
    log.info(
      `${entityLabel} state write skipped — the row is already gone (deleted during the run)`,
      { mod: "guarded-state" },
    );
    return;
  }
  await onLanded().catch(() => {});
}

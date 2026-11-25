// POST /api/videos/[id]/scenes/[n]/recheck — S116 (Scene-Level Editing,
// Stage 5): the scene-scoped QC re-check + the approval gate.
//
// THE STAGE'S EXIT CRITERION, made a route: repaired scenes are CHECKED
// before approval. The recheck runs the whole-file battery's probes scoped
// to ONE scene's standing preview (playable, black/frozen frames, aspect,
// the loudness family, dead air, static runs, flicker, stutter, duration
// vs the render's own timing fold, the scene-sliced caption cues, and —
// under a restricted content policy — the S49 visual scan at scene scope)
// plus the boundary-pair lens on the scene's seams, and stores the verdict
// ON the head revision it judged (revisionVersion-tied).
//
// Body shapes:
//   {}                      — RUN: enqueue the scene-recheck job (202; a
//                             retried click while one stands is a
//                             duplicate 200). Local ffmpeg work; the only
//                             paid surface is the policy-gated visual scan,
//                             which is exactly why it runs on a human's
//                             click and never auto-chains.
//   { approve: true }       — APPROVE: synchronous. Requires a standing
//                             PASSING verdict for the HEAD'S OWN version
//                             (the pure approvalBlocker): no verdict → 409,
//                             a verdict for an older revision → 409 (the
//                             head moved — re-run), a failed verdict → 409.
//                             Approving flips status → approved and touches
//                             NOTHING else; approving an approved head is
//                             an idempotent 200.
//
// GET — the standing verdict (the revision's stored report), the approval
// blocker's honest reason when approval is not yet possible, and which
// seam media is missing with the exact command that renders it.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/ibismuh/tenant-db";
import { requireUser } from "@/lib/ibismuh/tenant";
import { parseScenes } from "@/lib/ibismuh/story";
import { resolveLaneFromRow } from "@/lib/ibismuh/video-lanes";
import { loadSlideDeck, headlineFontPx } from "@/lib/ibismuh/slides";
import {
  evaluateClassicFocalGate,
  slideDeckGateReport,
  type QCGateStatus,
} from "@/lib/ibismuh/qc-gates";
import { headRevision } from "@/lib/ibismuh/scene-revisions";
import {
  approvalBlocker,
  approveSceneRevision,
  parseRecheckReport,
  runSceneRecheckJob,
  seamsOfScene,
  sceneBoundaryKey,
} from "@/lib/ibismuh/scene-qc";
import { startJob } from "@/lib/ibismuh/jobs";
import * as storage from "@/lib/ibismuh/storage";

type Ctx = { params: Promise<{ id: string; n: string }> };

async function loadScene(id: string, index: number) {
  const video = await db.video.findUnique({ where: { id } });
  if (!video) return { error: "Video not found", status: 404 as const, video: null };
  if (video.format !== "story")
    return {
      error: "Not a scene-based video — scene editing applies to scene-format videos",
      status: 400 as const,
      video: null,
    };
  if (!parseScenes(video.scenes).some((s) => s.index === index))
    return { error: `Scene ${index} does not exist`, status: 404 as const, video: null };
  return { error: null, status: 200 as const, video };
}

/** The registry-derived lane truth for the operator UI (the honesty law):
 *  resolved lanes expose the declared contract; ambiguous/unknown rows
 *  fail VISIBLE with the resolver's own message — never a silent default. */
function laneTruth(format: string, renderMode: string) {
  const row = resolveLaneFromRow(format, renderMode);
  if (row.status === "resolved") {
    const l = row.lane;
    return {
      status: "resolved" as const,
      videoType: l.type,
      planVersion: l.planVersion,
      planner: l.planner,
      renderer: l.renderer,
      fallbackPolicy: l.fallbackPolicy,
      qcProfile: l.qcProfile,
      capabilities: [...l.capabilities],
      modes: (l.modes ?? []).map((m) => ({ id: m.id, label: m.label, when: m.when })),
      supportedAspects: [...l.supportedAspects],
      supportedFps: [...l.supportedFps],
    };
  }
  if (row.status === "ambiguous")
    return { status: "ambiguous" as const, candidates: [...row.candidates], message: row.message };
  return { status: "unknown" as const, message: row.message };
}

type LaneGateRow = { status: QCGateStatus; detail: string; findings?: string[] };

/** The lane-scoped STATIC gates (qc-gates.ts) run against the live plan —
 *  the honesty surface measures what can be measured without a render and
 *  declares (unmeasured) what cannot. Returns null for lanes that declare
 *  no static gate yet — absence is honest, an empty pass is not. */
function laneStaticGates(
  videoId: string,
  lane: ReturnType<typeof laneTruth>,
  scenesJson: string | null,
): { fit?: LaneGateRow & { rows?: Array<{ index: number; layout: string; detail: string }> }; focal?: LaneGateRow; tiling?: LaneGateRow } | null {
  const laneId = lane.status === "resolved" ? lane.videoType : null;
  // the story/kenburns row is deliberately AMBIGUOUS (story + character share
  // it) — the compositor-family gates apply to every candidate alike.
  const compositorFamily =
    laneId === "classic" || laneId === "story" || laneId === "character" ||
    (lane.status === "ambiguous" && lane.candidates.some((c) => c === "classic" || c === "story" || c === "character"));

  if (laneId === "slides") {
    const deck = loadSlideDeck(videoId);
    const report = slideDeckGateReport(deck ?? [], (h) => headlineFontPx(h.length));
    return {
      fit: {
        status: report.status,
        detail: report.detail,
        rows: report.rows.map((r) => ({ index: r.index, layout: r.layout, detail: r.gate.detail })),
      },
    };
  }

  if (compositorFamily) {
    const scenes = parseScenes(scenesJson);
    const focal = evaluateClassicFocalGate(scenes.map((s) => ({ id: s.id ?? `scene-${s.index}`, focalPoint: s.focal })));
    return {
      focal: { status: focal.status, detail: focal.detail, findings: focal.findings },
      tiling: {
        status: "unmeasured" as const,
        detail:
          "scene durations are computed at render time — tiling is measured on the rendered timeline (scene-qc's seam lens), not on plan rows",
      },
    };
  }

  return null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter();

  const { id, n } = await ctx.params;
  const index = Number(n);
  if (!Number.isInteger(index) || index < 1)
    return NextResponse.json({ error: "A valid scene index is required" }, { status: 400 });

  const loaded = await loadScene(id, index);
  if (!loaded.video) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const video = loaded.video;
  const lane = laneTruth(video.format, video.renderMode);
  const laneGates = laneStaticGates(id, lane, video.scenes);

  const scene = parseScenes(video.scenes).find((s) => s.index === index);
  if (!scene?.id)
    return NextResponse.json({
      sceneId: null,
      head: null,
      verdict: null,
      approval: { ok: false, reason: "no-history", message: "Scene has no revision history — nothing to approve" },
      seams: [],
      lane,
      laneGates,
    });

  const head = await headRevision(id, scene.id);
  const verdict = parseRecheckReport(head?.recheck ?? null);
  const block = approvalBlocker(
    head ? { version: head.version, status: head.status } : null,
    verdict
  );

  // Which seam media stands — the honest "what's missing" feed for the UI.
  const sceneCount = parseScenes(video.scenes).length;
  const seams = await Promise.all(
    seamsOfScene(index, sceneCount).map(async (after) => ({
      afterScene: after,
      mediaStanding: Boolean(await storage.stat(sceneBoundaryKey(id, after)).catch(() => null)),
    }))
  );

  return NextResponse.json({
    sceneId: scene.id,
    head: head
      ? { version: head.version, status: head.status, changeKind: head.changeKind, origin: head.origin }
      : null,
    verdict,
    approval: block,
    seams,
    lane,
    laneGates,
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter();

  const { id, n } = await ctx.params;
  const index = Number(n);
  if (!Number.isInteger(index) || index < 1)
    return NextResponse.json({ error: "A valid scene index is required" }, { status: 400 });

  const loaded = await loadScene(id, index);
  if (!loaded.video) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const video = loaded.video;

  const body = await req.json().catch(() => null);

  // APPROVE arm — synchronous, row-ops only.
  if (body?.approve === true) {
    const result = await approveSceneRevision({
      video,
      sceneIndex: index,
      userId: auth.ctx.userId,
    });
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
    return NextResponse.json({
      approved: true,
      already: result.already,
      revision: result.revision,
      message: result.already
        ? "This revision is already approved"
        : `Scene ${index} v${result.revision.version} approved — the render source is pinned to it`,
    });
  }

  // RUN arm — enqueue the scene-recheck job, idempotently keyed to the
  // video row state: a retried click while one stands is a duplicate; any
  // content change (updatedAt moves) mints a fresh key so a recheck after
  // an edit is never blocked by the old one.
  const entity = `${id}#scene${index}`;
  const idempotencyKey = `scene-recheck:${id}:s${index}:${video.updatedAt.getTime()}`;
  const accepted = await startJob(entity, "scene-recheck", () => runSceneRecheckJob(entity), {
    payload: { sceneIndex: index },
    idempotencyKey,
  });
  const job = await db.job.findUnique({ where: { idempotencyKey } }).catch(() => null);

  return NextResponse.json(
    {
      accepted,
      jobId: job?.id ?? null,
      idempotencyKey,
      sceneIndex: index,
      targetHint: `Re-checking scene ${index} (the standing preview, its cues, and its seams) — the verdict lands on the head revision`,
    },
    { status: accepted ? 202 : 200 }
  );
}

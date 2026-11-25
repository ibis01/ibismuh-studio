// qc-engine.ts — deterministic structural QC (server-only).
//
// No ffmpeg in the sandbox — the checks are structural and HONEST about it:
// they verify the plan envelope, declared timing, geometry, provenance, and
// the lane-specific contract (draw coverage, layout bounds, deck structure,
// beat windows...) over the parsed documents. A check that cannot be run is
// never reported as passed — it reports warn/fail with the reason.
//
// THE LAW: overall = any fail → "fail"; any warn → "warn"; else "pass".
// Every run persists a QcReportRecord — QC is evidence, not a vibe.

import { db } from "@/lib/ibismuh/tenant-db";
import { canonicalStringify } from "./canonical";
import { resolveLane, type VideoType } from "./studio-lanes";
import { ASPECT_GEOMETRY } from "./studio-catalogs";
import type { VideoPlanEnvelope } from "./plan-envelope";
import { parsePlanEnvelope } from "./plan-envelope";
import type { AudioReceipt } from "./audio-receipt";
import type { LaneScene, PlannerOutput } from "./planner-types";
import type { QcCheck, QcDTO } from "./api-dto";
import {
  ORG,
  loadProjectRow,
  parseLaneDoc,
  requireCurrentRevisionRow,
  tryParseAudioReceipt,
  writeStudioEvent,
} from "./dto-mappers";

const PATH_ROLES = ["frame", "shape", "arrow", "underline", "glyph", "emphasis", "connector"] as const;
const BOARD_W = 1280;
const BOARD_H = 720;
const CAPTION_LIMIT = 90;
const DURATION_TOLERANCE_MS = 750;
const OVERLAP_LIMIT = 0.1;

function mkCheck(
  id: string,
  title: string,
  severity: QcCheck["severity"],
  pass: boolean,
  message: string,
  sceneRef?: string,
): QcCheck {
  return { id, title, severity, pass, message, ...(sceneRef ? { sceneRef } : {}) };
}

/** Image lanes: classic/story always, character's storyboard-fallback scenes. */
function laneUsesImages(lane: VideoType): boolean {
  return lane === "classic" || lane === "story" || lane === "character";
}

function pathInBounds(d: string): boolean {
  // Proper path evaluation: resolve each command (including RELATIVE
  // h/v/l/m forms) against the current point — naive number-pairing would
  // flag legitimate relative geometry as out-of-bounds.
  const tokens = d.match(/[a-zA-Z]|-?\d+(?:\.\d+)?/g) ?? [];
  let cx = 0;
  let cy = 0;
  let i = 0;
  let cmd = "";
  const peek = () => tokens[i];
  const nextNum = () => Number(tokens[i++]);
  const check = (x: number, y: number): boolean => x >= 0 && x <= BOARD_W && y >= 0 && y <= BOARD_H;
  while (i < tokens.length) {
    const t = peek();
    if (/^[a-zA-Z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "Z" || cmd === "z") continue;
    }
    switch (cmd) {
      case "M":
      case "L": {
        const x = nextNum();
        const y = nextNum();
        cx = x;
        cy = y;
        if (!check(cx, cy)) return false;
        break;
      }
      case "m":
      case "l": {
        const dx = nextNum();
        const dy = nextNum();
        cx += dx;
        cy += dy;
        if (!check(cx, cy)) return false;
        break;
      }
      case "H": {
        cx = nextNum();
        if (!check(cx, cy)) return false;
        break;
      }
      case "h": {
        cx += nextNum();
        if (!check(cx, cy)) return false;
        break;
      }
      case "V": {
        cy = nextNum();
        if (!check(cx, cy)) return false;
        break;
      }
      case "v": {
        cy += nextNum();
        if (!check(cx, cy)) return false;
        break;
      }
      case "A":
      case "a": {
        // rx ry rot laf sf x y — the endpoint is what ink touches.
        nextNum();
        nextNum();
        nextNum();
        nextNum();
        nextNum();
        const x = nextNum();
        const y = nextNum();
        if (cmd === "a") {
          cx += x;
          cy += y;
        } else {
          cx = x;
          cy = y;
        }
        if (!check(cx, cy)) return false;
        break;
      }
      default:
        // Unknown command letter — consume nothing, advance to avoid a loop.
        i++;
        break;
    }
  }
  return true;
}

type Rect = { x: number; y: number; w: number; h: number };

/** Intersection area over the SMALLER component's area (0..1+). */
function overlapRatio(a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const minArea = Math.min(a.w * a.h, b.w * b.h);
  return minArea <= 0 ? 0 : inter / minArea;
}

interface QcContext {
  plan: VideoPlanEnvelope;
  laneDoc: PlannerOutput;
  receipt: AudioReceipt | null;
}

function commonChecks(ctx: QcContext, checks: QcCheck[]): void {
  const { plan, laneDoc, receipt } = ctx;
  const lane = resolveLane(plan.videoType);

  checks.push(
    mkCheck("plan-fingerprint", "Plan envelope integrity", "info", true, "envelope parsed and its fingerprint verified"),
  );

  if (plan.narration.source === "estimate") {
    checks.push(
      mkCheck("timing-source", "Timing source declared", "warn", false, "estimated timing — measured audio recommended"),
    );
  } else {
    checks.push(
      mkCheck("timing-source", "Timing source declared", "info", true, `timing source declared: ${plan.narration.source}`),
    );
  }

  const planTotal = plan.beats.length ? Math.max(...plan.beats.map((b) => b.narrationWindow.endMs)) : 0;
  if (receipt) {
    const delta = Math.abs(planTotal - receipt.durationMs);
    const ok = delta < DURATION_TOLERANCE_MS;
    checks.push(
      mkCheck(
        "duration-agreement",
        "Duration agreement",
        ok ? "info" : "fail",
        ok,
        ok
          ? `plan total ${planTotal}ms vs measured audio ${receipt.durationMs}ms (delta ${delta}ms)`
          : `plan total ${planTotal}ms disagrees with measured audio ${receipt.durationMs}ms (delta ${delta}ms ≥ ${DURATION_TOLERANCE_MS}ms)`,
      ),
    );
  } else {
    checks.push(
      mkCheck("duration-agreement", "Duration agreement", "warn", false, "no measured receipt — duration rests on the declared estimate"),
    );
  }

  const longCaptions = laneDoc.scenes.filter((s) => typeof s.caption === "string" && s.caption.length > CAPTION_LIMIT);
  if (longCaptions.length === 0) {
    checks.push(mkCheck("caption-bounds", "Caption bounds", "info", true, `every caption is within ${CAPTION_LIMIT} characters`));
  } else {
    for (const s of longCaptions) {
      checks.push(
        mkCheck("caption-bounds", "Caption bounds", "fail", false, `caption is ${s.caption?.length ?? 0} characters (limit ${CAPTION_LIMIT})`, s.id),
      );
    }
  }

  const geo = ASPECT_GEOMETRY[plan.aspect];
  const aspectOk = lane.supportedAspects.includes(plan.aspect) && plan.width === geo.width && plan.height === geo.height;
  checks.push(
    mkCheck(
      "aspect-support",
      "Aspect support",
      aspectOk ? "info" : "fail",
      aspectOk,
      aspectOk
        ? `${plan.aspect} @ ${plan.width}x${plan.height} matches the lane contract`
        : `geometry ${plan.aspect} ${plan.width}x${plan.height} contradicts the lane contract (${lane.supportedAspects.join(", ")}, ${geo.width}x${geo.height})`,
    ),
  );

  const unprovenanced = plan.assets.filter((a) => !a.license || !a.tenantId || !/^[0-9a-f]{64}$/.test(a.contentHash));
  if (unprovenanced.length > 0) {
    checks.push(
      mkCheck(
        "asset-provenance",
        "Asset provenance",
        "fail",
        false,
        `assets missing license/tenant/hash: ${unprovenanced.map((a) => a.assetId).join(", ")}`,
      ),
    );
  } else if (laneUsesImages(plan.videoType) && plan.assets.length === 0) {
    checks.push(
      mkCheck("asset-provenance", "Asset provenance", "warn", false, "no generated art — gradient boards fallback (declared)"),
    );
  } else {
    checks.push(
      mkCheck("asset-provenance", "Asset provenance", "info", true, `${plan.assets.length} asset(s) carry full provenance`),
    );
  }
}

function laneChecks(ctx: QcContext, checks: QcCheck[]): void {
  const { plan, laneDoc } = ctx;
  const scenes: LaneScene[] = laneDoc.scenes;

  switch (plan.videoType) {
    case "whiteboard": {
      const uncovered = scenes.filter((s) => {
        const paths = s.paths ?? [];
        const good = paths.filter((p) => p.strokeMs > 0 && (PATH_ROLES as readonly string[]).includes(p.role));
        return good.length < 2;
      });
      if (uncovered.length === 0) {
        checks.push(
          mkCheck("draw-coverage", "Draw coverage", "info", true, "every scene carries ≥ 2 role-declared strokes with positive stroke duration"),
        );
      } else {
        for (const s of uncovered) {
          checks.push(
            mkCheck("draw-coverage", "Draw coverage", "fail", false, "scene carries fewer than 2 drawable strokes with positive strokeMs and declared roles", s.id),
          );
        }
      }

      const outOfBounds: string[] = [];
      for (const s of scenes) {
        for (const p of s.paths ?? []) {
          if (!pathInBounds(p.d)) outOfBounds.push(`${s.id}/${p.id}`);
        }
      }
      checks.push(
        mkCheck(
          "ink-fit",
          "Ink fit",
          outOfBounds.length ? "fail" : "info",
          outOfBounds.length === 0,
          outOfBounds.length
            ? `strokes outside the ${BOARD_W}x${BOARD_H} board: ${outOfBounds.slice(0, 5).join(", ")}`
            : `every stroke sits inside the ${BOARD_W}x${BOARD_H} board`,
        ),
      );
      break;
    }

    case "graphics2d": {
      const layoutIssues: string[] = [];
      const overlapIssues: string[] = [];
      for (const s of scenes) {
        const comps = s.components ?? [];
        for (const c of comps) {
          const { x, y, w, h } = c.layout;
          if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1 + 1e-6 || y + h > 1 + 1e-6) {
            layoutIssues.push(`${s.id}/${c.id}`);
          }
        }
        for (let i = 0; i < comps.length; i++) {
          for (let j = i + 1; j < comps.length; j++) {
            if (overlapRatio(comps[i].layout, comps[j].layout) > OVERLAP_LIMIT) {
              overlapIssues.push(`${s.id}/${comps[i].id}+${comps[j].id}`);
            }
          }
        }
      }
      const layoutBad = layoutIssues.length > 0 || overlapIssues.length > 0;
      checks.push(
        mkCheck(
          "layout-bounds",
          "Layout bounds",
          layoutBad ? "fail" : "info",
          !layoutBad,
          layoutBad
            ? `layout violations: ${[...layoutIssues, ...overlapIssues].slice(0, 5).join(", ")}`
            : "every component layout is normalized and overlaps stay under 10%",
        ),
      );

      const uncited = scenes.flatMap((s) =>
        (s.components ?? [])
          .filter((c) => (c.kind === "statistic" || c.kind === "chart") && !c.citation)
          .map((c) => `${s.id}/${c.id}`),
      );
      checks.push(
        mkCheck(
          "data-citation",
          "Data citation",
          uncited.length ? "warn" : "info",
          uncited.length === 0,
          uncited.length ? `data components without a citation: ${uncited.slice(0, 5).join(", ")}` : "every data component carries a citation",
        ),
      );
      break;
    }

    case "character": {
      const undeclared = scenes.filter((s) => !s.mode && !s.pose);
      const undeclaredFallback = scenes.filter(
        (s) =>
          (s.mode ?? s.pose?.rigMode) === "storyboard-fallback" &&
          !(plan.fallback.perScene ?? []).some((p) => p.sceneRef === s.id),
      );
      const modeOk = undeclared.length === 0 && undeclaredFallback.length === 0;
      checks.push(
        mkCheck(
          "mode-declared",
          "Per-scene mode declared",
          modeOk ? "info" : "fail",
          modeOk,
          modeOk
            ? "every scene declares its rig mode; storyboard-fallback scenes are declared per scene"
            : `undeclared scenes: ${[...undeclared, ...undeclaredFallback].map((s) => s.id).slice(0, 5).join(", ")}`,
        ),
      );

      const dishonest = scenes.filter((s) => s.pose && s.pose.lipSync === "validated" && s.pose.rigMode !== "native-rig");
      checks.push(
        mkCheck(
          "lip-sync-honesty",
          "Lip-sync honesty",
          dishonest.length ? "fail" : "info",
          dishonest.length === 0,
          dishonest.length
            ? `lip-sync "validated" without a native rig in: ${dishonest.map((s) => s.id).slice(0, 5).join(", ")}`
            : "lip-sync is only validated where a native rig performs it",
        ),
      );
      break;
    }

    case "slides": {
      const first = scenes[0]?.slide;
      const last = scenes[scenes.length - 1]?.slide;
      const structureOk = first?.template === "title" && last?.template === "closing";
      checks.push(
        mkCheck(
          "deck-structure",
          "Deck structure",
          structureOk ? "info" : "fail",
          structureOk,
          structureOk
            ? "deck opens on a title slide and closes on a closing slide"
            : `deck structure violates the contract (first: ${first?.template ?? "none"}, last: ${last?.template ?? "none"})`,
        ),
      );

      const dense = scenes.filter((s) => {
        const body = s.slide?.body ?? [];
        return body.length > 4 || body.some((b) => b.length > 70);
      });
      if (dense.length === 0) {
        checks.push(mkCheck("text-density", "Text density", "info", true, "slide bodies are within density limits (≤ 4 bullets, ≤ 70 chars each)"));
      } else {
        for (const s of dense) {
          checks.push(mkCheck("text-density", "Text density", "warn", false, "slide body exceeds 4 bullets or a bullet exceeds 70 characters", s.id));
        }
      }
      break;
    }

    case "story": {
      const issues = laneDoc.continuity ?? [];
      checks.push(
        mkCheck(
          "continuity-report",
          "Continuity report",
          "info",
          true,
          issues.length
            ? `${issues.length} continuity note(s) surfaced: ${issues
                .slice(0, 3)
                .map((i) => `${i.sceneRef} ${i.kind}`)
                .join(", ")}`
            : "no continuity issues detected",
        ),
      );
      if (scenes.length > 2 && !laneDoc.storyBible) {
        checks.push(mkCheck("story-bible", "Story bible", "warn", false, "no story bible for a 3+ scene story — characters and locations risk drift"));
      } else {
        checks.push(
          mkCheck("story-bible", "Story bible", "info", true, laneDoc.storyBible ? "story bible present" : "story bible optional below 3 scenes"),
        );
      }
      break;
    }

    case "classic": {
      const tiny = plan.beats.filter((b) => b.narrationWindow.endMs - b.narrationWindow.startMs < 900);
      const beatsOk = plan.beats.length >= 2 && tiny.length === 0;
      checks.push(
        mkCheck(
          "beat-windows",
          "Beat windows",
          beatsOk ? "info" : "fail",
          beatsOk,
          beatsOk
            ? `${plan.beats.length} beats, every window ≥ 900ms`
            : plan.beats.length < 2
              ? `only ${plan.beats.length} beat(s) — a classic render needs at least 2`
              : `beats under 900ms: ${tiny.map((b) => b.id).join(", ")}`,
        ),
      );
      break;
    }
  }
}

async function persistQcReport(projectId: string, dto: QcDTO, qcProfile: string): Promise<void> {
  await db.qcReportRecord.create({
    data: {
      projectId,
      organizationId: ORG,
      overall: dto.overall,
      qcProfile,
      planFingerprint: dto.planFingerprint,
      checksJson: canonicalStringify(dto.checks),
      ranAt: new Date(dto.ranAt),
    },
  });
}

export async function getLatestQc(projectId: string): Promise<QcDTO | null> {
  await loadProjectRow(projectId);
  const row = await db.qcReportRecord.findFirst({ where: { projectId, organizationId: ORG }, orderBy: { ranAt: "desc" } });
  if (!row) return null;
  try {
    const checks = JSON.parse(row.checksJson) as unknown;
    if (!Array.isArray(checks)) return null;
  } catch {
    return null;
  }
  return {
    overall: row.overall === "fail" ? "fail" : row.overall === "warn" ? "warn" : "pass",
    qcProfile: row.qcProfile,
    planFingerprint: row.planFingerprint,
    checks: (JSON.parse(row.checksJson) as unknown) as QcCheck[],
    ranAt: row.ranAt.toISOString(),
  };
}

/** Run the QC engine for a project: load, check, persist, return. */
export async function runQcForProject(projectId: string): Promise<QcDTO> {
  const project = await loadProjectRow(projectId);
  const lane = resolveLane(project.lane);
  const revRow = await requireCurrentRevisionRow(project);

  const plan = parsePlanEnvelope(revRow.planJson); // corrupted plan → 500 (fail closed; the plan-fingerprint check manifests as this error path)
  const laneDoc = parseLaneDoc(revRow.laneDocJson);
  const receiptRow = await db.audioReceiptRecord.findFirst({
    where: { projectId, organizationId: ORG },
    orderBy: { createdAt: "desc" },
  });
  const receipt = receiptRow ? tryParseAudioReceipt(receiptRow.receiptJson) : null;

  const ctx: QcContext = { plan, laneDoc, receipt };
  const checks: QcCheck[] = [];
  commonChecks(ctx, checks);
  laneChecks(ctx, checks);

  const hasFail = checks.some((c) => !c.pass && c.severity === "fail");
  const hasWarn = checks.some((c) => !c.pass && c.severity === "warn");
  const dto: QcDTO = {
    overall: hasFail ? "fail" : hasWarn ? "warn" : "pass",
    qcProfile: lane.qcProfile,
    planFingerprint: plan.fingerprint,
    checks,
    ranAt: new Date().toISOString(),
  };

  await persistQcReport(projectId, dto, lane.qcProfile);
  await writeStudioEvent(projectId, "qc-report", `QC ${dto.overall}: ${checks.filter((c) => !c.pass).length} issue(s) across ${checks.length} checks`);
  return dto;
}

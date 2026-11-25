// drawable-ir.ts — THE DRAWABLE IR (Whiteboard lane, master plan workstream E).
//
// The lane's drawable knowledge used to be scattered across WhiteboardAsset
// (metadata + sanitized SVG fragment), ExtractedAsset (id/d/pen attributes in
// document order), trace receipts, and placements. This module unifies them
// into ONE versioned, immutable, serializable document:
//
//   * provenance is mandatory (source kind + ref + content hash);
//   * geometry is MEASURED (arc length, bbox, expanded command count,
//     start/end pen anchors — the facts timing, camera, and hand travel pay
//     for anyway), never copied as opaque strings;
//   * serialization is canonical (sorted keys, fixed-precision numbers,
//     document-ordered arrays) so identical input is byte-identical;
//   * the fingerprint is sha256 over the canonical form, and parsing is
//     fail-closed: unknown version, missing fields, bad enums, or ANY
//     fingerprint mismatch is rejected — a stored IR is tamper-evident.
//
// Design contract: docs/whiteboard/drawable-ir-design.md. This module is
// deliberately AROUND the engine, not instead of it — svg.ts stays the only
// parser/flattener, asset-validate.ts stays the gate (the IR carries its
// receipt), and ExtractedAsset stays the renderer's working format.
//
// Run: npm run test:drawable-ir   (pure — no DB, no DOM; CI step)

import { canonicalStringify, sha256Hex } from "../canonical";
import { extractAsset, type ExtractedAsset, type WhiteboardAsset } from "./assets";
import type { AssetValidationReport } from "./asset-validate";
import { countPathCommands, pathSegments, totalLength } from "./svg";

// ---------- the contract ----------

export const DRAWABLE_IR_VERSION = 1;

export type DrawableSourceKind = "library" | "traced-upload" | "generated";

export type DrawablePathRole = "outline" | "fill";

export interface DrawablePathNode {
  id: string;
  d: string;
  /** Measured arc length across all subpaths. */
  length: number;
  bbox: { x: number; y: number; w: number; h: number };
  /** Expanded command count — the E1 budget unit. */
  commands: number;
  /** Pen-down start (first flattened point) — hand-travel anchor. */
  start: { x: number; y: number };
  /** Pen-up point (last flattened point) — hand-travel anchor. */
  end: { x: number; y: number };
  role: DrawablePathRole;
  /** Pen-group membership or "default". */
  semanticGroup: string;
  /** Resolved draw order: explicit drawOrder wins, document order fills the rest. */
  order: number;
  pen: { stroke?: string; strokeWidth?: number; linecap?: string; fill?: string };
}

export interface DrawableTextNode {
  id: string;
  content: string;
  x: number;
  y: number;
  size: number;
}

export interface DrawableRejectedElement {
  kind: "path" | "text";
  id: string;
  reason: string;
}

export interface DrawableValidationReceipt {
  /** True when an AssetValidationReport rode along at compile time. */
  ran: boolean;
  checksRun: string[];
  failedChecks: string[];
  findingCount: number;
}

export interface DrawableIr {
  version: number;
  assetId: string;
  source: { kind: DrawableSourceKind; ref?: string; contentHash: string };
  viewBox: { w: number; h: number };
  paths: DrawablePathNode[];
  texts: DrawableTextNode[];
  rejected: DrawableRejectedElement[];
  validationReceipt: DrawableValidationReceipt;
  /** sha256 over the canonical serialization of the document sans fingerprint. */
  fingerprint: string;
}

/** The validator battery whose receipt the IR carries (asset-validate.ts). */
export const DRAWABLE_IR_CHECKS = [
  "teleport",
  "self-intersection",
  "caps",
  "closed-direction",
  "fill-after-outline",
  "orientation",
] as const;

// ---------- canonical serialization (the shared contract, canonical.ts) ----------

/** The canonical serialization of an IR WITHOUT its fingerprint field. */
export function drawableIrCanonicalForm(ir: DrawableIr): string {
  const { fingerprint: _omit, ...rest } = ir;
  return canonicalStringify(rest);
}

/** Full canonical serialization INCLUDING the fingerprint (storage form). */
export function serializeDrawableIr(ir: DrawableIr): string {
  return canonicalStringify(ir);
}

/** sha256 over the canonical sans-fingerprint form. */
export function computeDrawableIrFingerprint(ir: DrawableIr): string {
  return sha256Hex(drawableIrCanonicalForm(ir));
}

// ---------- compilation ----------

export interface DrawableIrCompileInput {
  asset: WhiteboardAsset;
  /** Defaults to extractAsset(asset) — pass the caller's extraction to avoid re-parsing. */
  extracted?: ExtractedAsset;
  sourceKind: DrawableSourceKind;
  sourceRef?: string;
  validation?: AssetValidationReport;
}

/**
 * Compile a WhiteboardAsset into the Drawable IR. Fail-closed: an asset with
 * zero drawable paths cannot produce an IR (a drawable asset with nothing
 * drawable is an upstream bug, not an empty document), and a validation
 * report for a different assetId is rejected outright.
 */
export function compileDrawableIr(input: DrawableIrCompileInput): DrawableIr {
  const { asset, sourceKind, sourceRef, validation } = input;
  const extracted = input.extracted ?? extractAsset(asset);

  if (validation && validation.assetId !== asset.id) {
    throw new Error(
      `drawable-ir: validation report is for "${validation.assetId}", not "${asset.id}" — refusing to attach foreign receipts`,
    );
  }
  if (extracted.paths.length === 0) {
    throw new Error(`drawable-ir: asset "${asset.id}" has zero drawable paths — nothing to draw, refusing to compile`);
  }

  // Resolved draw order: the explicit drawOrder sequence pins 0..k-1; the
  // unlisted remainder follows document order after the explicit block.
  const explicit = asset.drawOrder ?? [];
  const explicitIndex = new Map(explicit.map((id, i) => [id, i]));
  const unlisted = extracted.paths.filter((p) => !explicitIndex.has(p.id));
  const fallbackStart = explicit.length;
  const orderOf = (id: string): number => {
    const hit = explicitIndex.get(id);
    if (hit !== undefined) return hit;
    const unlistedIndex = unlisted.findIndex((u) => u.id === id);
    return fallbackStart + unlistedIndex;
  };

  const penGroupOf = (pathId: string): string => {
    if (!asset.penGroups) return "default";
    for (const [group, members] of Object.entries(asset.penGroups)) {
      if (members.includes(pathId)) return group;
    }
    return "default";
  };

  const paths: DrawablePathNode[] = extracted.paths.map((p) => {
    const segs = pathSegments(p.d);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const seg of segs) {
      for (const pt of seg.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
    }
    if (!Number.isFinite(minX)) {
      throw new Error(`drawable-ir: path "${p.id}" of asset "${asset.id}" flattened to no points`);
    }
    const first = segs[0].points[0];
    const lastSeg = segs[segs.length - 1];
    const last = lastSeg.points[lastSeg.points.length - 1];
    // Role law: a filled, unstroked path is a fill region; anything stroked
    // (even with fill) is outline — in a whiteboard the drawn line dominates.
    const role: DrawablePathRole = p.fill !== undefined && p.stroke === undefined ? "fill" : "outline";
    return {
      id: p.id,
      d: p.d,
      length: totalLength(segs),
      bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      commands: countPathCommands(p.d),
      start: { x: first.x, y: first.y },
      end: { x: last.x, y: last.y },
      role,
      semanticGroup: penGroupOf(p.id),
      order: orderOf(p.id),
      pen: {
        stroke: p.stroke,
        strokeWidth: p.strokeWidth,
        linecap: p.linecap,
        fill: p.fill,
      },
    };
  });

  const failedChecks = validation ? [...new Set(validation.findings.filter((f) => !f.ok).map((f) => f.check))] : [];

  const ir: DrawableIr = {
    version: DRAWABLE_IR_VERSION,
    assetId: asset.id,
    source: { kind: sourceKind, ref: sourceRef, contentHash: sha256Hex(asset.svg) },
    viewBox: { w: asset.viewBox.w, h: asset.viewBox.h },
    paths,
    texts: extracted.texts.map((t) => ({ id: t.id, content: t.content, x: t.x, y: t.y, size: t.size })),
    rejected: extracted.rejected.map((r) => ({ kind: r.kind, id: r.id, reason: r.reason })),
    validationReceipt: {
      ran: Boolean(validation),
      checksRun: validation ? [...DRAWABLE_IR_CHECKS] : [],
      failedChecks,
      findingCount: validation ? validation.findings.length : 0,
    },
    fingerprint: "",
  };
  ir.fingerprint = computeDrawableIrFingerprint(ir);
  return ir;
}

// ---------- fail-closed parsing ----------

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isHex64(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
}

function fail(msg: string): never {
  throw new Error(`drawable-ir parse: ${msg}`);
}

/**
 * Strict shape validation for a parsed IR document. Every field is checked;
 * unknown versions are rejected before anything else (version-first).
 */
export function validateDrawableIrShape(parsed: unknown): DrawableIr {
  if (typeof parsed !== "object" || parsed === null) fail("document is not an object");
  const doc = parsed as Record<string, unknown>;
  if (doc.version !== DRAWABLE_IR_VERSION) {
    fail(`unsupported version ${String(doc.version)} (this parser speaks version ${DRAWABLE_IR_VERSION})`);
  }
  if (typeof doc.assetId !== "string" || doc.assetId.length === 0) fail("assetId must be a non-empty string");

  if (typeof doc.source !== "object" || doc.source === null) fail("source must be an object");
  const source = doc.source as Record<string, unknown>;
  if (source.kind !== "library" && source.kind !== "traced-upload" && source.kind !== "generated") {
    fail(`source.kind "${String(source.kind)}" is not a known source kind`);
  }
  if (!isHex64(source.contentHash)) fail("source.contentHash must be a 64-char sha256 hex string");
  if (source.ref !== undefined && typeof source.ref !== "string") fail("source.ref must be a string when present");

  if (typeof doc.viewBox !== "object" || doc.viewBox === null) fail("viewBox must be an object");
  const vb = doc.viewBox as Record<string, unknown>;
  if (!isFiniteNumber(vb.w) || !isFiniteNumber(vb.h) || (vb.w as number) <= 0 || (vb.h as number) <= 0) {
    fail("viewBox must carry finite positive w/h");
  }

  if (!Array.isArray(doc.paths) || doc.paths.length === 0) fail("paths must be a non-empty array");
  for (const raw of doc.paths) {
    if (typeof raw !== "object" || raw === null) fail("path node must be an object");
    const p = raw as Record<string, unknown>;
    if (typeof p.id !== "string" || p.id.length === 0) fail("path.id must be a non-empty string");
    if (typeof p.d !== "string" || p.d.length === 0) fail(`path "${String(p.id)}".d must be a non-empty string`);
    if (!isFiniteNumber(p.length) || (p.length as number) < 0) fail(`path "${String(p.id)}".length must be finite >= 0`);
    for (const key of ["bbox", "start", "end"] as const) {
      if (typeof p[key] !== "object" || p[key] === null) fail(`path "${String(p.id)}".${key} must be an object`);
      const box = p[key] as Record<string, unknown>;
      for (const k of Object.keys(box)) {
        if (!isFiniteNumber(box[k])) fail(`path "${String(p.id)}".${key}.${k} must be a finite number`);
      }
    }
    if (p.role !== "outline" && p.role !== "fill") fail(`path "${String(p.id)}".role must be "outline" or "fill"`);
    if (typeof p.semanticGroup !== "string" || p.semanticGroup.length === 0) {
      fail(`path "${String(p.id)}".semanticGroup must be a non-empty string`);
    }
    if (!Number.isInteger(p.order) || (p.order as number) < 0) fail(`path "${String(p.id)}".order must be an integer >= 0`);
    if (typeof p.pen !== "object" || p.pen === null) fail(`path "${String(p.id)}".pen must be an object`);
  }

  if (!Array.isArray(doc.texts)) fail("texts must be an array");
  if (!Array.isArray(doc.rejected)) fail("rejected must be an array");
  for (const raw of doc.rejected) {
    if (typeof raw !== "object" || raw === null) fail("rejected entry must be an object");
    const r = raw as Record<string, unknown>;
    if (r.kind !== "path" && r.kind !== "text") fail(`rejected.kind "${String(r.kind)}" is not path|text`);
    if (typeof r.id !== "string" || typeof r.reason !== "string") fail("rejected entry needs id + reason strings");
  }

  if (typeof doc.validationReceipt !== "object" || doc.validationReceipt === null) {
    fail("validationReceipt must be an object");
  }
  const vr = doc.validationReceipt as Record<string, unknown>;
  if (typeof vr.ran !== "boolean") fail("validationReceipt.ran must be a boolean");
  if (!Array.isArray(vr.checksRun) || !Array.isArray(vr.failedChecks)) {
    fail("validationReceipt.checksRun/failedChecks must be arrays");
  }
  if (!Number.isInteger(vr.findingCount) || (vr.findingCount as number) < 0) {
    fail("validationReceipt.findingCount must be an integer >= 0");
  }

  if (!isHex64(doc.fingerprint)) fail("fingerprint must be a 64-char sha256 hex string");

  return parsed as unknown as DrawableIr;
}

/**
 * Parse + validate + fingerprint-verify a stored IR document. The
 * fingerprint check runs LAST and covers the ENTIRE document: any edited
 * byte — a flipped d command, a rewritten role, a forged content hash —
 * fails the parse.
 */
export function parseDrawableIr(text: string): DrawableIr {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("document is not valid JSON");
  }
  const ir = validateDrawableIrShape(parsed);
  const expected = computeDrawableIrFingerprint(ir);
  if (ir.fingerprint !== expected) {
    fail(`fingerprint mismatch: document says ${ir.fingerprint.slice(0, 12)}…, content hashes to ${expected.slice(0, 12)}…`);
  }
  return ir;
}

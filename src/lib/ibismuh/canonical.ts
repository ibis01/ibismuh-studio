// canonical.ts — THE CANONICAL SERIALIZATION CONTRACT (platform-wide).
//
// One deterministic serializer for every versioned document the studio
// emits: plan envelopes, drawable IRs, audio receipts, manifests. THE LAW:
// object keys sort, numbers go through the fixed-precision formatter,
// arrays keep their declared order (order is CONTRACT, not implementation
// detail), and non-finite numbers throw instead of poisoning a document
// with a NaN that would JSON.stringify to null.
//
// Every contract module (plan-envelope.ts, whiteboard/drawable-ir.ts,
// audio-receipt.ts) serializes through THIS module so two documents can
// never disagree about what "the same bytes" means.

import { createHash } from "node:crypto";

/**
 * Fixed-precision number formatting for the canonical form: integers stay
 * integers, everything else rounds to 6 decimals with negative-zero and
 * sub-microscopic magnitudes normalized to "0". Document geometry and
 * timing live at human scales (milliseconds, viewBox units), so exponent
 * forms never occur after rounding.
 */
export function canonicalNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`canonical: non-finite number ${n} cannot be serialized`);
  if (Number.isInteger(n)) return String(n);
  const r = Number(n.toFixed(6));
  if (Object.is(r, -0) || Math.abs(r) < 1e-6) return "0";
  return String(r);
}

/**
 * Deterministic JSON: object keys sorted, numbers through canonicalNumber.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return canonicalNumber(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const body = keys
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalStringify((value as Record<string, unknown>)[k])}`);
    return `{${body.join(",")}}`;
  }
  throw new Error(`canonical: value of type ${typeof value} cannot be serialized`);
}

/** sha256 hex over a string — the fingerprint primitive every document uses. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

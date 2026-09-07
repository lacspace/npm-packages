/**
 * Internal shared helpers for the additive feature modules.
 *
 * Not part of the public API — intentionally NOT re-exported from `index.ts`.
 * These mirror the private integer-coercion helpers used by the core so that
 * every module enforces the same invariant: units are finite integers.
 */
import { InventoryError } from "./index";

/** Truncate to an integer, rejecting non-finite values. */
export function toCount(n: number, label: string): number {
  const v = Math.trunc(n);
  if (!Number.isFinite(v)) throw new InventoryError(`${label} must be a finite number`);
  return v;
}

/** Require a non-negative integer quantity for an operation. */
export function requireQty(qty: number, label = "qty"): number {
  const q = toCount(qty, label);
  if (q < 0) throw new InventoryError(`${label} must be >= 0`);
  return q;
}

/**
 * Refund tracking — record partial and full refunds against an order and derive
 * how much has been refunded, how much is still refundable, and a refund status.
 *
 * Refunds live on the optional `order.refunds` array, so an order from an older
 * version simply has no refunds until you call {@link recordRefund}. Amounts are
 * integer minor units, clamped so the running total can never exceed the order
 * total. Each refund appends a `refund` event to the timeline (opt out with
 * `event: false`).
 */

import type { Order } from "./index";
import { OrderError, randomOrderId } from "./index";
import { appendEvent, resolveAt, type Clock } from "./timeline";

/** Derived refund status of an order. */
export type RefundStatus = "none" | "partially_refunded" | "refunded";

/** A single, timestamped refund recorded against an order. */
export interface RefundRecord {
  id: string;
  /** Refunded amount in integer minor units (always `> 0`). */
  amount: number;
  /** Epoch milliseconds. */
  at: number;
  /** Optional machine reason (`"customer_request"`, `"damaged"…`). */
  reason?: string;
  /** Optional human note. */
  note?: string;
}

/** Sum of all refunds recorded against the order (integer minor units). */
export function refundedTotal(order: Order): number {
  return (order.refunds ?? []).reduce((s, r) => s + r.amount, 0);
}

/** How much of the order total is still refundable (never negative). */
export function refundableRemaining(order: Order): number {
  return Math.max(0, order.totals.total - refundedTotal(order));
}

/**
 * Derive the order's refund status: `none` (nothing refunded),
 * `refunded` (the whole order total has been refunded), otherwise
 * `partially_refunded`.
 */
export function refundStatus(order: Order): RefundStatus {
  const refunded = refundedTotal(order);
  if (refunded <= 0) return "none";
  if (refunded >= order.totals.total) return "refunded";
  return "partially_refunded";
}

/**
 * Record a refund of `amount` minor units against the order and return a
 * **new** order. Throws `OrderError` with code `"invalid-refund"` (non-positive
 * amount) or `"refund-exceeds-total"` (would push past the refundable
 * remaining).
 */
export function recordRefund(
  order: Order,
  amount: number,
  opts?: {
    at?: number;
    clock?: Clock;
    reason?: string;
    note?: string;
    id?: string;
    event?: boolean;
  },
): Order {
  const amt = Math.trunc(amount);
  if (amt <= 0) {
    throw new OrderError(
      "Refund amount must be a positive integer in minor units.",
      "invalid-refund",
    );
  }
  const remaining = refundableRemaining(order);
  if (amt > remaining) {
    throw new OrderError(
      `Refund of ${amt} exceeds the refundable remaining ${remaining}.`,
      "refund-exceeds-total",
    );
  }
  const at = resolveAt(opts);
  const record: RefundRecord = {
    id: opts?.id ?? randomOrderId({ prefix: "ref" }),
    amount: amt,
    at,
  };
  if (opts?.reason !== undefined) record.reason = opts.reason;
  if (opts?.note !== undefined) record.note = opts.note;
  let next: Order = {
    ...order,
    refunds: [...(order.refunds ?? []), record],
    updatedAt: at,
  };
  if (opts?.event !== false) {
    const event = {
      type: "refund" as const,
      data: { id: record.id, amount: amt, reason: record.reason },
    };
    next = appendEvent(
      next,
      opts?.note !== undefined ? { ...event, note: opts.note } : event,
      { at },
    );
  }
  return next;
}

/**
 * Partial fulfillment — track how much of each line has shipped and derive the
 * order's fulfillment status from the line states.
 *
 * Fulfilled quantity is stored on the optional `line.fulfilledQty` field, so an
 * order from an older version is simply treated as fully unfulfilled until you
 * call {@link fulfillLine} / {@link fulfillItems}. Every op is pure, integer,
 * clamped to the ordered quantity, and appends a `fulfillment` event to the
 * order timeline (opt out with `event: false`).
 */

import type { Order, OrderLine } from "./index";
import { OrderError } from "./index";
import { appendEvent, resolveAt, type Clock } from "./timeline";

/** Fulfillment status of a single line or a whole order. */
export type FulfillmentStatus =
  | "unfulfilled"
  | "partially_fulfilled"
  | "fulfilled";

/** The fulfilled quantity of a line, clamped into `0..qty`. */
export function lineFulfilledQty(line: OrderLine): number {
  return Math.min(line.qty, Math.max(0, Math.trunc(line.fulfilledQty ?? 0)));
}

/** The remaining unfulfilled quantity of a line. */
export function lineRemainingQty(line: OrderLine): number {
  return Math.max(0, line.qty - lineFulfilledQty(line));
}

/** Derive a single line's fulfillment status from its fulfilled quantity. */
export function lineFulfillmentStatus(line: OrderLine): FulfillmentStatus {
  const f = lineFulfilledQty(line);
  if (f <= 0) return "unfulfilled";
  if (f >= line.qty) return "fulfilled";
  return "partially_fulfilled";
}

/**
 * Derive the order's fulfillment status from the sum of its line states:
 * `unfulfilled` (nothing shipped), `fulfilled` (every unit shipped), otherwise
 * `partially_fulfilled`.
 */
export function fulfillmentStatus(order: Order): FulfillmentStatus {
  const lines = order.lines;
  if (lines.length === 0) return "unfulfilled";
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const done = lines.reduce((s, l) => s + lineFulfilledQty(l), 0);
  if (done <= 0) return "unfulfilled";
  if (done >= totalQty) return "fulfilled";
  return "partially_fulfilled";
}

/** Is every unit on every line fulfilled? */
export function isFullyFulfilled(order: Order): boolean {
  return fulfillmentStatus(order) === "fulfilled";
}

/**
 * Fulfill `qty` more units of one line and return a **new** order. Throws
 * `OrderError` with code `"invalid-fulfillment"` (non-positive qty),
 * `"line-not-found"`, or `"fulfillment-exceeds-qty"` (would overrun the line).
 */
export function fulfillLine(
  order: Order,
  lineId: string,
  qty: number,
  opts?: { at?: number; clock?: Clock; note?: string; event?: boolean },
): Order {
  const inc = Math.trunc(qty);
  if (inc <= 0) {
    throw new OrderError(
      "Fulfillment quantity must be a positive integer.",
      "invalid-fulfillment",
    );
  }
  const idx = order.lines.findIndex((l) => l.id === lineId);
  if (idx < 0) {
    throw new OrderError(
      `No line with id "${lineId}" to fulfill.`,
      "line-not-found",
    );
  }
  const line = order.lines[idx]!;
  const current = lineFulfilledQty(line);
  const next = current + inc;
  if (next > line.qty) {
    throw new OrderError(
      `Cannot fulfill ${inc} of "${lineId}"; only ${line.qty - current} remaining.`,
      "fulfillment-exceeds-qty",
    );
  }
  const at = resolveAt(opts);
  const lines = order.lines.map((l, i) =>
    i === idx ? { ...l, fulfilledQty: next } : l,
  );
  let updated: Order = { ...order, lines, updatedAt: at };
  if (opts?.event !== false) {
    const event = { type: "fulfillment" as const, data: { lineId, qty: inc } };
    updated = appendEvent(
      updated,
      opts?.note !== undefined ? { ...event, note: opts.note } : event,
      { at },
    );
  }
  return updated;
}

/**
 * Fulfill several lines at once. Each item is applied in order; if any item is
 * invalid the whole call throws (nothing is returned) so you never persist a
 * half-applied batch. Appends a single `fulfillment` event for the batch.
 */
export function fulfillItems(
  order: Order,
  items: { lineId: string; qty: number }[],
  opts?: { at?: number; clock?: Clock; note?: string; event?: boolean },
): Order {
  const at = resolveAt(opts);
  let o = order;
  for (const it of items) {
    o = fulfillLine(o, it.lineId, it.qty, { at, event: false });
  }
  if (opts?.event !== false && items.length > 0) {
    const event = { type: "fulfillment" as const, data: { items } };
    o = appendEvent(
      o,
      opts?.note !== undefined ? { ...event, note: opts.note } : event,
      { at },
    );
  }
  return o;
}

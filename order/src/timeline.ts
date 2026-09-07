/**
 * Order timeline — a typed, append-only audit trail on an `Order`.
 *
 * Every meaningful thing that happens to an order (a status change, a payment,
 * a fulfillment, a refund, a free-form note) can be recorded as an `OrderEvent`
 * with a timestamp. Events are stored on the optional `order.timeline` array,
 * which is left untouched unless you call {@link appendEvent}, so this is fully
 * backward compatible — an order created by an older version simply has no
 * timeline until you start one.
 *
 * Timestamps are **injectable**: pass an explicit `at` (epoch ms) or a `clock`
 * function so the trail is deterministic in tests and reproducible in replays.
 */

import type { Order } from "./index";

/** The kind of thing an {@link OrderEvent} records. */
export type OrderEventType =
  | "created"
  | "status_changed"
  | "payment"
  | "fulfillment"
  | "refund"
  | "note";

/** A single, timestamped entry in an order's audit-trail timeline. */
export interface OrderEvent {
  type: OrderEventType;
  /** Epoch milliseconds. */
  at: number;
  /** Arbitrary structured payload for the event (amount, lineId, from/to…). */
  data?: Record<string, unknown>;
  /** Optional human note describing the event. */
  note?: string;
}

/** An injectable clock: returns the current time in epoch milliseconds. */
export type Clock = () => number;

/** Resolve a timestamp from an explicit `at`, an injected `clock`, or `Date.now`. */
export function resolveAt(opts?: { at?: number; clock?: Clock }): number {
  if (opts?.at !== undefined) return opts.at;
  if (opts?.clock) return opts.clock();
  return Date.now();
}

/**
 * Append a typed event to an order's timeline and return a **new** order.
 * The original is never mutated. `updatedAt` advances to the event time.
 */
export function appendEvent(
  order: Order,
  event: {
    type: OrderEventType;
    data?: Record<string, unknown>;
    note?: string;
  },
  opts?: { at?: number; clock?: Clock },
): Order {
  const at = resolveAt(opts);
  const full: OrderEvent = { type: event.type, at };
  if (event.data !== undefined) full.data = event.data;
  if (event.note !== undefined) full.note = event.note;
  return {
    ...order,
    timeline: [...(order.timeline ?? []), full],
    updatedAt: at,
  };
}

/** Read the order's timeline (or an empty array if none has been started). */
export function orderTimeline(order: Order): OrderEvent[] {
  return order.timeline ?? [];
}

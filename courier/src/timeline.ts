/**
 * Shipment / tracking-event model: an unordered bag of tracking events in, a
 * chronological summary out — derived current status, is-delivered, estimated
 * vs actual delivery, and an on-time / late verdict. Pure; the "now" clock is
 * injectable so tests are deterministic.
 */
import { isTerminal, type DeliveryStatus } from "./index";
import { toDate } from "./_time";
import type { Carrier } from "./carriers";

/** One scan / event on a shipment's journey. */
export interface TrackingEvent {
  status: DeliveryStatus;
  /** ISO string, epoch-ms number, or `Date`. */
  timestamp: string | number | Date;
  description?: string;
  location?: string;
  /** The raw carrier event, kept for auditing / debugging. */
  raw?: unknown;
}

/** A shipment and its (possibly unordered) tracking events. */
export interface TrackingTimeline {
  trackingId?: string;
  carrier?: Carrier | string;
  events: TrackingEvent[];
  /** Carrier's estimated delivery date (fallback for the on-time check). */
  estimatedDelivery?: string | number | Date;
  /** The date delivery was promised by (takes precedence for on-time). */
  promisedBy?: string | number | Date;
}

/** A derived, chronological view of a `TrackingTimeline`. */
export interface TimelineSummary {
  trackingId?: string;
  carrier?: Carrier | string;
  /** Status of the most recent event (`undefined` if there are none). */
  currentStatus?: DeliveryStatus;
  isDelivered: boolean;
  isTerminal: boolean;
  /** Not yet delivered and already past the promised / estimated date. */
  isLate: boolean;
  /** Events sorted oldest → newest. */
  orderedEvents: TrackingEvent[];
  eventCount: number;
  firstEventAt?: Date;
  lastEventAt?: Date;
  deliveredAt?: Date;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  /** When delivered and a due date exists: whether it landed on time. */
  onTime?: boolean;
}

export interface SummarizeOptions {
  /** Injectable clock (epoch ms); defaults to `Date.now`. */
  now?: () => number;
}

/** Return a new array of `events` sorted oldest → newest by timestamp. */
export function sortTrackingEvents(events: TrackingEvent[]): TrackingEvent[] {
  return [...events].sort(
    (a, b) => toDate(a.timestamp).getTime() - toDate(b.timestamp).getTime(),
  );
}

/**
 * Summarize a `TrackingTimeline` into its derived state. Never mutates the
 * input. The current status is the newest event; delivery is detected from a
 * `delivered` event; the on-time verdict compares the delivery time against
 * `promisedBy` (or `estimatedDelivery`).
 */
export function summarizeTimeline(
  timeline: TrackingTimeline,
  opts: SummarizeOptions = {},
): TimelineSummary {
  const now = opts.now ?? (() => Date.now());
  const events = Array.isArray(timeline.events) ? timeline.events : [];
  const ordered = sortTrackingEvents(events);

  const current = ordered.length ? ordered[ordered.length - 1]!.status : undefined;
  const deliveredEvent = ordered.find((e) => e.status === "delivered");
  const deliveredAt = deliveredEvent ? toDate(deliveredEvent.timestamp) : undefined;
  const isDelivered = current === "delivered" || deliveredAt !== undefined;

  const estimatedDelivery =
    timeline.estimatedDelivery !== undefined ? toDate(timeline.estimatedDelivery) : undefined;
  const due =
    timeline.promisedBy !== undefined ? toDate(timeline.promisedBy) : estimatedDelivery;

  let onTime: boolean | undefined;
  if (isDelivered && deliveredAt && due) onTime = deliveredAt.getTime() <= due.getTime();

  const isLate = !isDelivered && due !== undefined && now() > due.getTime();

  return {
    trackingId: timeline.trackingId,
    carrier: timeline.carrier,
    currentStatus: current,
    isDelivered,
    isTerminal: current !== undefined && isTerminal(current),
    isLate,
    orderedEvents: ordered,
    eventCount: ordered.length,
    firstEventAt: ordered.length ? toDate(ordered[0]!.timestamp) : undefined,
    lastEventAt: ordered.length ? toDate(ordered[ordered.length - 1]!.timestamp) : undefined,
    deliveredAt,
    estimatedDelivery,
    actualDelivery: deliveredAt,
    onTime,
  };
}

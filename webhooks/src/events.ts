/**
 * Event envelope + consumer-side idempotency.
 *
 * A small, typed envelope for the events you send and receive — `id`, `type`,
 * `created` and a typed `data` payload — plus a helper that runs a handler at
 * most once per event id, so a redelivered event is never processed twice.
 */
import { newId, isDuplicate } from "./index";
import type { IdempotencyStore } from "./index";

/**
 * A typed webhook event envelope. `type` is a dotted event name
 * (e.g. `"invoice.paid"`), `created` is a Unix timestamp in seconds, and
 * `data` is your typed payload.
 */
export interface WebhookEvent<T = unknown> {
  id: string;
  type: string;
  /** Unix timestamp in seconds. */
  created: number;
  data: T;
}

export interface CreateEventOptions {
  /** Override the generated id. */
  id?: string;
  /** Override `created` (Unix seconds). Default: now. */
  created?: number;
  /** Prefix for the generated id. Default `"evt"`. */
  idPrefix?: string;
}

/**
 * Build a {@link WebhookEvent} envelope with a fresh id and timestamp.
 *
 * @example
 * const event = createEvent("invoice.paid", { invoiceId: "in_123", amount: 4200 });
 * await deliver(url, event, { secret });
 */
export function createEvent<T>(type: string, data: T, opts: CreateEventOptions = {}): WebhookEvent<T> {
  return {
    id: opts.id ?? newId(opts.idPrefix ?? "evt"),
    type,
    created: opts.created ?? Math.floor(Date.now() / 1000),
    data,
  };
}

/** Narrow-ish runtime check that an unknown value looks like a {@link WebhookEvent}. */
export function isWebhookEvent(value: unknown): value is WebhookEvent {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.type === "string" && typeof e.created === "number" && "data" in e;
}

export interface ProcessOnceResult<R> {
  /** `false` when the event id was already seen within the store's window. */
  processed: boolean;
  /** The handler's return value — present only when `processed` is `true`. */
  result?: R;
}

/**
 * Run `handler` for an event at most once. If the event id is already recorded
 * in `store` (within its retention window) the handler is skipped and
 * `{ processed: false }` is returned; otherwise the id is recorded, the handler
 * runs, and its result is returned.
 *
 * Pair with {@link MemoryIdempotencyStore} (its TTL is the dedupe window) or any
 * {@link IdempotencyStore} (e.g. Redis-backed) in production.
 *
 * @example
 * const { processed } = await processOnce(event, store, async (e) => save(e.data));
 * if (!processed) return ok(); // redelivery — already handled
 */
export async function processOnce<T, R>(
  event: WebhookEvent<T>,
  store: IdempotencyStore,
  handler: (event: WebhookEvent<T>) => R | Promise<R>,
): Promise<ProcessOnceResult<R>> {
  if (await isDuplicate(event.id, store)) return { processed: false };
  const result = await handler(event);
  return { processed: true, result };
}

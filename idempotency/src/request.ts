/**
 * Request-level idempotency helpers (new in 1.1.0).
 *
 * Ties the engine's fingerprint + claim + replay together for the common HTTP
 * shape: hash the request (method + path + body), run the handler at most once,
 * and replay the stored response (status + body) on retries. A repeat of the
 * SAME key with a DIFFERENT request is rejected — the Stripe behaviour.
 *
 * Zero-dependency, isomorphic, storage-agnostic — reuses the core {@link Idempotency}
 * engine and any {@link IdempotencyStore}.
 */

import {
  Idempotency,
  fingerprint,
  type IdempotencyStore,
  type RunOptions,
} from "./index";

/** The minimal request shape used to build a fingerprint. */
export interface RequestLike {
  /** HTTP method (case-insensitive). Defaults to "GET". */
  method?: string;
  /** Request path. `url` is used as a fallback when omitted. */
  path?: string;
  /** Full URL — used as the path when `path` is absent. */
  url?: string;
  /** Parsed request body (any JSON-serialisable value). */
  body?: unknown;
}

/** A replayable HTTP-style response: what we store and hand back on retries. */
export interface IdempotentResponse<T = unknown> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}

export interface WithIdempotencyOptions extends RunOptions {
  /**
   * Engine to run through (bind it to your shared store). When omitted a
   * process-shared in-memory engine is used — good for a single instance,
   * bring a store-backed engine for multi-instance apps.
   */
  idempotency?: Idempotency;
}

export interface WithIdempotencyResult<T> {
  /** The handler's response (fresh) or the replayed stored response. */
  response: IdempotentResponse<T>;
  /** True when `response` was replayed from a prior run, not freshly executed. */
  replayed: boolean;
}

/**
 * Stable fingerprint of a request: method + path + body, order-independent.
 * A mismatch on the same key signals the key was reused with a different request.
 */
export function fingerprintRequest(req: RequestLike): string {
  const method = (req.method ?? "GET").toUpperCase();
  const path = req.path ?? req.url ?? "";
  return fingerprint({ method, path, body: req.body ?? null });
}

/** Shared engine for {@link withIdempotency} when no `idempotency` is supplied. */
let _sharedRequestEngine: Idempotency | undefined;
function sharedRequestEngine(): Idempotency {
  return (_sharedRequestEngine ??= new Idempotency());
}

/**
 * Run `handler` at most once for `key`, keyed to the request. Fingerprints the
 * request (unless `opts.fingerprint` is given), claims the key, and replays the
 * stored response for repeat requests within the store's TTL.
 *
 * - Same key + same request → handler runs once; retries replay the response.
 * - Same key + different request → throws `IdempotencyKeyReuseError`.
 * - Same key in progress → de-duped in-process; across instances it throws
 *   `IdempotencyConflictError` or waits with `{ onConflict: "wait" }`.
 *
 * @example
 * const { response, replayed } = await withIdempotency(
 *   key,
 *   { method: req.method, path: url.pathname, body },
 *   async () => ({ status: 201, body: await createOrder(body) }),
 *   { store },
 * );
 * return Response.json(response.body, { status: response.status });
 */
export async function withIdempotency<T>(
  key: string,
  req: RequestLike,
  handler: () => Promise<IdempotentResponse<T>> | IdempotentResponse<T>,
  opts: WithIdempotencyOptions = {},
): Promise<WithIdempotencyResult<T>> {
  const engine = opts.idempotency ?? sharedRequestEngine();
  const fp = opts.fingerprint ?? fingerprintRequest(req);
  const { value, replayed } = await engine.run<IdempotentResponse<T>>(key, handler, {
    ...opts,
    fingerprint: fp,
  });
  return { response: value, replayed };
}

/**
 * Prune expired records from a store, returning how many were removed. A no-op
 * (returns 0) for stores that don't implement `sweep` — call your backing store's
 * own expiry there instead (e.g. Redis TTLs prune themselves).
 */
export async function sweep(store: IdempotencyStore, now?: number): Promise<number> {
  return store.sweep ? await store.sweep(now) : 0;
}

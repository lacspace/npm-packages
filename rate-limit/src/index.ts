/**
 * @lacspace/rate-limit
 * Framework-agnostic rate limiting for API routes, middleware and edge.
 *
 * Fixed-window, sliding-window and token-bucket algorithms over a pluggable
 * store (in-memory built in; implement `RateLimitStore` for Redis etc.).
 * Returns standard `RateLimit-*` headers.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export type Algorithm = "fixed" | "sliding" | "token-bucket";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the limit resets / a token frees up. */
  reset: number;
  /** Seconds to wait before retrying (0 when allowed). */
  retryAfter: number;
}

export interface RateLimitStore {
  /** Attempt to consume `cost` units for `key`. */
  consume(
    key: string,
    limit: number,
    windowMs: number,
    cost: number,
  ): Promise<{ success: boolean; remaining: number; reset: number }>;
}

/* ------------------------------ memory store ------------------------------ */

interface FixedEntry {
  count: number;
  reset: number;
}
interface BucketEntry {
  tokens: number;
  last: number;
}

export class MemoryStore implements RateLimitStore {
  private fixed = new Map<string, FixedEntry>();
  private windows = new Map<string, number[]>();
  private buckets = new Map<string, BucketEntry>();
  private lastSweep = 0;

  constructor(private algorithm: Algorithm = "fixed") {}

  async consume(key: string, limit: number, windowMs: number, cost: number) {
    const now = Date.now();
    this.sweep(now, windowMs);
    if (this.algorithm === "sliding") return this.sliding(key, limit, windowMs, cost, now);
    if (this.algorithm === "token-bucket") return this.bucket(key, limit, windowMs, cost, now);
    return this.fixedWindow(key, limit, windowMs, cost, now);
  }

  private fixedWindow(key: string, limit: number, windowMs: number, cost: number, now: number) {
    let e = this.fixed.get(key);
    if (!e || now >= e.reset) {
      e = { count: 0, reset: now + windowMs };
      this.fixed.set(key, e);
    }
    const success = e.count + cost <= limit;
    if (success) e.count += cost;
    return { success, remaining: Math.max(0, limit - e.count), reset: e.reset };
  }

  private sliding(key: string, limit: number, windowMs: number, cost: number, now: number) {
    const cutoff = now - windowMs;
    const hits = (this.windows.get(key) ?? []).filter((t) => t > cutoff);
    const success = hits.length + cost <= limit;
    if (success) for (let i = 0; i < cost; i++) hits.push(now);
    this.windows.set(key, hits);
    const oldest = hits[0] ?? now;
    return {
      success,
      remaining: Math.max(0, limit - hits.length),
      reset: oldest + windowMs,
    };
  }

  private bucket(key: string, limit: number, windowMs: number, cost: number, now: number) {
    const rate = limit / windowMs; // tokens per ms
    let e = this.buckets.get(key);
    if (!e) {
      e = { tokens: limit, last: now };
      this.buckets.set(key, e);
    }
    e.tokens = Math.min(limit, e.tokens + (now - e.last) * rate);
    e.last = now;
    const success = e.tokens >= cost;
    if (success) e.tokens -= cost;
    const deficit = Math.max(0, cost - e.tokens);
    return {
      success,
      remaining: Math.floor(e.tokens),
      reset: now + (success ? 0 : Math.ceil(deficit / rate)),
    };
  }

  private sweep(now: number, windowMs: number) {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;
    for (const [k, e] of this.fixed) if (now >= e.reset) this.fixed.delete(k);
    const cutoff = now - windowMs;
    for (const [k, hits] of this.windows) {
      const live = hits.filter((t) => t > cutoff);
      if (live.length) this.windows.set(k, live);
      else this.windows.delete(k);
    }
    for (const [k, e] of this.buckets) if (now - e.last > windowMs * 2) this.buckets.delete(k);
  }
}

/* ------------------------------ limiter ------------------------------ */

export interface RateLimiterOptions {
  /** Max requests per window (or bucket capacity). */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
  algorithm?: Algorithm;
  store?: RateLimitStore;
  /** Prefix for keys (namespacing shared stores). */
  prefix?: string;
}

export class RateLimiter {
  private store: RateLimitStore;
  constructor(private opts: RateLimiterOptions) {
    this.store = opts.store ?? new MemoryStore(opts.algorithm ?? "fixed");
  }

  /** Check (and consume) `cost` units for an identifier (IP, user id, API key…). */
  async check(identifier: string, cost = 1): Promise<RateLimitResult> {
    const key = this.opts.prefix ? `${this.opts.prefix}:${identifier}` : identifier;
    const r = await this.store.consume(key, this.opts.limit, this.opts.windowMs, cost);
    return {
      success: r.success,
      limit: this.opts.limit,
      remaining: r.remaining,
      reset: r.reset,
      retryAfter: r.success ? 0 : Math.max(0, Math.ceil((r.reset - Date.now()) / 1000)),
    };
  }
}

export function rateLimit(opts: RateLimiterOptions): RateLimiter {
  return new RateLimiter(opts);
}

/** Standard response headers for a result (IETF draft `RateLimit-*` + Retry-After). */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(r.limit),
    "RateLimit-Remaining": String(r.remaining),
    "RateLimit-Reset": String(Math.max(0, Math.ceil((r.reset - Date.now()) / 1000))),
  };
  if (!r.success) headers["Retry-After"] = String(r.retryAfter);
  return headers;
}

/* ------------------------------ adapters ------------------------------ */

export type HeadersLike =
  | Request
  | Headers
  | { headers: Headers | Record<string, string | string[] | undefined> }
  | Record<string, string | string[] | undefined>;

function readHeader(src: HeadersLike, name: string): string | undefined {
  const h: unknown = (src as { headers?: unknown }).headers ?? src;
  if (h && typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? undefined;
  const rec = h as Record<string, string | string[] | undefined>;
  const v = rec[name] ?? rec[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

/**
 * Best-effort client IP from common proxy headers (falls back to "unknown").
 *
 * Trusted platform-injected headers (`cf-connecting-ip`, `true-client-ip`) are
 * preferred over `x-forwarded-for`. Note that `x-forwarded-for` is
 * client-spoofable unless your app sits behind a trusted proxy that overwrites
 * it — so it is only used as a fallback here.
 */
export function ipKeyFromRequest(src: HeadersLike): string {
  const trusted =
    readHeader(src, "cf-connecting-ip") ?? readHeader(src, "true-client-ip");
  if (trusted) return trusted.trim();

  const xff = readHeader(src, "x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();

  return (
    readHeader(src, "x-real-ip") ??
    readHeader(src, "fly-client-ip") ??
    (src as { ip?: string }).ip ??
    (src as { socket?: { remoteAddress?: string } }).socket?.remoteAddress ??
    "unknown"
  );
}

/** Check a request against a limiter using a key function (IP by default). */
export function checkRequest(
  limiter: RateLimiter,
  src: HeadersLike,
  keyFn: (src: HeadersLike) => string = ipKeyFromRequest,
  cost = 1,
): Promise<RateLimitResult> {
  return limiter.check(keyFn(src), cost);
}

/** A ready 429 `Response` (Fetch/edge) with `RateLimit-*` + `Retry-After` headers. */
export function rateLimitResponse(result: RateLimitResult, body?: BodyInit): Response {
  return new Response(body ?? JSON.stringify({ error: "rate_limited", retryAfter: result.retryAfter }), {
    status: 429,
    headers: { "content-type": "application/json", ...rateLimitHeaders(result) },
  });
}

/**
 * Fetch/edge guard. Returns a 429 `Response` when blocked, otherwise `null`
 * plus the headers to spread onto your successful response.
 * @example const blocked = await withRateLimit(limiter, req); if (blocked) return blocked;
 */
export async function withRateLimit(
  limiter: RateLimiter,
  src: HeadersLike,
  keyFn: (src: HeadersLike) => string = ipKeyFromRequest,
): Promise<Response | null> {
  const result = await checkRequest(limiter, src, keyFn);
  return result.success ? null : rateLimitResponse(result);
}

/** Minimal Express-style middleware: 429s when over the limit, sets `RateLimit-*` headers. */
export function expressRateLimit(
  limiter: RateLimiter,
  opts: { keyFn?: (src: HeadersLike) => string } = {},
) {
  const keyFn = opts.keyFn ?? ipKeyFromRequest;
  return async (
    req: { headers: Record<string, string | string[] | undefined>; [k: string]: unknown },
    res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (b: unknown) => unknown } },
    next: (err?: unknown) => void,
  ): Promise<void> => {
    const result = await limiter.check(keyFn(req));
    for (const [k, v] of Object.entries(rateLimitHeaders(result))) res.setHeader(k, v);
    if (result.success) next();
    else res.status(429).json({ error: "rate_limited", retryAfter: result.retryAfter });
  };
}

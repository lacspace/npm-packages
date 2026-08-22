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

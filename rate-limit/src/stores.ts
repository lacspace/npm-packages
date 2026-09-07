/**
 * Additional rate-limiting algorithms as standalone `RateLimitStore`s.
 *
 * Each one is opt-in (pass it as `store`) and takes an injectable {@link Clock}
 * so behaviour is fully deterministic in tests. They honour the same
 * `consume(key, limit, windowMs, cost)` contract as the built-in `MemoryStore`,
 * so cost-weighted requests and the pluggable-store design all keep working.
 *
 * @example
 * import { rateLimit } from "@lacspace/rate-limit";
 * import { LeakyBucketStore } from "@lacspace/rate-limit";
 * const limiter = rateLimit({ limit: 10, windowMs: 1000, store: new LeakyBucketStore() });
 */

import { systemClock, type Clock } from "./clock";
import type { RateLimitStore } from "./index";

/* ---------------------------- token bucket ---------------------------- */

export interface TokenBucketStoreOptions {
  /** Injected clock (defaults to the system clock). */
  clock?: Clock;
  /**
   * Tokens added every `intervalMs`. When omitted, the refill rate is derived
   * from the limiter's `limit / windowMs` (same as the built-in token bucket).
   */
  refill?: number;
  /** Interval (ms) over which `refill` tokens are added. */
  intervalMs?: number;
}

interface TBEntry {
  tokens: number;
  last: number;
}

/**
 * Token bucket with an explicit **burst** (capacity = the limiter's `limit`)
 * and a decoupled **refill rate** (`refill` per `intervalMs`). Allows short
 * bursts up to capacity while enforcing a steady long-run rate.
 */
export class TokenBucketStore implements RateLimitStore {
  private map = new Map<string, TBEntry>();
  private clock: Clock;
  private refill?: number;
  private intervalMs?: number;

  constructor(opts: TokenBucketStoreOptions = {}) {
    this.clock = opts.clock ?? systemClock;
    this.refill = opts.refill;
    this.intervalMs = opts.intervalMs;
  }

  async consume(key: string, limit: number, windowMs: number, cost: number) {
    const now = this.clock.now();
    const capacity = limit;
    const rate =
      this.refill != null && this.intervalMs
        ? this.refill / this.intervalMs
        : limit / windowMs; // tokens per ms

    let e = this.map.get(key);
    if (!e) {
      e = { tokens: capacity, last: now };
      this.map.set(key, e);
    }
    e.tokens = Math.min(capacity, e.tokens + (now - e.last) * rate);
    e.last = now;

    const success = e.tokens >= cost;
    if (success) e.tokens -= cost;
    const deficit = Math.max(0, cost - e.tokens);
    return {
      success,
      remaining: Math.max(0, Math.floor(e.tokens)),
      reset: now + (success ? 0 : Math.ceil(deficit / rate)),
    };
  }
}

/* ---------------------------- leaky bucket ---------------------------- */

export interface LeakyBucketStoreOptions {
  clock?: Clock;
}

interface LBEntry {
  level: number;
  last: number;
}

/**
 * Leaky bucket (as a meter): each request adds `cost` to the bucket which then
 * "leaks" at a constant `limit / windowMs` units per ms. Requests are rejected
 * when the bucket would overflow its `limit` capacity — enforcing a smooth,
 * constant outflow rate rather than allowing bursts.
 */
export class LeakyBucketStore implements RateLimitStore {
  private map = new Map<string, LBEntry>();
  private clock: Clock;

  constructor(opts: LeakyBucketStoreOptions = {}) {
    this.clock = opts.clock ?? systemClock;
  }

  async consume(key: string, limit: number, windowMs: number, cost: number) {
    const now = this.clock.now();
    const leakRate = limit / windowMs; // units per ms

    let e = this.map.get(key);
    if (!e) {
      e = { level: 0, last: now };
      this.map.set(key, e);
    }
    e.level = Math.max(0, e.level - (now - e.last) * leakRate);
    e.last = now;

    const success = e.level + cost <= limit;
    if (success) e.level += cost;

    // Time until enough has leaked for this request (blocked) or to fully drain.
    const deficit = success ? e.level : e.level + cost - limit;
    return {
      success,
      remaining: Math.max(0, Math.floor(limit - e.level)),
      reset: now + Math.ceil(deficit / leakRate),
    };
  }
}

/* ----------------------- sliding window counter ----------------------- */

export interface SlidingWindowCounterStoreOptions {
  clock?: Clock;
}

interface SWCEntry {
  windowStart: number;
  count: number;
  prev: number;
}

/**
 * Weighted sliding-window counter — the memory-cheap approximation of a true
 * sliding log. Keeps only the current and previous fixed-window counts and
 * weights the previous window by how much of it still overlaps the rolling
 * window. Smooth like the log algorithm (no burst / double-count at the window
 * edge) but O(1) memory per key.
 */
export class SlidingWindowCounterStore implements RateLimitStore {
  private map = new Map<string, SWCEntry>();
  private clock: Clock;

  constructor(opts: SlidingWindowCounterStoreOptions = {}) {
    this.clock = opts.clock ?? systemClock;
  }

  async consume(key: string, limit: number, windowMs: number, cost: number) {
    const now = this.clock.now();
    const curStart = Math.floor(now / windowMs) * windowMs;

    let e = this.map.get(key);
    if (!e) {
      e = { windowStart: curStart, count: 0, prev: 0 };
      this.map.set(key, e);
    } else if (curStart > e.windowStart) {
      // Roll forward: only an immediately-adjacent window contributes.
      const prev = curStart - e.windowStart === windowMs ? e.count : 0;
      e.windowStart = curStart;
      e.prev = prev;
      e.count = 0;
    }

    const elapsed = now - curStart;
    const weight = (windowMs - elapsed) / windowMs; // 1 → 0 across the window
    const estimated = e.prev * weight + e.count;

    const success = estimated + cost <= limit;
    if (success) e.count += cost;

    const after = e.prev * weight + e.count;
    return {
      success,
      remaining: Math.max(0, Math.floor(limit - after)),
      reset: curStart + windowMs,
    };
  }
}

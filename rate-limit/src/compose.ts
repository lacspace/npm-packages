/**
 * Compose several limiters together.
 *
 * - {@link combineLimiters} enforces multiple limiters at once where the
 *   strictest wins (e.g. "10 / second AND 1000 / day").
 * - {@link routeLimiter} maps route names to their own limiter (per-route caps).
 *
 * Both work with anything shaped like a limiter ({@link LimiterLike}), so a
 * `RateLimiter` and a `CombinedLimiter` are interchangeable.
 */

import type { RateLimitResult } from "./index";

/** Anything that can check-and-consume for an identifier. `RateLimiter` implements this. */
export interface LimiterLike {
  check(identifier: string, cost?: number): Promise<RateLimitResult>;
}

/**
 * Combine limiters so ALL must allow a request; the returned result is the most
 * restrictive one (any block → the blocking result with the longest wait;
 * otherwise the result with the least remaining).
 *
 * Note: every underlying limiter is consulted (and thus consumes) on each call.
 */
export class CombinedLimiter implements LimiterLike {
  private limiters: LimiterLike[];
  constructor(limiters: LimiterLike[]) {
    this.limiters = limiters;
  }

  async check(identifier: string, cost = 1): Promise<RateLimitResult> {
    const results = await Promise.all(this.limiters.map((l) => l.check(identifier, cost)));
    if (!results.length) {
      throw new Error("combineLimiters: at least one limiter is required");
    }
    const blocked = results.filter((r) => !r.success);
    if (blocked.length) {
      return blocked.reduce((a, b) => (b.retryAfter > a.retryAfter ? b : a));
    }
    return results.reduce((a, b) => (b.remaining < a.remaining ? b : a));
  }
}

/** Enforce several limiters at once — the strictest wins. */
export function combineLimiters(...limiters: LimiterLike[]): CombinedLimiter {
  return new CombinedLimiter(limiters);
}

/**
 * Named per-route limiters. Look up the limiter for a route by name and check
 * against it; unknown routes use the optional `fallback` (or throw if none).
 *
 * @example
 * const routes = routeLimiter({
 *   "auth/login": rateLimit({ limit: 5, windowMs: 60_000 }),
 *   "search":     rateLimit({ limit: 30, windowMs: 60_000 }),
 * });
 * await routes.check("search", ip);
 */
export class RouteLimiter {
  private routes: Map<string, LimiterLike>;
  private fallback?: LimiterLike;
  constructor(routes: Record<string, LimiterLike>, fallback?: LimiterLike) {
    this.routes = new Map(Object.entries(routes));
    this.fallback = fallback;
  }

  /** True if a limiter (route-specific or fallback) exists for `route`. */
  has(route: string): boolean {
    return this.routes.has(route) || this.fallback != null;
  }

  async check(route: string, identifier: string, cost = 1): Promise<RateLimitResult> {
    const limiter = this.routes.get(route) ?? this.fallback;
    if (!limiter) throw new Error(`routeLimiter: no limiter for route "${route}"`);
    return limiter.check(identifier, cost);
  }
}

/** Build a {@link RouteLimiter} from a `{ route: limiter }` map (+ optional fallback). */
export function routeLimiter(
  routes: Record<string, LimiterLike>,
  fallback?: LimiterLike,
): RouteLimiter {
  return new RouteLimiter(routes, fallback);
}

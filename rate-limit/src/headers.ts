/**
 * Pure header helpers for a rate-limit result.
 *
 * `rateLimitHeaders` (in index) emits only the IETF draft `RateLimit-*` set.
 * `standardRateLimitHeaders` here additionally emits the widely-deployed legacy
 * `X-RateLimit-*` headers, and is **pure** — pass `now` for a fully
 * deterministic value (defaults to `Date.now()`).
 *
 * Header conventions:
 *  - `RateLimit-Reset` (IETF draft) → seconds until reset (delta).
 *  - `X-RateLimit-Reset` (legacy, GitHub-style) → epoch seconds of reset.
 */

import type { RateLimitResult } from "./index";

export interface StandardHeadersOptions {
  /** "now" in epoch ms, for deterministic output. Defaults to `Date.now()`. */
  now?: number;
  /** Include legacy `X-RateLimit-*` headers (default `true`). */
  legacy?: boolean;
}

/**
 * Compute standard rate-limit response headers from a check result.
 *
 * Emits the IETF draft `RateLimit-Limit/Remaining/Reset` set, the legacy
 * `X-RateLimit-Limit/Remaining/Reset` set (unless `legacy: false`), and
 * `Retry-After` when the request was blocked.
 */
export function standardRateLimitHeaders(
  r: RateLimitResult,
  opts: StandardHeadersOptions = {},
): Record<string, string> {
  const now = opts.now ?? Date.now();
  const legacy = opts.legacy ?? true;
  const resetDeltaSec = Math.max(0, Math.ceil((r.reset - now) / 1000));
  const resetEpochSec = Math.max(0, Math.ceil(r.reset / 1000));

  const headers: Record<string, string> = {
    "RateLimit-Limit": String(r.limit),
    "RateLimit-Remaining": String(r.remaining),
    "RateLimit-Reset": String(resetDeltaSec),
  };
  if (legacy) {
    headers["X-RateLimit-Limit"] = String(r.limit);
    headers["X-RateLimit-Remaining"] = String(r.remaining);
    headers["X-RateLimit-Reset"] = String(resetEpochSec);
  }
  if (!r.success) headers["Retry-After"] = String(r.retryAfter);
  return headers;
}

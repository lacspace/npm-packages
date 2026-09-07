/**
 * Retry with exponential backoff. The decision logic is deliberately pure so it
 * can be unit-tested without ever sleeping or touching the network: given the
 * attempt number and the outcome (a status code, or a thrown transport error),
 * {@link retryDecision} says whether to retry and how long to wait. The actual
 * sleeping is done by the caller (see {@link SendOptions.sleepImpl}).
 */

/** A fully-resolved retry policy. */
export interface RetryPolicy {
  /** Maximum number of *additional* attempts after the first (0 = no retry). */
  retries: number;
  /** Base delay before the first retry, in ms. */
  delayMs: number;
  /** Backoff multiplier applied per attempt (default 2 → exponential). */
  factor: number;
  /** Upper bound on any single backoff delay, in ms. */
  maxDelayMs: number;
  /** Add up-to-half random jitter to each delay (default true). */
  jitter: boolean;
  /** Status codes that count as retryable. */
  statuses: number[];
  /** Retry when the request throws (network error / timeout). */
  retryOnNetworkError: boolean;
}

/** The status codes retried by default — transient/server errors only. */
export const DEFAULT_RETRY_STATUSES: readonly number[] = [408, 425, 429, 500, 502, 503, 504];

/** The zero-retry default policy (backward-compatible no-op). */
export const NO_RETRY: RetryPolicy = {
  retries: 0,
  delayMs: 300,
  factor: 2,
  maxDelayMs: 30_000,
  jitter: true,
  statuses: [...DEFAULT_RETRY_STATUSES],
  retryOnNetworkError: true,
};

/**
 * Resolve a partial policy (or a bare retry count) into a full {@link RetryPolicy}.
 * `undefined` yields {@link NO_RETRY}; a number sets `retries` with defaults.
 */
export function normalizeRetry(input?: Partial<RetryPolicy> | number): RetryPolicy {
  if (input === undefined) return { ...NO_RETRY };
  if (typeof input === "number") {
    return { ...NO_RETRY, retries: Math.max(0, Math.floor(input)) };
  }
  const merged: RetryPolicy = { ...NO_RETRY, ...input };
  merged.retries = Math.max(0, Math.floor(merged.retries));
  if (!Array.isArray(merged.statuses) || merged.statuses.length === 0) {
    merged.statuses = [...DEFAULT_RETRY_STATUSES];
  }
  return merged;
}

/**
 * The backoff delay before the retry that follows a completed attempt.
 * `attempt` is 0-based (the delay before retry #1 uses `attempt = 0`). The delay
 * is `delayMs * factor^attempt`, capped at `maxDelayMs`; with jitter on, a
 * random amount up to half the delay is subtracted, so callers pass a `rand`
 * function for deterministic tests.
 */
export function backoffDelay(attempt: number, policy: RetryPolicy, rand: () => number = Math.random): number {
  const raw = policy.delayMs * Math.pow(policy.factor, Math.max(0, attempt));
  const capped = Math.min(raw, policy.maxDelayMs);
  if (!policy.jitter) return Math.round(capped);
  // Half jitter: keep at least half the delay, add up to the other half.
  const half = capped / 2;
  return Math.round(half + rand() * half);
}

/** What happened on an attempt: a status code, and/or a thrown error. */
export interface RetryOutcome {
  status?: number;
  error?: unknown;
}

/** Whether an outcome is, in principle, retryable under a policy. */
export function isRetryableOutcome(outcome: RetryOutcome, policy: RetryPolicy): boolean {
  if (outcome.error !== undefined) return policy.retryOnNetworkError;
  if (outcome.status !== undefined) return policy.statuses.includes(outcome.status);
  return false;
}

/** The decision after a completed attempt: retry (and wait) or stop. */
export interface RetryVerdict {
  retry: boolean;
  delayMs: number;
  attempt: number;
}

/**
 * Decide whether to retry after attempt number `attempt` (0-based) produced
 * `outcome`. Retries only while `attempt < policy.retries` *and* the outcome is
 * retryable. Pure — no sleeping.
 */
export function retryDecision(
  attempt: number,
  outcome: RetryOutcome,
  policy: RetryPolicy,
  rand: () => number = Math.random,
): RetryVerdict {
  const canRetry = attempt < policy.retries && isRetryableOutcome(outcome, policy);
  return {
    retry: canRetry,
    delayMs: canRetry ? backoffDelay(attempt, policy, rand) : 0,
    attempt,
  };
}

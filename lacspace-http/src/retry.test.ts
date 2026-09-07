import { describe, it, expect } from "vitest";
import {
  normalizeRetry,
  backoffDelay,
  isRetryableOutcome,
  retryDecision,
  DEFAULT_RETRY_STATUSES,
  NO_RETRY,
} from "./retry.js";

describe("normalizeRetry", () => {
  it("defaults to no retries", () => {
    expect(normalizeRetry().retries).toBe(0);
    expect(normalizeRetry()).toEqual(NO_RETRY);
  });

  it("accepts a bare number as the retry count", () => {
    const p = normalizeRetry(3);
    expect(p.retries).toBe(3);
    expect(p.statuses).toEqual([...DEFAULT_RETRY_STATUSES]);
  });

  it("merges a partial policy and clamps negatives", () => {
    const p = normalizeRetry({ retries: -2, delayMs: 100, factor: 3 });
    expect(p.retries).toBe(0);
    expect(p.delayMs).toBe(100);
    expect(p.factor).toBe(3);
  });

  it("falls back to default statuses when an empty list is given", () => {
    expect(normalizeRetry({ statuses: [] }).statuses).toEqual([...DEFAULT_RETRY_STATUSES]);
    expect(normalizeRetry({ statuses: [418] }).statuses).toEqual([418]);
  });
});

describe("backoffDelay", () => {
  const policy = normalizeRetry({ retries: 5, delayMs: 100, factor: 2, jitter: false, maxDelayMs: 1000 });

  it("grows exponentially without jitter", () => {
    expect(backoffDelay(0, policy)).toBe(100);
    expect(backoffDelay(1, policy)).toBe(200);
    expect(backoffDelay(2, policy)).toBe(400);
  });

  it("caps at maxDelayMs", () => {
    expect(backoffDelay(10, policy)).toBe(1000);
  });

  it("applies deterministic half-jitter with an injected rand", () => {
    const jittered = normalizeRetry({ delayMs: 100, factor: 2, jitter: true, maxDelayMs: 1000 });
    // half = 50; with rand()=0 → 50, rand()=1 → 100.
    expect(backoffDelay(0, jittered, () => 0)).toBe(50);
    expect(backoffDelay(0, jittered, () => 1)).toBe(100);
  });
});

describe("isRetryableOutcome", () => {
  const policy = normalizeRetry({ retries: 3, statuses: [503] });

  it("retries a configured status", () => {
    expect(isRetryableOutcome({ status: 503 }, policy)).toBe(true);
    expect(isRetryableOutcome({ status: 200 }, policy)).toBe(false);
  });

  it("retries a thrown error when enabled", () => {
    expect(isRetryableOutcome({ error: new Error("ECONNRESET") }, policy)).toBe(true);
    const noNet = normalizeRetry({ retries: 3, retryOnNetworkError: false });
    expect(isRetryableOutcome({ error: new Error("x") }, noNet)).toBe(false);
  });
});

describe("retryDecision", () => {
  const policy = normalizeRetry({ retries: 2, delayMs: 50, factor: 2, jitter: false });

  it("retries while attempts remain and outcome is retryable", () => {
    expect(retryDecision(0, { status: 500 }, policy)).toMatchObject({ retry: true, delayMs: 50 });
    expect(retryDecision(1, { status: 500 }, policy)).toMatchObject({ retry: true, delayMs: 100 });
  });

  it("stops once the retry budget is exhausted", () => {
    expect(retryDecision(2, { status: 500 }, policy).retry).toBe(false);
  });

  it("does not retry a success", () => {
    expect(retryDecision(0, { status: 200 }, policy)).toMatchObject({ retry: false, delayMs: 0 });
  });

  it("never retries under NO_RETRY", () => {
    expect(retryDecision(0, { status: 500 }, NO_RETRY).retry).toBe(false);
    expect(retryDecision(0, { error: new Error("x") }, NO_RETRY).retry).toBe(false);
  });
});

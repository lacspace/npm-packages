import { test, expect } from "vitest";
import { standardRateLimitHeaders } from "./headers";
import type { RateLimitResult } from "./index";

const allowed: RateLimitResult = { success: true, limit: 100, remaining: 42, reset: 60_000, retryAfter: 0 };
const blocked: RateLimitResult = { success: false, limit: 100, remaining: 0, reset: 60_000, retryAfter: 30 };

test("emits IETF + legacy headers with deterministic values", () => {
  const h = standardRateLimitHeaders(allowed, { now: 30_000 });
  // IETF draft: Reset is a delta in seconds.
  expect(h["RateLimit-Limit"]).toBe("100");
  expect(h["RateLimit-Remaining"]).toBe("42");
  expect(h["RateLimit-Reset"]).toBe("30"); // (60000-30000)/1000
  // Legacy: Reset is epoch seconds.
  expect(h["X-RateLimit-Limit"]).toBe("100");
  expect(h["X-RateLimit-Remaining"]).toBe("42");
  expect(h["X-RateLimit-Reset"]).toBe("60"); // 60000/1000
});

test("Retry-After only present when blocked", () => {
  expect(standardRateLimitHeaders(allowed, { now: 0 })["Retry-After"]).toBeUndefined();
  const h = standardRateLimitHeaders(blocked, { now: 0 });
  expect(h["Retry-After"]).toBe("30");
});

test("legacy headers can be turned off", () => {
  const h = standardRateLimitHeaders(allowed, { now: 0, legacy: false });
  expect(h["X-RateLimit-Limit"]).toBeUndefined();
  expect(h["RateLimit-Limit"]).toBe("100");
});

test("Reset never goes negative once the reset time has passed", () => {
  const h = standardRateLimitHeaders(allowed, { now: 999_999 });
  expect(h["RateLimit-Reset"]).toBe("0");
});

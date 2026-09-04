import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit } from "./index";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

test("fixed window allows up to the limit then blocks; resets after the window", async () => {
  const limiter = rateLimit({ limit: 2, windowMs: 1000, algorithm: "fixed" });
  expect((await limiter.check("ip")).success).toBe(true);
  expect((await limiter.check("ip")).success).toBe(true);
  const blocked = await limiter.check("ip");
  expect(blocked.success).toBe(false);
  expect(blocked.remaining).toBe(0);
  expect(blocked.retryAfter).toBeGreaterThan(0);

  // Advance past the window → counter resets.
  vi.setSystemTime(1001);
  expect((await limiter.check("ip")).success).toBe(true);
});

test("separate identifiers have independent windows", async () => {
  const limiter = rateLimit({ limit: 1, windowMs: 1000, algorithm: "fixed" });
  expect((await limiter.check("a")).success).toBe(true);
  expect((await limiter.check("a")).success).toBe(false);
  expect((await limiter.check("b")).success).toBe(true);
});

test("token-bucket drains then refills over time", async () => {
  // capacity 2, refill 2 tokens / 1000ms → 1 token per 500ms.
  const limiter = rateLimit({ limit: 2, windowMs: 1000, algorithm: "token-bucket" });
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(false); // drained

  vi.setSystemTime(500); // refills ~1 token
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(false);
});

import { test, expect } from "vitest";
import { rateLimit } from "./index";
import { ManualClock } from "./clock";
import { combineLimiters, routeLimiter } from "./compose";

test("combineLimiters: strictest wins (per-second binds before per-day)", async () => {
  const clock = new ManualClock(0);
  const perSec = rateLimit({ limit: 2, windowMs: 1000, clock });
  const perDay = rateLimit({ limit: 1000, windowMs: 86_400_000, clock });
  const combined = combineLimiters(perSec, perDay);

  expect((await combined.check("ip")).success).toBe(true);
  const second = await combined.check("ip");
  expect(second.success).toBe(true);
  // Reported result is the most restrictive (the per-second limiter).
  expect(second.limit).toBe(2);

  const blocked = await combined.check("ip");
  expect(blocked.success).toBe(false);
  expect(blocked.limit).toBe(2); // blocked by the per-second cap
});

test("combineLimiters: allowed only when every limiter allows", async () => {
  const clock = new ManualClock(0);
  const a = rateLimit({ limit: 1, windowMs: 1000, clock });
  const b = rateLimit({ limit: 5, windowMs: 1000, clock });
  const combined = combineLimiters(a, b);
  expect((await combined.check("k")).success).toBe(true);
  expect((await combined.check("k")).success).toBe(false); // a is exhausted
});

test("combineLimiters: remaining is the minimum across limiters", async () => {
  const clock = new ManualClock(0);
  const a = rateLimit({ limit: 3, windowMs: 1000, clock });
  const b = rateLimit({ limit: 10, windowMs: 1000, clock });
  const combined = combineLimiters(a, b);
  const r = await combined.check("k");
  expect(r.success).toBe(true);
  expect(r.remaining).toBe(2); // min(2, 9)
});

test("routeLimiter: each route enforces its own limit independently", async () => {
  const clock = new ManualClock(0);
  const routes = routeLimiter({
    "auth/login": rateLimit({ limit: 1, windowMs: 1000, clock }),
    search: rateLimit({ limit: 3, windowMs: 1000, clock }),
  });

  expect((await routes.check("auth/login", "ip")).success).toBe(true);
  expect((await routes.check("auth/login", "ip")).success).toBe(false);

  // The search route has its own independent budget.
  expect((await routes.check("search", "ip")).success).toBe(true);
  expect((await routes.check("search", "ip")).success).toBe(true);
});

test("routeLimiter: unknown route uses fallback, else throws", async () => {
  const clock = new ManualClock(0);
  const fallback = rateLimit({ limit: 1, windowMs: 1000, clock });
  const withFallback = routeLimiter({ search: rateLimit({ limit: 5, windowMs: 1000, clock }) }, fallback);
  expect((await withFallback.check("anything", "ip")).success).toBe(true);
  expect((await withFallback.check("anything", "ip")).success).toBe(false);

  const noFallback = routeLimiter({ search: rateLimit({ limit: 5, windowMs: 1000, clock }) });
  expect(noFallback.has("missing")).toBe(false);
  await expect(noFallback.check("missing", "ip")).rejects.toThrow(/no limiter/);
});

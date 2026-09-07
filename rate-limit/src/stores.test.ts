import { test, expect } from "vitest";
import { rateLimit } from "./index";
import { ManualClock } from "./clock";
import { TokenBucketStore, LeakyBucketStore, SlidingWindowCounterStore } from "./stores";

test("token bucket: burst up to capacity, then blocks", async () => {
  const clock = new ManualClock(0);
  const limiter = rateLimit({ limit: 5, windowMs: 1000, clock, store: new TokenBucketStore({ clock }) });
  for (let i = 0; i < 5; i++) expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(false); // drained
});

test("token bucket: explicit refill rate over a deterministic timeline", async () => {
  const clock = new ManualClock(0);
  // capacity 5 (limit), refill 1 token / 1000ms — decoupled from windowMs.
  const store = new TokenBucketStore({ clock, refill: 1, intervalMs: 1000 });
  const limiter = rateLimit({ limit: 5, windowMs: 60_000, store });

  for (let i = 0; i < 5; i++) expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(false);

  clock.advance(1000); // +1 token
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(false);

  clock.advance(3000); // +3 tokens (capped well under capacity)
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(false);
});

test("token bucket never refills beyond capacity", async () => {
  const clock = new ManualClock(0);
  const store = new TokenBucketStore({ clock, refill: 1, intervalMs: 1000 });
  const limiter = rateLimit({ limit: 3, windowMs: 60_000, store });
  clock.advance(100_000); // huge idle — must cap at capacity 3
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(false);
});

test("token bucket: cost-weighted consume spends multiple tokens", async () => {
  const clock = new ManualClock(0);
  const limiter = rateLimit({ limit: 10, windowMs: 1000, clock, store: new TokenBucketStore({ clock }) });
  const r = await limiter.check("k", 7);
  expect(r.success).toBe(true);
  expect(r.remaining).toBe(3);
  expect((await limiter.check("k", 4)).success).toBe(false); // only 3 left
  expect((await limiter.check("k", 3)).success).toBe(true);
});

test("leaky bucket: constant outflow, blocks when full then drains", async () => {
  const clock = new ManualClock(0);
  // capacity 3, leaks 3 units / 3000ms = 1 unit / 1000ms.
  const limiter = rateLimit({ limit: 3, windowMs: 3000, clock, store: new LeakyBucketStore({ clock }) });
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(false); // full

  clock.advance(1000); // one unit leaks out
  expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(false);
});

test("leaky bucket: retryAfter reflects time to leak a slot", async () => {
  const clock = new ManualClock(0);
  const limiter = rateLimit({ limit: 2, windowMs: 2000, clock, store: new LeakyBucketStore({ clock }) });
  await limiter.check("k");
  await limiter.check("k");
  const blocked = await limiter.check("k");
  expect(blocked.success).toBe(false);
  expect(blocked.retryAfter).toBe(1); // 1 unit @ 1/1000ms → 1s
});

test("leaky bucket: cost-weighted request must fit remaining capacity", async () => {
  const clock = new ManualClock(0);
  const limiter = rateLimit({ limit: 5, windowMs: 5000, clock, store: new LeakyBucketStore({ clock }) });
  expect((await limiter.check("k", 3)).success).toBe(true);
  expect((await limiter.check("k", 3)).success).toBe(false); // 3+3 > 5
  expect((await limiter.check("k", 2)).success).toBe(true); // 3+2 = 5
});

test("sliding window counter: no double-count at the window boundary", async () => {
  const clock = new ManualClock(0);
  const limiter = rateLimit({
    limit: 10,
    windowMs: 1000,
    store: new SlidingWindowCounterStore({ clock }),
  });
  // Fill the first window completely at t=0.
  for (let i = 0; i < 10; i++) expect((await limiter.check("k")).success).toBe(true);
  expect((await limiter.check("k")).success).toBe(false);

  // Exactly at the next window edge the previous count is weighted fully → still blocked.
  clock.set(1000);
  expect((await limiter.check("k")).success).toBe(false);

  // Halfway through the new window, only ~half of the previous window counts →
  // capacity for ~5 more (10 - 10*0.5).
  clock.set(1500);
  let allowed = 0;
  for (let i = 0; i < 10; i++) if ((await limiter.check("k")).success) allowed++;
  expect(allowed).toBe(5);
});

test("sliding window counter: fully resets after a full window with no traffic", async () => {
  const clock = new ManualClock(0);
  const limiter = rateLimit({
    limit: 4,
    windowMs: 1000,
    store: new SlidingWindowCounterStore({ clock }),
  });
  for (let i = 0; i < 4; i++) await limiter.check("k");
  expect((await limiter.check("k")).success).toBe(false);

  clock.set(2000); // skip an entire empty window → previous contributes 0
  let allowed = 0;
  for (let i = 0; i < 6; i++) if ((await limiter.check("k")).success) allowed++;
  expect(allowed).toBe(4);
});

test("sliding window counter: remaining reflects the weighted estimate", async () => {
  const clock = new ManualClock(0);
  const limiter = rateLimit({
    limit: 10,
    windowMs: 1000,
    store: new SlidingWindowCounterStore({ clock }),
  });
  const r = await limiter.check("k", 4);
  expect(r.success).toBe(true);
  expect(r.remaining).toBe(6);
});

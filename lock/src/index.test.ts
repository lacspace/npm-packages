import { test, expect } from "vitest";
import { lockout, Lockout, MemoryLockStore } from "./index";

test("locks after maxAttempts is exceeded, with exponential backoff", async () => {
  const guard = lockout({ maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 10_000 });
  expect((await guard.record("u")).locked).toBe(false); // 1
  expect((await guard.record("u")).locked).toBe(false); // 2
  expect((await guard.record("u")).locked).toBe(false); // 3 (== max, still allowed)
  const s4 = await guard.record("u"); // 4 → lock (base)
  expect(s4.locked).toBe(true);
  expect(s4.retryAfterMs).toBe(1_000);
  const s5 = await guard.record("u"); // 5 → 2× base
  expect(s5.retryAfterMs).toBe(2_000);
});

test("remaining counts down and reset clears state", async () => {
  const guard = new Lockout({ maxAttempts: 5 });
  expect((await guard.check("u")).remaining).toBe(5);
  await guard.record("u");
  expect((await guard.check("u")).remaining).toBe(4);
  await guard.reset("u");
  expect((await guard.check("u")).remaining).toBe(5);
});

test("MemoryLockStore evicts oldest past maxEntries", async () => {
  const store = new MemoryLockStore({ maxEntries: 2, ttlMs: 60_000 });
  await store.set("a", { attempts: 1, lockedUntil: 0, firstAttempt: Date.now() });
  await store.set("b", { attempts: 1, lockedUntil: 0, firstAttempt: Date.now() });
  await store.set("c", { attempts: 1, lockedUntil: 0, firstAttempt: Date.now() });
  expect(await store.get("a")).toBeUndefined(); // evicted
  expect(await store.get("c")).toBeDefined();
});

import { test, expect } from "vitest";
import { lockout, Lockout, MemoryLockStore } from "./index";

// This test used to assert that the THIRD failure of `maxAttempts: 3` was
// "== max, still allowed" and the lock engaged on the fourth. That granted
// every attacker one free extra guess and contradicted the README ("lock after
// N strikes"), the status object (`remaining: 0` beside `locked: false`) and
// @lacspace/mfa's counting in the same kit. Three strikes means out.
test("locks on the maxAttempts-th failure, with exponential backoff", async () => {
  const guard = lockout({ maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 10_000 });
  expect((await guard.record("u")).locked).toBe(false); // 1
  expect((await guard.record("u")).locked).toBe(false); // 2
  const s3 = await guard.record("u"); // 3 == max → lock (base)
  expect(s3.locked).toBe(true);
  expect(s3.retryAfterMs).toBe(1_000);
  const s4 = await guard.record("u"); // 4 → 2× base
  expect(s4.retryAfterMs).toBe(2_000);
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

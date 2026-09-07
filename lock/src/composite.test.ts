import { test, expect } from "vitest";
import { compositeKey, multiLockout, MultiLockout, Lockout, MemoryLockStore } from "./index";

test("compositeKey joins parts and is collision-safe", () => {
  expect(compositeKey("acct", "1.2.3.4")).toBe("acct|1.2.3.4");
  expect(compositeKey("a|b", "c")).not.toBe(compositeKey("a", "b|c"));
  expect(compositeKey("user", 42)).toBe("user|42");
});

test("composite-key lockout: locks on the account+ip pair", async () => {
  const guard = new Lockout({ maxAttempts: 2, baseDelayMs: 1000 });
  const key = compositeKey("bob", "9.9.9.9");
  await guard.record(key);
  await guard.record(key);
  const s = await guard.record(key); // 3rd > maxAttempts → locked
  expect(s.locked).toBe(true);
  // A different pair is unaffected.
  expect((await guard.check(compositeKey("bob", "8.8.8.8"))).locked).toBe(false);
});

test("MultiLockout blocks when ANY dimension is locked (IP spray)", async () => {
  const ipStore = new MemoryLockStore();
  const guard = multiLockout({
    account: { maxAttempts: 5, baseDelayMs: 60_000 },
    ip: { maxAttempts: 3, baseDelayMs: 60_000, store: ipStore },
  });

  // Attacker sprays 4 different accounts from one IP; each account stays low,
  // but the shared IP dimension crosses its own threshold.
  let last;
  for (const acct of ["a", "b", "c", "d"]) {
    last = await guard.record({ account: acct, ip: "5.5.5.5" });
  }
  expect(last!.locked).toBe(true);
  expect(last!.lockedBy).toContain("ip");
  expect(last!.lockedBy).not.toContain("account");
  expect(last!.dimensions.ip!.locked).toBe(true);
  expect(last!.dimensions.account!.locked).toBe(false);
});

test("MultiLockout combines strictest: max retryAfter, min remaining", async () => {
  const guard = new MultiLockout({
    account: { maxAttempts: 10 },
    ip: { maxAttempts: 2, baseDelayMs: 30_000 },
  });
  await guard.record({ account: "u", ip: "7.7.7.7" });
  await guard.record({ account: "u", ip: "7.7.7.7" });
  const s = await guard.record({ account: "u", ip: "7.7.7.7" });
  expect(s.locked).toBe(true);
  expect(s.retryAfterMs).toBeGreaterThan(0);
  expect(s.remaining).toBe(0); // ip dimension is locked
});

test("MultiLockout reset clears the supplied dimensions", async () => {
  const guard = multiLockout({ account: { maxAttempts: 1 }, ip: { maxAttempts: 1 } });
  await guard.record({ account: "u", ip: "1.1.1.1" });
  await guard.record({ account: "u", ip: "1.1.1.1" });
  expect((await guard.check({ account: "u", ip: "1.1.1.1" })).locked).toBe(true);
  await guard.reset({ account: "u", ip: "1.1.1.1" });
  expect((await guard.check({ account: "u", ip: "1.1.1.1" })).locked).toBe(false);
});

test("MultiLockout only touches dimensions given a key", async () => {
  const guard = multiLockout({ account: { maxAttempts: 1 }, ip: { maxAttempts: 1 } });
  const s = await guard.record({ account: "solo" });
  expect(Object.keys(s.dimensions)).toEqual(["account"]);
  expect(s.dimensions.ip).toBeUndefined();
});

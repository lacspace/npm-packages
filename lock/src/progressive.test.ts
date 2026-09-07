import { test, expect, vi } from "vitest";
import {
  progressiveLockout,
  ProgressiveLockout,
  describe as describeStatus,
  requiresChallenge,
  type LockEvent,
} from "./index";

/** Deterministic, advanceable clock. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("progressive schedule: first tiers are free, later ones lock for longer", async () => {
  const c = clock();
  const guard = progressiveLockout({ schedule: [0, 0, 0, 1_000, 5_000], now: c.now });

  expect((await guard.record("u")).locked).toBe(false); // 1
  expect((await guard.record("u")).locked).toBe(false); // 2
  expect((await guard.record("u")).locked).toBe(false); // 3

  const s4 = await guard.record("u"); // 4 → 1s
  expect(s4.locked).toBe(true);
  expect(s4.retryAfterMs).toBe(1_000);
  expect(s4.nextAttemptAt).toBe(c.now() + 1_000);
  expect(s4.level).toBe("locked");
});

test("injectable clock: retryAfter counts down as time passes", async () => {
  const c = clock();
  const guard = progressiveLockout({ schedule: [0, 5_000], now: c.now });
  await guard.record("u");
  await guard.record("u"); // 2 → 5s lock
  expect((await guard.check("u")).retryAfterMs).toBe(5_000);
  c.advance(2_000);
  expect((await guard.check("u")).retryAfterMs).toBe(3_000);
  c.advance(3_000);
  expect((await guard.check("u")).locked).toBe(false); // lock elapsed
});

test("hard lock after a threshold, longer than the schedule delays", async () => {
  const c = clock();
  const guard = new ProgressiveLockout({
    schedule: [0, 0, 0],
    hardLockAfter: 3,
    hardLockMs: 60_000,
    now: c.now,
  });
  await guard.record("u"); // 1
  await guard.record("u"); // 2
  const s = await guard.record("u"); // 3 → hard
  expect(s.hardLocked).toBe(true);
  expect(s.locked).toBe(true);
  expect(s.level).toBe("hard");
  expect(s.retryAfterMs).toBe(60_000);
  expect(s.remaining).toBe(0);
  // Hard lock does NOT self-reset even after the window lapses.
  c.advance(20 * 60_000);
  expect((await guard.check("u")).hardLocked).toBe(true);
});

test("requiresChallenge crosses a soft threshold before hard lockout", async () => {
  const c = clock();
  const guard = progressiveLockout({
    schedule: [0, 0, 0, 0, 0],
    challengeAfter: 3,
    hardLockAfter: 5,
    now: c.now,
  });
  await guard.record("u"); // 1
  let s = await guard.record("u"); // 2
  expect(s.requiresChallenge).toBe(false);
  expect(requiresChallenge(s)).toBe(false);

  s = await guard.record("u"); // 3 → challenge
  expect(s.requiresChallenge).toBe(true);
  expect(requiresChallenge(s)).toBe(true);
  expect(s.level).toBe("challenge");
  expect(s.hardLocked).toBe(false);
  expect(await guard.requiresChallenge("u")).toBe(true);
});

test("describe() returns the compact UI shape", async () => {
  const c = clock();
  const guard = progressiveLockout({ schedule: [0, 0, 1_000], hardLockAfter: 4, now: c.now });
  await guard.record("u");
  await guard.record("u");
  await guard.record("u"); // 3 → 1s lock
  const d = await guard.describe("u");
  expect(d).toEqual({
    locked: true,
    attemptsRemaining: 1, // hardLockAfter 4 − 3 attempts
    retryAfter: 1_000,
    level: "locked",
  });
  // Pure projection matches the instance method.
  const pure = describeStatus(await guard.check("u"));
  expect(pure).toEqual(d);
});

test("onLock fires exactly once when a key becomes locked", async () => {
  const c = clock();
  const events: LockEvent[] = [];
  const onLock = vi.fn((e: LockEvent) => events.push(e));
  const guard = progressiveLockout({
    schedule: [0, 0, 0],
    hardLockAfter: 3,
    hardLockMs: 30_000,
    now: c.now,
    onLock,
  });
  await guard.record("u"); // 1
  await guard.record("u"); // 2
  await guard.record("u"); // 3 → hard lock (fires)
  await guard.record("u"); // 4 still locked (must NOT fire again)
  expect(onLock).toHaveBeenCalledTimes(1);
  expect(events[0]!.hard).toBe(true);
  expect(events[0]!.key).toBe("u");

  // After reset, a fresh lock notifies again.
  await guard.reset("u");
  await guard.record("u");
  await guard.record("u");
  await guard.record("u");
  expect(onLock).toHaveBeenCalledTimes(2);
});

test("onLock also fires on a plain progressive-delay lock (no hard threshold)", async () => {
  const c = clock();
  const onLock = vi.fn();
  const guard = progressiveLockout({ schedule: [0, 2_000], now: c.now, onLock });
  await guard.record("u"); // free
  await guard.record("u"); // 2s lock → fires
  expect(onLock).toHaveBeenCalledTimes(1);
});

test("empty key state and self-reset behave", async () => {
  const c = clock();
  const guard = progressiveLockout({ schedule: [0, 1_000], windowMs: 10_000, now: c.now });
  expect(await guard.check("fresh")).toMatchObject({ locked: false, level: "none", attempts: 0 });
  await guard.record("u"); // soft
  c.advance(11_000); // window lapses (not locked) → counter self-resets
  const s = await guard.check("u");
  expect(s.attempts).toBe(0);
  expect(s.level).toBe("none");
});

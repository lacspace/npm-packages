import { test, expect } from "vitest";
import { lockout } from "./index";

// `maxAttempts: 3` means three strikes and you are out — how the README reads,
// how a user reads it, and how @lacspace/mfa counts. The lock used to engage
// one failure LATER, granting a free extra guess, while status() reported
// `remaining: 0` beside `locked: false`.
test("the lock engages on the maxAttempts-th failure", async () => {
  const guard = lockout({ maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 4000 });
  expect((await guard.record("u")).locked).toBe(false);
  expect(await guard.record("u")).toMatchObject({ locked: false, remaining: 1 });
  expect(await guard.record("u")).toMatchObject({ locked: true, remaining: 0, retryAfterMs: 500 });
});

test("status is never `remaining: 0` while unlocked", async () => {
  const guard = lockout({ maxAttempts: 2, baseDelayMs: 500 });
  await guard.record("u");
  const s = await guard.check("u");
  expect(s.locked).toBe(false); expect(s.remaining).toBe(1);
});

test("backoff doubles from the first lock and caps at maxDelayMs", async () => {
  const guard = lockout({ maxAttempts: 1, baseDelayMs: 500, maxDelayMs: 1500 });
  const delays: number[] = []; for (let i = 0; i < 4; i++) delays.push((await guard.record("u")).retryAfterMs);
  expect(delays).toEqual([500, 1000, 1500, 1500]);
});

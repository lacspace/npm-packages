import { test, expect } from "vitest";
import {
  evaluateLockout,
  recordFailure,
  recordSuccess,
  initialLockoutState,
  type LockoutPolicy,
} from "./index";

const policy: LockoutPolicy = { maxAttempts: 3, cooldownMs: 30_000 };

test("attempts count down, then lock, then cooldown expires", () => {
  let state = initialLockoutState();
  let t = 0;

  // 3 allowed attempts before lockout
  expect(evaluateLockout(state, policy, t).remaining).toBe(3);
  state = recordFailure(state, policy, t); // 1
  expect(evaluateLockout(state, policy, t).remaining).toBe(2);
  state = recordFailure(state, policy, t); // 2
  expect(evaluateLockout(state, policy, t).remaining).toBe(1);
  state = recordFailure(state, policy, t); // 3 → locked

  const locked = evaluateLockout(state, policy, t);
  expect(locked.allowed).toBe(false);
  expect(locked.remaining).toBe(0);
  expect(locked.retryAfter).toBe(30_000);

  // halfway through cooldown, still locked with less retryAfter
  expect(evaluateLockout(state, policy, t + 10_000).retryAfter).toBe(20_000);

  // after cooldown → allowed again
  const after = evaluateLockout(state, policy, t + 30_000);
  expect(after.allowed).toBe(true);
  expect(after.remaining).toBe(3);
});

test("exponential backoff lengthens repeated lockouts", () => {
  const p: LockoutPolicy = { maxAttempts: 1, cooldownMs: 1_000, backoffFactor: 2 };
  let state = initialLockoutState();

  state = recordFailure(state, p, 0); // 1st lockout, lockCount=1 → cooldown 1000
  expect(evaluateLockout(state, p, 0).retryAfter).toBe(1_000);

  // serve cooldown, fail again → 2nd lockout, cooldown 2000
  state = recordFailure(state, p, 1_000);
  expect(evaluateLockout(state, p, 1_000).retryAfter).toBe(2_000);

  // serve, fail again → 3rd lockout, cooldown 4000
  state = recordFailure(state, p, 3_000);
  expect(evaluateLockout(state, p, 3_000).retryAfter).toBe(4_000);
});

test("maxCooldownMs caps the backoff", () => {
  const p: LockoutPolicy = { maxAttempts: 1, cooldownMs: 1_000, backoffFactor: 10, maxCooldownMs: 5_000 };
  let state = initialLockoutState();
  state = recordFailure(state, p, 0);
  state = recordFailure(state, p, 1_000); // 2nd lockout wants 10_000 → capped 5_000
  expect(evaluateLockout(state, p, 1_000).retryAfter).toBe(5_000);
});

test("rolling window forgets stale failures", () => {
  const p: LockoutPolicy = { maxAttempts: 3, windowMs: 60_000 };
  let state = initialLockoutState();
  state = recordFailure(state, p, 0);
  state = recordFailure(state, p, 1_000);
  // 2 fails, but the window elapses before the next check
  const d = evaluateLockout(state, p, 1_000 + 60_001);
  expect(d.allowed).toBe(true);
  expect(d.remaining).toBe(3);

  // and a new failure after the window starts a fresh run
  state = recordFailure(state, p, 1_000 + 60_001);
  expect(state.fails).toBe(1);
});

test("recordSuccess clears the run and backoff", () => {
  let state = initialLockoutState();
  state = recordFailure(state, policy, 0);
  state = recordFailure(state, policy, 0);
  state = recordSuccess();
  expect(state.fails).toBe(0);
  expect(state.lockCount).toBe(0);
  expect(evaluateLockout(state, policy, 0).remaining).toBe(3);
});

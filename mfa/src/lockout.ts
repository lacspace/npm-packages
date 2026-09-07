/**
 * Lockout / rate-limit policy — a PURE evaluator for failed-attempt lockout with
 * optional exponential backoff and a rolling window. No timers, no storage: you
 * keep the small {@link LockoutStateData} per identity (user, IP, device) and
 * feed it a clock. `evaluateLockout` reads; `recordFailure` / `recordSuccess`
 * return the next state to persist.
 */

/** Tunables for the lockout policy. All optional. */
export interface LockoutPolicy {
  /** Failed attempts allowed before lockout. Default 5. */
  maxAttempts?: number;
  /** Base cooldown (ms) once locked. Default 30_000. */
  cooldownMs?: number;
  /** Multiplier applied per prior lockout (exponential backoff). Default 1 (flat). */
  backoffFactor?: number;
  /** Upper bound (ms) for a backed-off cooldown. */
  maxCooldownMs?: number;
  /**
   * Rolling window (ms): a run of failures is forgotten if this long has passed
   * since the last one (while not currently locked). Unset ⇒ failures never age.
   */
  windowMs?: number;
}

/** The per-identity counter you persist between attempts. */
export interface LockoutStateData {
  /** Consecutive failed attempts in the current run. */
  fails: number;
  /** ms epoch of the most recent failure. */
  lastFailAt?: number;
  /** How many times this identity has crossed into lockout (drives backoff). */
  lockCount?: number;
}

/** The verdict for an attempt. */
export interface LockoutDecision {
  /** True when an attempt is permitted right now. */
  allowed: boolean;
  /** ms until the caller may retry (0 when allowed). */
  retryAfter: number;
  /** Attempts left before lockout (0 when locked). */
  remaining: number;
}

/** A fresh, clean lockout state. */
export function initialLockoutState(): LockoutStateData {
  return { fails: 0, lockCount: 0 };
}

function cooldownFor(policy: LockoutPolicy, lockCount: number): number {
  const base = policy.cooldownMs ?? 30_000;
  const factor = policy.backoffFactor ?? 1;
  const exp = Math.max(0, lockCount - 1);
  let cd = base * Math.pow(factor, exp);
  if (policy.maxCooldownMs != null) cd = Math.min(cd, policy.maxCooldownMs);
  return cd;
}

/**
 * Evaluate whether an attempt is allowed for the given state — pure, given `now`
 * (ms epoch, defaults to `Date.now()`). Returns `{ allowed, retryAfter, remaining }`.
 */
export function evaluateLockout(
  state: LockoutStateData,
  policy: LockoutPolicy = {},
  now: number = Date.now(),
): LockoutDecision {
  const max = policy.maxAttempts ?? 5;
  const fails = state.fails ?? 0;
  const lockCount = state.lockCount ?? 0;
  const lastFailAt = state.lastFailAt;

  if (fails < max) {
    let remaining = max - fails;
    if (policy.windowMs != null && lastFailAt != null && now - lastFailAt > policy.windowMs) {
      remaining = max;
    }
    return { allowed: true, retryAfter: 0, remaining };
  }

  const unlockAt = (lastFailAt ?? now) + cooldownFor(policy, lockCount);
  if (now >= unlockAt) {
    // Cooldown served — a fresh run is available.
    return { allowed: true, retryAfter: 0, remaining: max };
  }
  return { allowed: false, retryAfter: unlockAt - now, remaining: 0 };
}

/**
 * Record one failed attempt and return the next state to persist. Rolls a new
 * run after a served cooldown (keeping `lockCount` for backoff) or after the
 * rolling window elapses, and bumps `lockCount` on the crossing into lockout.
 */
export function recordFailure(
  state: LockoutStateData,
  policy: LockoutPolicy = {},
  now: number = Date.now(),
): LockoutStateData {
  const max = policy.maxAttempts ?? 5;
  let fails = state.fails ?? 0;
  let lockCount = state.lockCount ?? 0;
  const lastFailAt = state.lastFailAt;

  if (fails >= max) {
    // Currently locked; if the cooldown has been served start a fresh run.
    const unlockAt = (lastFailAt ?? now) + cooldownFor(policy, lockCount);
    if (now >= unlockAt) fails = 0;
  } else if (policy.windowMs != null && lastFailAt != null && now - lastFailAt > policy.windowMs) {
    fails = 0;
  }

  fails += 1;
  if (fails === max) lockCount += 1;
  return { fails, lastFailAt: now, lockCount };
}

/** Record a successful attempt — clears the run and any backoff. */
export function recordSuccess(): LockoutStateData {
  return initialLockoutState();
}

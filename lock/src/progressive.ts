/**
 * Progressive / tiered lockout.
 *
 * An alternative to the core {@link Lockout}'s exponential backoff: instead of
 * one growing lock, you supply an explicit delay schedule — e.g.
 * `[0, 0, 0, 1_000, 5_000, 30_000, 300_000]` — so the first few failures are free
 * and each further failure waits progressively longer, with an optional HARD lock
 * once a threshold is crossed. Also surfaces a soft "challenge" threshold so the
 * caller can require a CAPTCHA / step-up BEFORE the hard lockout, an optional
 * `onLock` notify hook (fired exactly once per lock), and `describe()` for UI.
 *
 * Reuses the same {@link AttemptState} shape and pluggable {@link LockStore}, so
 * it is storage-agnostic and shares stores with the core lockout. The clock is
 * injectable (`now`) for deterministic tests. Zero dependencies · isomorphic.
 */
import { type AttemptState, type LockStore, MemoryLockStore } from "./index";

/** Escalating severity of a key's current state, low → high. */
export type LockLevel = "none" | "soft" | "challenge" | "locked" | "hard";

/** Emitted (once per lock) when a key becomes locked, if `onLock` is set. */
export interface LockEvent {
  key: string;
  attempts: number;
  /** Epoch ms the key is locked until. */
  lockedUntil: number;
  level: LockLevel;
  /** True when this is the terminal hard lock. */
  hard: boolean;
  /** Clock value when the lock fired. */
  now: number;
}

export type LockNotifier = (event: LockEvent) => void;

export interface ProgressiveOptions {
  /**
   * Delay (ms) applied AFTER the Nth failed attempt, indexed by attempt−1. The
   * last entry is reused for any further attempts. Default
   * `[0, 0, 0, 1_000, 5_000, 30_000, 300_000]` (3 free, then 1s/5s/30s/5m…).
   */
  schedule?: number[];
  /**
   * Attempt count at/above which the key is HARD-locked for `hardLockMs`. Omit
   * for no hard lock (the schedule alone throttles). Default `undefined`.
   */
  hardLockAfter?: number;
  /** Duration (ms) of the hard lock. Default 86_400_000 (24h). */
  hardLockMs?: number;
  /**
   * Attempt count at/above which a step-up challenge (CAPTCHA/2FA) should be
   * required — the soft threshold before hard lockout. Omit to disable.
   */
  challengeAfter?: number;
  /** Window (ms) after which the counter self-resets when not locked. Default 900000 (15 min). */
  windowMs?: number;
  store?: LockStore;
  /** Fired once when a key becomes locked (soft-delay lock, or hard lock). */
  onLock?: LockNotifier;
  /** Injectable clock (epoch ms). Default `Date.now`. */
  now?: () => number;
}

export interface ProgressiveStatus {
  locked: boolean;
  /** True when the key has reached the terminal hard lock. */
  hardLocked: boolean;
  attempts: number;
  /** Attempts left before the hard lock (or before the last tier, if no hard lock). */
  remaining: number;
  /** ms until the next attempt is allowed (0 when not locked). */
  retryAfterMs: number;
  /** Epoch ms the next attempt is allowed (now when not locked). */
  nextAttemptAt: number;
  /** True once `challengeAfter` is crossed (and not yet hard-locked). */
  requiresChallenge: boolean;
  level: LockLevel;
}

/** The compact UI shape returned by {@link ProgressiveLockout.describe}. */
export interface LockDescription {
  locked: boolean;
  attemptsRemaining: number;
  /** ms until the next attempt is allowed. */
  retryAfter: number;
  level: LockLevel;
}

const DEFAULT_SCHEDULE = [0, 0, 0, 1_000, 5_000, 30_000, 300_000];

export class ProgressiveLockout {
  private store: LockStore;
  private schedule: number[];
  private hardLockAfter?: number;
  private hardLockMs: number;
  private challengeAfter?: number;
  private windowMs: number;
  private onLock?: LockNotifier;
  private clock: () => number;

  constructor(opts: ProgressiveOptions = {}) {
    this.store = opts.store ?? new MemoryLockStore();
    this.schedule = opts.schedule && opts.schedule.length > 0 ? opts.schedule.slice() : DEFAULT_SCHEDULE.slice();
    this.hardLockAfter = opts.hardLockAfter;
    this.hardLockMs = opts.hardLockMs ?? 86_400_000;
    this.challengeAfter = opts.challengeAfter;
    this.windowMs = opts.windowMs ?? 900_000;
    this.onLock = opts.onLock;
    this.clock = opts.now ?? Date.now;
  }

  /** Delay (ms) that applies after `attempts` failures. */
  private delayFor(attempts: number): number {
    if (attempts < 1 || this.schedule.length === 0) return 0;
    const idx = Math.min(attempts - 1, this.schedule.length - 1);
    return this.schedule[idx] ?? 0;
  }

  private isHard(attempts: number): boolean {
    return this.hardLockAfter !== undefined && attempts >= this.hardLockAfter;
  }

  private computeStatus(state: AttemptState | undefined, now: number): ProgressiveStatus {
    if (!state) {
      return {
        locked: false,
        hardLocked: false,
        attempts: 0,
        remaining: this.hardLockAfter ?? this.schedule.length,
        retryAfterMs: 0,
        nextAttemptAt: now,
        requiresChallenge: false,
        level: "none",
      };
    }
    const attempts = state.attempts;
    const hardLocked = this.isHard(attempts);
    const locked = state.lockedUntil > now;
    const retryAfterMs = locked ? state.lockedUntil - now : 0;
    const nextAttemptAt = locked ? state.lockedUntil : now;
    const requiresChallenge =
      !hardLocked && this.challengeAfter !== undefined && attempts >= this.challengeAfter;
    const remaining =
      this.hardLockAfter !== undefined
        ? Math.max(0, this.hardLockAfter - attempts)
        : Math.max(0, this.schedule.length - attempts);

    let level: LockLevel;
    if (hardLocked) level = "hard";
    else if (locked) level = "locked";
    else if (requiresChallenge) level = "challenge";
    else if (attempts > 0) level = "soft";
    else level = "none";

    return {
      locked: locked || hardLocked,
      hardLocked,
      attempts,
      remaining,
      retryAfterMs,
      nextAttemptAt,
      requiresChallenge,
      level,
    };
  }

  private async load(key: string, now: number): Promise<AttemptState | undefined> {
    let state = await this.store.get(key);
    // Self-reset a fully lapsed window (unless a hard lock is still in force).
    if (
      state &&
      now - state.firstAttempt > this.windowMs &&
      state.lockedUntil <= now &&
      !this.isHard(state.attempts)
    ) {
      await this.store.delete(key);
      state = undefined;
    }
    return state;
  }

  /** Current status without recording an attempt. */
  async check(key: string): Promise<ProgressiveStatus> {
    const now = this.clock();
    const state = await this.load(key, now);
    return this.computeStatus(state, now);
  }

  /**
   * Record a failed attempt and return the new status. Not atomic — see the note
   * on {@link Lockout.record}; a shared store should increment atomically.
   */
  async record(key: string): Promise<ProgressiveStatus> {
    const now = this.clock();
    let state = await this.load(key, now);
    if (!state) state = { attempts: 0, lockedUntil: 0, firstAttempt: now };

    state.attempts += 1;
    const hard = this.isHard(state.attempts);
    const dur = hard ? this.hardLockMs : this.delayFor(state.attempts);
    if (dur > 0) state.lockedUntil = now + dur;

    const status = this.computeStatus(state, now);

    // Fire onLock exactly once per lock (guarded by notifiedAt, cleared on reset).
    if (status.locked && state.notifiedAt === undefined) {
      state.notifiedAt = now;
      this.onLock?.({
        key,
        attempts: state.attempts,
        lockedUntil: state.lockedUntil,
        level: status.level,
        hard: status.hardLocked,
        now,
      });
    }

    await this.store.set(key, state);
    return status;
  }

  /** Clear all state for a key (call on successful auth). */
  async reset(key: string): Promise<void> {
    await this.store.delete(key);
  }

  /** Compact status for UI: `{ locked, attemptsRemaining, retryAfter, level }`. */
  async describe(key: string): Promise<LockDescription> {
    return describe(await this.check(key), this.clock());
  }

  /** Whether a step-up challenge (CAPTCHA/2FA) should be required for this key. */
  async requiresChallenge(key: string): Promise<boolean> {
    return (await this.check(key)).requiresChallenge;
  }
}

export function progressiveLockout(opts?: ProgressiveOptions): ProgressiveLockout {
  return new ProgressiveLockout(opts);
}

/**
 * Pure projection of a {@link ProgressiveStatus} into the compact UI shape.
 * `now` is accepted for symmetry but the status already carries the resolved
 * timings, so it is not required.
 */
export function describe(status: ProgressiveStatus, _now?: number): LockDescription {
  return {
    locked: status.locked,
    attemptsRemaining: status.remaining,
    retryAfter: status.retryAfterMs,
    level: status.level,
  };
}

/** Pure check: has the soft challenge threshold been crossed (and not hard-locked)? */
export function requiresChallenge(status: ProgressiveStatus): boolean {
  return status.requiresChallenge;
}

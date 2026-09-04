/**
 * @lacspace/lock
 * Account lockout & brute-force protection ("server lock").
 *
 * Track failed attempts per key (user, IP, email), lock after N strikes with
 * exponential backoff, and reset on success. Pluggable store (in-memory built
 * in; implement `LockStore` for Redis/Mongo).
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export interface AttemptState {
  attempts: number;
  /** Epoch ms the key is locked until (0 = not locked). */
  lockedUntil: number;
  /** Epoch ms of the first attempt in the current window. */
  firstAttempt: number;
}

export interface LockStore {
  get(key: string): Promise<AttemptState | undefined>;
  set(key: string, state: AttemptState): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface MemoryLockStoreOptions {
  /** Hard cap on tracked keys; the oldest are evicted past this. Default 100_000. */
  maxEntries?: number;
  /**
   * ms after an entry's window/lock has fully lapsed before it may be purged on
   * access. Default 3_600_000 (1 hour).
   */
  ttlMs?: number;
}

/**
 * In-memory {@link LockStore}. Bounded so a flood of distinct keys cannot grow it
 * without limit (a DoS vector): fully-expired entries are purged on access, and a
 * hard `maxEntries` cap evicts the oldest keys once exceeded.
 *
 * Fine for a single process; use a shared store (Redis/Mongo) across instances.
 */
export class MemoryLockStore implements LockStore {
  private map = new Map<string, AttemptState>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(opts: MemoryLockStoreOptions = {}) {
    this.maxEntries = opts.maxEntries ?? 100_000;
    this.ttlMs = opts.ttlMs ?? 3_600_000;
  }

  /** Drop entries whose lock has lapsed and that are older than `ttlMs`. */
  private purgeExpired(now: number) {
    for (const [k, s] of this.map) {
      if (s.lockedUntil <= now && now - s.firstAttempt > this.ttlMs) this.map.delete(k);
    }
  }

  async get(key: string) {
    return this.map.get(key);
  }
  async set(key: string, state: AttemptState) {
    this.map.set(key, state);
    if (this.map.size > this.maxEntries) {
      this.purgeExpired(Date.now());
      // Still over the cap? Evict oldest by insertion order until within bounds.
      while (this.map.size > this.maxEntries) {
        const oldest = this.map.keys().next().value;
        if (oldest === undefined) break;
        this.map.delete(oldest);
      }
    }
  }
  async delete(key: string) {
    this.map.delete(key);
  }
}

export interface LockoutOptions {
  /** Failed attempts allowed before locking. Default 5. */
  maxAttempts?: number;
  /** Base lock duration in ms once the threshold is crossed. Default 60000 (1 min). */
  baseDelayMs?: number;
  /** Maximum lock duration in ms. Default 3600000 (1 hour). */
  maxDelayMs?: number;
  /** Window in ms after which the attempt counter resets on its own. Default 900000 (15 min). */
  windowMs?: number;
  store?: LockStore;
}

export interface LockStatus {
  locked: boolean;
  attempts: number;
  /** Attempts left before the next lock (0 when locked). */
  remaining: number;
  /** ms until unlock (0 when not locked). */
  retryAfterMs: number;
}

export class Lockout {
  private store: LockStore;
  private maxAttempts: number;
  private baseDelayMs: number;
  private maxDelayMs: number;
  private windowMs: number;

  constructor(opts: LockoutOptions = {}) {
    this.store = opts.store ?? new MemoryLockStore();
    this.maxAttempts = opts.maxAttempts ?? 5;
    this.baseDelayMs = opts.baseDelayMs ?? 60000;
    this.maxDelayMs = opts.maxDelayMs ?? 3600000;
    this.windowMs = opts.windowMs ?? 900000;
  }

  private lockDuration(attempts: number): number {
    // maxAttempts failures are allowed; locking begins once they're exceeded.
    const over = attempts - this.maxAttempts;
    if (over < 1) return 0;
    return Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (over - 1));
  }

  private status(state: AttemptState | undefined, now: number): LockStatus {
    if (!state) return { locked: false, attempts: 0, remaining: this.maxAttempts, retryAfterMs: 0 };
    const locked = state.lockedUntil > now;
    return {
      locked,
      attempts: state.attempts,
      remaining: locked ? 0 : Math.max(0, this.maxAttempts - state.attempts),
      retryAfterMs: locked ? state.lockedUntil - now : 0,
    };
  }

  /** Current lock status without recording an attempt. */
  async check(key: string): Promise<LockStatus> {
    const now = Date.now();
    let state = await this.store.get(key);
    if (state && now - state.firstAttempt > this.windowMs && state.lockedUntil <= now) {
      await this.store.delete(key);
      state = undefined;
    }
    return this.status(state, now);
  }

  /**
   * Record a failed attempt and return the new status.
   *
   * NOTE: this is a read-modify-write against the store and is therefore not
   * atomic — under concurrent calls for the same key, two records can read the
   * same state and one increment can be lost (a TOCTOU race). {@link MemoryLockStore}
   * is single-process and safe enough, but a production/shared store (Redis, Mongo)
   * MUST implement an atomic increment (e.g. Redis `INCR`/Lua, Mongo `$inc`) to
   * count reliably under load.
   */
  async record(key: string): Promise<LockStatus> {
    const now = Date.now();
    let state = await this.store.get(key);
    if (!state || (now - state.firstAttempt > this.windowMs && state.lockedUntil <= now)) {
      state = { attempts: 0, lockedUntil: 0, firstAttempt: now };
    }
    state.attempts += 1;
    const dur = this.lockDuration(state.attempts);
    if (dur > 0) state.lockedUntil = now + dur;
    await this.store.set(key, state);
    return this.status(state, now);
  }

  /** Clear all state for a key (call on successful auth). */
  async reset(key: string): Promise<void> {
    await this.store.delete(key);
  }
}

export function lockout(opts?: LockoutOptions): Lockout {
  return new Lockout(opts);
}

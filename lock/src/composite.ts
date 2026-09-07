/**
 * Combined-key & multi-dimension lockout.
 *
 * Two additive helpers on top of the core {@link Lockout}, neither of which
 * changes the single-key path:
 *
 * - {@link compositeKey} builds a single composite key from parts (e.g.
 *   `account + ip`) so you can lock on the *pair*.
 * - {@link MultiLockout} tracks several dimensions at once (e.g. per-account AND
 *   per-IP), each with its own {@link Lockout}, and returns the STRICTEST status
 *   — so an attacker spraying many accounts from one IP is throttled by the IP
 *   dimension even while each account's own counter stays low.
 *
 * Zero dependencies · isomorphic · storage-agnostic (each dimension keeps its
 * own store).
 */
import { Lockout, type LockoutOptions, type LockStatus } from "./index";

/**
 * Join parts into one composite lockout key. `|` inside a part is escaped so
 * `["a|b", "c"]` can never collide with `["a", "b|c"]`. Non-string parts are
 * stringified.
 */
export function compositeKey(...parts: Array<string | number>): string {
  return parts.map((p) => String(p).replace(/\|/g, "%7C")).join("|");
}

/** A per-dimension breakdown plus the combined (strictest) view. */
export interface MultiLockStatus extends LockStatus {
  /** Status for each dimension that was supplied a key. */
  dimensions: Record<string, LockStatus>;
  /** Names of the dimensions that are currently locked. */
  lockedBy: string[];
}

/** Map of dimension name → the key to use for that dimension on this call. */
export type DimensionKeys = Record<string, string>;

/**
 * Tracks failed attempts across multiple independent dimensions (e.g.
 * `{ account, ip }`). Every dimension has its own {@link Lockout} (and therefore
 * its own thresholds/store), and a request is blocked if ANY dimension is locked.
 */
export class MultiLockout {
  private guards: Record<string, Lockout>;

  /**
   * @param dims Map of dimension name → a ready {@link Lockout} or the
   * {@link LockoutOptions} to build one. e.g.
   * `{ account: { maxAttempts: 5 }, ip: { maxAttempts: 50 } }`.
   */
  constructor(dims: Record<string, Lockout | LockoutOptions>) {
    this.guards = {};
    for (const name of Object.keys(dims)) {
      const d = dims[name]!;
      this.guards[name] = d instanceof Lockout ? d : new Lockout(d);
    }
  }

  private combine(dimensions: Record<string, LockStatus>): MultiLockStatus {
    const entries = Object.entries(dimensions);
    const lockedBy = entries.filter(([, s]) => s.locked).map(([n]) => n);
    let attempts = 0;
    let remaining = Number.POSITIVE_INFINITY;
    let retryAfterMs = 0;
    for (const [, s] of entries) {
      attempts = Math.max(attempts, s.attempts);
      remaining = Math.min(remaining, s.remaining);
      retryAfterMs = Math.max(retryAfterMs, s.retryAfterMs);
    }
    return {
      locked: lockedBy.length > 0,
      attempts,
      remaining: entries.length === 0 ? 0 : remaining,
      retryAfterMs,
      dimensions,
      lockedBy,
    };
  }

  /** Combined status without recording (only the supplied dimensions are checked). */
  async check(keys: DimensionKeys): Promise<MultiLockStatus> {
    const dimensions: Record<string, LockStatus> = {};
    for (const name of Object.keys(keys)) {
      const guard = this.guards[name];
      if (guard) dimensions[name] = await guard.check(keys[name]!);
    }
    return this.combine(dimensions);
  }

  /** Record ONE failure against every supplied dimension; returns combined status. */
  async record(keys: DimensionKeys): Promise<MultiLockStatus> {
    const dimensions: Record<string, LockStatus> = {};
    for (const name of Object.keys(keys)) {
      const guard = this.guards[name];
      if (guard) dimensions[name] = await guard.record(keys[name]!);
    }
    return this.combine(dimensions);
  }

  /** Clear every supplied dimension (call on successful auth). */
  async reset(keys: DimensionKeys): Promise<void> {
    for (const name of Object.keys(keys)) {
      const guard = this.guards[name];
      if (guard) await guard.reset(keys[name]!);
    }
  }
}

export function multiLockout(dims: Record<string, Lockout | LockoutOptions>): MultiLockout {
  return new MultiLockout(dims);
}

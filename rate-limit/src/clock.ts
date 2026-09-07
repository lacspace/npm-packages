/**
 * Injectable clock — lets every algorithm read "now" from one place so tests can
 * drive a deterministic timeline instead of real wall-clock time / sleeps.
 */

export interface Clock {
  /** Current time in epoch milliseconds. */
  now(): number;
}

/** Default clock backed by `Date.now()`. */
export const systemClock: Clock = { now: () => Date.now() };

/**
 * A controllable clock for tests (and simulations): starts at `start` and only
 * moves when you call `advance`/`set`. Never touches real time.
 *
 * @example
 * const clock = new ManualClock(0);
 * const store = new LeakyBucketStore({ clock });
 * clock.advance(500); // 500ms later
 */
export class ManualClock implements Clock {
  private t: number;
  constructor(start = 0) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  /** Jump to an absolute epoch-ms time. */
  set(ms: number): this {
    this.t = ms;
    return this;
  }
  /** Move forward by `ms` milliseconds (negative values are ignored). */
  advance(ms: number): this {
    if (ms > 0) this.t += ms;
    return this;
  }
}

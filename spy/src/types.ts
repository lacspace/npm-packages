/**
 * Any callable. Used as the constraint that lets every spy preserve the
 * exact parameter and return types of the function it wraps.
 */
export type AnyFn = (...args: any[]) => any;

/** The outcome of a single recorded call. */
export type SpyResult<R> =
  /** The call returned `value` (for `.resolves`, `value` is the returned promise). */
  | { readonly type: "return"; readonly value: R }
  /** The call threw `value` synchronously. */
  | { readonly type: "throw"; readonly value: unknown };

/**
 * A callable spy that records every invocation and can be programmed with
 * canned behaviour. The call signature (parameters + return type) is
 * preserved from the wrapped function `F`.
 *
 * Behaviour resolution order on each call:
 * 1. the FIFO "once" queue ({@link Spy.returnsOnce} etc.), if non-empty;
 * 2. otherwise the default behaviour ({@link Spy.returns}/{@link Spy.callsFake}/… or the original impl);
 * 3. otherwise `undefined`.
 */
export interface Spy<F extends AnyFn = AnyFn> {
  (...args: Parameters<F>): ReturnType<F>;

  /** Recorded argument tuples, one per call, in call order. */
  readonly calls: ReadonlyArray<Parameters<F>>;
  /** Number of times the spy was called. */
  readonly callCount: number;
  /** `true` if the spy was called at least once. */
  readonly called: boolean;
  /** `true` if the spy was called exactly once. */
  readonly calledOnce: boolean;
  /** Argument tuple of the first call, or `undefined` if never called. */
  readonly firstCall: Parameters<F> | undefined;
  /** Argument tuple of the most recent call, or `undefined` if never called. */
  readonly lastCall: Parameters<F> | undefined;
  /** The return/throw outcome of each call, in call order. */
  readonly results: ReadonlyArray<SpyResult<ReturnType<F>>>;

  /** Deep-equality check: was the spy ever called with exactly these args? */
  calledWith(...args: Parameters<F>): boolean;

  /** Clear recorded calls and results. Programmed behaviour is kept. */
  reset(): void;
  /**
   * Restore whatever this spy replaced. For a standalone {@link spy} this is a
   * no-op; for {@link spyOn}/{@link stub} it puts the original member back.
   */
  restore(): void;

  /** Set the default behaviour: return `value`. */
  returns(value: ReturnType<F>): this;
  /** Set the default behaviour: throw `error`. */
  throws(error: unknown): this;
  /** Set the default behaviour: return a promise resolving to `value`. */
  resolves(value?: unknown): this;
  /** Set the default behaviour: return a promise rejecting with `error`. */
  rejects(error?: unknown): this;
  /** Set the default behaviour: delegate to `fn` (called with the spy's `this`). */
  callsFake(fn: F): this;

  /** Queue a one-shot behaviour: the next call returns `value`. FIFO. */
  returnsOnce(value: ReturnType<F>): this;
  /** Queue a one-shot behaviour: the next call resolves to `value`. FIFO. */
  resolvesOnce(value?: unknown): this;
  /** Queue a one-shot behaviour: the next call throws `error`. FIFO. */
  throwsOnce(error: unknown): this;
}

/** Options for {@link spyOn}. */
export interface SpyOnOptions {
  /**
   * Spy on the property's getter or setter instead of a method. When set, the
   * spy wraps `Object.getOwnPropertyDescriptor(obj, key)[accessType]` and calls
   * through to the original accessor by default.
   */
  accessType?: "get" | "set";
}

/**
 * Maps an object type to its mocked shape: every function becomes a {@link Spy}
 * of that function, nested objects are mocked recursively, everything else is
 * left as-is.
 */
export type Mocked<T> = {
  [K in keyof T]: T[K] extends AnyFn
    ? Spy<T[K]>
    : T[K] extends object
      ? Mocked<T[K]>
      : T[K];
};

/** A controllable fake clock returned by {@link useFakeTimers}. */
export interface FakeTimers {
  /** Advance the clock by `ms`, firing every timer that becomes due. */
  tick(ms: number): void;
  /** Alias of {@link FakeTimers.tick} (Jest-style name). */
  advanceTimersByTime(ms: number): void;
  /**
   * Run every scheduled timer until the queue is empty, advancing the clock to
   * each one in turn. Throws if it exceeds a large iteration budget (e.g. a
   * `setInterval` that never gets cleared).
   */
  runAllTimers(): void;
  /**
   * Fire only the timers pending right now (a snapshot), advancing the clock to
   * each. Timers scheduled during execution are not run in this pass — the safe
   * way to drain a recurring `setInterval`.
   */
  runOnlyPendingTimers(): void;
  /** Set the fake wall-clock time (affects `Date`/`Date.now`). Does not fire timers. */
  setSystemTime(date: number | Date): void;
  /** Current fake epoch time in milliseconds (same value as `Date.now()`). */
  now(): number;
  /** Restore the real global timers and `Date`. */
  restore(): void;
}

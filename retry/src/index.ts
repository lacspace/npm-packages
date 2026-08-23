/**
 * @lacspace/retry
 *
 * Resilience for flaky calls — retry with exponential backoff & jitter,
 * per-call timeouts, and a circuit breaker. Zero-dependency, isomorphic,
 * and tiny. Pairs with any fetch / DB / queue call.
 */

export class TimeoutError extends Error {
  readonly code = "timeout";
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms.`);
    this.name = "TimeoutError";
  }
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Aborted"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new Error("Aborted")); }, { once: true });
  });

/* ------------------------------ backoff ------------------------------ */

export interface BackoffOptions {
  /** First delay in ms. Default 300. */
  minDelay?: number;
  /** Max delay in ms. Default 30_000. */
  maxDelay?: number;
  /** Growth multiplier per attempt. Default 2. */
  factor?: number;
  /** Full jitter (delay is randomised in [0, computed]). Default true. */
  jitter?: boolean;
  /** Deterministic random source (0–1) for tests. */
  random?: () => number;
}

/** Compute the backoff delay (ms) for a 0-based attempt number. */
export function backoff(attempt: number, opts: BackoffOptions = {}): number {
  const min = opts.minDelay ?? 300;
  const max = opts.maxDelay ?? 30_000;
  const factor = opts.factor ?? 2;
  const raw = Math.min(max, min * factor ** attempt);
  if (opts.jitter === false) return raw;
  const rnd = opts.random ?? Math.random;
  return Math.floor(rnd() * raw);
}

/* ------------------------------ retry ------------------------------ */

export interface RetryOptions extends BackoffOptions {
  /** Number of retries after the first attempt. Default 3. */
  retries?: number;
  /** Decide whether an error is retryable. Default: always retry. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Called before each retry (for logging/metrics). */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Abort the whole retry loop. */
  signal?: AbortSignal;
  /** Injected sleeper (for tests). */
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Run `fn`, retrying on failure with exponential backoff + jitter.
 *
 * @example
 * const data = await retry(() => fetch(url).then(r => r.json()), {
 *   retries: 4,
 *   shouldRetry: (e) => isTransient(e),
 * });
 */
export async function retry<T>(fn: (attempt: number) => Promise<T> | T, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const shouldRetry = opts.shouldRetry ?? (() => true);
  const doSleep = opts.sleepImpl ?? ((ms: number) => sleep(ms, opts.signal));

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) throw new Error("Aborted");
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt === retries || !shouldRetry(err, attempt)) break;
      const delay = backoff(attempt, opts);
      opts.onRetry?.(err, attempt + 1, delay);
      await doSleep(delay);
    }
  }
  throw lastError;
}

/* ------------------------------ timeout ------------------------------ */

/**
 * Reject with {@link TimeoutError} if `fn` doesn't settle within `ms`. Passes an
 * AbortSignal to `fn` so it can cancel underlying work (e.g. fetch).
 */
export function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ac = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { ac?.abort(); reject(new TimeoutError(ms)); }, ms);
    Promise.resolve(fn(ac?.signal as AbortSignal)).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Combine timeout + retry: retry `fn`, giving each attempt its own timeout. */
export function retryWithTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number, opts: RetryOptions = {}): Promise<T> {
  return retry(() => withTimeout(fn, timeoutMs), opts);
}

/* ------------------------------ circuit breaker ------------------------------ */

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitOpenError extends Error {
  readonly code = "circuit-open";
  constructor() {
    super("Circuit breaker is open; call rejected.");
    this.name = "CircuitOpenError";
  }
}

export interface CircuitOptions {
  /** Consecutive failures before the circuit opens. Default 5. */
  failureThreshold?: number;
  /** How long to stay open before a trial call (ms). Default 30_000. */
  resetTimeoutMs?: number;
  /** Successes needed in half-open to close again. Default 1. */
  successThreshold?: number;
  /** Clock override (ms) for tests. */
  now?: () => number;
}

/**
 * A circuit breaker: after repeated failures it "opens" and fails fast for a
 * cool-down window, then allows a trial call before fully closing again —
 * protecting a struggling dependency from being hammered.
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private openedAt = 0;
  private readonly threshold: number;
  private readonly resetMs: number;
  private readonly successThreshold: number;
  private readonly now: () => number;

  constructor(opts: CircuitOptions = {}) {
    this.threshold = opts.failureThreshold ?? 5;
    this.resetMs = opts.resetTimeoutMs ?? 30_000;
    this.successThreshold = opts.successThreshold ?? 1;
    this.now = opts.now ?? Date.now;
  }

  get current(): CircuitState {
    if (this.state === "open" && this.now() - this.openedAt >= this.resetMs) this.state = "half-open";
    return this.state;
  }

  /** Run `fn` through the breaker. Throws {@link CircuitOpenError} while open. */
  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    if (this.current === "open") throw new CircuitOpenError();
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.successes++;
      if (this.successes >= this.successThreshold) this.reset();
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.successes = 0;
    if (this.state === "half-open" || this.failures >= this.threshold) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }

  /** Force the circuit closed and clear counters. */
  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
  }
}

/**
 * Provider-agnostic retry / backoff / timeout wrappers.
 *
 * These are generic async combinators — they wrap *any* promise-returning
 * function, so you compose them around `chat()` / `stream()` yourself and keep
 * those primitives small. Everything is injectable (the `sleep` clock, the
 * retry predicate) so they're fully testable without real timers or a network.
 *
 * ```ts
 * import { chat, withRetry, withTimeout } from "@lacspace/ai";
 *
 * const res = await withRetry(
 *   () => withTimeout((signal) => chat({ ...opts, signal }), 10_000),
 *   { retries: 3 },
 * );
 * ```
 */

import { AiError } from "./errors.js";

/** Options for {@link withRetry}. All optional. */
export interface RetryOptions {
  /** Max *additional* attempts after the first (default `2` → up to 3 tries). */
  retries?: number;
  /** Base backoff delay in ms (default `250`). */
  minDelayMs?: number;
  /** Maximum backoff delay in ms (default `8000`). */
  maxDelayMs?: number;
  /** Exponential growth factor per attempt (default `2`). */
  factor?: number;
  /** Randomize each delay in `[0, delay]` to avoid thundering herds (default `true`). */
  jitter?: boolean;
  /** Decide whether a thrown error is retryable (default {@link isRetryableError}). */
  retryOn?: (err: unknown, attempt: number) => boolean;
  /** Called before each retry with the error, the upcoming attempt no. and delay. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  /** Injectable clock — return a promise that resolves after `ms` (default real timers). */
  sleep?: (ms: number) => Promise<void>;
  /** Abort the whole retry loop. */
  signal?: AbortSignal;
}

/**
 * Default retry predicate: retry {@link AiError}s that are transient — network
 * failures (`status 0`), rate limits (`429`) and server errors (`>= 500`).
 * Never retries 4xx like `400`/`401`/`404`.
 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof AiError) {
    return err.status === 0 || err.status === 429 || err.status >= 500;
  }
  return false;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn` with exponential backoff, retrying only errors `retryOn` approves.
 * `fn` receives the zero-based attempt number. Rethrows the last error once the
 * attempts are exhausted (or immediately for a non-retryable error).
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const minDelay = opts.minDelayMs ?? 250;
  const maxDelay = opts.maxDelayMs ?? 8000;
  const factor = opts.factor ?? 2;
  const jitter = opts.jitter ?? true;
  const retryOn = opts.retryOn ?? isRetryableError;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) {
      throw new AiError("Retry aborted", { provider: "openai", status: 0 });
    }
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !retryOn(err, attempt)) throw err;
      const base = Math.min(maxDelay, minDelay * Math.pow(factor, attempt));
      const delay = jitter ? Math.random() * base : base;
      opts.onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * Race `fn` against a timeout. `fn` receives an {@link AbortSignal} that fires
 * when the deadline is hit (pass it to `chat`/`fetch` so the request is actually
 * cancelled). Rejects with an `Error` if `ms` elapses first. An optional outer
 * `signal` is chained so an outer abort also cancels `fn`.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  opts: { signal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onOuterAbort, { once: true });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`Operation timed out after ${ms}ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", onOuterAbort);
  }
}

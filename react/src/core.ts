/**
 * @lacspace/react — pure, framework-agnostic core.
 *
 * This module holds everything that does NOT touch React: the async state
 * machine that backs the hooks, auth-status derivation, retry/backoff timing,
 * polling-interval resolution and stable dependency serialization. The React
 * hooks and provider in `index.ts` are thin wrappers over this.
 *
 * Every symbol here is safe to import and unit-test under plain Node — no
 * `react`, no DOM, no `@lacspace/sdk` runtime coupling. All timing/IO is
 * injectable (`sleep`, `random`) so tests never touch the clock or the network.
 *
 * @packageDocumentation
 */

/* ------------------------------------------------------------------ *
 * Async state machine (backs useMutation / any request hook)
 * ------------------------------------------------------------------ */

/** The lifecycle phase of an async operation. */
export type AsyncStatus = "idle" | "loading" | "success" | "error";

/**
 * An immutable snapshot of an async operation's state.
 *
 * @typeParam T - the resolved data type.
 */
export interface AsyncState<T> {
  /** Current lifecycle phase. */
  status: AsyncStatus;
  /** The last successful result, or `undefined`. */
  data: T | undefined;
  /** The last error, or `null`. Always a real `Error`. */
  error: Error | null;
}

/** Actions understood by {@link asyncReducer}. */
export type AsyncAction<T> =
  | { type: "start" }
  | { type: "success"; data: T }
  | { type: "error"; error: unknown }
  | { type: "reset" };

/**
 * Build the starting {@link AsyncState}. Pass `seed` to begin in the `success`
 * phase with pre-populated data (e.g. server-rendered or cached values).
 *
 * @example
 * ```ts
 * initialAsyncState();      // { status: "idle", data: undefined, error: null }
 * initialAsyncState(user);  // { status: "success", data: user, error: null }
 * ```
 */
export function initialAsyncState<T>(seed?: T): AsyncState<T> {
  return seed === undefined
    ? { status: "idle", data: undefined, error: null }
    : { status: "success", data: seed, error: null };
}

/** Coerce any thrown value into a real `Error`. */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * A pure reducer for an async operation. Deterministic and side-effect free, so
 * it drives `useReducer` in the hooks and is trivially unit-testable.
 *
 * - `start`   → `loading` (keeps prior `data`, clears `error`)
 * - `success` → `success` with `data`
 * - `error`   → `error` with a normalized `Error` (keeps prior `data`)
 * - `reset`   → back to `idle`
 *
 * @example
 * ```ts
 * let s = initialAsyncState<number>();
 * s = asyncReducer(s, { type: "start" });          // loading
 * s = asyncReducer(s, { type: "success", data: 1 }); // success, data 1
 * ```
 */
export function asyncReducer<T>(state: AsyncState<T>, action: AsyncAction<T>): AsyncState<T> {
  switch (action.type) {
    case "start":
      return { status: "loading", data: state.data, error: null };
    case "success":
      return { status: "success", data: action.data, error: null };
    case "error":
      return { status: "error", data: state.data, error: toError(action.error) };
    case "reset":
      return { status: "idle", data: undefined, error: null };
    default:
      return state;
  }
}

/** Convenience booleans derived from an {@link AsyncState}'s `status`. */
export interface AsyncFlags {
  isIdle: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}

/**
 * Expand an {@link AsyncState}'s `status` into the four mutually-exclusive
 * boolean flags the hooks expose (`isLoading`, `isSuccess`, …).
 */
export function selectAsyncFlags<T>(state: AsyncState<T>): AsyncFlags {
  return {
    isIdle: state.status === "idle",
    isLoading: state.status === "loading",
    isSuccess: state.status === "success",
    isError: state.status === "error",
  };
}

/* ------------------------------------------------------------------ *
 * Auth-status derivation
 * ------------------------------------------------------------------ */

/** The three states an auth session can be in from a UI's point of view. */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/** `true` when `user` is a non-null value (a signed-in user). */
export function isAuthenticated(user: unknown): boolean {
  return user != null;
}

/**
 * Reduce a `{ user, loading }` pair to a single {@link AuthStatus}. `loading`
 * only wins while there is no user yet — once a user is present the session is
 * `authenticated` even during a background refresh.
 *
 * @example
 * ```ts
 * deriveAuthStatus({ user: null, loading: true });   // "loading"
 * deriveAuthStatus({ user: null, loading: false });  // "unauthenticated"
 * deriveAuthStatus({ user: { id: 1 } });             // "authenticated"
 * ```
 */
export function deriveAuthStatus(input: { user: unknown; loading?: boolean }): AuthStatus {
  if (isAuthenticated(input.user)) return "authenticated";
  return input.loading ? "loading" : "unauthenticated";
}

/* ------------------------------------------------------------------ *
 * Retry + exponential backoff (injectable timing)
 * ------------------------------------------------------------------ */

/** Options for {@link computeBackoff}. */
export interface BackoffOptions {
  /** Delay for the first retry, in ms. Default `1000`. */
  baseDelay?: number;
  /** Multiplier applied per attempt. Default `2` (exponential). */
  factor?: number;
  /** Upper bound for any single delay, in ms. Default `30_000`. */
  maxDelay?: number;
  /** Apply random "full jitter" in `[delay/2, delay]`. Default `false`. */
  jitter?: boolean;
  /** Injectable RNG in `[0,1)` (defaults to `Math.random`) for deterministic tests. */
  random?: () => number;
}

/**
 * Exponential-backoff delay for a zero-based `attempt`, capped at `maxDelay`.
 * With `jitter`, returns a value in `[delay / 2, delay]`.
 *
 * @example
 * ```ts
 * computeBackoff(0); // 1000
 * computeBackoff(1); // 2000
 * computeBackoff(2); // 4000
 * ```
 */
export function computeBackoff(attempt: number, options: BackoffOptions = {}): number {
  const { baseDelay = 1000, factor = 2, maxDelay = 30_000, jitter = false, random = Math.random } =
    options;
  const raw = baseDelay * Math.pow(factor, Math.max(0, attempt));
  const capped = Math.min(raw, maxDelay);
  if (!jitter) return capped;
  return capped / 2 + random() * (capped / 2);
}

/** Options for {@link runWithRetry}. */
export interface RetryOptions extends BackoffOptions {
  /** How many times to retry after the first failure. Default `0` (no retry). */
  retries?: number;
  /**
   * Override the delay between attempts. A number (fixed ms) or a function of the
   * zero-based attempt index. When omitted, {@link computeBackoff} is used.
   */
  retryDelay?: number | ((attempt: number) => number);
  /** Decide per-error whether to keep retrying. Default: retry until `retries`. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Injectable delay (defaults to `setTimeout`). Pass `() => Promise.resolve()` in tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying on rejection up to `retries` times with backoff. All timing
 * is injectable via `sleep`, so tests are instant and deterministic. The last
 * error is re-thrown when every attempt is exhausted (or `shouldRetry` bails).
 *
 * @example
 * ```ts
 * const data = await runWithRetry(() => sdk.ecommerce.getProducts(), { retries: 3 });
 * ```
 */
export async function runWithRetry<T>(
  fn: (attempt: number) => Promise<T> | T,
  options: RetryOptions = {},
): Promise<T> {
  const { retries = 0, retryDelay, shouldRetry, sleep = defaultSleep } = options;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn(attempt);
    } catch (error) {
      const canRetry = attempt < retries && (shouldRetry ? shouldRetry(error, attempt) : true);
      if (!canRetry) throw error;
      const delay =
        typeof retryDelay === "function"
          ? retryDelay(attempt)
          : typeof retryDelay === "number"
            ? retryDelay
            : computeBackoff(attempt, options);
      if (delay > 0) await sleep(delay);
      attempt++;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Polling interval resolution
 * ------------------------------------------------------------------ */

/**
 * A refetch interval: a fixed number of ms, or a function of the latest data
 * that returns the next interval (or `false` to stop polling).
 */
export type RefetchInterval<T> = number | ((data: T | undefined) => number | false);

/** Options for {@link resolveRefetchInterval}. */
export interface ResolveIntervalOptions {
  /** Skip polling entirely when `false`. Default `true`. */
  enabled?: boolean;
  /** Skip polling while the last fetch errored, unless this is `true`. Default `false`. */
  refetchOnError?: boolean;
  /** Whether the last fetch errored. Default `false`. */
  hasError?: boolean;
}

/**
 * Resolve the next poll delay in ms, or `null` when polling should stop. Returns
 * `null` for a disabled interval, a non-positive delay, an interval function that
 * returns `false`, or an errored fetch (unless `refetchOnError`).
 *
 * @example
 * ```ts
 * resolveRefetchInterval(5000, undefined);                 // 5000
 * resolveRefetchInterval((d) => (d ? 1000 : false), data); // 1000 or null
 * ```
 */
export function resolveRefetchInterval<T>(
  interval: RefetchInterval<T> | undefined,
  data: T | undefined,
  options: ResolveIntervalOptions = {},
): number | null {
  const { enabled = true, refetchOnError = false, hasError = false } = options;
  if (!enabled) return null;
  if (hasError && !refetchOnError) return null;
  const ms = typeof interval === "function" ? interval(data) : interval;
  if (ms === false || ms == null) return null;
  return ms > 0 ? ms : null;
}

/* ------------------------------------------------------------------ *
 * Stable dependency serialization
 * ------------------------------------------------------------------ */

/** Recursively stringify a value with object keys sorted, for stable output. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

/**
 * Serialize a hook's dependency array to a stable string, so equivalent deps
 * compare equal regardless of object key order. Useful as a cache/effect key.
 *
 * @example
 * ```ts
 * serializeDeps(["user", { a: 1, b: 2 }]) === serializeDeps(["user", { b: 2, a: 1 }]); // true
 * ```
 */
export function serializeDeps(deps: readonly unknown[]): string {
  return stableStringify(deps);
}

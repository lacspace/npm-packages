/**
 * @lacspace/query — pure, framework-agnostic core.
 *
 * This module holds everything that does NOT touch React: the module-level cache,
 * stable key hashing, request de-duplication / in-flight coalescing, the imperative
 * cache API, retry/backoff math, query-filter matching, invalidation, subscriptions
 * and garbage collection. The React hooks in `index.ts` are thin wrappers over this.
 *
 * Every symbol here is safe to import and unit-test under plain Node — no `react`,
 * no DOM. All network/IO is injected (fetchers, `sleep`) so tests never hit the wire.
 *
 * @packageDocumentation
 */

/**
 * A cache key. Either a plain string, or a (readonly) array that is serialized to a
 * stable string key — object properties are sorted so key order never matters.
 */
export type QueryKey = string | readonly unknown[];

/** A function that resolves the data for a given key. Receives the original key. */
export type QueryFetcher<T> = (key: QueryKey) => Promise<T> | T;

/**
 * A filter that selects cached queries by key, for {@link invalidateQueries} and
 * {@link matchQueryKey}.
 *
 * - A {@link QueryKey} — a string matches that exact string key; an array matches any
 *   entry whose key is an array with the same leading segments (a *prefix* match).
 * - A predicate over the serialized key string.
 * - An object with an optional `key` (prefix match, or exact when `exact: true`) and/or
 *   `predicate`. Both, when given, must match.
 */
export type QueryFilter =
  | QueryKey
  | ((keyStr: string) => boolean)
  | { key?: QueryKey; exact?: boolean; predicate?: (keyStr: string) => boolean };

/**
 * A read-only view of a cached query's state, returned by {@link getQueryState}.
 *
 * @typeParam T - The type of the resolved data.
 */
export interface QueryState<T> {
  /** The current data, or `undefined` if none is cached yet. */
  data: T | undefined;
  /** The last error thrown by the fetcher, or `undefined`. */
  error: unknown;
  /** Epoch ms of the last successful fetch (`0` if never / seeded-stale). */
  updatedAt: number;
  /** `true` whenever a fetch is in flight (including background revalidation). */
  isValidating: boolean;
  /** `true` when the data is older than the supplied `staleTime` (or has never loaded). */
  isStale: boolean;
}

/** Options for {@link runWithRetry} and the `retry`/`retryDelay` query options. */
export interface RetryOptions {
  /** How many times to retry after the first failure. Default `0` (no retry). */
  retries?: number;
  /** Delay between attempts: fixed ms, or a function of the (zero-based) attempt index. */
  retryDelay?: number | ((attempt: number) => number);
  /** Decide per-error whether to keep retrying. Default: always retry until `retries`. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Injectable delay (defaults to `setTimeout`). Pass `() => Promise.resolve()` in tests. */
  sleep?: (ms: number) => Promise<void>;
}

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
  /** Injectable RNG in `[0,1)` (defaults to `Math.random`), for deterministic jitter tests. */
  random?: () => number;
}

/** Immutable view of an entry's public state, shared by all subscribers of a key. */
interface Snapshot<T> {
  data: T | undefined;
  error: unknown;
  isValidating: boolean;
  updatedAt: number;
}

/** Internal, mutable cache record for a single key. */
interface CacheEntry {
  key: QueryKey;
  data: unknown;
  error: unknown;
  isValidating: boolean;
  updatedAt: number;
  promise: Promise<unknown> | null;
  fetcher: QueryFetcher<unknown> | null;
  listeners: Set<() => void>;
  snapshot: Snapshot<unknown>;
}

/* ------------------------------------------------------------------ *
 * Module-level singleton cache + pub/sub
 * ------------------------------------------------------------------ */

const cache = new Map<string, CacheEntry>();

/** A stable snapshot returned for disabled queries so `useSyncExternalStore` never tears. */
export const DISABLED_SNAPSHOT: Snapshot<unknown> = Object.freeze({
  data: undefined,
  error: undefined,
  isValidating: false,
  updatedAt: 0,
});

/** Recursively stringify a value with object keys sorted, for stable array keys. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

/**
 * Serialize any {@link QueryKey} to a stable string. Object properties are sorted, so
 * `["u", { a: 1, b: 2 }]` and `["u", { b: 2, a: 1 }]` produce the same key.
 *
 * @example
 * ```ts
 * serializeQueryKey(["user", 1]); // '["user",1]'
 * ```
 */
export function serializeQueryKey(key: QueryKey): string {
  return typeof key === "string" ? key : stableStringify(key);
}

/** Build a fresh immutable snapshot from an entry's current fields. */
function buildSnapshot(entry: CacheEntry): Snapshot<unknown> {
  return {
    data: entry.data,
    error: entry.error,
    isValidating: entry.isValidating,
    updatedAt: entry.updatedAt,
  };
}

/** Rebuild the snapshot and notify all subscribers of the entry. */
function commit(entry: CacheEntry): void {
  entry.snapshot = buildSnapshot(entry);
  entry.listeners.forEach((l) => l());
}

/**
 * Get (or lazily create) the cache entry for a serialized key. When the original
 * (array) key is supplied it is remembered on the entry, enabling structural
 * {@link matchQueryKey} filtering.
 */
function getEntry(keyStr: string, key?: QueryKey): CacheEntry {
  let entry = cache.get(keyStr);
  if (!entry) {
    entry = {
      key: key ?? keyStr,
      data: undefined,
      error: undefined,
      isValidating: false,
      updatedAt: 0,
      promise: null,
      fetcher: null,
      listeners: new Set(),
      snapshot: DISABLED_SNAPSHOT,
    };
    entry.snapshot = buildSnapshot(entry);
    cache.set(keyStr, entry);
  } else if (key !== undefined && Array.isArray(key)) {
    // Upgrade a string-only key record to the real structured key for matching.
    entry.key = key;
  }
  return entry;
}

/* ------------------------------------------------------------------ *
 * Retry / backoff (pure math)
 * ------------------------------------------------------------------ */

/**
 * Compute an exponential backoff delay (in ms) for a zero-based retry `attempt`.
 * Deterministic unless `jitter` is enabled (inject `random` for reproducible tests).
 *
 * @example
 * ```ts
 * computeBackoff(0); // 1000
 * computeBackoff(1); // 2000
 * computeBackoff(2, { baseDelay: 100, factor: 3 }); // 900
 * ```
 */
export function computeBackoff(attempt: number, options: BackoffOptions = {}): number {
  const base = options.baseDelay ?? 1000;
  const factor = options.factor ?? 2;
  const maxDelay = options.maxDelay ?? 30_000;
  const raw = Math.min(maxDelay, base * Math.pow(factor, Math.max(0, attempt)));
  if (!options.jitter) return raw;
  const rnd = (options.random ?? Math.random)();
  return raw / 2 + rnd * (raw / 2);
}

/**
 * Run `fn`, retrying on rejection with backoff. Resolves with the first success, or
 * rejects with the final error once retries are exhausted. All timing is injectable
 * via `sleep`, so this is fully testable without real timers or network.
 *
 * @example
 * ```ts
 * const data = await runWithRetry(() => api.get(url), {
 *   retries: 3,
 *   sleep: () => Promise.resolve(), // instant, for tests
 * });
 * ```
 */
export async function runWithRetry<T>(
  fn: () => Promise<T> | T,
  options: RetryOptions = {},
): Promise<T> {
  const retries = Math.max(0, options.retries ?? 0);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      if (options.shouldRetry && !options.shouldRetry(err, attempt)) throw err;
      const delay =
        typeof options.retryDelay === "function"
          ? options.retryDelay(attempt)
          : computeBackoff(attempt, { baseDelay: options.retryDelay ?? 1000 });
      await sleep(delay);
      attempt++;
    }
  }
}

/**
 * Core fetch with de-duplication: concurrent calls for the same key reuse the single
 * in-flight promise. On success, data is written and any error cleared; on failure,
 * the error is recorded and the promise re-thrown. An optional {@link RetryOptions}
 * retries a failing fetcher before the entry is marked errored.
 */
export function triggerFetch<T>(
  keyStr: string,
  fetcher: QueryFetcher<T>,
  originalKey: QueryKey,
  retry?: RetryOptions,
): Promise<T> {
  const entry = getEntry(keyStr, originalKey);
  if (entry.promise) return entry.promise as Promise<T>;

  entry.isValidating = true;
  commit(entry);

  const promise = (async () => {
    try {
      const data = retry
        ? await runWithRetry(() => fetcher(originalKey), retry)
        : await fetcher(originalKey);
      entry.data = data;
      entry.error = undefined;
      entry.updatedAt = Date.now();
      return data;
    } catch (err) {
      entry.error = err;
      throw err;
    } finally {
      entry.promise = null;
      entry.isValidating = false;
      commit(entry);
    }
  })();

  entry.promise = promise;
  return promise as Promise<T>;
}

/* ------------------------------------------------------------------ *
 * Imperative cache API (usable without React)
 * ------------------------------------------------------------------ */

/**
 * Read the currently cached data for a key without subscribing.
 *
 * @example
 * ```ts
 * const user = getQueryData<User>(["user", 1]);
 * ```
 */
export function getQueryData<T>(key: QueryKey): T | undefined {
  const entry = cache.get(serializeQueryKey(key));
  return entry ? (entry.data as T | undefined) : undefined;
}

/**
 * Write data into the cache for a key. Accepts a value or an updater function; all
 * mounted components using the key re-render. Any stored error is cleared.
 *
 * @example
 * ```ts
 * setQueryData(["user", 1], { name: "Ada" });
 * setQueryData<number>("count", (prev) => (prev ?? 0) + 1);
 * ```
 */
export function setQueryData<T>(key: QueryKey, data: T | ((prev: T | undefined) => T)): void {
  const entry = getEntry(serializeQueryKey(key), key);
  const next =
    typeof data === "function"
      ? (data as (prev: T | undefined) => T)(entry.data as T | undefined)
      : data;
  entry.data = next;
  entry.error = undefined;
  entry.updatedAt = Date.now();
  commit(entry);
}

/**
 * Globally update and/or revalidate a key (like SWR's `mutate`).
 *
 * - With `data` omitted: revalidate (refetch using the key's last fetcher).
 * - With `data` given: optimistically set it, then revalidate — unless `revalidate:false`.
 *
 * @example
 * ```ts
 * await mutate(["user", 1], { ...user, name: "Grace" });
 * await mutate("todos");                                  // pure revalidation
 * await mutate("todos", newTodos, { revalidate: false }); // optimistic only
 * ```
 */
export async function mutate<T>(
  key: QueryKey,
  data?: T | ((prev: T | undefined) => T),
  options?: { revalidate?: boolean },
): Promise<T | undefined> {
  const keyStr = serializeQueryKey(key);
  const entry = getEntry(keyStr, key);

  if (data !== undefined) {
    setQueryData<T>(key, data);
    if (options?.revalidate === false) return entry.data as T | undefined;
  }

  if (entry.fetcher) {
    try {
      return await triggerFetch<T>(keyStr, entry.fetcher as QueryFetcher<T>, key);
    } catch {
      return entry.data as T | undefined;
    }
  }
  return entry.data as T | undefined;
}

/**
 * Fetch and populate the cache ahead of render — e.g. on route change or hover.
 *
 * @example
 * ```ts
 * await prefetchQuery(["user", id], (k) => api.get(k));
 * ```
 */
export function prefetchQuery<T>(key: QueryKey, fetcher: QueryFetcher<T>): Promise<T> {
  const keyStr = serializeQueryKey(key);
  getEntry(keyStr, key).fetcher = fetcher as QueryFetcher<unknown>;
  return triggerFetch<T>(keyStr, fetcher, key);
}

/**
 * Clear all cached data. Entries with active subscribers are reset (subscribers
 * re-render with empty state); unused entries are removed.
 *
 * @example
 * ```ts
 * clearQueryCache(); // e.g. on logout
 * ```
 */
export function clearQueryCache(): void {
  cache.forEach((entry, keyStr) => {
    entry.data = undefined;
    entry.error = undefined;
    entry.updatedAt = 0;
    entry.promise = null;
    entry.isValidating = false;
    commit(entry);
    if (entry.listeners.size === 0) cache.delete(keyStr);
  });
}

/* ------------------------------------------------------------------ *
 * Inspection, matching, invalidation, subscriptions, GC (new pure API)
 * ------------------------------------------------------------------ */

/** Structural prefix (or exact) match between a filter key and an entry key. */
function partialMatch(filterKey: QueryKey, entryKey: QueryKey, exact: boolean): boolean {
  if (exact) return serializeQueryKey(filterKey) === serializeQueryKey(entryKey);
  if (typeof filterKey === "string") return typeof entryKey === "string" && entryKey === filterKey;
  if (typeof entryKey === "string") return false;
  if (filterKey.length > entryKey.length) return false;
  for (let i = 0; i < filterKey.length; i++) {
    if (stableStringify(filterKey[i]) !== stableStringify(entryKey[i])) return false;
  }
  return true;
}

/**
 * Test whether a query key matches a {@link QueryFilter}. Pure — no cache lookup.
 *
 * @example
 * ```ts
 * matchQueryKey(["user", 1], ["user"]);                 // true (prefix)
 * matchQueryKey(["user", 1], { key: ["user"], exact: true }); // false
 * matchQueryKey("todos", (k) => k.startsWith("to"));    // true
 * ```
 */
export function matchQueryKey(entryKey: QueryKey, filter: QueryFilter): boolean {
  if (typeof filter === "function") return filter(serializeQueryKey(entryKey));
  if (typeof filter === "string" || Array.isArray(filter)) {
    return partialMatch(filter as QueryKey, entryKey, false);
  }
  const f = filter as { key?: QueryKey; exact?: boolean; predicate?: (keyStr: string) => boolean };
  if (f.predicate && !f.predicate(serializeQueryKey(entryKey))) return false;
  if (f.key !== undefined && !partialMatch(f.key, entryKey, f.exact ?? false)) return false;
  return true;
}

/**
 * Read the full state for a key without subscribing. `isStale` is computed against
 * the supplied `staleTime` (default `0` — anything not fetched this instant is stale).
 *
 * @example
 * ```ts
 * const s = getQueryState<User>(["user", 1], 30_000);
 * if (s && !s.isStale) render(s.data);
 * ```
 */
export function getQueryState<T>(key: QueryKey, staleTime = 0): QueryState<T> | undefined {
  const entry = cache.get(serializeQueryKey(key));
  if (!entry) return undefined;
  const isStale = entry.updatedAt === 0 || Date.now() - entry.updatedAt >= staleTime;
  return {
    data: entry.data as T | undefined,
    error: entry.error,
    updatedAt: entry.updatedAt,
    isValidating: entry.isValidating,
    isStale,
  };
}

/** The serialized keys of every entry currently in the cache. */
export function getQueryKeys(): string[] {
  return [...cache.keys()];
}

/**
 * Subscribe to changes for a key from outside React. The listener fires on every
 * commit (fetch start/finish, `setQueryData`, invalidation) with the latest state.
 * Returns an unsubscribe function.
 *
 * @example
 * ```ts
 * const off = subscribeQuery(["user", 1], (s) => console.log(s.data));
 * // ...later
 * off();
 * ```
 */
export function subscribeQuery<T>(
  key: QueryKey,
  listener: (state: QueryState<T>) => void,
): () => void {
  const entry = getEntry(serializeQueryKey(key), key);
  const wrapped = () => listener(getQueryState<T>(key)!);
  entry.listeners.add(wrapped);
  return () => {
    entry.listeners.delete(wrapped);
  };
}

/**
 * Remove a single cached query. If it has active subscribers they are reset to empty
 * state (and re-render); an unsubscribed entry is deleted outright. Returns `true` if
 * an entry existed.
 *
 * @example
 * ```ts
 * removeQuery(["user", 1]);
 * ```
 */
export function removeQuery(key: QueryKey): boolean {
  const keyStr = serializeQueryKey(key);
  const entry = cache.get(keyStr);
  if (!entry) return false;
  if (entry.listeners.size > 0) {
    entry.data = undefined;
    entry.error = undefined;
    entry.updatedAt = 0;
    entry.promise = null;
    entry.isValidating = false;
    commit(entry);
  } else {
    cache.delete(keyStr);
  }
  return true;
}

/**
 * Mark matching queries stale and (by default) refetch those that have a fetcher.
 * With no `filter`, every entry matches. Pass `{ refetch: false }` to only mark stale.
 * Resolves once any triggered refetches settle (their errors are swallowed).
 *
 * @example
 * ```ts
 * await invalidateQueries(["user"]);              // refetch all ["user", …] entries
 * await invalidateQueries("todos", { refetch: false }); // just mark stale
 * ```
 */
export function invalidateQueries(
  filter?: QueryFilter,
  options?: { refetch?: boolean },
): Promise<void> {
  const doRefetch = options?.refetch !== false;
  const jobs: Promise<unknown>[] = [];
  cache.forEach((entry) => {
    if (filter !== undefined && !matchQueryKey(entry.key, filter)) return;
    entry.updatedAt = 0; // mark stale
    commit(entry);
    if (doRefetch && entry.fetcher && !entry.promise) {
      jobs.push(
        triggerFetch(serializeQueryKey(entry.key), entry.fetcher, entry.key).catch(() => undefined),
      );
    }
  });
  return Promise.all(jobs).then(() => undefined);
}

/**
 * Garbage-collect idle cache entries. Removes entries that have no active subscribers
 * and no in-flight fetch, and whose data is older than `maxAge` ms (never-loaded
 * entries are always eligible). `now` is injectable for deterministic tests. Returns
 * the number of entries removed.
 *
 * @example
 * ```ts
 * gcQueries({ maxAge: 5 * 60_000 }); // drop unused queries older than 5 min
 * ```
 */
export function gcQueries(options?: { maxAge?: number; now?: number }): number {
  const maxAge = options?.maxAge ?? 0;
  const now = options?.now ?? Date.now();
  let removed = 0;
  cache.forEach((entry, keyStr) => {
    if (entry.listeners.size > 0 || entry.promise) return;
    if (entry.updatedAt !== 0 && now - entry.updatedAt < maxAge) return;
    cache.delete(keyStr);
    removed++;
  });
  return removed;
}

/* ------------------------------------------------------------------ *
 * Internal wiring shared with the React hooks (not part of the public API)
 * ------------------------------------------------------------------ */

/** @internal */
export const __internal = {
  getEntry,
  buildSnapshot,
  commit,
  cache,
};

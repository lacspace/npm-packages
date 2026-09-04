/**
 * @lacspace/query — tiny data fetching for React.
 *
 * A shared, module-level cache with request de-duplication, stale-while-revalidate,
 * focus/reconnect revalidation, polling, and mutations. Think "SWR-lite": `useQuery`
 * and `useMutation` in ~2KB, zero runtime dependencies, SSR-safe and fully typed.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

/**
 * A cache key. Either a plain string, or a (readonly) array that is serialized to a
 * stable string key — object properties are sorted so key order never matters.
 *
 * @example
 * ```ts
 * "users";              // simple string key
 * ["user", 42];         // array key -> stable string
 * ["list", { q: "a" }]; // objects are key-sorted before serializing
 * ```
 */
export type QueryKey = string | readonly unknown[];

/** A function that resolves the data for a given key. Receives the original key. */
export type QueryFetcher<T> = (key: QueryKey) => Promise<T> | T;

/**
 * Options for {@link useQuery}.
 *
 * @typeParam T - The type of the resolved data.
 */
export interface QueryOptions<T> {
  /** Set to `false` to disable the query (also disabled by a `null`/`false` key). Default `true`. */
  enabled?: boolean;
  /** How long (ms) cached data is considered fresh; fresh data is served without a refetch. Default `0`. */
  staleTime?: number;
  /** Revalidate when the window regains focus. Default `true`. */
  refetchOnWindowFocus?: boolean;
  /** Revalidate when the network reconnects (`online` event). Default `true`. */
  refetchOnReconnect?: boolean;
  /** Poll every N ms while mounted. Disabled when falsy. */
  refetchInterval?: number;
  /** Seed data to display before the first fetch resolves (kept stale so it revalidates). */
  initialData?: T;
  /** Keep showing the previous key's data while a new key loads. Default `false`. */
  keepPreviousData?: boolean;
  /** Called after each successful fetch for this hook (mount-guarded). */
  onSuccess?: (data: T) => void;
  /** Called after each failed fetch for this hook (mount-guarded). */
  onError?: (error: unknown) => void;
}

/**
 * The value returned by {@link useQuery}.
 *
 * @typeParam T - The type of the resolved data.
 */
export interface QueryResult<T> {
  /** The current data, or `undefined` if none is cached yet. */
  data: T | undefined;
  /** The last error thrown by the fetcher, or `undefined`. Cleared on a successful fetch. */
  error: unknown;
  /** `true` when there is no data yet AND a fetch is in flight (initial load). */
  isLoading: boolean;
  /** `true` whenever a fetch is in flight (including background revalidation). */
  isFetching: boolean;
  /** `true` when data is present and there is no error. */
  isSuccess: boolean;
  /** `true` when the last fetch errored. */
  isError: boolean;
  /** Imperatively (re)fetch this key. Resolves with the data, or `undefined` on error. */
  refetch: () => Promise<T | undefined>;
}

/** Options for {@link useMutation}. */
export interface MutationOptions<TData, TVars> {
  /** Called with the result after a successful mutation. */
  onSuccess?: (data: TData, vars: TVars) => void;
  /** Called with the error after a failed mutation. */
  onError?: (error: unknown, vars: TVars) => void;
  /** Called after the mutation settles, regardless of outcome. */
  onSettled?: (data: TData | undefined, error: unknown, vars: TVars) => void;
}

/** The value returned by {@link useMutation}. */
export interface MutationResult<TData, TVars> {
  /** Fire the mutation (fire-and-forget; errors are swallowed — use {@link mutateAsync} to catch). */
  mutate: (vars: TVars) => void;
  /** Fire the mutation and get a promise that resolves/rejects with the result. */
  mutateAsync: (vars: TVars) => Promise<TData>;
  /** The data from the last successful mutation, or `undefined`. */
  data: TData | undefined;
  /** The error from the last failed mutation, or `undefined`. */
  error: unknown;
  /** `true` while the mutation is running. */
  isPending: boolean;
  /** `true` when the last mutation succeeded. */
  isSuccess: boolean;
  /** `true` when the last mutation failed. */
  isError: boolean;
  /** Reset back to the idle state. */
  reset: () => void;
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
const DISABLED_SNAPSHOT: Snapshot<unknown> = Object.freeze({
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

/** Serialize any {@link QueryKey} to a stable string. */
function serializeKey(key: QueryKey): string {
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

/** Get (or lazily create) the cache entry for a serialized key. */
function getEntry(keyStr: string): CacheEntry {
  let entry = cache.get(keyStr);
  if (!entry) {
    entry = {
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
  }
  return entry;
}

/**
 * Core fetch with de-duplication: concurrent calls for the same key reuse the single
 * in-flight promise. On success, data is written and any error cleared; on failure,
 * the error is recorded and the promise re-thrown.
 */
function triggerFetch<T>(keyStr: string, fetcher: QueryFetcher<T>, originalKey: QueryKey): Promise<T> {
  const entry = getEntry(keyStr);
  if (entry.promise) return entry.promise as Promise<T>;

  entry.isValidating = true;
  commit(entry);

  const promise = (async () => {
    try {
      const data = await fetcher(originalKey);
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
  const entry = cache.get(serializeKey(key));
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
  const entry = getEntry(serializeKey(key));
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
 * // optimistic update, then refetch to confirm
 * await mutate(["user", 1], { ...user, name: "Grace" });
 *
 * // pure revalidation
 * await mutate("todos");
 *
 * // optimistic only, skip refetch
 * await mutate("todos", newTodos, { revalidate: false });
 * ```
 */
export async function mutate<T>(
  key: QueryKey,
  data?: T | ((prev: T | undefined) => T),
  options?: { revalidate?: boolean },
): Promise<T | undefined> {
  const keyStr = serializeKey(key);
  const entry = getEntry(keyStr);

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
  const keyStr = serializeKey(key);
  getEntry(keyStr).fetcher = fetcher as QueryFetcher<unknown>;
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
 * Hooks
 * ------------------------------------------------------------------ */

/**
 * Subscribe a component to a cache key, fetching on demand with de-duplication,
 * stale-while-revalidate, focus/reconnect revalidation and optional polling.
 *
 * Pass a `null`/`false` key (or `enabled:false`) to disable the query.
 *
 * @typeParam T - The type of the resolved data.
 * @param key - The cache key, or `null`/`false` to disable.
 * @param fetcher - Resolves the data for the key. Receives the original key.
 * @param options - Optional {@link QueryOptions}.
 * @returns A {@link QueryResult}.
 *
 * @example
 * ```tsx
 * function Profile({ id }: { id: number }) {
 *   const { data, error, isLoading, refetch } = useQuery(
 *     ["user", id],
 *     ([, uid]) => fetch(`/api/users/${uid}`).then((r) => r.json()),
 *     { staleTime: 30_000 }
 *   );
 *   if (isLoading) return <p>Loading…</p>;
 *   if (error) return <button onClick={refetch}>Retry</button>;
 *   return <h1>{data.name}</h1>;
 * }
 * ```
 */
export function useQuery<T>(
  key: QueryKey | null | false,
  fetcher: QueryFetcher<T>,
  options: QueryOptions<T> = {},
): QueryResult<T> {
  const enabled = options.enabled !== false && key !== null && key !== false;
  const keyStr = enabled ? serializeKey(key) : null;

  // Latest-ref pattern: avoid stale closures without re-subscribing on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const keyRef = useRef<QueryKey | null | false>(key);
  keyRef.current = key;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Seed initialData and reflect an imminent fetch as loading — during render so the
  // very first paint is correct. Idempotent; only mutates when something changes.
  useMemo(() => {
    if (keyStr === null) return;
    const entry = getEntry(keyStr);
    let changed = false;
    if (entry.data === undefined && optionsRef.current.initialData !== undefined) {
      entry.data = optionsRef.current.initialData;
      entry.updatedAt = 0; // stale, so it still revalidates
      changed = true;
    }
    const staleTime = optionsRef.current.staleTime ?? 0;
    const fresh = entry.data !== undefined && Date.now() - entry.updatedAt < staleTime;
    if (!fresh && !entry.promise && !entry.isValidating) {
      entry.isValidating = true; // optimistic; the mount effect starts the real fetch
      changed = true;
    }
    if (changed) entry.snapshot = buildSnapshot(entry);
  }, [keyStr]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (keyStr === null) return () => {};
      const entry = getEntry(keyStr);
      entry.listeners.add(onChange);
      return () => {
        entry.listeners.delete(onChange);
      };
    },
    [keyStr],
  );

  const getSnapshot = useCallback(
    () => (keyStr === null ? DISABLED_SNAPSHOT : getEntry(keyStr).snapshot),
    [keyStr],
  );

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refetch = useCallback(async (): Promise<T | undefined> => {
    if (keyStr === null) return undefined;
    const entry = getEntry(keyStr);
    entry.fetcher = fetcherRef.current as QueryFetcher<unknown>;
    const activeKey = (keyRef.current as QueryKey) ?? keyStr;
    try {
      const result = await triggerFetch<T>(keyStr, fetcherRef.current, activeKey);
      if (isMountedRef.current) optionsRef.current.onSuccess?.(result);
      return result;
    } catch (err) {
      if (isMountedRef.current) optionsRef.current.onError?.(err);
      return undefined;
    }
  }, [keyStr]);

  // Fetch on mount / key change when data is missing or stale.
  useEffect(() => {
    if (keyStr === null) return;
    const entry = getEntry(keyStr);
    entry.fetcher = fetcherRef.current as QueryFetcher<unknown>;
    const staleTime = optionsRef.current.staleTime ?? 0;
    const fresh = entry.data !== undefined && Date.now() - entry.updatedAt < staleTime;
    if (!fresh && !entry.promise) void refetch();
  }, [keyStr, refetch]);

  // Focus / reconnect / interval revalidation (client-only).
  useEffect(() => {
    if (keyStr === null || typeof window === "undefined") return;
    const onFocus = () => {
      if (optionsRef.current.refetchOnWindowFocus !== false) void refetch();
    };
    const onOnline = () => {
      if (optionsRef.current.refetchOnReconnect !== false) void refetch();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    const intervalMs = options.refetchInterval;
    const timer =
      intervalMs && intervalMs > 0 ? setInterval(() => void refetch(), intervalMs) : undefined;

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      if (timer !== undefined) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyStr, refetch, options.refetchInterval]);

  // keepPreviousData: remember the last non-empty data to show across key changes.
  const previousDataRef = useRef<T | undefined>(undefined);
  useEffect(() => {
    if (snapshot.data !== undefined) previousDataRef.current = snapshot.data as T;
  }, [snapshot.data]);

  let data = snapshot.data as T | undefined;
  if (data === undefined && options.keepPreviousData && previousDataRef.current !== undefined) {
    data = previousDataRef.current;
  }

  const hasData = data !== undefined;
  const isFetching = snapshot.isValidating;
  const isError = snapshot.error !== undefined;

  return {
    data,
    error: snapshot.error,
    isLoading: !hasData && isFetching,
    isFetching,
    isSuccess: hasData && !isError,
    isError,
    refetch,
  };
}

/**
 * Run an imperative async mutation (create/update/delete) and track its lifecycle.
 * Pair with {@link mutate} or {@link setQueryData} to update cached queries.
 *
 * @typeParam TData - The mutation's result type.
 * @typeParam TVars - The mutation's input variables type.
 *
 * @example
 * ```tsx
 * function AddTodo() {
 *   const { mutate, isPending } = useMutation(
 *     (title: string) => fetch("/api/todos", { method: "POST", body: title }).then((r) => r.json()),
 *     { onSuccess: (todo) => setQueryData<Todo[]>("todos", (p) => [...(p ?? []), todo]) }
 *   );
 *   return <button disabled={isPending} onClick={() => mutate("New task")}>Add</button>;
 * }
 * ```
 */
export function useMutation<TData, TVars = void>(
  mutationFn: (vars: TVars) => Promise<TData> | TData,
  options: MutationOptions<TData, TVars> = {},
): MutationResult<TData, TVars> {
  const [state, setState] = useState<{
    data: TData | undefined;
    error: unknown;
    status: "idle" | "pending" | "success" | "error";
  }>({ data: undefined, error: undefined, status: "idle" });

  const fnRef = useRef(mutationFn);
  fnRef.current = mutationFn;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const mutateAsync = useCallback(async (vars: TVars): Promise<TData> => {
    if (isMountedRef.current) setState({ data: undefined, error: undefined, status: "pending" });
    try {
      const data = await fnRef.current(vars);
      if (isMountedRef.current) setState({ data, error: undefined, status: "success" });
      optionsRef.current.onSuccess?.(data, vars);
      optionsRef.current.onSettled?.(data, undefined, vars);
      return data;
    } catch (err) {
      if (isMountedRef.current) setState({ data: undefined, error: err, status: "error" });
      optionsRef.current.onError?.(err, vars);
      optionsRef.current.onSettled?.(undefined, err, vars);
      throw err;
    }
  }, []);

  const mutateFn = useCallback(
    (vars: TVars) => {
      void mutateAsync(vars).catch(() => {});
    },
    [mutateAsync],
  );

  const reset = useCallback(() => {
    if (isMountedRef.current) setState({ data: undefined, error: undefined, status: "idle" });
  }, []);

  return {
    mutate: mutateFn,
    mutateAsync,
    data: state.data,
    error: state.error,
    isPending: state.status === "pending",
    isSuccess: state.status === "success",
    isError: state.status === "error",
    reset,
  };
}

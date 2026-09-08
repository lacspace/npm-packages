/**
 * @lacspace/query — tiny data fetching for React.
 *
 * A shared, module-level cache with request de-duplication, stale-while-revalidate,
 * focus/reconnect revalidation, polling, and mutations. Think "SWR-lite": `useQuery`
 * and `useMutation` in ~2KB, zero runtime dependencies, SSR-safe and fully typed.
 *
 * The React hooks below are thin wrappers over the framework-agnostic core in
 * `./core` (cache, key hashing, dedup, retry/backoff, matching, invalidation, GC),
 * which is also re-exported here so it can be used from anywhere — inside or outside
 * React.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  __internal,
  DISABLED_SNAPSHOT,
  serializeQueryKey,
  triggerFetch,
  type QueryKey,
  type QueryFetcher,
  type RetryOptions,
} from "./core";

const { getEntry, buildSnapshot } = __internal;

/* ------------------------------------------------------------------ *
 * Public re-exports from the pure core
 * ------------------------------------------------------------------ */

export {
  // key hashing
  serializeQueryKey,
  // imperative cache API
  getQueryData,
  setQueryData,
  mutate,
  prefetchQuery,
  clearQueryCache,
  // inspection / matching / invalidation / subscriptions / GC
  getQueryState,
  getQueryKeys,
  matchQueryKey,
  invalidateQueries,
  removeQuery,
  subscribeQuery,
  gcQueries,
  // retry / backoff
  computeBackoff,
  runWithRetry,
} from "./core";

export type {
  QueryKey,
  QueryFetcher,
  QueryFilter,
  QueryState,
  RetryOptions,
  BackoffOptions,
} from "./core";

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
  /** Retry a failing fetcher this many times (exponential backoff). Default `0` (no retry). */
  retry?: number;
  /** Delay between retries: fixed ms, or a function of the (zero-based) attempt index. */
  retryDelay?: number | ((attempt: number) => number);
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
 *     { staleTime: 30_000, retry: 2 }
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
  const keyStr = enabled ? serializeQueryKey(key) : null;

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
    const entry = getEntry(keyStr, key as QueryKey);
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
      const entry = getEntry(keyStr, keyRef.current as QueryKey);
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
    const entry = getEntry(keyStr, keyRef.current as QueryKey);
    entry.fetcher = fetcherRef.current as QueryFetcher<unknown>;
    const activeKey = (keyRef.current as QueryKey) ?? keyStr;
    const retries = optionsRef.current.retry;
    const retryCfg: RetryOptions | undefined =
      retries && retries > 0
        ? { retries, retryDelay: optionsRef.current.retryDelay }
        : undefined;
    try {
      const result = await triggerFetch<T>(keyStr, fetcherRef.current, activeKey, retryCfg);
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
    const entry = getEntry(keyStr, keyRef.current as QueryKey);
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

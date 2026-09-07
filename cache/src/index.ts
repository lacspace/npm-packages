/**
 * @lacspace/cache
 * A tiny in-memory cache with LRU (or LFU) eviction, per-entry TTL and
 * stale-while-revalidate — plus `wrap()` / `getOrSet()` / `memoize()` to cache
 * any async function with automatic de-duplication of in-flight calls.
 *
 * ```ts
 * import { createCache } from "@lacspace/cache";
 *
 * const cache = createCache<User>({ max: 500, ttl: 60_000 });
 *
 * // Cache an async call; concurrent callers share one fetch.
 * const user = await cache.wrap(`user:${id}`, () => db.users.find(id), {
 *   ttl: 60_000,
 *   staleWhileRevalidate: 30_000, // serve stale instantly, refresh in the background
 *   tags: [`user:${id}`],         // group entries for invalidateTag()
 * });
 * ```
 *
 * Zero dependencies · isomorphic · fully typed.
 */

import { selectLfuVictim, type EvictionPolicy, type VictimMeta } from "./policies";

export type { EvictionPolicy, VictimMeta } from "./policies";

/** Why an entry left the cache — passed to the `onEvict` callback. @since 1.1.0 */
export type EvictReason = "capacity" | "expire" | "delete" | "invalidate";

export interface CacheOptions {
  /** Maximum number of entries before eviction kicks in. Default `1000`. */
  max?: number;
  /** Default time-to-live in ms. `0` / omitted = never expires. */
  ttl?: number;
}

/** Extra construction options added in 1.1.0. Superset of {@link CacheOptions}. */
export interface CreateCacheOptions<V = unknown> extends CacheOptions {
  /**
   * Eviction strategy once `max` is exceeded: `"lru"` (least-recently-used,
   * the default and previous behaviour) or `"lfu"` (least-frequently-used).
   * @since 1.1.0
   */
  policy?: EvictionPolicy;
  /**
   * Injectable time source returning ms (like `Date.now`). Defaults to
   * `Date.now`. Handy for deterministic TTL tests. @since 1.1.0
   */
  clock?: () => number;
  /**
   * Called whenever an entry leaves the cache (capacity eviction, TTL expiry,
   * explicit delete, or tag invalidation). Errors thrown here are swallowed.
   * @since 1.1.0
   */
  onEvict?: (key: string, value: V, reason: EvictReason) => void;
}

export interface WrapOptions {
  /** Override the default TTL for this entry (ms). */
  ttl?: number;
  /**
   * After the entry expires, keep serving the stale value for this many ms
   * while a fresh value is fetched in the background. Great for hiding latency.
   */
  staleWhileRevalidate?: number;
  /** Tags to attach to the cached entry, for `invalidateTag()`. @since 1.1.0 */
  tags?: string[];
}

/** Options for `set()`'s optional 4th argument. @since 1.1.0 */
export interface SetOptions {
  /** Tags to attach to the entry, for `invalidateTag()`. */
  tags?: string[];
}

/** Snapshot of lifetime counters returned by `cache.stats()`. @since 1.1.0 */
export interface CacheStats {
  /** Reads served from the cache (`get`/`wrap`/`getOrSet` hits, incl. stale). */
  hits: number;
  /** Reads that had to fall through to a fetch / returned `undefined`. */
  misses: number;
  /** Number of explicit `set()` calls. */
  sets: number;
  /** Entries dropped to stay within `max` (capacity evictions). */
  evictions: number;
  /** Entries dropped because their TTL (and any stale window) elapsed. */
  expirations: number;
  /** Current live entry count. */
  size: number;
  /** `hits / (hits + misses)`, or `0` when nothing has been read. */
  hitRate: number;
}

interface Entry<V> extends VictimMeta {
  value: V;
  /** Absolute expiry timestamp (ms). `0` = never. */
  expires: number;
  /** Absolute time after which even stale serving stops. `0` = follow expires. */
  staleUntil: number;
  /** Access frequency, for LFU eviction and stats. */
  freq: number;
  /** Monotonic creation order, for LFU tie-breaking. */
  seq: number;
  /** Tags attached to this entry, for tag invalidation. */
  tags?: string[];
}

export interface Cache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V, ttl?: number, opts?: SetOptions): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  readonly size: number;
  keys(): string[];
  /** Cache the result of an async function under `key`, de-duping in-flight calls. */
  wrap<T extends V>(key: string, fn: () => Promise<T>, opts?: WrapOptions): Promise<T>;
  /**
   * Alias of {@link Cache.wrap} — get the cached value or run `factory` once to
   * produce it, sharing a single in-flight promise under a stampede. @since 1.1.0
   */
  getOrSet<T extends V>(key: string, factory: () => Promise<T>, opts?: WrapOptions): Promise<T>;
  /** Drop every entry carrying `tag`. Returns how many were removed. @since 1.1.0 */
  invalidateTag(tag: string): number;
  /**
   * Delete every key matching `pattern` — a string prefix, a `RegExp`, or a
   * predicate. Returns how many were removed. @since 1.1.0
   */
  deleteMany(pattern: string | RegExp | ((key: string) => boolean)): number;
  /** Sweep out expired entries now (TTL + stale window elapsed). Returns count. @since 1.1.0 */
  purge(): number;
  /** Lifetime hit/miss/eviction counters plus current size. @since 1.1.0 */
  stats(): CacheStats;
  /** Reset the counters returned by {@link Cache.stats} to zero. @since 1.1.0 */
  resetStats(): void;
}

export function createCache<V = unknown>(options: CreateCacheOptions<V> = {}): Cache<V> {
  const max = options.max ?? 1000;
  const defaultTtl = options.ttl ?? 0;
  const policy: EvictionPolicy = options.policy ?? "lru";
  const clock = options.clock ?? Date.now;
  const onEvict = options.onEvict;

  const store = new Map<string, Entry<V>>();
  const inflight = new Map<string, Promise<V>>();
  const tagIndex = new Map<string, Set<string>>();
  let seqCounter = 0;

  const counters = { hits: 0, misses: 0, sets: 0, evictions: 0, expirations: 0 };

  function fireEvict(key: string, value: V, reason: EvictReason): void {
    if (!onEvict) return;
    try {
      onEvict(key, value, reason);
    } catch {
      /* a misbehaving listener must never corrupt cache state */
    }
  }

  function addTags(key: string, tags?: string[]): void {
    if (!tags) return;
    for (const tag of tags) {
      let set = tagIndex.get(tag);
      if (!set) {
        set = new Set();
        tagIndex.set(tag, set);
      }
      set.add(key);
    }
  }

  function removeTags(key: string, entry: Entry<V>): void {
    if (!entry.tags) return;
    for (const tag of entry.tags) {
      const set = tagIndex.get(tag);
      if (!set) continue;
      set.delete(key);
      if (set.size === 0) tagIndex.delete(tag);
    }
  }

  /** Remove an entry, keeping tag index + counters + listener in sync. */
  function removeEntry(key: string, entry: Entry<V>, reason: EvictReason): void {
    store.delete(key);
    removeTags(key, entry);
    if (reason === "capacity") counters.evictions++;
    else if (reason === "expire") counters.expirations++;
    fireEvict(key, entry.value, reason);
  }

  /** Move a key to the most-recently-used position (LRU only). */
  function touch(key: string, entry: Entry<V>): void {
    store.delete(key);
    store.set(key, entry);
  }

  /** Drop entries that are fully dead (past their stale window). Returns count. */
  function purgeExpired(): number {
    const t = clock();
    let removed = 0;
    for (const [key, entry] of store) {
      const deadline = entry.staleUntil || entry.expires;
      if (deadline && t > deadline) {
        removeEntry(key, entry, "expire");
        removed++;
      }
    }
    return removed;
  }

  function evictIfNeeded(): void {
    // Reclaim already-dead entries before evicting any live ones — a dead entry
    // should never push a live one out just because it still sits in the Map.
    if (store.size > max) purgeExpired();
    while (store.size > max) {
      const victim = policy === "lfu" ? selectLfuVictim(store) : store.keys().next().value;
      if (victim === undefined) break;
      const entry = store.get(victim);
      if (entry) removeEntry(victim, entry, "capacity");
      else store.delete(victim);
    }
  }

  function readEntry(key: string): Entry<V> | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    const t = clock();
    // Fully dead (past the stale window) → drop it.
    const deadline = entry.staleUntil || entry.expires;
    if (deadline && t > deadline) {
      removeEntry(key, entry, "expire");
      return undefined;
    }
    return entry;
  }

  const cache: Cache<V> = {
    get(key) {
      const entry = readEntry(key);
      if (!entry) {
        counters.misses++;
        return undefined;
      }
      // Expired but still within stale window → miss for get(), but keep it
      // (wrap() may still serve it). Plain get() only returns fresh values.
      if (entry.expires && clock() > entry.expires) {
        counters.misses++;
        return undefined;
      }
      entry.freq++;
      if (policy === "lru") touch(key, entry);
      counters.hits++;
      return entry.value;
    },

    set(key, value, ttl, opts) {
      const effectiveTtl = ttl ?? defaultTtl;
      const expires = effectiveTtl ? clock() + effectiveTtl : 0;
      const prev = store.get(key);
      if (prev) removeTags(key, prev);
      store.delete(key);
      const tags = opts?.tags && opts.tags.length ? opts.tags.slice() : undefined;
      const entry: Entry<V> = { value, expires, staleUntil: 0, freq: 1, seq: seqCounter++, tags };
      store.set(key, entry);
      addTags(key, tags);
      counters.sets++;
      evictIfNeeded();
    },

    has(key) {
      const entry = readEntry(key);
      return !!entry && !(entry.expires && clock() > entry.expires);
    },

    delete(key) {
      inflight.delete(key);
      const entry = store.get(key);
      if (!entry) return false;
      removeTags(key, entry);
      store.delete(key);
      fireEvict(key, entry.value, "delete");
      return true;
    },

    clear() {
      store.clear();
      tagIndex.clear();
      inflight.delete("");
      inflight.clear();
    },

    get size() {
      return store.size;
    },

    keys() {
      return [...store.keys()];
    },

    async wrap(key, fn, opts) {
      const ttl = opts?.ttl ?? defaultTtl;
      const swr = opts?.staleWhileRevalidate ?? 0;
      const tags = opts?.tags;
      const t = clock();
      const entry = readEntry(key);

      if (entry) {
        const fresh = !entry.expires || t <= entry.expires;
        if (fresh) {
          entry.freq++;
          if (policy === "lru") touch(key, entry);
          counters.hits++;
          return entry.value as Awaited<ReturnType<typeof fn>>;
        }
        // Stale but within the SWR window → serve stale, refresh in background.
        if (swr && entry.staleUntil && t <= entry.staleUntil) {
          // Mark as recently used so a hot-but-stale key isn't evicted before
          // its background refresh lands.
          entry.freq++;
          if (policy === "lru") touch(key, entry);
          counters.hits++;
          if (!inflight.has(key)) revalidate(key, fn, ttl, swr, tags);
          return entry.value as Awaited<ReturnType<typeof fn>>;
        }
      }

      // Miss (or hard-expired): de-dupe concurrent callers onto one promise.
      counters.misses++;
      const existing = inflight.get(key);
      if (existing) return existing as Promise<Awaited<ReturnType<typeof fn>>>;

      const p = (async () => {
        try {
          const value = await fn();
          writeFresh(key, value, ttl, swr, tags);
          return value;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, p);
      return p;
    },

    getOrSet(key, factory, opts) {
      return cache.wrap(key, factory, opts);
    },

    invalidateTag(tag) {
      const set = tagIndex.get(tag);
      if (!set) return 0;
      let removed = 0;
      for (const key of [...set]) {
        inflight.delete(key);
        const entry = store.get(key);
        if (entry) {
          removeEntry(key, entry, "invalidate");
          removed++;
        }
      }
      // removeEntry already prunes empty tag sets; ensure the tag is gone.
      tagIndex.delete(tag);
      return removed;
    },

    deleteMany(pattern) {
      const match =
        typeof pattern === "function"
          ? pattern
          : pattern instanceof RegExp
            ? (k: string) => pattern.test(k)
            : (k: string) => k.startsWith(pattern);
      let removed = 0;
      for (const key of [...store.keys()]) {
        if (!match(key)) continue;
        const entry = store.get(key);
        if (!entry) continue;
        inflight.delete(key);
        removeEntry(key, entry, "delete");
        removed++;
      }
      return removed;
    },

    purge() {
      return purgeExpired();
    },

    stats() {
      const total = counters.hits + counters.misses;
      return {
        hits: counters.hits,
        misses: counters.misses,
        sets: counters.sets,
        evictions: counters.evictions,
        expirations: counters.expirations,
        size: store.size,
        hitRate: total ? counters.hits / total : 0,
      };
    },

    resetStats() {
      counters.hits = 0;
      counters.misses = 0;
      counters.sets = 0;
      counters.evictions = 0;
      counters.expirations = 0;
    },
  };

  function writeFresh(key: string, value: V, ttl: number, swr: number, tags?: string[]): void {
    const t = clock();
    const expires = ttl ? t + ttl : 0;
    const staleUntil = ttl && swr ? expires + swr : 0;
    const prev = store.get(key);
    if (prev) removeTags(key, prev);
    store.delete(key);
    const nextTags = tags && tags.length ? tags.slice() : prev?.tags;
    const entry: Entry<V> = {
      value,
      expires,
      staleUntil,
      freq: (prev?.freq ?? 0) + 1,
      seq: seqCounter++,
      tags: nextTags,
    };
    store.set(key, entry);
    addTags(key, nextTags);
    evictIfNeeded();
  }

  function revalidate(
    key: string,
    fn: () => Promise<V>,
    ttl: number,
    swr: number,
    tags?: string[],
  ): void {
    const p = (async () => {
      try {
        const value = await fn();
        writeFresh(key, value, ttl, swr, tags);
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    // Swallow background errors — the stale value already went out.
    p.catch(() => {});
  }

  return cache;
}

/* ------------------------------------------------------------------ *
 * memoize — cache an async function keyed by its arguments
 * ------------------------------------------------------------------ */

export interface MemoizeOptions<A extends unknown[]> extends CreateCacheOptions, WrapOptions {
  /** Derive a cache key from the arguments. Default: JSON.stringify(args). */
  key?: (...args: A) => string;
}

/**
 * Wrap an async function so identical calls are cached (and de-duplicated
 * while in flight). Returns the same function signature.
 */
export function memoize<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  options: MemoizeOptions<A> = {},
): ((...args: A) => Promise<R>) & { cache: Cache<R> } {
  const cache = createCache<R>({
    max: options.max,
    ttl: options.ttl,
    policy: options.policy,
    clock: options.clock,
    onEvict: options.onEvict as CreateCacheOptions<R>["onEvict"],
  });
  const keyFn = options.key ?? ((...args: A) => JSON.stringify(args));
  const wrapOpts: WrapOptions = {
    ttl: options.ttl,
    staleWhileRevalidate: options.staleWhileRevalidate,
    tags: options.tags,
  };

  const memoized = ((...args: A) => cache.wrap(keyFn(...args), () => fn(...args), wrapOpts)) as ((
    ...args: A
  ) => Promise<R>) & { cache: Cache<R> };
  memoized.cache = cache;
  return memoized;
}

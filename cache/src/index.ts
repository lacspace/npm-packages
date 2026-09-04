/**
 * @lacspace/cache
 * A tiny in-memory cache with LRU eviction, per-entry TTL and
 * stale-while-revalidate — plus `wrap()` / `memoize()` to cache any async
 * function with automatic de-duplication of in-flight calls.
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
 * });
 * ```
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export interface CacheOptions {
  /** Maximum number of entries before least-recently-used ones are evicted. */
  max?: number;
  /** Default time-to-live in ms. `0` / omitted = never expires. */
  ttl?: number;
}

export interface WrapOptions {
  /** Override the default TTL for this entry (ms). */
  ttl?: number;
  /**
   * After the entry expires, keep serving the stale value for this many ms
   * while a fresh value is fetched in the background. Great for hiding latency.
   */
  staleWhileRevalidate?: number;
}

interface Entry<V> {
  value: V;
  /** Absolute expiry timestamp (ms). `0` = never. */
  expires: number;
  /** Absolute time after which even stale serving stops. `0` = follow expires. */
  staleUntil: number;
}

export interface Cache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V, ttl?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  readonly size: number;
  keys(): string[];
  /** Cache the result of an async function under `key`, de-duping in-flight calls. */
  wrap<T extends V>(key: string, fn: () => Promise<T>, opts?: WrapOptions): Promise<T>;
}

const now = (): number => Date.now();

export function createCache<V = unknown>(options: CacheOptions = {}): Cache<V> {
  const max = options.max ?? 1000;
  const defaultTtl = options.ttl ?? 0;
  const store = new Map<string, Entry<V>>();
  const inflight = new Map<string, Promise<V>>();

  /** Move a key to the most-recently-used position. */
  function touch(key: string, entry: Entry<V>): void {
    store.delete(key);
    store.set(key, entry);
  }

  /** Drop entries that are fully dead (past their stale window) so they don't count as live. */
  function purgeExpired(): void {
    const t = now();
    for (const [key, entry] of store) {
      const deadline = entry.staleUntil || entry.expires;
      if (deadline && t > deadline) store.delete(key);
    }
  }

  function evictIfNeeded(): void {
    // Reclaim already-dead entries before evicting any live (LRU) ones — a dead
    // entry should never push a live one out just because it still sits in the Map.
    if (store.size > max) purgeExpired();
    while (store.size > max) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }

  function readEntry(key: string): Entry<V> | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    const t = now();
    // Fully dead (past the stale window) → drop it.
    const deadline = entry.staleUntil || entry.expires;
    if (deadline && t > deadline) {
      store.delete(key);
      return undefined;
    }
    return entry;
  }

  const cache: Cache<V> = {
    get(key) {
      const entry = readEntry(key);
      if (!entry) return undefined;
      // Expired but still within stale window → miss for get(), but keep it
      // (wrap() may still serve it). Plain get() only returns fresh values.
      if (entry.expires && now() > entry.expires) return undefined;
      touch(key, entry);
      return entry.value;
    },

    set(key, value, ttl) {
      const effectiveTtl = ttl ?? defaultTtl;
      const expires = effectiveTtl ? now() + effectiveTtl : 0;
      store.delete(key);
      store.set(key, { value, expires, staleUntil: 0 });
      evictIfNeeded();
    },

    has(key) {
      const entry = readEntry(key);
      return !!entry && !(entry.expires && now() > entry.expires);
    },

    delete(key) {
      inflight.delete(key);
      return store.delete(key);
    },

    clear() {
      store.clear();
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
      const t = now();
      const entry = readEntry(key);

      if (entry) {
        const fresh = !entry.expires || t <= entry.expires;
        if (fresh) {
          touch(key, entry);
          return entry.value as Awaited<ReturnType<typeof fn>>;
        }
        // Stale but within the SWR window → serve stale, refresh in background.
        if (swr && entry.staleUntil && t <= entry.staleUntil) {
          // Mark as recently used so a hot-but-stale key isn't evicted before
          // its background refresh lands.
          touch(key, entry);
          if (!inflight.has(key)) revalidate(key, fn, ttl, swr);
          return entry.value as Awaited<ReturnType<typeof fn>>;
        }
      }

      // Miss (or hard-expired): de-dupe concurrent callers onto one promise.
      const existing = inflight.get(key);
      if (existing) return existing as Promise<Awaited<ReturnType<typeof fn>>>;

      const p = (async () => {
        try {
          const value = await fn();
          writeFresh(key, value, ttl, swr);
          return value;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, p);
      return p;
    },
  };

  function writeFresh(key: string, value: V, ttl: number, swr: number): void {
    const t = now();
    const expires = ttl ? t + ttl : 0;
    const staleUntil = ttl && swr ? expires + swr : 0;
    store.delete(key);
    store.set(key, { value, expires, staleUntil });
    evictIfNeeded();
  }

  function revalidate(key: string, fn: () => Promise<V>, ttl: number, swr: number): void {
    const p = (async () => {
      try {
        const value = await fn();
        writeFresh(key, value, ttl, swr);
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

export interface MemoizeOptions<A extends unknown[]> extends CacheOptions, WrapOptions {
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
  const cache = createCache<R>({ max: options.max, ttl: options.ttl });
  const keyFn = options.key ?? ((...args: A) => JSON.stringify(args));
  const wrapOpts: WrapOptions = { ttl: options.ttl, staleWhileRevalidate: options.staleWhileRevalidate };

  const memoized = ((...args: A) => cache.wrap(keyFn(...args), () => fn(...args), wrapOpts)) as ((
    ...args: A
  ) => Promise<R>) & { cache: Cache<R> };
  memoized.cache = cache;
  return memoized;
}

import type { CacheRecord, CacheStore } from "./types.js";

/**
 * In-memory store with TTL and an LRU cap. Good for a single process; for
 * multi-process (PM2) or cross-host sharing, pass a Mongo/Redis-backed store
 * that implements the same {@link CacheStore} interface.
 */
export interface MemoryStore extends CacheStore {
  get(key: string): CacheRecord | null;
  set(key: string, record: CacheRecord): void;
  delete(key: string): void;
  size(): number;
  clear(): void;
}

export function memoryStore(options: { maxEntries?: number } = {}): MemoryStore {
  const max = options.maxEntries ?? 1000;
  const map = new Map<string, CacheRecord>();

  const evictExpired = (now: number) => {
    for (const [k, v] of map) if (v.expiresAt !== null && v.expiresAt <= now) map.delete(k);
  };

  return {
    get(key) {
      const rec = map.get(key);
      if (!rec) return null;
      if (rec.expiresAt !== null && rec.expiresAt <= Date.now()) {
        map.delete(key);
        return null;
      }
      // LRU touch
      map.delete(key);
      map.set(key, rec);
      return rec;
    },
    set(key, rec) {
      const now = Date.now();
      evictExpired(now);
      map.delete(key);
      map.set(key, rec);
      while (map.size > max) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    delete(key) {
      map.delete(key);
    },
    size() {
      return map.size;
    },
    clear() {
      map.clear();
    },
  };
}

/** A stored cache record. `value` is whatever the LLM call returned (JSON-serializable). */
export interface CacheRecord<T = unknown> {
  value: T;
  /** Epoch ms when this expires, or null for no expiry. */
  expiresAt: number | null;
  /** Epoch ms when it was written. */
  storedAt: number;
  /** Optional metadata the caller attached (e.g. model, tokens). */
  meta?: Record<string, unknown>;
}

/**
 * A pluggable cache store. All methods may be sync or async. Implement this over
 * Mongo, Redis, Cloudflare KV, etc. to share the cache across processes/hosts.
 */
export interface CacheStore {
  get(key: string): CacheRecord | null | Promise<CacheRecord | null>;
  set(key: string, record: CacheRecord): void | Promise<void>;
  delete(key: string): void | Promise<void>;
}

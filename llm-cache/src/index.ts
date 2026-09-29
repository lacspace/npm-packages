import { contentHash } from "./hash.js";
import { memoryStore } from "./stores.js";
import type { CacheRecord, CacheStore } from "./types.js";

export { contentHash } from "./hash.js";
export { memoryStore } from "./stores.js";
export type { MemoryStore } from "./stores.js";
export type { CacheRecord, CacheStore } from "./types.js";

/** The dimensions that make one LLM request identical to another. */
export interface CacheKeyInput {
  /** The prompt / input text (or a stable stringification of your messages). */
  input: string;
  /** Model family — different families should not share results (e.g. "gemini", "groq-llama"). */
  model?: string;
  /** Bump when your prompt template changes so old results are not reused. */
  promptVersion?: string;
  /** Extra key parts (temperature, tools, language…) that change the output. */
  variant?: string | Record<string, unknown>;
}

export interface LlmCacheOptions {
  /** Where records live. Default: in-memory LRU (1000 entries). */
  store?: CacheStore;
  /** Default TTL in ms. Omit or 0 for no expiry. */
  ttlMs?: number;
  /** Global prompt version, overridable per call. */
  promptVersion?: string;
  /** Namespace prefix, so multiple caches can share one store. */
  namespace?: string;
  /** Normalize the input before hashing. Default: trim + collapse whitespace. */
  normalize?: (input: string) => string;
}

export interface CacheGetResult<T> {
  hit: boolean;
  value: T | null;
  key: string;
  record: CacheRecord<T> | null;
}

export interface LlmCache {
  /** Compute the content-hash key for an input (no store access). */
  key(input: CacheKeyInput): string;
  /** Look up a cached value. */
  get<T = unknown>(input: CacheKeyInput): Promise<CacheGetResult<T>>;
  /** Store a value, with an optional per-call TTL and metadata. */
  set<T = unknown>(input: CacheKeyInput, value: T, opts?: { ttlMs?: number; meta?: Record<string, unknown> }): Promise<void>;
  /** Remove one entry. */
  delete(input: CacheKeyInput): Promise<void>;
  /**
   * Memoize an async LLM call: returns the cached value on a hit, otherwise runs
   * `fn`, stores the result, and returns it. On a `fn` error, an unexpired
   * record is returned if present (stale-if-error), else the error rethrows.
   */
  wrap<T>(input: CacheKeyInput, fn: () => Promise<T>, opts?: { ttlMs?: number; meta?: Record<string, unknown>; staleIfError?: boolean }): Promise<T>;
  /** Hit/miss counters since creation. */
  stats(): { hits: number; misses: number; sets: number };
}

const defaultNormalize = (s: string): string => s.replace(/\s+/g, " ").trim();

function variantString(v: CacheKeyInput["variant"]): string {
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  // Stable stringify: sort keys.
  return JSON.stringify(v, Object.keys(v).sort());
}

export function createLlmCache(options: LlmCacheOptions = {}): LlmCache {
  const store = options.store ?? memoryStore();
  const ns = options.namespace ?? "llm";
  const normalize = options.normalize ?? defaultNormalize;
  let hits = 0;
  let misses = 0;
  let sets = 0;

  const key = (input: CacheKeyInput): string => {
    const parts = [
      ns,
      input.model ?? "",
      input.promptVersion ?? options.promptVersion ?? "",
      variantString(input.variant),
      normalize(input.input ?? ""),
    ].join("\u0000");
    return `${ns}:${contentHash(parts)}`;
  };

  const get = async <T>(input: CacheKeyInput): Promise<CacheGetResult<T>> => {
    const k = key(input);
    const rec = (await store.get(k)) as CacheRecord<T> | null;
    if (rec && (rec.expiresAt === null || rec.expiresAt > Date.now())) {
      hits++;
      return { hit: true, value: rec.value, key: k, record: rec };
    }
    misses++;
    return { hit: false, value: null, key: k, record: null };
  };

  const setAt = async <T>(k: string, value: T, ttlMs: number | undefined, meta?: Record<string, unknown>): Promise<void> => {
    const now = Date.now();
    const ttl = ttlMs ?? options.ttlMs ?? 0;
    const record: CacheRecord<T> = { value, storedAt: now, expiresAt: ttl > 0 ? now + ttl : null, meta };
    await store.set(k, record as CacheRecord);
    sets++;
  };

  return {
    key,
    get,
    async set(input, value, opts) {
      await setAt(key(input), value, opts?.ttlMs, opts?.meta);
    },
    async delete(input) {
      await store.delete(key(input));
    },
    async wrap(input, fn, opts) {
      const k = key(input);
      const rec = (await store.get(k)) as CacheRecord | null;
      if (rec && (rec.expiresAt === null || rec.expiresAt > Date.now())) {
        hits++;
        return rec.value as Awaited<ReturnType<typeof fn>>;
      }
      misses++;
      try {
        const value = await fn();
        await setAt(k, value, opts?.ttlMs, opts?.meta);
        return value;
      } catch (err) {
        if ((opts?.staleIfError ?? false) && rec) return rec.value as Awaited<ReturnType<typeof fn>>;
        throw err;
      }
    },
    stats() {
      return { hits, misses, sets };
    },
  };
}

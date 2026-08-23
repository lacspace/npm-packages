/**
 * @lacspace/idempotency
 *
 * Make any operation exactly-once with an idempotency key — the "run this at
 * most once, and replay the stored result on retries" pattern that payment APIs
 * and webhook handlers need. Framework-agnostic (every existing lib is locked to
 * Hono / AWS Lambda), zero-dependency, isomorphic.
 *
 * - Replay the cached result for a repeated key (never double-charge / double-send)
 * - Safe under concurrency: in-flight de-dupe in-process, atomic "create-if-absent"
 *   for shared stores, and a conflict/wait policy for the rest
 * - Optional request fingerprint → detect a key reused with a different payload
 * - Pluggable store (in-memory built in; bring your own Redis/KV/SQL)
 */

export type RecordStatus = "in-progress" | "completed" | "failed";

export interface IdempotencyRecord<T = unknown> {
  status: RecordStatus;
  value?: T;
  error?: string;
  /** Optional request signature to detect key reuse with different params. */
  fingerprint?: string;
  createdAt: number;
  completedAt?: number;
}

export interface IdempotencyStore {
  get(key: string): IdempotencyRecord | undefined | Promise<IdempotencyRecord | undefined>;
  /** Atomically create an in-progress record only if the key is absent. Returns true when created. */
  create(key: string, record: IdempotencyRecord): boolean | Promise<boolean>;
  set(key: string, record: IdempotencyRecord): void | Promise<void>;
  delete(key: string): void | Promise<void>;
}

/* ------------------------------ errors ------------------------------ */

export class IdempotencyConflictError extends Error {
  readonly code = "conflict";
  constructor(public readonly key: string) {
    super(`An operation for idempotency key "${key}" is already in progress.`);
    this.name = "IdempotencyConflictError";
  }
}

export class IdempotencyKeyReuseError extends Error {
  readonly code = "key-reuse";
  constructor(public readonly key: string) {
    super(`Idempotency key "${key}" was reused with a different request payload.`);
    this.name = "IdempotencyKeyReuseError";
  }
}

export class ReplayedError extends Error {
  readonly code = "replayed-error";
  constructor(message: string) {
    super(message);
    this.name = "ReplayedError";
  }
}

/* ------------------------------ in-memory store ------------------------------ */

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, { rec: IdempotencyRecord; exp: number }>();
  constructor(private readonly ttlMs = 24 * 60 * 60 * 1000) {}

  get(key: string): IdempotencyRecord | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.exp) { this.map.delete(key); return undefined; }
    return e.rec;
  }
  create(key: string, record: IdempotencyRecord): boolean {
    if (this.get(key)) return false;
    this.map.set(key, { rec: record, exp: Date.now() + this.ttlMs });
    return true;
  }
  set(key: string, record: IdempotencyRecord): void {
    this.map.set(key, { rec: record, exp: Date.now() + this.ttlMs });
  }
  delete(key: string): void {
    this.map.delete(key);
  }
}

/* ------------------------------ fingerprint ------------------------------ */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

/** Stable fingerprint of a request payload (order-independent). Pass it as `fingerprint`. */
export function fingerprint(value: unknown): string {
  const s = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/* ------------------------------ options & result ------------------------------ */

export interface RunOptions {
  store?: IdempotencyStore;
  /** Request signature; a mismatch on the same key throws {@link IdempotencyKeyReuseError}. */
  fingerprint?: string;
  /** What to do when another call for the key is in progress. Default "throw". */
  onConflict?: "throw" | "wait";
  /** Cache failures too (replay the error). Default false → failures are retryable. */
  cacheErrors?: boolean;
  /** Poll interval when waiting (ms). Default 50. */
  pollIntervalMs?: number;
  /** Max time to wait for an in-progress op (ms). Default 10_000. */
  waitTimeoutMs?: number;
  /** Override "now" (ms) — for tests. */
  now?: number;
}

export interface RunResult<T> {
  value: T;
  /** True when the result came from a previous run (a replay), not a fresh execution. */
  replayed: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ the engine ------------------------------ */

export class Idempotency {
  private readonly store: IdempotencyStore;
  private readonly cacheErrors: boolean;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(opts: { store?: IdempotencyStore; cacheErrors?: boolean } = {}) {
    this.store = opts.store ?? new MemoryIdempotencyStore();
    this.cacheErrors = opts.cacheErrors ?? false;
  }

  /**
   * Run `fn` at most once for `key`. A repeat call replays the stored result.
   *
   * @example
   * const { value, replayed } = await idem.run(idempotencyKey, () => charge(order));
   */
  async run<T>(key: string, fn: () => Promise<T> | T, opts: RunOptions = {}): Promise<RunResult<T>> {
    // Same-process single-flight: concurrent duplicates await the same execution.
    const flying = this.inflight.get(key) as Promise<{ value: T; fresh: boolean }> | undefined;
    if (flying) return { value: (await flying).value, replayed: true };

    const store = opts.store ?? this.store;
    const cacheErrors = opts.cacheErrors ?? this.cacheErrors;
    const now = opts.now ?? Date.now();
    const record: IdempotencyRecord = { status: "in-progress", fingerprint: opts.fingerprint, createdAt: now };

    // Register the in-flight promise SYNCHRONOUSLY, before any await, so
    // truly-concurrent callers see it and don't race on create().
    const exec = (async (): Promise<{ value: T; fresh: boolean }> => {
      const existing = await store.get(key);
      if (existing) {
        if (opts.fingerprint && existing.fingerprint && existing.fingerprint !== opts.fingerprint) {
          throw new IdempotencyKeyReuseError(key);
        }
        if (existing.status === "completed") return { value: existing.value as T, fresh: false };
        if (existing.status === "failed") {
          if (cacheErrors) throw new ReplayedError(existing.error ?? "Operation previously failed.");
          await store.delete(key); // retryable → clear and re-run below
        } else {
          if ((opts.onConflict ?? "throw") === "wait") return { value: await this.waitFor<T>(store, key, opts), fresh: false };
          throw new IdempotencyConflictError(key);
        }
      }
      const created = await store.create(key, record);
      if (!created) {
        if ((opts.onConflict ?? "throw") === "wait") return { value: await this.waitFor<T>(store, key, opts), fresh: false };
        throw new IdempotencyConflictError(key);
      }
      try {
        const value = await fn();
        await store.set(key, { status: "completed", value, fingerprint: opts.fingerprint, createdAt: record.createdAt, completedAt: Date.now() });
        return { value, fresh: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (cacheErrors) await store.set(key, { status: "failed", error: message, fingerprint: opts.fingerprint, createdAt: record.createdAt, completedAt: Date.now() });
        else await store.delete(key);
        throw err;
      }
    })().finally(() => this.inflight.delete(key));

    this.inflight.set(key, exec);
    const out = await exec;
    return { value: out.value, replayed: !out.fresh };
  }

  private async waitFor<T>(store: IdempotencyStore, key: string, opts: RunOptions): Promise<T> {
    const interval = opts.pollIntervalMs ?? 50;
    const timeout = opts.waitTimeoutMs ?? 10_000;
    const start = Date.now();
    for (;;) {
      const rec = await store.get(key);
      if (!rec || rec.status === "completed") {
        if (rec?.status === "completed") return rec.value as T;
        throw new IdempotencyConflictError(key); // vanished mid-wait
      }
      if (rec.status === "failed") throw new ReplayedError(rec.error ?? "Operation failed.");
      if (Date.now() - start > timeout) throw new IdempotencyConflictError(key);
      await sleep(interval);
    }
  }

  /** Forget a key so its operation can run fresh again. */
  async forget(key: string, store?: IdempotencyStore): Promise<void> {
    await (store ?? this.store).delete(key);
  }
}

/* ------------------------------ functional default ------------------------------ */

const shared = new Idempotency();

/**
 * Run `fn` at most once for `key`, using a shared in-memory store (pass
 * `opts.store` for your own). Returns `{ value, replayed }`.
 *
 * @example
 * const { value } = await idempotent(req.headers["idempotency-key"], () => createOrder(body));
 */
export function idempotent<T>(key: string, fn: () => Promise<T> | T, opts?: RunOptions): Promise<RunResult<T>> {
  return shared.run(key, fn, opts);
}

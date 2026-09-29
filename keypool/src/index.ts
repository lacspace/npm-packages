import type { BucketState, KeypoolStore, KeySpec, KeyState, Limits, ReportInput } from "./types.js";

export type { BucketState, KeypoolStore, KeySpec, KeyState, Limits, ReportInput } from "./types.js";

export interface KeypoolOptions {
  keys: KeySpec[];
  /** Default limits per provider, applied to every key unless the key overrides. */
  providerLimits?: Record<string, Limits>;
  /** Per-model limit overrides, e.g. { "groq:llama-3.3-70b": { tpd: 500000 } }. Key format `provider:model`. */
  modelLimits?: Record<string, Limits>;
  /** Cooldown (ms) applied on a 429 when no retry-after header is present. Default 60000. */
  defaultCooldownMs?: number;
  /** Persistence adapter for cross-process sharing. Default: in-memory only. */
  store?: KeypoolStore;
  /** Injectable clock (ms). */
  now?: () => number;
}

export interface Pick {
  id: string;
  secret: string;
  provider: string;
  model: string;
}

export interface Keypool {
  /**
   * Pick the best healthy key for (provider, model) that can afford ~estTokens,
   * or null if every key is cooling down / quota-exhausted / invalid.
   */
  pick(provider: string, model?: string, estTokens?: number): Promise<Pick | null>;
  /** Report the outcome of a call so counters, cooldowns and quarantine update. */
  report(id: string, result: ReportInput): Promise<void>;
  /** Reserve usage yourself (when you don't call report), e.g. optimistic accounting. */
  note(id: string, model: string, tokens: number): Promise<void>;
  /** Clear a key's invalid quarantine (after you rotated the secret). */
  reinstate(id: string, secret?: string): Promise<void>;
  /** Snapshot of every key's state. */
  states(): Promise<Record<string, KeyState>>;
  /** How many keys are pickable right now for a provider/model. */
  available(provider: string, model?: string, estTokens?: number): Promise<number>;
}

const MIN = 60_000;
const DAY = 86_400_000;

function emptyBucket(now: number): BucketState {
  return { minStart: now, minReq: 0, minTok: 0, dayStart: now, dayReq: 0, dayTok: 0 };
}

function rollBucket(b: BucketState, now: number): void {
  if (now - b.minStart >= MIN) {
    b.minStart = now;
    b.minReq = 0;
    b.minTok = 0;
  }
  if (now - b.dayStart >= DAY) {
    b.dayStart = now;
    b.dayReq = 0;
    b.dayTok = 0;
  }
}

function headerGet(headers: ReportInput["headers"], name: string): string | null {
  if (!headers) return null;
  if (typeof (headers as { get?: unknown }).get === "function") return (headers as { get(n: string): string | null }).get(name);
  const h = headers as Record<string, string | number | null | undefined>;
  const found = h[name] ?? h[name.toLowerCase()] ?? h[name.toUpperCase()];
  return found === undefined || found === null ? null : String(found);
}

export function createKeypool(options: KeypoolOptions): Keypool {
  const now = options.now ?? (() => Date.now());
  const cooldownMs = options.defaultCooldownMs ?? MIN;
  const store = options.store;
  const specs = new Map<string, KeySpec>();
  for (const k of options.keys) specs.set(k.id, k);

  // Live state, hydrated from the store if present.
  let state: Record<string, KeyState> = {};
  let loaded = false;

  const ensureLoaded = async () => {
    if (loaded) return;
    const fromStore = store ? await store.load() : null;
    for (const spec of options.keys) {
      state[spec.id] = fromStore?.[spec.id] ?? {
        id: spec.id,
        provider: spec.provider,
        cooldownUntil: 0,
        invalid: false,
        buckets: {},
        lastUsed: 0,
      };
    }
    loaded = true;
  };

  const persist = async () => {
    if (store) await store.save(state);
  };

  const limitsFor = (spec: KeySpec, model: string): Limits => ({
    ...(options.providerLimits?.[spec.provider] ?? {}),
    ...(options.modelLimits?.[`${spec.provider}:${model}`] ?? {}),
    ...(spec.limits ?? {}),
  });

  const bucketOf = (ks: KeyState, model: string, t: number): BucketState => {
    let b = ks.buckets[model];
    if (!b) {
      b = emptyBucket(t);
      ks.buckets[model] = b;
    }
    rollBucket(b, t);
    return b;
  };

  const canAfford = (spec: KeySpec, ks: KeyState, model: string, estTokens: number, t: number): boolean => {
    if (ks.invalid) return false;
    if (ks.cooldownUntil > t) return false;
    const lim = limitsFor(spec, model);
    const b = bucketOf(ks, model, t);
    if (lim.rpm !== undefined && b.minReq + 1 > lim.rpm) return false;
    if (lim.rpd !== undefined && b.dayReq + 1 > lim.rpd) return false;
    if (lim.tpm !== undefined && b.minTok + estTokens > lim.tpm) return false;
    if (lim.tpd !== undefined && b.dayTok + estTokens > lim.tpd) return false;
    return true;
  };

  const candidates = (provider: string, model: string, estTokens: number, t: number): { spec: KeySpec; ks: KeyState }[] => {
    const out: { spec: KeySpec; ks: KeyState }[] = [];
    for (const spec of options.keys) {
      if (spec.provider !== provider) continue;
      const ks = state[spec.id]!;
      if (canAfford(spec, ks, model, estTokens, t)) out.push({ spec, ks });
    }
    // Highest priority, then least-recently-used (round-robin), then id for stability.
    out.sort(
      (a, b) =>
        (b.spec.priority ?? 0) - (a.spec.priority ?? 0) ||
        a.ks.lastUsed - b.ks.lastUsed ||
        a.spec.id.localeCompare(b.spec.id),
    );
    return out;
  };

  return {
    async pick(provider, model = "", estTokens = 0) {
      await ensureLoaded();
      const t = now();
      const cand = candidates(provider, model, estTokens, t)[0];
      if (!cand) return null;
      // Optimistically reserve one request + estimated tokens so concurrent picks spread out.
      const b = bucketOf(cand.ks, model, t);
      b.minReq += 1;
      b.dayReq += 1;
      b.minTok += estTokens;
      b.dayTok += estTokens;
      cand.ks.lastUsed = t;
      await persist();
      return { id: cand.spec.id, secret: cand.spec.secret, provider, model };
    },

    async report(id, result) {
      await ensureLoaded();
      const ks = state[id];
      if (!ks) return;
      const t = now();
      const model = result.model ?? Object.keys(ks.buckets)[0] ?? "";
      const b = bucketOf(ks, model, t);

      // Reconcile token count if the caller reserved an estimate at pick().
      if (result.tokens !== undefined) {
        b.minTok += result.tokens; // add ACTUAL on top of the estimate reserved at pick; callers can pass a delta if they prefer
        b.dayTok += result.tokens;
      }

      // Absorb provider-reported remaining/limits when present.
      const retryAfter = headerGet(result.headers, "retry-after");
      const status = result.status ?? (result.ok ? 200 : 0);

      if (status === 401 || status === 403) {
        ks.invalid = true;
      } else if (status === 429) {
        let waitMs = cooldownMs;
        if (retryAfter) {
          const n = Number(retryAfter);
          waitMs = Number.isFinite(n) ? n * 1000 : Math.max(0, new Date(retryAfter).getTime() - t) || cooldownMs;
        }
        ks.cooldownUntil = t + waitMs;
      } else if (result.ok) {
        // clear any stale cooldown on a clean success
        if (ks.cooldownUntil <= t) ks.cooldownUntil = 0;
      }
      await persist();
    },

    async note(id, model, tokens) {
      await ensureLoaded();
      const ks = state[id];
      if (!ks) return;
      const b = bucketOf(ks, model, now());
      b.minTok += tokens;
      b.dayTok += tokens;
      await persist();
    },

    async reinstate(id, secret) {
      await ensureLoaded();
      const ks = state[id];
      if (!ks) return;
      ks.invalid = false;
      ks.cooldownUntil = 0;
      if (secret) {
        const spec = specs.get(id);
        if (spec) spec.secret = secret;
      }
      await persist();
    },

    async states() {
      await ensureLoaded();
      return JSON.parse(JSON.stringify(state));
    },

    async available(provider, model = "", estTokens = 0) {
      await ensureLoaded();
      return candidates(provider, model, estTokens, now()).length;
    },
  };
}

/** A KeypoolStore backed by any {get,set} KV (JSON string values). Handy over Mongo/Redis. */
export function kvStore(kv: { get(k: string): Promise<string | null> | string | null; set(k: string, v: string): Promise<void> | void }, key = "keypool:state"): KeypoolStore {
  return {
    async load() {
      const raw = await kv.get(key);
      return raw ? (JSON.parse(raw) as Record<string, KeyState>) : null;
    },
    async save(states) {
      await kv.set(key, JSON.stringify(states));
    },
  };
}

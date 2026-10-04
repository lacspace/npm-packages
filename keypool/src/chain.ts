/**
 * The AI key chain: every key you hold, tried in a fixed route order, switching to the next
 * only when one fails. Packaged from ShareRocketPro's production pool, which follows
 * WeNepal's rules:
 *
 *  - The route is a list of provider/model steps (per purpose if you like). Each step is
 *    tried with every key of that provider before moving on.
 *  - 429 rests the key+model PAIR, not the whole key. A per-day quota rests Gemini until
 *    Pacific midnight (when Google resets it); other providers rest max(retry-after, 15 min).
 *    Per-minute limits rest for the delay the provider asks for (min 20 s). 402 rests 6 h.
 *  - A rejected key (401/403, Gemini's 400 "API key not valid") is marked invalid and skipped
 *    until it is re-tested (`clearRests`).
 *  - 5xx / timeout / network: one retry, then a failure count. N failures in a row (default 3)
 *    rest the key for 10 min. A success resets the count. An overloaded model skips the rest
 *    of that step's keys (they'd hit the same model) and goes to the next step.
 *  - Groq counts max_tokens against its per-minute budget up front: a 413 or "tokens per
 *    minute" 429 shrinks max_tokens to fit and retries once.
 *  - A reasoning model that returns empty text is retried once with a bigger budget.
 *  - Gemini Flash (not Flash-Lite) gets thinkingBudget 0; gpt-oss gets reasoning_effort low.
 *  - JSON mode: response_format json_object where supported; Groq's json_validate_failed is
 *    retried without it; fences are stripped and the JSON is repaired.
 *  - Rests, counts and invalid marks live in a pluggable store so every process sees them.
 *  - Every attempt is reported to `onCall` for a ledger (never the key or the text).
 */

import { parseJson as repairParse } from "@lacspace/json-repair";
import { AiError, chat as aiChat, classifyError, type ChatOptions, type ChatResponse, type FetchLike, type Message } from "@lacspace/ai";

/* ── providers ──────────────────────────────────────────────────────────── */

export interface ProviderDef {
  /** @lacspace/ai provider id. */
  provider: ChatOptions["provider"];
  baseUrl?: string;
  /** Default model for this provider. */
  model: string;
  /** Minimum max_tokens (reasoning models need room to think and answer). */
  minTokens?: number;
  label?: string;
  /** Supports OpenAI-style `response_format: { type: "json_object" }`. */
  jsonMode?: boolean;
}

/** Built-in provider presets (override or extend with `providers`). */
export const PROVIDERS: Record<string, ProviderDef> = {
  gemini: { provider: "google", model: "gemini-3.1-flash-lite", label: "Google Gemini" },
  // gpt-oss reasons before it answers, so it needs room for both.
  groq: { provider: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", minTokens: 1600, label: "Groq", jsonMode: true },
  cerebras: { provider: "openai-compatible", baseUrl: "https://api.cerebras.ai/v1", model: "gpt-oss-120b", minTokens: 1600, label: "Cerebras", jsonMode: true },
  openai: { provider: "openai", model: "gpt-5-mini", label: "OpenAI", jsonMode: true },
  anthropic: { provider: "anthropic", model: "claude-haiku-4-5", label: "Anthropic" },
  deepseek: { provider: "openai-compatible", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", label: "DeepSeek", jsonMode: true },
  openrouter: { provider: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-3.1-flash-lite", label: "OpenRouter" },
};

/* ── shared state ───────────────────────────────────────────────────────── */

/** Where rests, failure counts, invalid marks and caps live. Async-friendly. */
export interface ChainStore {
  get(k: string): Promise<string | null> | string | null;
  /** Set with an optional TTL in ms. */
  set(k: string, v: string, ttlMs?: number): Promise<void> | void;
  del(...ks: string[]): Promise<void> | void;
  /** Increment; when the counter is new, it expires after `ttlMs`. Returns the new value. */
  incr(k: string, ttlMs: number): Promise<number> | number;
  /** Keys starting with a prefix (for listing rests). */
  keys(prefix: string): Promise<string[]> | string[];
}

/** In-memory store (single process). */
export function memoryStore(now: () => number = Date.now): ChainStore {
  const m = new Map<string, { v: string; until: number }>();
  const live = (k: string) => {
    const e = m.get(k);
    if (!e) return null;
    if (e.until && e.until < now()) { m.delete(k); return null; }
    return e;
  };
  return {
    get: (k) => live(k)?.v ?? null,
    set: (k, v, ttl) => void m.set(k, { v, until: ttl ? now() + ttl : 0 }),
    del: (...ks) => { for (const k of ks) m.delete(k); },
    incr: (k, ttl) => {
      const e = live(k);
      const n = Number(e?.v ?? 0) + 1;
      m.set(k, { v: String(n), until: e?.until || now() + ttl });
      return n;
    },
    keys: (p) => [...m.keys()].filter((k) => k.startsWith(p) && live(k)),
  };
}

/**
 * Adapter for a node-redis v4 client (`createClient()`), so several processes share state.
 * Uses GET, SET PX, DEL, INCR + PEXPIRE and KEYS (prefix listing is only used for `rests()`).
 */
export function redisStore(client: {
  get(k: string): Promise<string | null>;
  set(k: string, v: string, opts?: { PX: number }): Promise<unknown>;
  del(ks: string[]): Promise<unknown>;
  incr(k: string): Promise<number>;
  pExpire(k: string, ms: number): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}, prefix = ""): ChainStore {
  return {
    get: (k) => client.get(prefix + k),
    set: async (k, v, ttl) => { await (ttl ? client.set(prefix + k, v, { PX: Math.max(1000, Math.round(ttl)) }) : client.set(prefix + k, v)); },
    del: async (...ks) => { if (ks.length) await client.del(ks.map((k) => prefix + k)); },
    incr: async (k, ttl) => {
      const n = await client.incr(prefix + k);
      if (n === 1) await client.pExpire(prefix + k, ttl);
      return n;
    },
    keys: async (p) => (await client.keys(`${prefix}${p}*`)).map((k) => k.slice(prefix.length)),
  };
}

/** The subset of a MongoDB driver `Collection` that `mongoStore` uses (driver v4–v6). */
export interface MongoLikeCollection {
  findOne(filter: Record<string, unknown>): Promise<Record<string, any> | null>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, opts?: { upsert?: boolean }): Promise<unknown>;
  deleteOne(filter: Record<string, unknown>): Promise<unknown>;
  deleteMany(filter: Record<string, unknown>): Promise<unknown>;
  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>, opts: Record<string, unknown>): Promise<any>;
  find(filter: Record<string, unknown>, opts?: Record<string, unknown>): { toArray(): Promise<Record<string, any>[]> };
  createIndex?(spec: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Store on a MongoDB collection (pass `mongoose.connection.db.collection("ai_pool")` or a
 * driver Collection), so several processes share rests without Redis. Documents are
 * `{ _id: key, v, n?, expiresAt? }`; a TTL index on `expiresAt` is created once (Mongo sweeps it
 * about once a minute, so reads also check expiry). Counters use an atomic `$inc` upsert.
 * @since 1.3.0
 */
export function mongoStore(collection: MongoLikeCollection, options: string | { prefix?: string; now?: () => number } = {}): ChainStore {
  const o = typeof options === "string" ? { prefix: options } : options;
  const prefix = o.prefix ?? "";
  const now = o.now ?? Date.now;
  let indexed: Promise<unknown> | null = null;
  const ensureIndex = () => (indexed ??= Promise.resolve(collection.createIndex?.({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "keypool_ttl" })).catch(() => undefined));
  const id = (k: string) => prefix + k;
  const alive = (d: Record<string, any> | null) => !!d && !(d.expiresAt && new Date(d.expiresAt).getTime() <= now());
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    async get(k) {
      await ensureIndex();
      const d = await collection.findOne({ _id: id(k) });
      if (!alive(d)) return null;
      return d!.v != null ? String(d!.v) : d!.n != null ? String(d!.n) : null;
    },
    async set(k, v, ttl) {
      await ensureIndex();
      await collection.updateOne(
        { _id: id(k) },
        ttl ? { $set: { v, expiresAt: new Date(now() + ttl) }, $unset: { n: "" } } : { $set: { v }, $unset: { expiresAt: "", n: "" } },
        { upsert: true },
      );
    },
    async del(...ks) {
      if (ks.length) await collection.deleteMany({ _id: { $in: ks.map(id) } });
    },
    async incr(k, ttl) {
      await ensureIndex();
      // An expired counter the TTL sweep hasn't removed yet must restart from 1.
      await collection.deleteOne({ _id: id(k), expiresAt: { $lte: new Date(now()) } });
      const res = await collection.findOneAndUpdate(
        { _id: id(k) },
        { $inc: { n: 1 }, $setOnInsert: { expiresAt: new Date(now() + ttl) } },
        { upsert: true, returnDocument: "after" },
      );
      const doc = res && "value" in res && res.ok !== undefined ? res.value : res; // driver v4/v5 vs v6
      return Number(doc?.n ?? 1);
    },
    async keys(p) {
      const docs = await collection
        .find({ _id: { $regex: "^" + esc(id(p)) }, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date(now()) } }] }, { projection: { _id: 1 } })
        .toArray();
      return docs.map((d) => String(d._id).slice(prefix.length));
    },
  };
}

/* ── helpers ────────────────────────────────────────────────────────────── */

/** ms until the next midnight in Los Angeles, when Gemini's daily quota resets (+30 s, min 1 min). */
export function msToPacificMidnight(now = new Date()): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(now)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const secs = (parts.hour! % 24) * 3600 + parts.minute! * 60 + parts.second!;
  return Math.max(60_000, (86_400 - secs) * 1000 + 30_000);
}

/** The wait a provider asks for: Gemini `"retryDelay": "35s"`, Groq "try again in 2m3.5s". */
export function retryAfterMs(text: string): number | null {
  const g = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text);
  if (g) return Number(g[1]) * 1000;
  const q = /try again in\s+(?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?/i.exec(text);
  if (q && (q[1] || q[2] || q[3] || q[4])) return (Number(q[1] || 0) * 3600 + Number(q[2] || 0) * 60 + Number(q[3] || 0)) * 1000 + Number(q[4] || 0);
  return null;
}

const errText = (e: unknown) => {
  const raw = e instanceof AiError ? e.raw : undefined;
  let body = "";
  try { body = typeof raw === "string" ? raw : raw ? JSON.stringify(raw) : ""; } catch { body = ""; }
  return `${(e as Error)?.message || String(e)} ${body}`;
};
const PER_DAY = /per ?day|PerDay|\bRPD\b|\bTPD\b|daily/i;
const TPM = /tokens per minute|\bTPM\b|Request too large/i;
const OVERLOADED = /overloaded|UNAVAILABLE|high demand/i;
const JSON_FAILED = /json_validate_failed|response_format|json mode/i;

/**
 * Default request tweaks: Gemini Flash (not Flash-Lite, which rejects it) gets
 * thinkingBudget 0 so it doesn't spend output tokens thinking; gpt-oss gets reasoning_effort low.
 */
export function defaultTweak(providerName: string, model: string, body: Record<string, any>): Record<string, any> {
  if (providerName === "gemini" && /flash/.test(model) && !/lite/.test(model)) {
    body.generationConfig = { ...(body.generationConfig || {}), thinkingConfig: { thinkingBudget: 0 } };
  }
  if ((providerName === "groq" || providerName === "cerebras") && /gpt-oss/.test(model)) body.reasoning_effort = "low";
  return body;
}

/* ── the chain ──────────────────────────────────────────────────────────── */

export interface ChainKey {
  id: string;
  /** Provider name from `providers` (e.g. "gemini", "groq"). */
  provider: string;
  apiKey: string;
  label?: string;
  /** "disabled" / "invalid" keys are skipped (except when targeted with `onlyKey`). */
  status?: "active" | "disabled" | "invalid";
}

export interface RouteStep {
  provider: string;
  model: string;
  enabled?: boolean;
}

export interface CallRow {
  purpose?: string;
  provider: string;
  model: string;
  keyId: string;
  ok: boolean;
  status?: number;
  kind?: string;
  error?: string;
  inTok?: number;
  outTok?: number;
  ms: number;
  who?: string;
}

export interface ChainOptions {
  /** The keys, or a loader (called on every chat; cache it yourself if it hits a DB). */
  keys: ChainKey[] | (() => ChainKey[] | Promise<ChainKey[]>);
  /** Default route. */
  route: RouteStep[];
  /** Per-purpose routes (fall back to `route`). */
  routes?: Record<string, RouteStep[]>;
  /** Extra / overriding provider definitions. */
  providers?: Record<string, ProviderDef>;
  store?: ChainStore;
  /** Failures in a row before a key rests (default 3). */
  failThreshold?: number;
  /** Rest after `failThreshold` failures, minutes (default 10). */
  coolMinutes?: number;
  /** Per-purpose daily caps for `takePurpose` (0/absent = unlimited). */
  purposeCaps?: Record<string, number>;
  /** Day bucket for caps (default: Nepal date, UTC+05:45). */
  dayKey?: (now: number) => string;
  /** Called for every attempt (ledger). Never receives the key or the text. */
  onCall?: (row: CallRow) => void;
  /** A key was rejected by its provider (persist the "invalid" status in your DB). */
  onInvalid?: (key: ChainKey, why: string) => void | Promise<void>;
  /** A key answered (e.g. update lastOkAt). */
  onOk?: (key: ChainKey) => void | Promise<void>;
  /** Shape the provider request body (default `defaultTweak`). */
  tweak?: (providerName: string, model: string, body: Record<string, any>) => Record<string, any>;
  /** Default temperature (0.3). */
  temperature?: number;
  /** Overall deadline per chat, ms (45 000). */
  timeoutMs?: number;
  /** Base fetch (default global fetch). */
  fetchImpl?: FetchLike;
  /** Chat implementation (default @lacspace/ai `chat`), injectable for tests. */
  chat?: (o: ChatOptions) => Promise<ChatResponse>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ChainCall {
  purpose?: string;
  messages: Message[];
  maxTokens: number;
  temperature?: number;
  who?: string;
  /** Ask for JSON: response_format where supported, then fence-strip + repair into `json`. */
  json?: boolean;
  /** Only this key / step (for a panel "test" button). */
  onlyKey?: string;
  onlyStep?: { provider: string; model: string };
  timeoutMs?: number;
}

export interface ChainResult {
  text: string;
  /** Parsed JSON when `json: true` (undefined if it couldn't be repaired). */
  json?: unknown;
  provider: string;
  model: string;
  keyId: string;
  usage?: ChatResponse["usage"];
  attempts: { target: string; kind: string }[];
}

export class AiChainError extends Error {
  readonly name = "AiChainError";
  constructor(message: string, readonly attempts: { target: string; kind: string }[]) {
    super(message);
    Object.setPrototypeOf(this, AiChainError.prototype);
  }
}

export interface Rest { until: number; kind: string; why: string }

export interface AiChain {
  chat(c: ChainCall): Promise<ChainResult>;
  /** Reserve one call against a purpose's daily cap; false when the cap is reached. */
  takePurpose(purpose: string): Promise<boolean>;
  /** Every resting key+model pair ("*" = whole key), for an admin panel. */
  rests(): Promise<Record<string, (Rest & { model: string })[]>>;
  /** Clear a key's rests, failure count and invalid mark (after a successful re-test). */
  clearRests(keyId: string): Promise<void>;
  /** True if the key was marked invalid (rejected by its provider). */
  isInvalid(keyId: string): Promise<boolean>;
  /**
   * Change options without rebuilding the chain (e.g. after an admin edits the route).
   * Rests, counts and invalid marks in the store are kept. `store`, `now` and `sleep` can't change. @since 1.2.0
   */
  setOptions(patch: Partial<Omit<ChainOptions, "store" | "now" | "sleep">>): void;
}

/** Create an AI key chain. */
export function createAiChain(initial: ChainOptions): AiChain {
  let o: ChainOptions = { ...initial };
  const store = o.store ?? memoryStore(o.now);
  const now = o.now ?? Date.now;
  let providers = { ...PROVIDERS, ...(o.providers ?? {}) };
  const failThreshold = () => o.failThreshold ?? 3;
  const coolMs = () => (o.coolMinutes ?? 10) * 60_000;
  const tweak = (p: string, m: string, b: Record<string, any>) => (o.tweak ?? defaultTweak)(p, m, b);
  const doChat = o.chat ?? aiChat;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const dayKey = o.dayKey ?? ((t: number) => new Date(t + 5.75 * 3600_000).toISOString().slice(0, 10));
  const baseFetch: FetchLike = o.fetchImpl ?? ((u, i) => fetch(u, i));

  const restKey = (keyId: string, model: string) => `ai:rest:${keyId}:${model}`;
  const restOf = async (keyId: string, model: string): Promise<Rest | null> => {
    for (const m of [model, "*"]) {
      const v = await store.get(restKey(keyId, m));
      if (v) { try { const r = JSON.parse(v) as Rest; if (r.until > now()) return r; } catch { /* ignore */ } }
    }
    return null;
  };
  const rest = (keyId: string, model: string, ms: number, kind: string, why: string) =>
    store.set(restKey(keyId, model), JSON.stringify({ until: now() + ms, kind, why: why.slice(0, 160) }), ms);

  const tweakFetch = (providerName: string, model: string, jsonFormat: boolean): FetchLike => (url, init) => {
    try {
      if (typeof init.body === "string") {
        let b = JSON.parse(init.body) as Record<string, any>;
        b = tweak(providerName, model, b);
        if (jsonFormat) b.response_format = { type: "json_object" };
        init = { ...init, body: JSON.stringify(b) };
      }
    } catch { /* send unchanged */ }
    return baseFetch(url, init);
  };

  const ledger = (row: CallRow) => {
    try { o.onCall?.({ ...row, ...(row.error ? { error: row.error.slice(0, 300) } : {}) }); } catch { /* ledger must never break a call */ }
  };

  return {
    async chat(c) {
      const all = typeof o.keys === "function" ? await o.keys() : o.keys;
      const keys: ChainKey[] = [];
      for (const k of all) {
        const bad = await store.get(`ai:bad:${k.id}`);
        const status = bad ? "invalid" : (k.status ?? "active");
        if (status === "active" || (c.onlyKey && k.id === c.onlyKey)) keys.push({ ...k, status });
      }
      const route = (c.purpose && o.routes?.[c.purpose]) || o.route;
      const steps = c.onlyStep ? [{ ...c.onlyStep, enabled: true }] : route.filter((r) => r.enabled !== false);
      const attempts: { target: string; kind: string }[] = [];
      const deadline = now() + (c.timeoutMs ?? o.timeoutMs ?? 45_000);
      const skipped: { k: ChainKey; step: RouteStep; until: number }[] = [];

      const tryOne = async (k: ChainKey, step: RouteStep): Promise<ChainResult | "next-step" | null> => {
        const def = providers[step.provider]!;
        let maxTokens = Math.max(c.maxTokens, def.minTokens || 0);
        let transientRetry = true, grewOnce = false, shrankOnce = false;
        let jsonFormat = !!c.json && !!def.jsonMode;
        for (;;) {
          const t0 = now();
          const left = deadline - t0;
          if (left < 2000) return null;
          try {
            const r = await doChat({
              provider: def.provider,
              baseUrl: def.baseUrl,
              model: step.model,
              apiKey: k.apiKey,
              messages: c.messages,
              maxTokens,
              temperature: c.temperature ?? o.temperature ?? 0.3,
              signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(Math.min(left, 40_000)) : undefined,
              fetchImpl: tweakFetch(step.provider, step.model, jsonFormat),
            });
            const text = (r.text || "").trim();
            ledger({ purpose: c.purpose, provider: step.provider, model: step.model, keyId: k.id, ok: !!text, kind: text ? undefined : "empty", inTok: r.usage?.inputTokens, outTok: r.usage?.outputTokens, ms: now() - t0, who: c.who });
            if (text) {
              await store.del(`ai:fails:${k.id}`);
              try { await o.onOk?.(k); } catch { /* ignore */ }
              const out: ChainResult = { text, provider: step.provider, model: step.model, keyId: k.id, usage: r.usage, attempts };
              if (c.json) { try { out.json = repairParse(text); } catch { out.json = undefined; } }
              return out;
            }
            // Empty: a reasoning model spent the budget thinking. Once with more room.
            if (!grewOnce && (r.finishReason === "length" || (r.usage?.reasoningTokens ?? 0) > 0)) { grewOnce = true; maxTokens = Math.min(8000, Math.max(2000, maxTokens * 2.5)); continue; }
            attempts.push({ target: `${k.id}/${step.model}`, kind: "empty" });
            return null;
          } catch (e) {
            const ms = now() - t0;
            const kind = classifyError(e);
            const status = e instanceof AiError ? e.status : undefined;
            const text = errText(e);
            ledger({ purpose: c.purpose, provider: step.provider, model: step.model, keyId: k.id, ok: false, status, kind, error: (e as Error)?.message, ms, who: c.who });
            attempts.push({ target: `${k.id}/${step.model}`, kind });

            if (kind === "auth") {
              k.status = "invalid";
              const why = (e as Error)?.message || "rejected";
              await store.set(`ai:bad:${k.id}`, why.slice(0, 200));
              try { await o.onInvalid?.(k, why); } catch { /* ignore */ }
              return null;
            }
            // Groq json mode: the model's JSON failed validation — retry once without response_format.
            if (jsonFormat && status === 400 && JSON_FAILED.test(text)) { jsonFormat = false; continue; }
            // Groq: max_tokens counts against tokens-per-minute up front — shrink to fit once.
            if (!shrankOnce && (status === 413 || (status === 429 && TPM.test(text)))) {
              const m = /Limit\s+(\d+),\s*Requested\s+(\d+)/i.exec(text);
              const over = m ? Number(m[2]) - Number(m[1]) : maxTokens / 2;
              const next = Math.floor(maxTokens - over - 200);
              // Never shrink under the provider's floor (gpt-oss needs ~1600 to reason + answer):
              // that retry is certain to fail. A 413 can't be served by this step at all.
              if (next >= Math.max(400, def.minTokens ?? 0)) { shrankOnce = true; maxTokens = next; continue; }
              if (status === 413) return "next-step";
            }
            if (status === 429 || status === 402 || kind === "quota" || kind === "rate_limit") {
              const perDay = PER_DAY.test(text);
              const wait = retryAfterMs(text);
              const restMs = status === 402
                ? 6 * 3600_000
                : perDay
                  ? (step.provider === "gemini" ? msToPacificMidnight(new Date(now())) : Math.max(wait ?? 0, 15 * 60_000))
                  : Math.max(wait ?? 60_000, 20_000);
              await rest(k.id, step.model, restMs, perDay ? "daily quota" : status === 402 ? "billing" : "rate limit", String((e as Error)?.message || ""));
              return null;
            }
            if (kind === "transient") {
              if (transientRetry && !OVERLOADED.test(text)) { transientRetry = false; await sleep(800); continue; }
              const fails = await store.incr(`ai:fails:${k.id}`, 30 * 60_000);
              if (fails >= failThreshold()) await rest(k.id, "*", coolMs(), "failing", `${fails} failures in a row`);
              // The model itself is overloaded: the other keys would hit the same wall.
              if (OVERLOADED.test(text)) { await rest(k.id, step.model, 60_000, "overloaded", "model overloaded"); return "next-step"; }
              return null;
            }
            // 400/404 (unknown model, bad request): this step can't serve it; other steps might.
            if (kind === "bad_request") return "next-step";
            const fails = await store.incr(`ai:fails:${k.id}`, 30 * 60_000);
            if (fails >= failThreshold()) await rest(k.id, "*", coolMs(), "failing", `${fails} failures in a row`);
            return null;
          }
        }
      };

      for (const step of steps) {
        if (!providers[step.provider]) continue;
        for (const k of keys.filter((x) => x.provider === step.provider && (!c.onlyKey || x.id === c.onlyKey))) {
          if (now() > deadline - 2000) break;
          if (k.status === "invalid" && !c.onlyKey) continue; // rejected earlier in this call
          const r0 = await restOf(k.id, step.model);
          if (r0 && !c.onlyKey) { skipped.push({ k, step, until: r0.until }); continue; }
          const r = await tryOne(k, step);
          if (r === "next-step") break;
          if (r) return r;
        }
      }
      // Everything was resting: try the soonest-to-recover pair once before giving up.
      if (!attempts.length && skipped.length) {
        const s0 = skipped.sort((a, b) => a.until - b.until)[0]!;
        const r = await tryOne(s0.k, s0.step);
        if (r && r !== "next-step") return r;
      }
      if (!attempts.length && !skipped.length) throw new AiChainError("No AI key is configured for the route.", attempts);
      throw new AiChainError(`Every AI key failed: ${attempts.map((a) => `${a.target}=${a.kind}`).join(", ")}`, attempts);
    },

    async takePurpose(p) {
      const cap = o.purposeCaps?.[p];
      if (!cap || cap <= 0) return true;
      const n = await store.incr(`ai:cap:${dayKey(now())}:${p}`, 26 * 3600_000);
      return n <= cap;
    },

    async rests() {
      const out: Record<string, (Rest & { model: string })[]> = {};
      for (const k of await store.keys("ai:rest:")) {
        const v = await store.get(k);
        if (!v) continue;
        const [, , keyId, ...m] = k.split(":");
        try {
          const r = JSON.parse(v) as Rest;
          if (r.until > now()) (out[keyId!] ||= []).push({ ...r, model: m.join(":") });
        } catch { /* ignore */ }
      }
      return out;
    },

    async clearRests(keyId) {
      const ks = await store.keys(`ai:rest:${keyId}:`);
      await store.del(...ks, `ai:fails:${keyId}`, `ai:bad:${keyId}`);
    },

    async isInvalid(keyId) {
      return !!(await store.get(`ai:bad:${keyId}`));
    },

    setOptions(patch) {
      o = { ...o, ...patch };
      if (patch.providers) providers = { ...PROVIDERS, ...(o.providers ?? {}) };
    },
  };
}

/**
 * Provider fallback with cooldowns: try each configured provider/model in order, rest the
 * ones that fail (longer for quota/billing and bad keys), and move on. When every target
 * is resting, try them all once anyway, soonest-to-recover first.
 *
 * ```ts
 * const ai = createFallbackClient([
 *   { provider: "google", model: "gemini-3.1-flash-lite", apiKey: GEMINI_KEY },
 *   { provider: "openai-compatible", model: "openai/gpt-oss-120b", apiKey: GROQ_KEY, baseUrl: "https://api.groq.com/openai/v1" },
 * ]);
 * const res = await ai.chat({ messages: [user("Explain RSI in one line")] });
 * res.target; // which one answered
 * ```
 */

import type { ChatChunk, ChatOptions, ChatResponse, FetchLike, Provider } from "./types.js";
import { AiError } from "./errors.js";
import { chat } from "./chat.js";
import { stream } from "./stream.js";

/** Why a call failed, for picking a cooldown. */
export type FailureKind = "auth" | "quota" | "rate_limit" | "transient" | "bad_request" | "empty" | "other";

const AUTH_RE = /api[ _-]?key not valid|invalid[ _-]?(?:api[ _-]?)?key|incorrect api key|invalid x-api-key|invalid authentication|unauthori[sz]ed|authentication[ _]failed|permission[ _]denied|api[ _-]?key (?:expired|revoked|missing)|no api key/i;
const QUOTA_RE = /quota|billing|insufficient[ _](?:quota|funds|balance|credits?)|credit balance|exceeded your current|payment required|plan limit|spend(?:ing)? limit|tokens per day|requests per day|\bTPD\b|\bRPD\b/i;

/**
 * Classify a thrown error. Handles provider quirks: Gemini reports a bad key as HTTP 400
 * "API key not valid", and quota exhaustion as 429 RESOURCE_EXHAUSTED with "quota".
 */
export function classifyError(err: unknown): FailureKind {
  if (err instanceof EmptyResponseError) return "empty";
  // AiError, or any error-like object with a numeric HTTP `status` (fetch wrappers, other SDKs).
  const e = err as { status?: unknown; statusCode?: unknown; message?: unknown; raw?: unknown; body?: unknown } | null;
  const status = typeof e?.status === "number" ? e.status : typeof e?.statusCode === "number" ? e.statusCode : undefined;
  if (!(err instanceof AiError) && status === undefined) return "other";
  err = { status: status ?? 0, message: String(e?.message ?? ""), raw: e?.raw ?? e?.body };
  const x = err as { status: number; message: string; raw: unknown };
  const msg = `${x.message} ${safeString(x.raw)}`;
  if (x.status === 401 || x.status === 403 || AUTH_RE.test(msg)) return "auth";
  if (x.status === 402 || QUOTA_RE.test(msg)) return "quota";
  if (x.status === 429) return "rate_limit";
  if (x.status === 0 || x.status === 408 || x.status >= 500) return "transient";
  if (x.status === 400 || x.status === 404 || x.status === 422) return "bad_request";
  return "other";
}

/** Thrown (internally) when a reply is empty even after growing the token budget. */
export class EmptyResponseError extends Error {
  readonly name = "EmptyResponseError";
  constructor(readonly response: ChatResponse) {
    super(`empty response (finishReason ${response.finishReason}, reasoning ${response.usage?.reasoningTokens ?? 0} tokens)`);
    Object.setPrototypeOf(this, EmptyResponseError.prototype);
  }
}

function safeString(x: unknown): string {
  if (x == null) return "";
  if (typeof x === "string") return x;
  try { return JSON.stringify(x); } catch { return ""; }
}

/** One provider/model/key to try. */
export interface FallbackTarget {
  provider: Provider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  /** Label used in results/status (default `provider:model`). */
  name?: string;
  /** Per-target defaults merged under each call (e.g. a larger maxTokens for a reasoning model). */
  defaults?: Partial<Omit<ChatOptions, "provider" | "model" | "messages">>;
}

export interface FallbackOptions {
  /** Cooldown per failure kind, ms. Defaults: quota 1 h, auth 6 h, everything else 2 min. */
  cooldownMs?: Partial<Record<FailureKind, number>>;
  /**
   * When a reply is empty with `finishReason: "length"` (budget spent on reasoning),
   * retry the same target with `maxTokens × factor` (capped). Default `{ factor: 4, max: 8192 }`;
   * `false` disables. If it is still empty, the target is treated as failed ("empty").
   */
  growOnEmpty?: false | { factor?: number; max?: number };
  /** Called when a target fails and the client moves on. */
  onFallback?: (info: { target: string; kind: FailureKind; error: unknown; restUntil: number }) => void;
  /** Clock (ms), injectable for tests. */
  now?: () => number;
  fetchImpl?: FetchLike;
}

export interface FallbackAttempt {
  target: string;
  kind: FailureKind;
  error: string;
}

export type FallbackResponse = ChatResponse & {
  /** The target that answered. */
  target: string;
  /** Failed attempts before it, in order. */
  attempts: FallbackAttempt[];
};

export interface TargetStatus {
  target: string;
  resting: boolean;
  restUntil: number;
  lastKind?: FailureKind;
}

export type FallbackCallOptions = Omit<ChatOptions, "provider" | "model" | "apiKey" | "baseUrl">;

export interface FallbackClient {
  chat(opts: FallbackCallOptions): Promise<FallbackResponse>;
  /** Streams from the first target that starts streaming; falls back only before the first chunk. */
  stream(opts: FallbackCallOptions): AsyncGenerator<ChatChunk & { target?: string }, void, unknown>;
  status(): TargetStatus[];
  /** Clear cooldowns (all, or one target by name). */
  reset(target?: string): void;
}

/** All targets failed. `attempts` lists each failure. */
export class FallbackError extends Error {
  readonly name = "FallbackError";
  constructor(readonly attempts: FallbackAttempt[], readonly last: unknown) {
    super(`All ${attempts.length} AI targets failed: ${attempts.map((a) => `${a.target} (${a.kind})`).join(", ")}`);
    Object.setPrototypeOf(this, FallbackError.prototype);
  }
}

const DEFAULT_COOLDOWN: Record<FailureKind, number> = {
  quota: 60 * 60_000,
  auth: 6 * 60 * 60_000,
  rate_limit: 2 * 60_000,
  transient: 2 * 60_000,
  bad_request: 2 * 60_000,
  empty: 2 * 60_000,
  other: 2 * 60_000,
};

/** Create a client that falls back across providers with per-failure cooldowns. */
export function createFallbackClient(targets: FallbackTarget[], options: FallbackOptions = {}): FallbackClient {
  if (!targets.length) throw new Error("createFallbackClient: pass at least one target");
  const now = options.now ?? Date.now;
  const cool = { ...DEFAULT_COOLDOWN, ...(options.cooldownMs ?? {}) };
  const grow = options.growOnEmpty === false ? null : { factor: 4, max: 8192, ...(options.growOnEmpty ?? {}) };
  const nameOf = (t: FallbackTarget) => t.name ?? `${t.provider}:${t.model}`;
  const state = new Map<string, { restUntil: number; lastKind?: FailureKind }>(targets.map((t) => [nameOf(t), { restUntil: 0 }]));

  /** Awake targets in order; if none, every target ordered by soonest recovery. */
  const order = (): FallbackTarget[] => {
    const t = now();
    const awake = targets.filter((x) => state.get(nameOf(x))!.restUntil <= t);
    if (awake.length) return awake;
    return [...targets].sort((a, b) => state.get(nameOf(a))!.restUntil - state.get(nameOf(b))!.restUntil);
  };

  const build = (t: FallbackTarget, o: FallbackCallOptions): ChatOptions => ({
    ...(t.defaults ?? {}),
    ...o,
    provider: t.provider,
    model: t.model,
    apiKey: t.apiKey,
    baseUrl: t.baseUrl,
    headers: { ...(t.headers ?? {}), ...(o.headers ?? {}) },
    fetchImpl: o.fetchImpl ?? options.fetchImpl,
  });

  const fail = (t: FallbackTarget, err: unknown, attempts: FallbackAttempt[]) => {
    const kind = classifyError(err);
    const restUntil = now() + cool[kind];
    const name = nameOf(t);
    state.set(name, { restUntil, lastKind: kind });
    attempts.push({ target: name, kind, error: err instanceof Error ? err.message : String(err) });
    options.onFallback?.({ target: name, kind, error: err, restUntil });
  };
  const ok = (t: FallbackTarget) => state.set(nameOf(t), { restUntil: 0 });

  const isEmpty = (r: ChatResponse) => !r.text && !r.toolCalls.length;

  return {
    async chat(o) {
      const attempts: FallbackAttempt[] = [];
      let last: unknown;
      for (const t of order()) {
        if (o.signal?.aborted) break;
        try {
          const req = build(t, o);
          let res = await chat(req);
          if (isEmpty(res) && res.finishReason === "length" && grow) {
            const bigger = Math.min(grow.max, Math.max(256, (req.maxTokens ?? 1024) * grow.factor));
            if (bigger > (req.maxTokens ?? 0)) res = await chat({ ...req, maxTokens: bigger });
          }
          if (isEmpty(res) && (res.finishReason === "length" || !res.finishReason || res.finishReason === "stop")) throw new EmptyResponseError(res);
          ok(t);
          return { ...res, target: nameOf(t), attempts };
        } catch (err) {
          if (o.signal?.aborted) throw err;
          last = err;
          fail(t, err, attempts);
        }
      }
      throw new FallbackError(attempts, last);
    },

    async *stream(o) {
      const attempts: FallbackAttempt[] = [];
      let last: unknown;
      for (const t of order()) {
        const it = stream(build(t, o));
        let first: IteratorResult<ChatChunk, void>;
        try {
          first = await it.next();
        } catch (err) {
          if (o.signal?.aborted) throw err;
          last = err;
          fail(t, err, attempts);
          continue;
        }
        ok(t);
        const target = nameOf(t);
        if (!first.done) yield { ...first.value, target };
        for await (const c of it) yield { ...c, target };
        return;
      }
      throw new FallbackError(attempts, last);
    },

    status() {
      const t = now();
      return targets.map((x) => {
        const s = state.get(nameOf(x))!;
        return { target: nameOf(x), resting: s.restUntil > t, restUntil: s.restUntil, lastKind: s.lastKind };
      });
    },

    reset(target) {
      for (const [k] of state) if (!target || k === target) state.set(k, { restUntil: 0 });
    },
  };
}

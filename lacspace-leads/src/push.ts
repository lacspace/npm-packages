/**
 * Push finished leads to an HTTP endpoint (a CRM, the Lacspace Mail Leads board…) while
 * the run keeps writing its normal file. @since 1.9.0
 *
 * Leads are batched (every 10 leads or 3 seconds, whichever comes first) and POSTed as JSON
 * in the background: one request in flight at a time, so a slow endpoint never slows the
 * scrape. While a request is out, new leads queue up (capped, default 2,000) and merge into
 * the next batch. `finish(stats)` flushes the rest and sends one final `done: true` POST,
 * bounded in time so Ctrl-C still exits within a few seconds.
 *
 * ```ts
 * const pusher = createPusher({ url: "https://crm.example.com/leads", token: process.env.TOKEN });
 * await searchLeads({ type: "cafes", city: "Kathmandu", onResult: (l) => pusher.push(l) });
 * console.log(formatPushSummary(await pusher.finish()));
 * ```
 *
 * The token is only ever sent in the `Authorization` header. It is never logged, never part
 * of a warning, and never written to any file.
 */
import type { Lead, LeadStats } from "./types.js";

/** This package's version, sent in the push `User-Agent`. */
export const VERSION = "1.9.0";

/** Env var the CLI reads the push token from (safer than `--push-token`). */
export const PUSH_TOKEN_ENV = "LACSPACE_LEADS_PUSH_TOKEN";

/** What the run was searching for, sent with every batch. */
export interface PushSearch {
  type: string | null;
  city: string | null;
  area: string | null;
  target: number | null;
}

/** The JSON body of every push request. */
export interface PushPayload {
  leads: Lead[];
  search: PushSearch;
  /** One random UUID per run/process. */
  run: string;
  /** Batch number, from 1. */
  seq: number;
  /** True only on the final request. */
  done: boolean;
  /** Present on the final (`done: true`) request. */
  stats?: LeadStats;
}

/** Push counters, see {@link Pusher.stats}. */
export interface PushStats {
  /** Leads the endpoint accepted. */
  sent: number;
  /** Lead batches the endpoint accepted (excludes the final done POST). */
  batches: number;
  /** Leads that were not delivered (retries exhausted, 4xx, rejected, or unsent at the deadline). */
  failed: number;
  /** Leads dropped because the in-memory queue was full. */
  dropped: number;
  /** The endpoint answered 401/403; pushing stopped for the rest of the run. */
  rejected: boolean;
  /** The final done POST was accepted. */
  doneSent: boolean;
  /** Leads still waiting to be sent. */
  pending: number;
}

export interface PusherOptions {
  /** Endpoint URL. Must be https, or http on localhost / 127.0.0.1 / [::1]. */
  url: string;
  /** Bearer token; sent as `Authorization: Bearer <token>` when set. */
  token?: string;
  /** Search description sent with every batch. */
  search?: Partial<{ type: string; city: string; area: string; target: number }>;
  /** Run id. Default: a random UUID. */
  run?: string;
  /** The output file, named in the "rejected" message. */
  file?: string;
  /** Warnings and errors (never contain the token). Default: silent. */
  onWarn?: (message: string) => void;
  /** Flush after this many leads. Default 10. */
  batchSize?: number;
  /** Flush at least this often while leads are waiting, ms. Default 3000. */
  intervalMs?: number;
  /** Most leads held in memory waiting to be sent. Default 2000. */
  maxQueue?: number;
  /** Most leads merged into one request when the endpoint is slow. Default 500. */
  maxBatch?: number;
  /** Per-request timeout, ms. Default 15000. */
  timeoutMs?: number;
  /** Backoff before each retry, ms. Default [1000, 3000, 9000] (3 retries). */
  retryDelaysMs?: number[];
  /** Cap on a 429 Retry-After, ms. Default 60000. */
  maxRetryAfterMs?: number;
  /** How long {@link Pusher.finish} may take at most, ms. Default 5000. */
  finishTimeoutMs?: number;
  /** Override fetch (tests). Default: global fetch. */
  fetch?: typeof fetch;
}

export interface Pusher {
  /** Queue a finished lead. Never throws, never blocks. */
  push(lead: Lead): void;
  /** Flush what's left, send the final `done: true` POST with `stats`, and resolve with the counters. Bounded by `finishTimeoutMs`. */
  finish(stats?: LeadStats, opts?: { timeoutMs?: number }): Promise<PushStats>;
  /** Current counters. */
  stats(): PushStats;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Validate a push URL: https anywhere, or plain http only on localhost / 127.0.0.1 / [::1]
 * (development). Throws a clear error otherwise. Returns the parsed URL.
 */
export function validatePushUrl(raw: string): URL {
  const s = (raw ?? "").trim();
  if (!s) throw new Error("--push needs a URL, e.g. --push https://api.example.com/leads");
  let u: URL;
  try { u = new URL(s); } catch { throw new Error(`--push URL is not valid: "${maskUrl(s)}"`); }
  if (u.protocol === "https:") return u;
  if (u.protocol === "http:" && LOCAL_HOSTS.has(u.hostname.toLowerCase())) return u;
  if (u.protocol === "http:") throw new Error(`--push must use https:// (plain http is only allowed for localhost, 127.0.0.1 or [::1]): ${maskUrl(s)}`);
  throw new Error(`--push must be an https:// URL, not ${u.protocol}`);
}

/** A URL safe to print: no user:pass, no query string or fragment. */
export function maskUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}${u.search ? "?…" : ""}`;
  } catch {
    return String(raw).replace(/\/\/[^@/]+@/, "//***@").replace(/\?.*$/, "?…");
  }
}

/** The `"push"` block of a `--config` JSON file. */
export interface PushConfig {
  url?: string;
  token?: string;
}

/**
 * Resolve the push URL + token. Precedence for each: CLI flag, then the config's `push`
 * block, then (token only) the `LACSPACE_LEADS_PUSH_TOKEN` env var. Returns `undefined`
 * when no URL is set (push off). Pure.
 */
export function resolvePush(input: {
  flagUrl?: string;
  flagToken?: string;
  config?: PushConfig | undefined;
  env?: Record<string, string | undefined>;
}): { url: string; token?: string } | undefined {
  const url = input.flagUrl ?? input.config?.url;
  if (url === undefined) return undefined;
  const token = input.flagToken || input.config?.token || input.env?.[PUSH_TOKEN_ENV] || undefined;
  return token ? { url, token } : { url };
}

/**
 * Parse a `Retry-After` header (delta-seconds or an HTTP date) into ms, capped at `capMs`.
 * Returns `undefined` when absent or unreadable. Pure.
 */
export function parseRetryAfter(value: string | null | undefined, capMs = 60_000, now = Date.now()): number | undefined {
  if (value == null) return undefined;
  const v = value.trim();
  if (!v) return undefined;
  let ms: number;
  if (/^\d+(\.\d+)?$/.test(v)) ms = parseFloat(v) * 1000;
  else {
    const t = Date.parse(v);
    if (Number.isNaN(t)) return undefined;
    ms = t - now;
  }
  return Math.min(Math.max(0, ms), capMs);
}

/** One-line summary of a push, e.g. for the CLI's last line. Pure. */
export function formatPushSummary(s: PushStats): string {
  const bits = [`sent ${s.sent} lead${s.sent === 1 ? "" : "s"} in ${s.batches} batch${s.batches === 1 ? "" : "es"}`, `failed ${s.failed}`];
  if (s.dropped) bits.push(`dropped ${s.dropped} (queue full)`);
  bits.push(s.rejected ? "REJECTED (401/403)" : "not rejected");
  return `push: ${bits.join(", ")}`;
}

const randomId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const h = (n: number): string => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${h(8)}-${h(4)}-4${h(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${h(3)}-${h(12)}`;
};

type Outcome = "ok" | "rejected" | "dropped" | "failed" | "stopped";

/** Create a background lead pusher. See the module docs. */
export function createPusher(opts: PusherOptions): Pusher {
  const url = validatePushUrl(opts.url).toString();
  const doFetch = opts.fetch ?? globalThis.fetch;
  const batchSize = Math.max(1, opts.batchSize ?? 10);
  const intervalMs = Math.max(1, opts.intervalMs ?? 3000);
  const maxQueue = Math.max(1, opts.maxQueue ?? 2000);
  const maxBatch = Math.max(batchSize, opts.maxBatch ?? 500);
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const delays = opts.retryDelaysMs ?? [1000, 3000, 9000];
  const maxRetryAfterMs = opts.maxRetryAfterMs ?? 60_000;
  const warn = (m: string): void => { try { opts.onWarn?.(m); } catch { /* never throws */ } };
  const run = opts.run ?? randomId();
  const s = opts.search ?? {};
  const search: PushSearch = {
    type: s.type || null,
    city: s.city || null,
    area: s.area || null,
    target: typeof s.target === "number" && Number.isFinite(s.target) ? s.target : null,
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": `lacspace-leads/${VERSION}`,
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const pending: Lead[] = [];
  const st = { sent: 0, batches: 0, failed: 0, dropped: 0, rejected: false, doneSent: false };
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let due = false;
  let finishing = false;
  let finished = false;
  let sending: Promise<void> | undefined;
  let warnedDrop = false;
  const warned4xx = new Set<number>();
  // Aborted at the finish deadline: cancels any in-flight request and backoff wait.
  const stop = new AbortController();

  const sleep = (ms: number): Promise<void> => new Promise((res) => {
    if (stop.signal.aborted) return res();
    const t = setTimeout(done, ms);
    function done(): void { clearTimeout(t); stop.signal.removeEventListener("abort", done); res(); }
    stop.signal.addEventListener("abort", done);
  });

  const post = async (payload: PushPayload): Promise<Outcome> => {
    const body = JSON.stringify(payload);
    for (let attempt = 0; ; attempt++) {
      if (stop.signal.aborted) return "stopped";
      const ac = new AbortController();
      const onStop = (): void => ac.abort();
      stop.signal.addEventListener("abort", onStop);
      const to = setTimeout(() => ac.abort(), timeoutMs);
      let status = 0;
      let retryAfter: string | null = null;
      try {
        const res = await doFetch(url, { method: "POST", headers, body, signal: ac.signal });
        status = res.status;
        retryAfter = res.headers.get("retry-after");
        try { await res.arrayBuffer(); } catch { /* body not needed */ }
      } catch {
        status = 0; // network error / timeout
      } finally {
        clearTimeout(to);
        stop.signal.removeEventListener("abort", onStop);
      }
      if (stop.signal.aborted) return status >= 200 && status < 300 ? "ok" : "stopped";
      if (status >= 200 && status < 300) return "ok";
      if (status === 401 || status === 403) return "rejected";
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable) {
        if (!warned4xx.has(status)) {
          warned4xx.add(status);
          warn(`push: endpoint answered HTTP ${status}; dropping that batch and carrying on`);
        }
        return "dropped";
      }
      if (attempt >= delays.length) return "failed";
      let wait = delays[attempt] ?? 1000;
      if (status === 429) wait = parseRetryAfter(retryAfter, maxRetryAfterMs) ?? wait;
      await sleep(wait);
    }
  };

  const reject = (lost: number): void => {
    st.rejected = true;
    st.failed += lost + pending.length;
    pending.length = 0;
    if (timer) { clearTimeout(timer); timer = undefined; }
    warn(`push rejected: token invalid or expired, leads are still being saved to ${opts.file ?? "the output file"}`);
  };

  const sendLeads = async (leads: Lead[]): Promise<void> => {
    const outcome = await post({ leads, search, run, seq: ++seq, done: false });
    if (outcome === "ok") { st.sent += leads.length; st.batches++; return; }
    if (outcome === "rejected") { reject(leads.length); return; }
    st.failed += leads.length;
    if (outcome === "failed") warn(`push: a batch of ${leads.length} lead${leads.length === 1 ? "" : "s"} could not be delivered after retries (still in the file)`);
  };

  const schedule = (): void => {
    if (timer || !pending.length || st.rejected || finishing) return;
    timer = setTimeout(() => { timer = undefined; due = true; void drain(); }, intervalMs);
    (timer as { unref?: () => void }).unref?.();
  };

  const drain = (): Promise<void> => {
    if (sending) return sending;
    sending = (async () => {
      try {
        while (!st.rejected && !stop.signal.aborted && pending.length && (due || finishing || pending.length >= batchSize)) {
          due = false;
          if (timer) { clearTimeout(timer); timer = undefined; }
          await sendLeads(pending.splice(0, maxBatch));
        }
      } catch { /* never throws */ } finally {
        sending = undefined;
      }
      schedule();
    })();
    return sending;
  };

  const snapshot = (): PushStats => ({ ...st, pending: pending.length });

  return {
    push(lead) {
      if (st.rejected || finished || stop.signal.aborted) return;
      if (pending.length >= maxQueue) {
        st.dropped++;
        if (!warnedDrop) {
          warnedDrop = true;
          warn(`push: the endpoint is too slow, ${maxQueue} leads are already waiting; extra leads are not pushed (they are still in the file)`);
        }
        return;
      }
      pending.push(lead);
      if (pending.length >= batchSize) void drain();
      else schedule();
    },
    async finish(stats, fopts) {
      if (finished) return snapshot();
      finishing = true;
      if (timer) { clearTimeout(timer); timer = undefined; }
      const limit = fopts?.timeoutMs ?? opts.finishTimeoutMs ?? 5000;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const work = (async () => {
        // Wait for an in-flight batch, then flush the rest.
        await drain();
        await drain();
        if (st.rejected || stop.signal.aborted) return;
        const payload: PushPayload = { leads: [], search, run, seq: ++seq, done: true };
        if (stats) payload.stats = stats;
        const outcome = await post(payload);
        if (outcome === "ok") st.doneSent = true;
        else if (outcome === "rejected") reject(0);
      })();
      await Promise.race([
        work.catch(() => undefined),
        new Promise<void>((res) => { deadline = setTimeout(res, limit); }),
      ]);
      if (deadline) clearTimeout(deadline);
      stop.abort();
      await Promise.race([work.catch(() => undefined), new Promise<void>((r) => setTimeout(r, 50))]);
      if (pending.length) { st.failed += pending.length; pending.length = 0; }
      finished = true;
      return snapshot();
    },
    stats: snapshot,
  };
}

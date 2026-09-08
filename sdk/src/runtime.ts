/**
 * @lacspace/sdk — runtime helpers: typed error normalization, a health/ping
 * probe, and a transport-agnostic pagination iterator.
 *
 * Every side-effect (fetch, clock) is injected, so these never touch the
 * network on their own and are deterministic in tests. Zero dependencies,
 * isomorphic. Purely additive to the SDK's existing surface.
 */

import { isApiError } from "@lacspace/api";

/** The published SDK version (kept in sync with package.json). */
export const SDK_VERSION = "2.2.0";

/* ------------------------------- errors ------------------------------- */

/** A coarse classification of any thrown value. */
export type ErrorKind = "http" | "network" | "timeout" | "abort" | "unknown";

/** A uniform, inspectable shape for any error the SDK can surface. */
export interface NormalizedError {
  kind: ErrorKind;
  message: string;
  /** HTTP status when `kind === "http"`. */
  status?: number;
  /** Whether retrying the operation could plausibly succeed. */
  retryable: boolean;
  /** Parsed response body for HTTP errors, when available. */
  body?: unknown;
  /** The original thrown value. */
  cause: unknown;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Normalize any thrown value into a {@link NormalizedError}. Never throws. */
export function normalizeError(e: unknown): NormalizedError {
  if (isApiError(e)) {
    return {
      kind: "http",
      message: e.message,
      status: e.status,
      retryable: RETRYABLE_STATUS.has(e.status),
      body: e.body,
      cause: e,
    };
  }
  if (e instanceof Error) {
    if (e.name === "TimeoutError") return { kind: "timeout", message: e.message, retryable: true, cause: e };
    if (e.name === "AbortError") return { kind: "abort", message: e.message, retryable: false, cause: e };
    // `fetch` throws a TypeError for network-level failures (DNS, offline, CORS).
    if (e.name === "TypeError") return { kind: "network", message: e.message, retryable: true, cause: e };
    return { kind: "unknown", message: e.message, retryable: false, cause: e };
  }
  return { kind: "unknown", message: String(e), retryable: false, cause: e };
}

/** Convenience: is this thrown value worth retrying? */
export function isRetryableError(e: unknown): boolean {
  return normalizeError(e).retryable;
}

/* ------------------------------- health ------------------------------- */

/** The outcome of a {@link checkHealth} probe. */
export interface HealthResult {
  ok: boolean;
  /** HTTP status (0 for a network-level failure). */
  status: number;
  /** Round-trip time in ms (from the injected clock). */
  latencyMs: number;
  /** Parsed JSON body, when the response was JSON. */
  body?: unknown;
  /** Present only when the probe threw. */
  error?: NormalizedError;
}

/** Options for {@link checkHealth}. */
export interface HealthCheckOptions {
  /** Custom fetch (for tests / edge / Node < 18). Default: global `fetch`. */
  fetch?: typeof fetch;
  /** Clock, injectable for tests. Default `Date.now`. */
  now?: () => number;
  /** Extra headers (e.g. a correlation id). */
  headers?: Record<string, string>;
  /** Abort signal. */
  signal?: AbortSignal;
  /** HTTP method. Default `"GET"`. */
  method?: string;
}

/**
 * Ping a health/status URL and report ok-ness, HTTP status and latency. Never
 * rejects — a network failure is reported as `{ ok:false, status:0, error }`.
 */
export async function checkHealth(url: string, opts: HealthCheckOptions = {}): Promise<HealthResult> {
  const now = opts.now ?? Date.now;
  const f = opts.fetch ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
  if (!f) throw new Error("checkHealth: no global `fetch` — pass options.fetch.");
  const started = now();
  try {
    const res = await f(url, { method: opts.method ?? "GET", headers: opts.headers, signal: opts.signal });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      /* non-JSON or empty body — leave undefined */
    }
    return { ok: res.ok, status: res.status, latencyMs: now() - started, body };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: now() - started, error: normalizeError(e) };
  }
}

/* ----------------------------- pagination ----------------------------- */

/** One page returned by a {@link PageFetcher}. */
export interface PageResult<T> {
  items: T[];
  /** Cursor/token for the next page; `null`/`undefined`/`""` ends iteration. */
  next?: string | number | null;
}

/** Fetches one page given the cursor for it (`undefined` for the first page). */
export type PageFetcher<T> = (
  cursor: string | number | undefined,
) => PageResult<T> | Promise<PageResult<T>>;

/** Options for {@link paginate} / {@link collectPages}. */
export interface PaginateOptions {
  /** Cursor for the first page. Default `undefined`. */
  start?: string | number;
  /** Safety cap on pages fetched. Default 1000. */
  maxPages?: number;
}

/**
 * Lazily iterate every item across pages, following `next` cursors. Transport-
 * agnostic: you supply `fetchPage`, so nothing here touches the network.
 */
export async function* paginate<T>(
  fetchPage: PageFetcher<T>,
  opts: PaginateOptions = {},
): AsyncGenerator<T, void, unknown> {
  const maxPages = opts.maxPages ?? 1000;
  let cursor = opts.start;
  for (let page = 0; page < maxPages; page++) {
    const res = await fetchPage(cursor);
    for (const item of res.items) yield item;
    if (res.items.length === 0 || res.next === undefined || res.next === null || res.next === "") return;
    cursor = res.next;
  }
}

/** Collect every paginated item into a single array. */
export async function collectPages<T>(fetchPage: PageFetcher<T>, opts?: PaginateOptions): Promise<T[]> {
  const out: T[] = [];
  for await (const item of paginate(fetchPage, opts)) out.push(item);
  return out;
}

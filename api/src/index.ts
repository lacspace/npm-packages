/**
 * @lacspace/api — a lightweight, zero-dependency, isomorphic HTTP client for
 * Lacspace APIs. Built on the platform `fetch` (Node 18+, browsers, edge).
 *
 * Batteries included: timeouts & abort, retries with backoff (honours
 * `Retry-After`), request/response/error interceptors, query-string params,
 * non-JSON bodies & response types, in-flight de-duplication, an optional TTL
 * cache, and pagination helpers.
 */

export interface RetryOptions {
  /** Max retry attempts (after the first try). Default 0. */
  retries?: number;
  /** Base backoff in ms (doubles each attempt, with jitter). Default 300. */
  retryDelayMs?: number;
  /** Max backoff cap in ms. Default 10000. */
  maxRetryDelayMs?: number;
  /** Decide whether to retry. Default: network errors + 408/425/429/5xx. */
  retryOn?: (status: number | undefined, error: unknown, attempt: number) => boolean;
}

export interface LacspaceApiOptions extends RetryOptions {
  /** Base URL, e.g. `https://api.lacspace.com/api`. Falls back to `LACSPACE_API_URL`. */
  baseURL?: string;
  /** Bearer token/API key sent as `Authorization: Bearer …`. Falls back to `LACSPACE_API_KEY`. */
  apiKey?: string;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  /** Custom fetch implementation (for tests, edge runtimes, or Node < 18). */
  fetch?: typeof fetch;
  /** Abort a request after this many ms (per request; can be overridden). */
  timeoutMs?: number;
  /** De-duplicate concurrent identical GETs. Default true. */
  dedupe?: boolean;
}

export type QueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;
export type QueryParams = Record<string, QueryValue>;

export type ResponseType = "json" | "text" | "blob" | "arrayBuffer" | "stream" | "response";

export interface RequestOptions extends Omit<RequestInit, "body" | "method"> {
  /** Query-string params (arrays repeat the key). */
  params?: QueryParams;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Per-request retry override. */
  retries?: number;
  /** How to read the body. Default "json". */
  responseType?: ResponseType;
  /** Per-request cache TTL in ms (GET only). */
  cacheTtlMs?: number;
  /** Override de-dupe for this request. */
  dedupe?: boolean;
}

/** Thrown for any non-2xx response. Carries the status and parsed body. */
export class LacspaceApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;
  /** The raw Response, when available (not present for network errors). */
  readonly response?: Response;
  constructor(message: string, status: number, statusText: string, body: unknown, response?: Response) {
    super(message);
    this.name = "LacspaceApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.response = response;
  }
}

/** Type guard: was this error thrown by the API client? */
export function isApiError(e: unknown): e is LacspaceApiError {
  return e instanceof LacspaceApiError;
}

export interface RequestContext {
  method: string;
  url: string;
  init: RequestInit & { headers: Record<string, string> };
  attempt: number;
}

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
function defaultRetryOn(status: number | undefined): boolean {
  if (status === undefined) return true; // network/timeout error
  return RETRY_STATUS.has(status);
}

function readEnv(key: string): string | undefined {
  return typeof process !== "undefined" && process.env ? process.env[key] : undefined;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toQuery(params?: QueryParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const item of v) sp.append(k, String(item));
    else sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Should this body be JSON-encoded (vs passed through to fetch as-is)? */
function isJsonBody(body: unknown): boolean {
  if (body === undefined || body === null || typeof body === "string") return false;
  if (typeof FormData !== "undefined" && body instanceof FormData) return false;
  if (typeof Blob !== "undefined" && body instanceof Blob) return false;
  if (typeof ArrayBuffer !== "undefined" && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) return false;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return false;
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) return false;
  return typeof body === "object";
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Merge a timeout into an optional caller signal, returning signal + cleanup. */
function withTimeout(timeoutMs: number | undefined, caller: AbortSignal | null | undefined) {
  if (!timeoutMs && !caller) return { signal: undefined as AbortSignal | undefined, done: () => {} };
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs) timer = setTimeout(() => ctl.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  const onAbort = () => ctl.abort((caller as AbortSignal).reason);
  if (caller) {
    if (caller.aborted) ctl.abort(caller.reason);
    else caller.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: ctl.signal,
    done: () => {
      if (timer) clearTimeout(timer);
      if (caller) caller.removeEventListener("abort", onAbort);
    },
  };
}

interface CacheEntry {
  value: unknown;
  expires: number;
}

export interface PaginateOptions extends RequestOptions {
  /** Query param carrying the page number. Default "page". */
  pageParam?: string;
  /** First page number. Default 1. */
  startPage?: number;
  /** Extract the array of items from a page response. Default `r.data ?? r.items ?? r`. */
  extract?: (page: unknown) => unknown[];
  /** Stop when this returns false. Default: stop when a page yields 0 items. */
  hasMore?: (page: unknown, items: unknown[], pageNumber: number) => boolean;
  /** Safety cap on pages fetched. Default 1000. */
  maxPages?: number;
}

function defaultExtract(page: unknown): unknown[] {
  if (Array.isArray(page)) return page;
  if (page && typeof page === "object") {
    const o = page as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.results)) return o.results;
  }
  return [];
}

export class LacspaceApi {
  private readonly baseURL: string;
  private apiKey?: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly defaults: Required<Pick<LacspaceApiOptions, "retries" | "retryDelayMs" | "maxRetryDelayMs" | "dedupe">> & {
    timeoutMs?: number;
    retryOn: NonNullable<RetryOptions["retryOn"]>;
  };

  private reqInterceptors: Array<(ctx: RequestContext) => RequestContext | Promise<RequestContext>> = [];
  private resInterceptors: Array<(res: Response, ctx: RequestContext) => Response | Promise<Response>> = [];
  private errInterceptors: Array<(err: unknown, ctx: RequestContext) => unknown | Promise<unknown>> = [];

  private inflight = new Map<string, Promise<unknown>>();
  private cache = new Map<string, CacheEntry>();

  /** Register interceptors that run on every request (chainable). */
  readonly interceptors: {
    request: (fn: (ctx: RequestContext) => RequestContext | Promise<RequestContext>) => LacspaceApi;
    response: (fn: (res: Response, ctx: RequestContext) => Response | Promise<Response>) => LacspaceApi;
    error: (fn: (err: unknown, ctx: RequestContext) => unknown | Promise<unknown>) => LacspaceApi;
  } = {
    request: (fn) => (this.reqInterceptors.push(fn), this),
    response: (fn) => (this.resInterceptors.push(fn), this),
    error: (fn) => (this.errInterceptors.push(fn), this),
  };

  constructor(options: LacspaceApiOptions = {}) {
    this.baseURL = (options.baseURL ?? readEnv("LACSPACE_API_URL") ?? "").replace(/\/+$/, "");
    if (!this.baseURL) {
      throw new Error(
        "LacspaceApi: `baseURL` is required — pass it in options or set the LACSPACE_API_URL environment variable.",
      );
    }
    this.apiKey = options.apiKey ?? readEnv("LACSPACE_API_KEY");
    this.headers = options.headers ?? {};
    const impl = options.fetch ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
    if (!impl) {
      throw new Error(
        "LacspaceApi: no global `fetch` was found — pass options.fetch (required on Node < 18).",
      );
    }
    this.fetchImpl = impl;
    this.defaults = {
      retries: options.retries ?? 0,
      retryDelayMs: options.retryDelayMs ?? 300,
      maxRetryDelayMs: options.maxRetryDelayMs ?? 10000,
      dedupe: options.dedupe ?? true,
      timeoutMs: options.timeoutMs,
      retryOn: options.retryOn ?? defaultRetryOn,
    };
  }

  /** Set/replace the bearer token used for subsequent requests. */
  setToken(token: string): this {
    this.apiKey = token;
    return this;
  }

  /** The current bearer token, if any. */
  getToken(): string | undefined {
    return this.apiKey;
  }

  /** Clear the in-flight de-dupe map and the TTL cache. */
  clearCache(): this {
    this.cache.clear();
    this.inflight.clear();
    return this;
  }

  /** Low-level request. Returns the parsed body typed as `T`. */
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    opts: RequestOptions = {},
  ): Promise<T> {
    const { params, timeoutMs, retries, responseType = "json", cacheTtlMs, dedupe, headers: reqHeaders, signal, ...restInit } = opts;
    const url = `${this.baseURL}/${String(path).replace(/^\/+/, "")}${toQuery(params)}`;
    const isGet = method.toUpperCase() === "GET";
    const cacheKey = `${method} ${url}`;

    // TTL cache (GET only)
    if (isGet && cacheTtlMs) {
      const hit = this.cache.get(cacheKey);
      if (hit && hit.expires > Date.now()) return hit.value as T;
    }

    const run = async (): Promise<T> => {
      const encodeJson = isJsonBody(body);
      const headers: Record<string, string> = {
        Accept: "application/json",
        ...(encodeJson ? { "Content-Type": "application/json" } : {}),
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        ...this.headers,
        ...((reqHeaders as Record<string, string>) ?? {}),
      };
      const payload = body === undefined ? undefined : encodeJson ? JSON.stringify(body) : (body as BodyInit);

      const maxRetries = retries ?? this.defaults.retries;
      let lastErr: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let ctx: RequestContext = {
          method,
          url,
          init: { ...restInit, method, headers: { ...headers }, ...(payload !== undefined ? { body: payload } : {}) },
          attempt,
        };
        for (const i of this.reqInterceptors) ctx = await i(ctx);

        const t = withTimeout(timeoutMs ?? this.defaults.timeoutMs, signal ?? null);
        try {
          let response = await this.fetchImpl(ctx.url, { ...ctx.init, ...(t.signal ? { signal: t.signal } : {}) });
          for (const i of this.resInterceptors) response = await i(response, ctx);

          if (!response.ok) {
            if (attempt < maxRetries && this.defaults.retryOn(response.status, undefined, attempt)) {
              await sleep(this.backoff(attempt, response));
              continue;
            }
            const text = await response.text();
            const data = text ? safeJson(text) : undefined;
            throw new LacspaceApiError(
              `${method} ${path} failed: ${response.status} ${response.statusText}`,
              response.status,
              response.statusText,
              data ?? text,
              response,
            );
          }

          const result = (await this.readBody(response, responseType)) as T;
          if (isGet && cacheTtlMs) this.cache.set(cacheKey, { value: result, expires: Date.now() + cacheTtlMs });
          return result;
        } catch (err) {
          lastErr = err;
          if (isApiError(err)) throw err; // already terminal
          if (attempt < maxRetries && this.defaults.retryOn(undefined, err, attempt)) {
            await sleep(this.backoff(attempt));
            continue;
          }
          for (const i of this.errInterceptors) await i(err, ctx);
          throw err;
        } finally {
          t.done();
        }
      }
      throw lastErr;
    };

    // de-dupe concurrent identical GETs
    const shouldDedupe = (dedupe ?? this.defaults.dedupe) && isGet;
    if (shouldDedupe) {
      const existing = this.inflight.get(cacheKey) as Promise<T> | undefined;
      if (existing) return existing;
      const p = run().finally(() => this.inflight.delete(cacheKey));
      this.inflight.set(cacheKey, p);
      return p;
    }
    return run();
  }

  private backoff(attempt: number, response?: Response): number {
    // honour Retry-After when present
    const ra = response?.headers.get("retry-after");
    if (ra) {
      const secs = Number(ra);
      if (!Number.isNaN(secs)) return Math.min(this.defaults.maxRetryDelayMs, secs * 1000);
      const when = Date.parse(ra);
      if (!Number.isNaN(when)) return Math.min(this.defaults.maxRetryDelayMs, Math.max(0, when - Date.now()));
    }
    const base = this.defaults.retryDelayMs * 2 ** attempt;
    const jitter = base * 0.25 * Math.random();
    return Math.min(this.defaults.maxRetryDelayMs, base + jitter);
  }

  private async readBody(response: Response, type: ResponseType): Promise<unknown> {
    switch (type) {
      case "response":
        return response;
      case "stream":
        return response.body;
      case "blob":
        return response.blob();
      case "arrayBuffer":
        return response.arrayBuffer();
      case "text":
        return response.text();
      case "json":
      default: {
        const text = await response.text();
        return text ? safeJson(text) : undefined;
      }
    }
  }

  get<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, opts);
  }
  post<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, opts);
  }
  put<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", path, body, opts);
  }
  patch<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, body, opts);
  }
  delete<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, undefined, opts);
  }

  /** Async-iterate paginated pages, yielding each item. */
  async *paginate<T = unknown>(path: string, opts: PaginateOptions = {}): AsyncGenerator<T, void, unknown> {
    const { pageParam = "page", startPage = 1, extract = defaultExtract, hasMore, maxPages = 1000, params, ...rest } = opts;
    for (let page = startPage, i = 0; i < maxPages; page++, i++) {
      const res = await this.get<unknown>(path, { ...rest, params: { ...params, [pageParam]: page } });
      const items = extract(res);
      for (const item of items) yield item as T;
      const more = hasMore ? hasMore(res, items, page) : items.length > 0;
      if (!more || items.length === 0) return;
    }
  }

  /** Collect every item across all pages into one array. */
  async getAll<T = unknown>(path: string, opts?: PaginateOptions): Promise<T[]> {
    const out: T[] = [];
    for await (const item of this.paginate<T>(path, opts)) out.push(item);
    return out;
  }
}

/** Convenience factory. */
export function createApi(options?: LacspaceApiOptions): LacspaceApi {
  return new LacspaceApi(options);
}

export default LacspaceApi;

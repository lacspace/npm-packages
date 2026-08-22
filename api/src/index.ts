/**
 * @lacspace/api — a lightweight, zero-dependency, isomorphic HTTP client for
 * Lacspace APIs. Built on the platform `fetch` (Node 18+, browsers, edge).
 */

export interface LacspaceApiOptions {
  /** Base URL, e.g. `https://api.lacspace.com/api`. Falls back to `LACSPACE_API_URL`. */
  baseURL?: string;
  /** Bearer token/API key sent as `Authorization: Bearer …`. Falls back to `LACSPACE_API_KEY`. */
  apiKey?: string;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  /** Custom fetch implementation (for tests, edge runtimes, or Node < 18). */
  fetch?: typeof fetch;
}

/** Thrown for any non-2xx response. Carries the status and parsed body. */
export class LacspaceApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;
  constructor(message: string, status: number, statusText: string, body: unknown) {
    super(message);
    this.name = "LacspaceApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
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

export class LacspaceApi {
  private readonly baseURL: string;
  private apiKey?: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

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

  /** Low-level request. Returns the parsed JSON body typed as `T`. */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    init: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseURL}/${String(path).replace(/^\/+/, "")}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...this.headers,
      ...((init.headers as Record<string, string>) ?? {}),
    };

    const response = await this.fetchImpl(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...init,
    });

    const text = await response.text();
    const data = text ? safeJson(text) : undefined;

    if (!response.ok) {
      throw new LacspaceApiError(
        `${method} ${path} failed: ${response.status} ${response.statusText}`,
        response.status,
        response.statusText,
        data ?? text,
      );
    }
    return data as T;
  }

  get<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>("GET", path, undefined, init);
  }
  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>("POST", path, body, init);
  }
  put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>("PUT", path, body, init);
  }
  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>("PATCH", path, body, init);
  }
  delete<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>("DELETE", path, undefined, init);
  }
}

/** Convenience factory. */
export function createApi(options?: LacspaceApiOptions): LacspaceApi {
  return new LacspaceApi(options);
}

export default LacspaceApi;

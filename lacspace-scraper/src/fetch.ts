/**
 * Static page fetching over global `fetch` (Node 20+) — with a timeout, retries,
 * custom headers/User-Agent and a size cap. Never throws for HTTP errors; it
 * returns a result carrying `ok`/`status` so callers decide what to do.
 */

/** The `ScraperError` thrown for unrecoverable fetch problems. */
export class ScraperError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ScraperError";
    if (code !== undefined) this.code = code;
  }
}

export interface FetchResult {
  /** The final URL after redirects. */
  url: string;
  status: number;
  ok: boolean;
  html: string;
  contentType: string;
}

const DEFAULT_UA = "Mozilla/5.0 (compatible; lacspace-scraper/0.2; +https://developer.lacspace.com/tools/scraper)";
const MAX_BYTES = 5_000_000;

export interface FetchOptions {
  headers?: Record<string, string>;
  /** Cookies to send, as a `{ name: value }` map (added as a Cookie header). */
  cookies?: Record<string, string>;
  userAgent?: string;
  timeoutMs?: number;
  retries?: number;
  /**
   * Route this request through an HTTP/HTTPS proxy. Requires the optional
   * `undici` package to be installed; otherwise a clear error is thrown.
   */
  proxy?: string;
  signal?: AbortSignal;
}

function cookieHeader(cookies?: Record<string, string>): string | undefined {
  if (!cookies) return undefined;
  const parts = Object.entries(cookies).map(([k, v]) => `${k}=${v}`);
  return parts.length ? parts.join("; ") : undefined;
}

/** Build an undici ProxyAgent lazily (optional dep). Cached per proxy URL. */
const proxyAgents = new Map<string, unknown>();
async function proxyDispatcher(proxy: string): Promise<unknown> {
  const cached = proxyAgents.get(proxy);
  if (cached) return cached;
  let mod: { ProxyAgent?: new (url: string) => unknown } | null = null;
  try {
    const name = "undici";
    mod = (await import(name)) as { ProxyAgent?: new (url: string) => unknown };
  } catch {
    mod = null;
  }
  if (!mod?.ProxyAgent) {
    throw new ScraperError(
      "Routing the http engine through a proxy needs the optional `undici` package (npm i undici). " +
      "Or use the browser engine (--browser), whose --proxy works without it.",
      "NO_UNDICI",
    );
  }
  const agent = new mod.ProxyAgent(proxy);
  proxyAgents.set(proxy, agent);
  return agent;
}

/** Fetch a URL and return its HTML/text. Retries transient failures. */
export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const retries = Math.max(0, opts.retries ?? 1);
  const cookie = cookieHeader(opts.cookies);
  const headers: Record<string, string> = {
    "user-agent": opts.userAgent ?? DEFAULT_UA,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...opts.headers,
    ...(cookie ? { cookie } : {}),
  };
  const dispatcher = opts.proxy ? await proxyDispatcher(opts.proxy) : undefined;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) throw new ScraperError("Aborted.", "ABORTED");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onAbort = (): void => ctrl.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const init: RequestInit & { dispatcher?: unknown } = { headers, redirect: "follow", signal: ctrl.signal };
      if (dispatcher) init.dispatcher = dispatcher;
      const res = await fetch(url, init);
      const contentType = res.headers.get("content-type") ?? "";
      const buf = await res.arrayBuffer();
      const html = new TextDecoder("utf-8").decode(buf.slice(0, MAX_BYTES));
      return { url: res.url || url, status: res.status, ok: res.ok, html, contentType };
    } catch (e) {
      lastErr = e;
      if (attempt < retries && !opts.signal?.aborted) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new ScraperError(
    `Failed to fetch ${url}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    "FETCH_FAILED",
  );
}

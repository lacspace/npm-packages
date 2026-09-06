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

const DEFAULT_UA = "Mozilla/5.0 (compatible; lacspace-scraper/0.1; +https://developer.lacspace.com/tools/scraper)";
const MAX_BYTES = 5_000_000;

export interface FetchOptions {
  headers?: Record<string, string>;
  userAgent?: string;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

/** Fetch a URL and return its HTML/text. Retries transient failures. */
export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const retries = Math.max(0, opts.retries ?? 1);
  const headers: Record<string, string> = {
    "user-agent": opts.userAgent ?? DEFAULT_UA,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...opts.headers,
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) throw new ScraperError("Aborted.", "ABORTED");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onAbort = (): void => ctrl.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetch(url, { headers, redirect: "follow", signal: ctrl.signal });
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

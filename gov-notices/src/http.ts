/** Shared GET helper: timeout, capped body, polite default headers. */

export const VERSION = "1.1.0";
export const DEFAULT_USER_AGENT = "lacspace-gov-notices/1.1 (+https://developer.lacspace.com/packages/gov-notices)";

export interface HttpOptions {
  /** A fetch implementation (defaults to the global one). */
  fetch?: typeof globalThis.fetch;
  /** User-Agent header. Defaults to {@link DEFAULT_USER_AGENT}; pass a browser UA for sites that refuse bots. */
  userAgent?: string;
  /** Abort after this many ms (default 20000). */
  timeoutMs?: number;
  /** Stop reading the body after this many bytes (default 5 MB). */
  maxBytes?: number;
  /** Extra request headers. */
  headers?: Record<string, string>;
}

export function getFetch(opts: { fetch?: typeof globalThis.fetch }): typeof globalThis.fetch {
  const f = opts.fetch ?? globalThis.fetch;
  if (typeof f !== "function") throw new Error("@lacspace/gov-notices: no fetch available; pass opts.fetch");
  return f;
}

export function baseHeaders(opts: HttpOptions): Record<string, string> {
  return {
    "User-Agent": opts.userAgent ?? DEFAULT_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "ne,en;q=0.8",
  };
}

export async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body || typeof (res.body as ReadableStream<Uint8Array>).getReader !== "function") {
    const t = await res.text();
    return t.length > maxBytes ? t.slice(0, maxBytes) : t;
  }
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
      if (total >= maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } break; }
    }
  }
  const buf = new Uint8Array(Math.min(total, maxBytes));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.byteLength - off);
    buf.set(c.subarray(0, take), off);
    off += take;
    if (off >= buf.byteLength) break;
  }
  return new TextDecoder("utf-8").decode(buf);
}

/** One GET; returns the status and (for 2xx) the capped body. */
export async function getText(url: string, opts: HttpOptions): Promise<{ status: number; ok: boolean; body?: string; url: string }> {
  const doFetch = getFetch(opts);
  const ctrl = typeof AbortController === "function" ? new AbortController() : undefined;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000) : undefined;
  try {
    const res = await doFetch(url, { headers: { ...baseHeaders(opts), ...(opts.headers ?? {}) }, redirect: "follow", signal: ctrl?.signal });
    if (!res.ok) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return { status: res.status, ok: false, url: res.url || url };
    }
    return { status: res.status, ok: true, body: await readCapped(res, opts.maxBytes ?? 5_000_000), url: res.url || url };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

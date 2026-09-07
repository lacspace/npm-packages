/**
 * Record-and-replay passthrough proxy. When the engine has no local answer for
 * a request (it would otherwise 404), a configured proxy can forward it to a
 * real upstream, record the response, and serve that recording offline on the
 * next identical request. The network is kept behind an injectable `fetch`, so
 * tests drive the record→replay logic against a fake upstream — no sockets.
 *
 * Modes:
 *   "record"  always hit the upstream and (over)write the recording.
 *   "replay"  never hit the upstream; serve recordings, else 504.
 *   "auto"    replay if a recording exists, otherwise record (default).
 */

/** A recorded (or live) upstream response, in the engine's response shape. */
export interface RecordedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** The minimal request the proxy forwards. */
export interface ProxyRequest {
  method: string;
  /** Path + query, e.g. `/users?page=2`. */
  url: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}

/** The injectable fetch — tests pass a fake; the CLI passes a real one. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<RecordedResponse>;

/** A recordings cassette: `"METHOD path?query"` → response. */
export type Cassette = Record<string, RecordedResponse>;

/** Proxy configuration (goes on `MockConfig.proxy`). */
export interface ProxyConfig {
  /** Upstream base URL, e.g. `https://api.example.com`. */
  target: string;
  /** How to behave (default `"auto"`). */
  mode?: "record" | "replay" | "auto";
  /** Injected fetch (defaults to a `globalThis.fetch` adapter). */
  fetch?: FetchLike;
  /** Pre-loaded recordings to replay from. */
  recordings?: Cassette;
  /** Called after each new recording with the whole cassette (for persistence). */
  onRecord?: (cassette: Cassette) => void;
}

/** The runtime proxy handle. */
export interface Proxy {
  /** Try to answer a request; `null` means "proxy couldn't/​shouldn't handle it". */
  handle: (req: ProxyRequest) => Promise<RecordedResponse | null>;
  /** The live cassette (recordings made this session + any pre-loaded). */
  cassette: Cassette;
}

/** The canonical cassette key for a request. */
export function cassetteKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}

/** Join an upstream base with a request path, avoiding a double slash. */
export function joinUrl(target: string, url: string): string {
  const base = target.endsWith("/") ? target.slice(0, -1) : target;
  const path = url.startsWith("/") ? url : `/${url}`;
  return base + path;
}

function flattenHeaders(headers: ProxyRequest["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (v === undefined) continue;
    // Never forward hop-by-hop/host headers to the upstream.
    if (k.toLowerCase() === "host" || k.toLowerCase() === "connection") continue;
    out[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

/** A default {@link FetchLike} backed by the global `fetch` (Node >= 20). */
export function globalFetchAdapter(): FetchLike {
  return async (url, init) => {
    const f = (globalThis as { fetch?: typeof fetch }).fetch;
    if (!f) throw new Error("global fetch is unavailable; pass proxy.fetch");
    const res = await f(url, { method: init.method, headers: init.headers, body: init.body });
    const headers: Record<string, string> = {};
    res.headers.forEach((val: string, key: string) => (headers[key] = val));
    const text = await res.text();
    return { status: res.status, headers, body: text };
  };
}

/** Create a record-and-replay proxy from a {@link ProxyConfig}. */
export function createProxy(config: ProxyConfig): Proxy {
  const mode = config.mode ?? "auto";
  const doFetch = config.fetch ?? globalFetchAdapter();
  const cassette: Cassette = { ...(config.recordings ?? {}) };

  async function handle(req: ProxyRequest): Promise<RecordedResponse | null> {
    const key = cassetteKey(req.method, req.url);
    const recorded = cassette[key];

    if (mode === "replay") {
      return recorded ?? { status: 504, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ error: "no recording for this request (replay mode)", key }) };
    }

    if (mode === "auto" && recorded) return recorded;

    // record (or auto with no recording): forward upstream and capture.
    let live: RecordedResponse;
    try {
      live = await doFetch(joinUrl(config.target, req.url), {
        method: req.method.toUpperCase(),
        headers: flattenHeaders(req.headers),
        ...(req.body !== undefined ? { body: req.body } : {}),
      });
    } catch (err) {
      return { status: 502, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ error: "upstream request failed", detail: (err as Error).message }) };
    }
    cassette[key] = live;
    config.onRecord?.(cassette);
    return live;
  }

  return { handle, cassette };
}

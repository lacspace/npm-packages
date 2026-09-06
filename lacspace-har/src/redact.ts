/**
 * Redact a HAR so it's safe to share: strip cookies, Authorization and other
 * auth headers, auth-looking query tokens, and (by default) request/response
 * bodies. Returns a new HAR — the input is never mutated. Pure.
 */
import type { Har, RedactOptions } from "./types.js";

const REDACTED = "[redacted]";

/** Header names always stripped (case-insensitive). */
const DEFAULT_HEADERS = [
  "cookie", "set-cookie", "authorization", "proxy-authorization",
  "x-api-key", "x-auth-token", "x-csrf-token", "x-xsrf-token",
];

/** Query-string / postData param names whose values look like secrets. */
const DEFAULT_PARAMS = [
  "token", "access_token", "refresh_token", "id_token", "api_key", "apikey",
  "key", "auth", "authorization", "sig", "signature", "password", "passwd",
  "secret", "client_secret", "session", "sessionid", "sid",
];

/** Deep clone via structuredClone when available, else JSON round-trip. */
function clone<T>(v: T): T {
  const sc = (globalThis as { structuredClone?: <U>(x: U) => U }).structuredClone;
  if (typeof sc === "function") return sc(v);
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Redact matching name/value pairs in place. */
function redactPairs(
  pairs: { name?: string; value?: string }[] | undefined,
  names: Set<string>,
): void {
  if (!Array.isArray(pairs)) return;
  for (const p of pairs) {
    if (p && typeof p.name === "string" && names.has(p.name.toLowerCase())) {
      p.value = REDACTED;
    }
  }
}

/** Redact auth-looking params inside a URL's query string. */
function redactUrl(url: string, params: Set<string>): string {
  const q = url.indexOf("?");
  if (q < 0) return url;
  const base = url.slice(0, q);
  const rest = url.slice(q + 1);
  const [query, hash = ""] = rest.split("#");
  const parts = (query ?? "").split("&").map((kv) => {
    const eq = kv.indexOf("=");
    const key = (eq < 0 ? kv : kv.slice(0, eq)).toLowerCase();
    if (params.has(decodeURIComponent(key))) {
      return `${eq < 0 ? kv : kv.slice(0, eq)}=${REDACTED}`;
    }
    return kv;
  });
  return `${base}?${parts.join("&")}${hash ? "#" + hash : ""}`;
}

/**
 * Return a redacted copy of a HAR. By default strips cookies, auth headers,
 * auth query tokens and all request/response bodies. Pass `keepBodies: true`
 * to keep bodies, and `headers` / `params` to redact extra names.
 */
export function redactHar(har: Har, opts: RedactOptions = {}): Har {
  const out = clone(har);
  const headerNames = new Set([...DEFAULT_HEADERS, ...(opts.headers ?? []).map((h) => h.toLowerCase())]);
  const paramNames = new Set([...DEFAULT_PARAMS, ...(opts.params ?? []).map((p) => p.toLowerCase())]);

  for (const e of out.log?.entries ?? []) {
    const req = e.request as {
      url?: string;
      headers?: { name?: string; value?: string }[];
      queryString?: { name?: string; value?: string }[];
      cookies?: unknown[];
      postData?: { text?: string; params?: { name?: string; value?: string }[] };
    };
    const res = e.response as {
      headers?: { name?: string; value?: string }[];
      cookies?: unknown[];
      content?: { text?: string };
    };

    if (req) {
      redactPairs(req.headers, headerNames);
      redactPairs(req.queryString, paramNames);
      if (typeof req.url === "string") req.url = redactUrl(req.url, paramNames);
      if (Array.isArray(req.cookies)) req.cookies = [];
      if (req.postData) {
        redactPairs(req.postData.params, paramNames);
        if (!opts.keepBodies && typeof req.postData.text === "string") req.postData.text = REDACTED;
      }
    }
    if (res) {
      redactPairs(res.headers, headerNames);
      if (Array.isArray(res.cookies)) res.cookies = [];
      if (!opts.keepBodies && res.content && typeof res.content.text === "string") {
        res.content.text = REDACTED;
      }
    }
  }
  return out;
}

/**
 * The request engine: assemble a {@link RequestSpec} from friendly options,
 * send it with the global `fetch` (with manual redirect handling, a timeout, a
 * response-size cap and precise timing), and render the equivalent `curl`
 * command. The `fetch` implementation is injectable so tests never touch the
 * network.
 */

/** A concrete, ready-to-send HTTP request. */
export interface RequestSpec {
  method: string;
  url: string;
  /** Header pairs in order. */
  headers: Array<[string, string]>;
  body?: string;
}

/** Friendly inputs used to build a {@link RequestSpec}. */
export interface AssembleOptions {
  method?: string;
  /** Raw `"Key: Value"` header strings (repeatable `-H`). */
  headers?: string[];
  /** `"k=v"` query params (repeatable `-q`). */
  query?: string[];
  /** Raw request body (`-d`). */
  data?: string;
  /** A raw JSON object/array string (`--json '{...}'`). */
  json?: string;
  /** `"k=v"` (string) or `"k:=v"` (raw JSON) JSON-body shorthands (`-j`). */
  jsonKv?: string[];
  /** `"k=v"` urlencoded form fields (`--form`). */
  form?: string[];
  /** Bearer token → `Authorization: Bearer <token>` (`-b`). */
  bearer?: string;
  /** `"user:pass"` → HTTP Basic `Authorization` header (`-u`). */
  user?: string;
}

function parseHeaderStrings(raw: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const h of raw) {
    const colon = h.indexOf(":");
    if (colon === -1) continue;
    out.push([h.slice(0, colon).trim(), h.slice(colon + 1).trim()]);
  }
  return out;
}

function hasHeader(headers: Array<[string, string]>, name: string): boolean {
  return headers.some(([k]) => k.toLowerCase() === name.toLowerCase());
}

/** Coerce a `-j` value: `"1"`→1, `"true"`→true, JSON literals parsed, else string. */
function coerceKvValue(raw: string, rawJson: boolean): unknown {
  if (rawJson) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

function base64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

/** Assemble a concrete request from friendly options. Pure — no I/O. */
export function assembleRequest(url: string, o: AssembleOptions = {}): RequestSpec {
  const headers = parseHeaderStrings(o.headers ?? []);

  // Query params.
  let finalUrl = url;
  if (o.query && o.query.length) {
    const qs: string[] = [];
    for (const q of o.query) {
      const eq = q.indexOf("=");
      const k = eq === -1 ? q : q.slice(0, eq);
      const v = eq === -1 ? "" : q.slice(eq + 1);
      qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
    const joined = qs.join("&");
    finalUrl += (url.includes("?") ? "&" : "?") + joined;
  }

  // Body assembly (precedence: --json > -j > --form > -d).
  let body: string | undefined;
  let contentType: string | undefined;

  if (o.json !== undefined) {
    body = o.json;
    contentType = "application/json";
  } else if (o.jsonKv && o.jsonKv.length) {
    const obj: Record<string, unknown> = {};
    for (const pair of o.jsonKv) {
      const rawJson = pair.includes(":=");
      const sep = rawJson ? ":=" : "=";
      const idx = pair.indexOf(sep);
      if (idx === -1) continue;
      const k = pair.slice(0, idx);
      const v = pair.slice(idx + sep.length);
      obj[k] = coerceKvValue(v, rawJson);
    }
    body = JSON.stringify(obj);
    contentType = "application/json";
  } else if (o.form && o.form.length) {
    const params = new URLSearchParams();
    for (const f of o.form) {
      const eq = f.indexOf("=");
      params.append(eq === -1 ? f : f.slice(0, eq), eq === -1 ? "" : f.slice(eq + 1));
    }
    body = params.toString();
    contentType = "application/x-www-form-urlencoded";
  } else if (o.data !== undefined) {
    body = o.data;
  }

  if (contentType && !hasHeader(headers, "content-type")) {
    headers.push(["Content-Type", contentType]);
  }

  // Auth.
  if (o.bearer && !hasHeader(headers, "authorization")) {
    headers.push(["Authorization", `Bearer ${o.bearer}`]);
  } else if (o.user && !hasHeader(headers, "authorization")) {
    headers.push(["Authorization", `Basic ${base64(o.user)}`]);
  }

  // Method: explicit, else POST if a body is present, else GET.
  const method = (o.method ?? (body !== undefined ? "POST" : "GET")).toUpperCase();

  const spec: RequestSpec = { method, url: finalUrl, headers };
  if (body !== undefined) spec.body = body;
  return spec;
}

/** Options controlling how a request is sent. */
export interface SendOptions {
  /** Abort after this many ms (default 30000). */
  timeoutMs?: number;
  /** Cap the response body read at this many bytes (default 10MB). */
  maxSize?: number;
  /** Follow up to this many redirects (default 5). */
  maxRedirects?: number;
  /** Whether to follow redirects at all (default true). */
  followRedirects?: boolean;
  /** Inject a `fetch` implementation (defaults to the global). */
  fetchImpl?: typeof fetch;
}

/** A structured, serialisable record of an HTTP response. */
export interface ResponseRecord {
  status: number;
  statusText: string;
  /** Lower-cased header name → value. */
  headers: Record<string, string>;
  /** Total wall-clock time for the request (ms), including redirects. */
  timeMs: number;
  /** Bytes of body actually read (after any cap). */
  size: number;
  /** Response body as text (possibly truncated to `maxSize`). */
  body: string;
  /** Parsed JSON body, if the response looked like JSON. */
  json?: unknown;
  /** Final URL after any redirects. */
  url: string;
  /** Whether any redirect was followed. */
  redirected: boolean;
  /** The chain of URLs visited before the final one. */
  redirectChain: string[];
  ok: boolean;
  /** True if the body was cut off at `maxSize`. */
  truncated: boolean;
  /** True if a followed redirect crossed to a different host. */
  crossHostRedirect: boolean;
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

function headersToObject(h: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (h && typeof (h as Headers).forEach === "function") {
    (h as Headers).forEach((v, k) => { out[k.toLowerCase()] = v; });
  } else if (h && typeof h === "object") {
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) out[k.toLowerCase()] = String(v);
  }
  return out;
}

async function readCapped(
  res: Response,
  maxSize: number,
): Promise<{ text: string; size: number; truncated: boolean }> {
  const body = res.body as ReadableStream<Uint8Array> | null | undefined;
  if (!body || typeof body.getReader !== "function") {
    const text = await res.text();
    const buf = Buffer.from(text, "utf8");
    if (buf.length > maxSize) {
      return { text: buf.subarray(0, maxSize).toString("utf8"), size: maxSize, truncated: true };
    }
    return { text, size: buf.length, truncated: false };
  }
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(Buffer.from(value));
      size += value.byteLength;
      if (size > maxSize) {
        truncated = true;
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
    }
  }
  let buf = Buffer.concat(chunks);
  if (truncated) buf = buf.subarray(0, maxSize);
  return { text: buf.toString("utf8"), size: buf.length, truncated };
}

function looksJson(contentType: string | undefined, text: string): boolean {
  if (contentType && /\bjson\b/i.test(contentType)) return true;
  const t = text.trimStart();
  return t.startsWith("{") || t.startsWith("[");
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return ""; }
}

/**
 * Send a {@link RequestSpec}. Redirects are followed manually so the hop count
 * is enforced (`maxRedirects`) and cross-host hops are recorded rather than
 * followed silently. Times out after `timeoutMs`; the body is read up to
 * `maxSize` bytes.
 */
export async function sendRequest(spec: RequestSpec, opts: SendOptions = {}): Promise<ResponseRecord> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxSize = opts.maxSize ?? 10 * 1024 * 1024;
  const maxRedirects = opts.maxRedirects ?? 5;
  const follow = opts.followRedirects ?? true;
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new Error("global fetch is unavailable — Node 20+ (or a fetchImpl) is required.");
  }

  const originHost = hostOf(spec.url);
  let currentUrl = spec.url;
  let method = spec.method;
  let body = spec.body;
  const redirectChain: string[] = [];
  let crossHost = false;

  const start = Date.now();
  for (let hop = 0; ; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(currentUrl, {
        method,
        headers: spec.headers,
        ...(body !== undefined ? { body } : {}),
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error)?.name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutMs}ms: ${currentUrl}`);
      }
      throw err;
    }
    clearTimeout(timer);

    const location = res.headers.get?.("location") ?? undefined;
    if (follow && REDIRECT_STATUS.has(res.status) && location && hop < maxRedirects) {
      const nextUrl = new URL(location, currentUrl).toString();
      if (hostOf(nextUrl) !== originHost) crossHost = true;
      redirectChain.push(currentUrl);
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
        method = "GET";
        body = undefined;
      }
      currentUrl = nextUrl;
      // Drain the redirect body so the socket can be reused.
      try { await res.text(); } catch { /* ignore */ }
      continue;
    }

    const headers = headersToObject(res.headers);
    const { text, size, truncated } = await readCapped(res, maxSize);
    const timeMs = Date.now() - start;
    const record: ResponseRecord = {
      status: res.status,
      statusText: res.statusText || "",
      headers,
      timeMs,
      size,
      body: text,
      url: currentUrl,
      redirected: redirectChain.length > 0,
      redirectChain,
      ok: res.status >= 200 && res.status < 300,
      truncated,
      crossHostRedirect: crossHost,
    };
    if (looksJson(headers["content-type"], text)) {
      try { record.json = JSON.parse(text); } catch { /* leave undefined */ }
    }
    return record;
  }
}

/** Options for {@link toCurl}. */
export interface CurlOptions {
  /** Show real credential values instead of masking them (default false). */
  showSecrets?: boolean;
  maxRedirects?: number;
  followRedirects?: boolean;
}

function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Render the equivalent `curl` command for a request. Credentials in an
 * `Authorization` header are masked (`Bearer ***` / `Basic ***`) unless
 * `showSecrets` is set.
 */
export function toCurl(spec: RequestSpec, opts: CurlOptions = {}): string {
  const parts = ["curl"];
  if (spec.method !== "GET") parts.push("-X", spec.method);
  for (const [k, v] of spec.headers) {
    let value = v;
    if (!opts.showSecrets && k.toLowerCase() === "authorization") {
      const scheme = v.split(/\s+/)[0] ?? "";
      value = /^(Bearer|Basic)$/i.test(scheme) ? `${scheme} ***` : "***";
    }
    parts.push("-H", shq(`${k}: ${value}`));
  }
  if (spec.body !== undefined) parts.push("--data-raw", shq(spec.body));
  if (opts.followRedirects === false) {
    // no -L
  } else {
    parts.push("-L");
    if (opts.maxRedirects !== undefined) parts.push("--max-redirs", String(opts.maxRedirects));
  }
  parts.push(shq(spec.url));
  return parts.join(" ");
}

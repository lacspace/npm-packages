/**
 * @lacspace/next — framework-agnostic core
 *
 * Pure, dependency-free helpers used by the Next.js bindings. Nothing in this
 * module imports `next/*` or `react`, so it runs in any JS runtime (Edge,
 * Node, workers, the browser) and is trivially unit-testable. The Next-aware
 * wrappers in `index.ts` build on top of these.
 */

/* ----------------------------------- cookies ----------------------------------- */

export interface SerializeCookieOptions {
  /** Lifetime in seconds (`Max-Age`). */
  maxAge?: number;
  /** Absolute expiry (`Expires`). */
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  /** `true` is treated as `"strict"`. */
  sameSite?: "lax" | "strict" | "none" | true;
  priority?: "low" | "medium" | "high";
  partitioned?: boolean;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Serialize a `Set-Cookie` header value (RFC 6265). Pure string builder — the
 * value is percent-encoded; attributes are appended only when provided.
 */
export function serializeCookie(
  name: string,
  value: string,
  opts: SerializeCookieOptions = {},
): string {
  let str = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge != null) str += `; Max-Age=${Math.floor(opts.maxAge)}`;
  if (opts.domain) str += `; Domain=${opts.domain}`;
  if (opts.path) str += `; Path=${opts.path}`;
  if (opts.expires) str += `; Expires=${opts.expires.toUTCString()}`;
  if (opts.httpOnly) str += `; HttpOnly`;
  if (opts.secure) str += `; Secure`;
  if (opts.partitioned) str += `; Partitioned`;
  if (opts.priority) str += `; Priority=${capitalize(opts.priority)}`;
  if (opts.sameSite) {
    const s = opts.sameSite === true ? "Strict" : capitalize(opts.sameSite);
    str += `; SameSite=${s}`;
  }
  return str;
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * Parse a `Cookie` request header into a name→value map. Quoted values are
 * unquoted, values are percent-decoded, and the first occurrence of a name wins.
 */
export function parseCookieHeader(
  header: string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key || key in out) continue;
    let val = part.slice(idx + 1).trim();
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    out[key] = safeDecode(val);
  }
  return out;
}

/** Read a single cookie value from a raw `Cookie` header string. */
export function getCookieValue(
  header: string | null | undefined,
  name: string,
): string | undefined {
  return parseCookieHeader(header)[name];
}

/* -------------------------------- cache-control -------------------------------- */

export interface CacheControlOptions {
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  private?: boolean;
  public?: boolean;
  immutable?: boolean;
  mustRevalidate?: boolean;
  noStore?: boolean;
  noCache?: boolean;
  noTransform?: boolean;
}

function secs(n: number): number {
  return Math.max(0, Math.floor(n));
}

/**
 * Build a `Cache-Control` header value from options. `noStore` short-circuits
 * to `"no-store"`. Numeric ages are floored and clamped to ≥ 0.
 */
export function cacheControl(opts: CacheControlOptions = {}): string {
  if (opts.noStore) return "no-store";
  const parts: string[] = [];
  if (opts.private) parts.push("private");
  else if (opts.public) parts.push("public");
  if (opts.noCache) parts.push("no-cache");
  if (typeof opts.maxAge === "number") parts.push(`max-age=${secs(opts.maxAge)}`);
  if (typeof opts.sMaxAge === "number") parts.push(`s-maxage=${secs(opts.sMaxAge)}`);
  if (typeof opts.staleWhileRevalidate === "number")
    parts.push(`stale-while-revalidate=${secs(opts.staleWhileRevalidate)}`);
  if (typeof opts.staleIfError === "number")
    parts.push(`stale-if-error=${secs(opts.staleIfError)}`);
  if (opts.mustRevalidate) parts.push("must-revalidate");
  if (opts.immutable) parts.push("immutable");
  if (opts.noTransform) parts.push("no-transform");
  return parts.join(", ");
}

/* ---------------------------------- matching ----------------------------------- */

function escapeRegExp(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Convert a route pattern to a `RegExp`. Supports Next-style tokens:
 * `:param` (one path segment), `*` (within a segment), and `**` (across
 * segments). All other characters are matched literally.
 */
export function pathPatternToRegExp(pattern: string): RegExp {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 2;
      } else {
        out += "[^/]*";
        i += 1;
      }
    } else if (c === ":") {
      i += 1;
      while (i < pattern.length && /[A-Za-z0-9_]/.test(pattern[i]!)) i += 1;
      out += "[^/]+";
    } else {
      out += escapeRegExp(c);
      i += 1;
    }
  }
  return new RegExp("^" + out + "$");
}

/** True if a pathname matches a pattern (glob string or `RegExp`). */
export function matchPath(pathname: string, pattern: string | RegExp): boolean {
  return pattern instanceof RegExp ? pattern.test(pathname) : pathPatternToRegExp(pattern).test(pathname);
}

/** True if a pathname matches any pattern in the list. */
export function matchesAny(pathname: string, patterns: (string | RegExp)[]): boolean {
  return patterns.some((p) => matchPath(pathname, p));
}

/** Compile a reusable matcher for a list of patterns (e.g. `config.matcher`). */
export function createPathMatcher(
  patterns: (string | RegExp)[],
): (pathname: string) => boolean {
  return (pathname: string) => matchesAny(pathname, patterns);
}

/* ------------------------------- redirect safety ------------------------------- */

/**
 * True only for a same-origin relative path (`/dashboard`, `/a/b?x=1`). Rejects
 * absolute/protocol-relative URLs (`//evil.com`, `https://…`), backslash tricks
 * (`/\evil.com`) and control characters — use it to validate a `?next=` param
 * before redirecting to prevent open-redirect attacks.
 */
export function isSafeRedirectPath(target: string | null | undefined): boolean {
  if (typeof target !== "string" || target.length === 0) return false;
  if (target[0] !== "/") return false;
  if (target[1] === "/" || target[1] === "\\") return false;
  if (/[\x00-\x1f\x7f]/.test(target)) return false;
  if (target.includes("\\")) return false;
  return true;
}

/** Return `target` if it is a safe relative path, otherwise `fallback`. */
export function sanitizeRedirect(
  target: string | null | undefined,
  fallback = "/",
): string {
  return isSafeRedirectPath(target) ? (target as string) : fallback;
}

/* --------------------------------- auth tokens --------------------------------- */

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(
  authHeader: string | null | undefined,
): string | undefined {
  if (typeof authHeader !== "string") return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1]!.trim() : undefined;
}

/**
 * Generate a URL-safe (base64url, unpadded) random token. Uses the platform
 * CSPRNG. Handy for CSRF tokens, nonces and one-time state values.
 */
export function generateCsrfToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  const b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(buf).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time string comparison (avoids early-exit timing leaks). */
export function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* -------------------------------- error shaping -------------------------------- */

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: number; statusCode?: number } | null | undefined;
  const s = e?.status ?? e?.statusCode;
  return typeof s === "number" && s >= 100 && s <= 599 ? s : undefined;
}

/** Derive an HTTP status from a thrown error's `status`/`statusCode`, else 500. */
export function statusFromError(err: unknown): number {
  return statusOf(err) ?? 500;
}

export interface ErrorPayload {
  status: number;
  body: { error: string };
}

/**
 * Turn any thrown value into a `{ status, body }` JSON error payload, honouring
 * an error's `status`/`statusCode` and `message`.
 */
export function errorPayload(err: unknown, fallbackStatus = 500): ErrorPayload {
  const e = err as { message?: string } | null | undefined;
  return {
    status: statusOf(err) ?? fallbackStatus,
    body: { error: e?.message ?? "Internal Server Error" },
  };
}

/* ------------------------------- search params --------------------------------- */

/**
 * Parse a query string (or `URLSearchParams`) into a plain object. Repeated
 * keys collapse to an array; single keys stay strings. A leading `?` is
 * tolerated.
 */
export function parseSearchParams(
  input: string | URLSearchParams,
): Record<string, string | string[]> {
  const sp =
    typeof input === "string"
      ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
      : input;
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    out[key] = all.length > 1 ? all : all[0]!;
  }
  return out;
}

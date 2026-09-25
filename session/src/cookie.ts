/** Attributes for a Set-Cookie header (RFC 6265bis). */
export interface CookieOptions {
  /** Lifetime in seconds. Omit for a session cookie. */
  maxAge?: number;
  expires?: Date;
  /** Default "/". */
  path?: string;
  domain?: string;
  /** Default true. */
  secure?: boolean;
  /** Default true. */
  httpOnly?: boolean;
  /** Default "lax". */
  sameSite?: "lax" | "strict" | "none";
  partitioned?: boolean;
  priority?: "low" | "medium" | "high";
}

// RFC 6265 cookie-name is a token; cookie-value excludes CTLs, whitespace, DQUOTE, comma, semicolon, backslash.
const NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const VALUE_RE = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;

/** Parse a `Cookie` request header into a name → value map (first wins, values URL-decoded when safe). */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name || name in out) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    try {
      out[name] = value.includes("%") ? decodeURIComponent(value) : value;
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/**
 * Serialize a `Set-Cookie` header value. Enforces the `__Host-` / `__Secure-`
 * prefix rules and rejects characters that would smuggle extra attributes.
 */
export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  if (!NAME_RE.test(name)) throw new TypeError(`invalid cookie name: ${JSON.stringify(name)}`);
  if (!VALUE_RE.test(value)) throw new TypeError("invalid cookie value: contains characters that are not allowed");
  const secure = opts.secure ?? true;
  const httpOnly = opts.httpOnly ?? true;
  const sameSite = opts.sameSite ?? "lax";
  const path = opts.path ?? "/";
  if (name.startsWith("__Host-")) {
    if (!secure) throw new TypeError("__Host- cookies must be Secure");
    if (path !== "/") throw new TypeError("__Host- cookies must have Path=/");
    if (opts.domain) throw new TypeError("__Host- cookies must not set Domain");
  } else if (name.startsWith("__Secure-") && !secure) {
    throw new TypeError("__Secure- cookies must be Secure");
  }
  if (sameSite === "none" && !secure) throw new TypeError("SameSite=None requires Secure");
  if (opts.domain && !/^\.?[A-Za-z0-9.-]+$/.test(opts.domain)) throw new TypeError("invalid cookie domain");
  if (!/^[\x20-\x3A\x3C-\x7E]*$/.test(path)) throw new TypeError("invalid cookie path");

  let s = `${name}=${value}`;
  if (opts.maxAge !== undefined) {
    if (!Number.isFinite(opts.maxAge)) throw new TypeError("maxAge must be a finite number of seconds");
    s += `; Max-Age=${Math.floor(opts.maxAge)}`;
  }
  if (opts.expires) s += `; Expires=${opts.expires.toUTCString()}`;
  if (opts.domain) s += `; Domain=${opts.domain}`;
  s += `; Path=${path}`;
  if (secure) s += "; Secure";
  if (httpOnly) s += "; HttpOnly";
  s += `; SameSite=${sameSite === "none" ? "None" : sameSite === "strict" ? "Strict" : "Lax"}`;
  if (opts.partitioned) s += "; Partitioned";
  if (opts.priority) s += `; Priority=${opts.priority[0]!.toUpperCase()}${opts.priority.slice(1)}`;
  return s;
}

/** A `Set-Cookie` value that deletes the cookie (same name/path/domain it was set with). */
export function clearCookie(name: string, opts: Pick<CookieOptions, "path" | "domain" | "secure" | "sameSite" | "httpOnly" | "partitioned"> = {}): string {
  return serializeCookie(name, "", { ...opts, maxAge: 0, expires: new Date(0) });
}

/** Anything we can pull a `Cookie` header out of: the header itself, a Web `Request`, or a Node `IncomingMessage`. */
export type CookieSource =
  | string
  | null
  | undefined
  | { headers: { get(name: string): string | null } }
  | { headers: Record<string, string | string[] | undefined> }
  | { cookies: Record<string, string> };

/** Extract the raw `Cookie` header (or a pre-parsed map) from a request-like value. */
export function cookieHeaderOf(src: CookieSource): string | Record<string, string> | null {
  if (src == null) return null;
  if (typeof src === "string") return src;
  if ("cookies" in src && src.cookies && typeof src.cookies === "object") return src.cookies;
  const h = (src as { headers?: unknown }).headers;
  if (!h) return null;
  if (typeof (h as { get?: unknown }).get === "function") return (h as { get(n: string): string | null }).get("cookie");
  const v = (h as Record<string, string | string[] | undefined>)["cookie"] ?? (h as Record<string, string | string[] | undefined>)["Cookie"];
  return Array.isArray(v) ? v.join("; ") : v ?? null;
}

/** Read one cookie's value from any request-like source. */
export function getCookie(src: CookieSource, name: string): string | undefined {
  const h = cookieHeaderOf(src);
  if (h == null) return undefined;
  return typeof h === "string" ? parseCookies(h)[name] : h[name];
}

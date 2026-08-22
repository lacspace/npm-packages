/**
 * @lacspace/headers
 * Secure HTTP headers & a Content-Security-Policy builder.
 *
 * Framework-agnostic: get a plain headers object for Express/Hono/Fastify, a
 * Next.js `headers()` config, or a typed CSP string. Sensible, strict defaults.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export type CspValue = string[] | string | boolean;
export type CspDirectives = Record<string, CspValue>;

/** Build a Content-Security-Policy header value from typed directives. */
export function csp(directives: CspDirectives): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(directives)) {
    const name = key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    if (value === true) parts.push(name); // valueless directive, e.g. upgrade-insecure-requests
    else if (value === false) continue;
    else {
      const list = Array.isArray(value) ? value : [value];
      parts.push(`${name} ${list.join(" ")}`);
    }
  }
  return parts.join("; ");
}

export interface SecurityHeadersOptions {
  /** HSTS max-age in seconds. Default 15552000 (180 days). Set 0 to omit. */
  hstsMaxAge?: number;
  hstsIncludeSubDomains?: boolean;
  hstsPreload?: boolean;
  /** "DENY" | "SAMEORIGIN". Default "SAMEORIGIN". */
  frameOptions?: "DENY" | "SAMEORIGIN" | false;
  referrerPolicy?: string;
  /** Full CSP directives, or a prebuilt string. Omit to skip CSP. */
  contentSecurityPolicy?: CspDirectives | string;
  permissionsPolicy?: string;
  /** Cross-Origin-Opener-Policy. Default "same-origin". */
  crossOriginOpenerPolicy?: string;
}

/** A strict, sensible default set of security response headers. */
export function securityHeaders(opts: SecurityHeadersOptions = {}): Record<string, string> {
  const h: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": opts.referrerPolicy ?? "strict-origin-when-cross-origin",
  };

  const maxAge = opts.hstsMaxAge ?? 15552000;
  if (maxAge > 0) {
    let hsts = `max-age=${maxAge}`;
    if (opts.hstsIncludeSubDomains !== false) hsts += "; includeSubDomains";
    if (opts.hstsPreload) hsts += "; preload";
    h["Strict-Transport-Security"] = hsts;
  }

  if (opts.frameOptions !== false) h["X-Frame-Options"] = opts.frameOptions ?? "SAMEORIGIN";
  if (opts.permissionsPolicy) h["Permissions-Policy"] = opts.permissionsPolicy;
  h["Cross-Origin-Opener-Policy"] = opts.crossOriginOpenerPolicy ?? "same-origin";

  if (opts.contentSecurityPolicy) {
    h["Content-Security-Policy"] =
      typeof opts.contentSecurityPolicy === "string"
        ? opts.contentSecurityPolicy
        : csp(opts.contentSecurityPolicy);
  }
  return h;
}

/** A reasonable strict CSP baseline (adjust `scriptSrc`/`styleSrc` per app). */
export function strictCsp(overrides: CspDirectives = {}, opts: { nonce?: string } = {}): string {
  const nonceSrc = opts.nonce ? [`'nonce-${opts.nonce}'`] : [];
  return csp({
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    fontSrc: ["'self'", "https:", "data:"],
    imgSrc: ["'self'", "data:", "https:"],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'", ...nonceSrc],
    styleSrc: opts.nonce ? ["'self'", ...nonceSrc] : ["'self'", "'unsafe-inline'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: true,
    ...overrides,
  });
}

/** A per-response CSP nonce (base64, 16 random bytes) via Web Crypto. */
export function generateNonce(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(buf).toString("base64");
}

/* ------------------------------ adapters ------------------------------ */

/** Set security headers on a Fetch/edge `Response` (mutates and returns it). */
export function applyHeaders(response: Response, opts: SecurityHeadersOptions = {}): Response {
  for (const [k, v] of Object.entries(securityHeaders(opts))) {
    try {
      response.headers.set(k, v);
    } catch {
      /* immutable headers (rare) — ignore */
    }
  }
  return response;
}

/** Minimal Express-style middleware that applies the security headers. */
export function expressSecurityHeaders(opts: SecurityHeadersOptions = {}) {
  const h = securityHeaders(opts);
  return (
    _req: unknown,
    res: { setHeader: (k: string, v: string) => void },
    next: (err?: unknown) => void,
  ): void => {
    for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
    next();
  };
}

/** Convert to the array Next.js `next.config` `headers()` expects. */
export function toNextHeaders(
  opts: SecurityHeadersOptions = {},
  source = "/:path*",
): { source: string; headers: { key: string; value: string }[] }[] {
  return [
    {
      source,
      headers: Object.entries(securityHeaders(opts)).map(([key, value]) => ({ key, value })),
    },
  ];
}

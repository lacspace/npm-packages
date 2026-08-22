/**
 * @lacspace/jwt
 * JSON Web Tokens (HMAC) + secure random tokens — done safely.
 *
 * Sign and verify HS256/HS384/HS512 JWTs over Web Crypto (isomorphic), with
 * strict expiry / not-before / issuer / audience checks and constant-time
 * signature comparison. Plus opaque secure tokens and CSRF tokens.
 *
 * Zero dependencies (bar @lacspace/crypto) · isomorphic · fully typed.
 */

import { hmac, toBase64url, fromBase64url, constantTimeEqual, randomBytes, type HashAlgorithm } from "@lacspace/crypto";

export type Algorithm = "HS256" | "HS384" | "HS512";
const ALG_HASH: Record<Algorithm, HashAlgorithm> = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
};

export class JwtError extends Error {
  constructor(
    message: string,
    public code:
      | "malformed"
      | "signature"
      | "expired"
      | "not_active"
      | "issuer"
      | "audience"
      | "algorithm",
  ) {
    super(message);
    this.name = "JwtError";
  }
}

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface SignOptions {
  algorithm?: Algorithm;
  /** Seconds from now until expiry, e.g. 3600. */
  expiresIn?: number;
  issuer?: string;
  audience?: string | string[];
  subject?: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlJson(obj: unknown): string {
  return toBase64url(enc.encode(JSON.stringify(obj)));
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Sign a JWT. */
export async function sign(
  payload: JwtPayload,
  secret: string | Uint8Array,
  opts: SignOptions = {},
): Promise<string> {
  const alg = opts.algorithm ?? "HS256";
  const iat = nowSec();
  const body: JwtPayload = { iat, ...payload };
  if (opts.expiresIn !== undefined) body.exp = iat + opts.expiresIn;
  if (opts.issuer) body.iss = opts.issuer;
  if (opts.audience) body.aud = opts.audience;
  if (opts.subject) body.sub = opts.subject;

  const signingInput = `${b64urlJson({ alg, typ: "JWT" })}.${b64urlJson(body)}`;
  const sig = await hmac(secret, signingInput, ALG_HASH[alg]);
  return `${signingInput}.${toBase64url(sig)}`;
}

export interface VerifyOptions {
  algorithms?: Algorithm[];
  issuer?: string;
  audience?: string;
  /** Allowed clock skew in seconds. Default 0. */
  clockTolerance?: number;
}

/** Decode a JWT without verifying (never trust the result for auth). */
export function decode(token: string): { header: Record<string, unknown>; payload: JwtPayload } {
  const parts = token.split(".");
  if (parts.length !== 3) throw new JwtError("malformed token", "malformed");
  return {
    header: JSON.parse(dec.decode(fromBase64url(parts[0]!))),
    payload: JSON.parse(dec.decode(fromBase64url(parts[1]!))),
  };
}

/** Verify a JWT's signature and claims. Throws {@link JwtError} on any failure. */
export async function verify<T extends JwtPayload = JwtPayload>(
  token: string,
  secret: string | Uint8Array,
  opts: VerifyOptions = {},
): Promise<T> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new JwtError("malformed token", "malformed");
  const [h, p, s] = parts as [string, string, string];

  let header: { alg?: Algorithm };
  try {
    header = JSON.parse(dec.decode(fromBase64url(h)));
  } catch {
    throw new JwtError("malformed header", "malformed");
  }
  const alg = header.alg;
  if (!alg || !(alg in ALG_HASH)) throw new JwtError(`unsupported algorithm ${alg}`, "algorithm");
  if (opts.algorithms && !opts.algorithms.includes(alg))
    throw new JwtError(`algorithm ${alg} not allowed`, "algorithm");

  const expected = await hmac(secret, `${h}.${p}`, ALG_HASH[alg]);
  if (!constantTimeEqual(expected, fromBase64url(s)))
    throw new JwtError("signature verification failed", "signature");

  let payload: T;
  try {
    payload = JSON.parse(dec.decode(fromBase64url(p)));
  } catch {
    throw new JwtError("malformed payload", "malformed");
  }

  const now = nowSec();
  const skew = opts.clockTolerance ?? 0;
  if (payload.exp !== undefined && now > payload.exp + skew)
    throw new JwtError("token expired", "expired");
  if (payload.nbf !== undefined && now + skew < payload.nbf)
    throw new JwtError("token not yet active", "not_active");
  if (opts.issuer && payload.iss !== opts.issuer)
    throw new JwtError("issuer mismatch", "issuer");
  if (opts.audience) {
    const aud = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!aud.includes(opts.audience)) throw new JwtError("audience mismatch", "audience");
  }
  return payload;
}

/* ------------------------------ opaque tokens ------------------------------ */

/** A cryptographically-random URL-safe token (default 32 bytes → 43 chars). */
export function randomToken(bytes = 32): string {
  return toBase64url(randomBytes(bytes));
}

/** A CSRF token (alias of a 32-byte random token). */
export function csrfToken(): string {
  return randomToken(32);
}

/* ------------------------------ adapters ------------------------------ */

/** Anything we can read a header off: a Fetch Request/Headers, or Node `req.headers`. */
export type HeadersLike =
  | Request
  | Headers
  | { headers: Headers | Record<string, string | string[] | undefined> }
  | Record<string, string | string[] | undefined>;

function readHeader(src: HeadersLike, name: string): string | undefined {
  const lower = name.toLowerCase();
  const h: unknown = (src as { headers?: unknown }).headers ?? src;
  if (h && typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? undefined;
  const rec = h as Record<string, string | string[] | undefined>;
  const v = rec[name] ?? rec[lower];
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

/** Extract a bearer token from an `Authorization` header (or a named cookie). */
export function extractBearer(src: HeadersLike, opts: { cookieName?: string } = {}): string | undefined {
  const auth = readHeader(src, "authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1];
  }
  if (opts.cookieName) {
    const cookie = readHeader(src, "cookie");
    if (cookie) {
      const found = cookie.split(/;\s*/).find((c) => c.startsWith(`${opts.cookieName}=`));
      if (found) return decodeURIComponent(found.slice(opts.cookieName.length + 1));
    }
  }
  return undefined;
}

/** Read the bearer token from a request and verify it. Throws {@link JwtError}. */
export async function authenticate<T extends JwtPayload = JwtPayload>(
  src: HeadersLike,
  secret: string | Uint8Array,
  opts: VerifyOptions & { cookieName?: string } = {},
): Promise<T> {
  const token = extractBearer(src, { cookieName: opts.cookieName });
  if (!token) throw new JwtError("no bearer token", "malformed");
  return verify<T>(token, secret, opts);
}

export interface AuthCookieOptions {
  name?: string;
  maxAge?: number; // seconds
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

/** Build a hardened `Set-Cookie` value carrying an auth token. */
export function toAuthCookie(token: string, opts: AuthCookieOptions = {}): string {
  const name = opts.name ?? "token";
  const parts = [`${name}=${encodeURIComponent(token)}`, `Path=${opts.path ?? "/"}`, `SameSite=${opts.sameSite ?? "Lax"}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

/** Build a `Set-Cookie` value that clears the auth cookie. */
export function clearAuthCookie(opts: Pick<AuthCookieOptions, "name" | "path" | "domain"> = {}): string {
  const name = opts.name ?? "token";
  const parts = [`${name}=`, `Path=${opts.path ?? "/"}`, "Max-Age=0"];
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  return parts.join("; ");
}

/** Minimal Express-style middleware: verifies the bearer token → `req.user`, else 401. */
export function expressJwt<T extends JwtPayload = JwtPayload>(
  secret: string | Uint8Array,
  opts: VerifyOptions & { cookieName?: string; userKey?: string } = {},
) {
  const userKey = opts.userKey ?? "user";
  return async (
    req: { headers: Record<string, string | string[] | undefined>; [k: string]: unknown },
    res: { status: (n: number) => { json: (b: unknown) => unknown } },
    next: (err?: unknown) => void,
  ): Promise<void> => {
    try {
      req[userKey] = await authenticate<T>(req, secret, opts);
      next();
    } catch (err) {
      const code = err instanceof JwtError ? err.code : "malformed";
      res.status(401).json({ error: "unauthorized", code });
    }
  };
}

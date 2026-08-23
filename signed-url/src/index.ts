/**
 * @lacspace/signed-url
 *
 * HMAC-signed, expiring URLs & tokens over Web Crypto. Two things developers
 * re-implement badly on every project:
 *
 *   1. Signed *tokens*  — compact, tamper-proof strings for magic-login links,
 *      email unsubscribe links, one-time actions, email confirmations.
 *   2. Signed *URLs*    — protect a download / image-proxy / CDN link with an
 *      expiring `?exp=…&sig=…` signature (S3-presigned-style, self-hosted).
 *
 * Tamper-proof (any change breaks the signature), timing-safe verification,
 * optional expiry, zero config. Isomorphic: Node, edge runtimes and browsers.
 *
 * Built on @lacspace/crypto (Web Crypto) — never hand-rolled cryptography.
 */
import { hmac, hmacVerify, toBase64url, fromBase64url } from "@lacspace/crypto";

export type SignAlgorithm = "SHA-256" | "SHA-384" | "SHA-512";
export type Secret = string | Uint8Array;

/** JSON-serialisable token payload. */
export type TokenData =
  | string
  | number
  | boolean
  | null
  | { [key: string]: unknown }
  | unknown[];

const enc = new TextEncoder();
const dec = new TextDecoder();
const nowSec = (): number => Math.floor(Date.now() / 1000);

export interface ExpiryOptions {
  /** Seconds until expiry (relative to now). Ignored when `expiresAt` is set. */
  expiresIn?: number;
  /** Absolute expiry as a Unix timestamp (seconds). */
  expiresAt?: number;
  /** Override "now" (Unix seconds) — for deterministic tests. */
  now?: number;
}

export interface SignOptions extends ExpiryOptions {
  secret: Secret;
  /** HMAC hash. Default "SHA-256". */
  algorithm?: SignAlgorithm;
}

function resolveExp(o: ExpiryOptions): number | undefined {
  if (o.expiresAt !== undefined) return Math.floor(o.expiresAt);
  if (o.expiresIn !== undefined) return (o.now ?? nowSec()) + Math.floor(o.expiresIn);
  return undefined;
}

export type FailReason = "malformed" | "bad-signature" | "expired";

export interface VerifyResult<T> {
  valid: boolean;
  /** The original data (tokens only), present when `valid`. */
  data?: T;
  /** Why verification failed. */
  reason?: FailReason;
  /** Expiry timestamp (Unix seconds), if the token/URL had one. */
  expiresAt?: number;
}

export interface VerifyOptions {
  secret: Secret;
  algorithm?: SignAlgorithm;
  /** Override "now" (Unix seconds) — for deterministic tests. */
  now?: number;
  /** Allowed clock skew in seconds. Default 0. */
  clockToleranceSec?: number;
}

/* ------------------------------------------------------------------ *
 * Signed tokens
 * ------------------------------------------------------------------ */

interface Payload<T> {
  d: T;
  e?: number;
}

/**
 * Sign arbitrary JSON data into a compact, URL-safe, tamper-proof token:
 * `"<payload>.<signature>"`. Optionally expiring.
 *
 * @example
 * const token = await sign({ userId: 42, action: "reset-password" }, {
 *   secret: process.env.LINK_SECRET!, expiresIn: 3600,
 * });
 */
export async function sign(data: TokenData, opts: SignOptions): Promise<string> {
  const exp = resolveExp(opts);
  const payloadObj: Payload<TokenData> = { d: data };
  if (exp !== undefined) payloadObj.e = exp;
  const payload = toBase64url(enc.encode(JSON.stringify(payloadObj)));
  const sig = toBase64url(await hmac(opts.secret, payload, opts.algorithm ?? "SHA-256"));
  return `${payload}.${sig}`;
}

/**
 * Verify and decode a token from {@link sign}. Never throws — returns a result
 * with `valid` and, on failure, a `reason` ("malformed" | "bad-signature" | "expired").
 *
 * @example
 * const r = await verify<{ userId: number }>(token, { secret });
 * if (r.valid) grantAccess(r.data.userId);
 */
export async function verify<T = TokenData>(token: string, opts: VerifyOptions): Promise<VerifyResult<T>> {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { valid: false, reason: "malformed" };
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let sigBytes: Uint8Array;
  try {
    sigBytes = fromBase64url(sig);
  } catch {
    return { valid: false, reason: "malformed" };
  }

  const okSig = await hmacVerify(opts.secret, payload, sigBytes, opts.algorithm ?? "SHA-256");
  if (!okSig) return { valid: false, reason: "bad-signature" };

  let obj: Payload<T>;
  try {
    obj = JSON.parse(dec.decode(fromBase64url(payload))) as Payload<T>;
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (obj.e !== undefined) {
    const now = opts.now ?? nowSec();
    if (now > obj.e + (opts.clockToleranceSec ?? 0)) {
      return { valid: false, reason: "expired", expiresAt: obj.e };
    }
  }
  return { valid: true, data: obj.d, expiresAt: obj.e };
}

/** Convenience: `true` iff the token is valid (signature + not expired). */
export async function isValid(token: string, opts: VerifyOptions): Promise<boolean> {
  return (await verify(token, opts)).valid;
}

/* ------------------------------------------------------------------ *
 * Signed URLs
 * ------------------------------------------------------------------ */

export interface SignUrlOptions extends SignOptions {
  /** Query param that holds the signature. Default "sig". */
  sigParam?: string;
  /** Query param that holds the expiry. Default "exp". */
  expParam?: string;
}

export interface VerifyUrlOptions extends VerifyOptions {
  sigParam?: string;
  expParam?: string;
}

/** Canonical string to sign: origin + path + sorted query (excluding the sig param). */
function canonicalize(u: URL, sigParam: string): string {
  const params = [...u.searchParams.entries()]
    .filter(([k]) => k !== sigParam)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const qs = params.map(([k, v]) => `${k}=${v}`).join("&");
  return `${u.origin}${u.pathname}?${qs}`;
}

/**
 * Append an expiring HMAC signature to a URL — self-hosted presigned URLs for
 * downloads, image proxies or any link you want to protect from tampering.
 * Query-param order is normalised, so the link verifies regardless of ordering.
 *
 * @example
 * const link = await signUrl("https://cdn.me/files/report.pdf?uid=42", {
 *   secret, expiresIn: 300,
 * }); // → …?uid=42&exp=1699999999&sig=AbC…
 */
export async function signUrl(url: string, opts: SignUrlOptions): Promise<string> {
  const sigParam = opts.sigParam ?? "sig";
  const expParam = opts.expParam ?? "exp";
  const u = new URL(url);
  u.searchParams.delete(sigParam);
  const exp = resolveExp(opts);
  if (exp !== undefined) u.searchParams.set(expParam, String(exp));
  const sig = toBase64url(await hmac(opts.secret, canonicalize(u, sigParam), opts.algorithm ?? "SHA-256"));
  u.searchParams.set(sigParam, sig);
  return u.toString();
}

/**
 * Verify a URL produced by {@link signUrl}: checks the signature (timing-safe)
 * and expiry. Never throws.
 *
 * @example
 * const r = await verifyUrl(request.url, { secret });
 * if (!r.valid) return new Response("Link expired or invalid", { status: 403 });
 */
export async function verifyUrl(url: string, opts: VerifyUrlOptions): Promise<VerifyResult<never>> {
  const sigParam = opts.sigParam ?? "sig";
  const expParam = opts.expParam ?? "exp";

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { valid: false, reason: "malformed" };
  }

  const sig = u.searchParams.get(sigParam);
  if (!sig) return { valid: false, reason: "malformed" };

  let sigBytes: Uint8Array;
  try {
    sigBytes = fromBase64url(sig);
  } catch {
    return { valid: false, reason: "malformed" };
  }

  const okSig = await hmacVerify(opts.secret, canonicalize(u, sigParam), sigBytes, opts.algorithm ?? "SHA-256");
  if (!okSig) return { valid: false, reason: "bad-signature" };

  const expStr = u.searchParams.get(expParam);
  if (expStr) {
    const exp = Number(expStr);
    if (Number.isFinite(exp)) {
      const now = opts.now ?? nowSec();
      if (now > exp + (opts.clockToleranceSec ?? 0)) return { valid: false, reason: "expired", expiresAt: exp };
      return { valid: true, expiresAt: exp };
    }
  }
  return { valid: true };
}

/* ------------------------------------------------------------------ *
 * Magic links (token embedded in a URL)
 * ------------------------------------------------------------------ */

export interface MagicLinkOptions extends SignOptions {
  /** Query param that carries the token. Default "token". */
  param?: string;
}

/**
 * Build a magic link — a base URL with a signed token embedded as a query param.
 * Perfect for passwordless login, email verification and one-time actions.
 *
 * @example
 * const link = await magicLink("https://app.me/auth/callback", { email }, {
 *   secret, expiresIn: 900,
 * });
 */
export async function magicLink(baseUrl: string, data: TokenData, opts: MagicLinkOptions): Promise<string> {
  const token = await sign(data, opts);
  const u = new URL(baseUrl);
  u.searchParams.set(opts.param ?? "token", token);
  return u.toString();
}

/** Read & verify the token embedded in a magic link by {@link magicLink}. */
export async function readMagicLink<T = TokenData>(
  url: string,
  opts: VerifyOptions & { param?: string },
): Promise<VerifyResult<T>> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { valid: false, reason: "malformed" };
  }
  const token = u.searchParams.get(opts.param ?? "token");
  if (!token) return { valid: false, reason: "malformed" };
  return verify<T>(token, opts);
}

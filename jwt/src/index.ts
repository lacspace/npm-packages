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

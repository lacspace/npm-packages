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

export type Algorithm =
  | "HS256" | "HS384" | "HS512"
  | "RS256" | "RS384" | "RS512"
  | "ES256" | "ES384" | "ES512";

const ALG_HASH: Record<Algorithm, HashAlgorithm> = {
  HS256: "SHA-256", HS384: "SHA-384", HS512: "SHA-512",
  RS256: "SHA-256", RS384: "SHA-384", RS512: "SHA-512",
  ES256: "SHA-256", ES384: "SHA-384", ES512: "SHA-512",
};

/** A signing/verification key: an HMAC secret, or a Web Crypto key for RS and ES. */
export type SigningKey = string | Uint8Array | CryptoKey;
/** Resolve a verification key from the token header (e.g. by `kid`). */
export type KeyResolver = (header: { alg: Algorithm; kid?: string }) => SigningKey | Promise<SigningKey>;

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
      | "algorithm"
      | "reuse",
  ) {
    super(message);
    this.name = "JwtError";
  }
}

function getSubtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) throw new JwtError("Web Crypto API unavailable for asymmetric JWT", "algorithm");
  return c.subtle;
}

function b64ToBytes(b64: string): Uint8Array {
  if (typeof atob !== "undefined") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function subtleSignAlgo(alg: Algorithm): AlgorithmIdentifier | EcdsaParams {
  if (alg.startsWith("RS")) return { name: "RSASSA-PKCS1-v1_5" };
  if (alg.startsWith("ES")) return { name: "ECDSA", hash: ALG_HASH[alg] };
  throw new JwtError(`not an asymmetric algorithm: ${alg}`, "algorithm");
}

function subtleImportAlgo(alg: Algorithm): RsaHashedImportParams | EcKeyImportParams {
  if (alg.startsWith("RS")) return { name: "RSASSA-PKCS1-v1_5", hash: ALG_HASH[alg] };
  const curve = alg === "ES256" ? "P-256" : alg === "ES384" ? "P-384" : "P-521";
  return { name: "ECDSA", namedCurve: curve };
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
  /** `kid` header — which key signed this (for rotation / JWKS). */
  keyId?: string;
}

async function signBytes(alg: Algorithm, key: SigningKey, input: string): Promise<Uint8Array> {
  if (alg.startsWith("HS")) {
    if (typeof key !== "string" && !(key instanceof Uint8Array))
      throw new JwtError("HMAC algorithms need a string/bytes secret", "algorithm");
    return hmac(key, input, ALG_HASH[alg]);
  }
  if (!(typeof CryptoKey !== "undefined" && key instanceof CryptoKey))
    throw new JwtError(`${alg} needs a CryptoKey — use importPkcs8 / importJwk`, "algorithm");
  const sig = await getSubtle().sign(subtleSignAlgo(alg), key, enc.encode(input) as unknown as BufferSource);
  return new Uint8Array(sig);
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlJson(obj: unknown): string {
  return toBase64url(enc.encode(JSON.stringify(obj)));
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Sign a JWT. Pass an HMAC secret (HS*) or a Web Crypto private key (RS and ES). */
export async function sign(
  payload: JwtPayload,
  secret: SigningKey,
  opts: SignOptions = {},
): Promise<string> {
  const alg = opts.algorithm ?? "HS256";
  const iat = nowSec();
  const body: JwtPayload = { iat, ...payload };
  if (opts.expiresIn !== undefined) body.exp = iat + opts.expiresIn;
  if (opts.issuer) body.iss = opts.issuer;
  if (opts.audience) body.aud = opts.audience;
  if (opts.subject) body.sub = opts.subject;

  const header: Record<string, unknown> = { alg, typ: "JWT" };
  if (opts.keyId) header.kid = opts.keyId;
  const signingInput = `${b64urlJson(header)}.${b64urlJson(body)}`;
  const sig = await signBytes(alg, secret, signingInput);
  return `${signingInput}.${toBase64url(sig)}`;
}

export interface VerifyOptions {
  algorithms?: Algorithm[];
  issuer?: string;
  audience?: string | string[];
  /** Allowed clock skew in seconds. Default 0. */
  clockTolerance?: number;
  /** If set, reject unless the token's `typ` claim equals this (e.g. "refresh"). */
  requireTyp?: string;
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

/**
 * Verify a JWT's signature and claims. Throws {@link JwtError} on any failure.
 * `key` is an HMAC secret, a Web Crypto public key (RS and ES), or a resolver
 * (e.g. from {@link createRemoteJWKS}) that returns the key for the token header.
 */
export async function verify<T extends JwtPayload = JwtPayload>(
  token: string,
  key: SigningKey | KeyResolver,
  opts: VerifyOptions = {},
): Promise<T> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new JwtError("malformed token", "malformed");
  const [h, p, s] = parts as [string, string, string];

  let header: { alg?: Algorithm; kid?: string };
  try {
    header = JSON.parse(dec.decode(fromBase64url(h)));
  } catch {
    throw new JwtError("malformed header", "malformed");
  }
  const alg = header.alg;
  if (!alg || !(alg in ALG_HASH)) throw new JwtError(`unsupported algorithm ${alg}`, "algorithm");
  if (opts.algorithms && !opts.algorithms.includes(alg))
    throw new JwtError(`algorithm ${alg} not allowed`, "algorithm");

  const resolved = typeof key === "function" ? await key({ alg, kid: header.kid }) : key;

  const signingInput = `${h}.${p}`;
  const sig = fromBase64url(s);
  let valid: boolean;
  if (alg.startsWith("HS")) {
    if (typeof resolved !== "string" && !(resolved instanceof Uint8Array))
      throw new JwtError("HMAC algorithms need a string/bytes secret", "algorithm");
    valid = constantTimeEqual(await hmac(resolved, signingInput, ALG_HASH[alg]), sig);
  } else {
    if (!(typeof CryptoKey !== "undefined" && resolved instanceof CryptoKey))
      throw new JwtError(`${alg} needs a CryptoKey — use importSpki / importJwk / createRemoteJWKS`, "algorithm");
    valid = await getSubtle().verify(
      subtleSignAlgo(alg),
      resolved,
      sig as unknown as BufferSource,
      enc.encode(signingInput) as unknown as BufferSource,
    );
  }
  if (!valid) throw new JwtError("signature verification failed", "signature");

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
    const want = Array.isArray(opts.audience) ? opts.audience : [opts.audience];
    const have = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!want.some((a) => have.includes(a))) throw new JwtError("audience mismatch", "audience");
  }
  if (opts.requireTyp !== undefined && payload.typ !== opts.requireTyp)
    throw new JwtError(`token type mismatch (expected ${opts.requireTyp})`, "malformed");
  return payload;
}

/* ------------------------------ asymmetric keys & JWKS ------------------------------ */

function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  return b64ToBytes(b64);
}

/** Import a PKCS#8 PEM private key for signing (RS and ES). */
export function importPkcs8(pem: string, alg: Algorithm): Promise<CryptoKey> {
  return getSubtle().importKey("pkcs8", pemToDer(pem) as unknown as BufferSource, subtleImportAlgo(alg), false, ["sign"]);
}

/** Import an SPKI PEM public key for verification (RS and ES). */
export function importSpki(pem: string, alg: Algorithm): Promise<CryptoKey> {
  return getSubtle().importKey("spki", pemToDer(pem) as unknown as BufferSource, subtleImportAlgo(alg), false, ["verify"]);
}

/** Import a JWK (public or private) for verify/sign. */
export function importJwk(jwk: JsonWebKey, alg: Algorithm): Promise<CryptoKey> {
  const usage: KeyUsage[] = jwk.d ? ["sign"] : ["verify"];
  return getSubtle().importKey("jwk", jwk, subtleImportAlgo(alg), false, usage);
}

export interface JwksOptions {
  /** Cache the key set this long (ms). Default 600000 (10 min). */
  cacheMaxAgeMs?: number;
  /** Custom fetch (tests / edge). */
  fetch?: typeof fetch;
}

/**
 * A cached remote JWKS resolver for {@link verify}. Fetches the JSON Web Key
 * Set once, caches it, and returns the right public key by the token's `kid`.
 * @example const jwks = createRemoteJWKS("https://issuer/.well-known/jwks.json");
 *          const payload = await verify(token, jwks, { algorithms: ["RS256"] });
 */
export function createRemoteJWKS(url: string, opts: JwksOptions = {}): KeyResolver {
  const ttl = opts.cacheMaxAgeMs ?? 600000;
  const f = opts.fetch ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
  if (!f) throw new JwtError("no global fetch — pass opts.fetch", "signature");
  let cache: { keys: JsonWebKey[]; at: number } | null = null;
  const imported = new Map<string, CryptoKey>();

  return async ({ alg, kid }) => {
    if (!cache || Date.now() - cache.at > ttl) {
      const res = await f(url);
      if (!res.ok) throw new JwtError(`JWKS fetch failed: ${res.status}`, "signature");
      const data = (await res.json()) as { keys?: JsonWebKey[] };
      cache = { keys: data.keys ?? [], at: Date.now() };
      imported.clear();
    }
    const jwk = kid ? cache.keys.find((k) => (k as { kid?: string }).kid === kid) : cache.keys[0];
    if (!jwk) throw new JwtError(`no JWK found for kid "${kid}"`, "signature");
    const keyAlg = ((jwk as { alg?: string }).alg as Algorithm) ?? alg;
    const cacheKey = `${keyAlg}:${kid ?? ""}`;
    let ck = imported.get(cacheKey);
    if (!ck) {
      ck = await importJwk(jwk, keyAlg);
      imported.set(cacheKey, ck);
    }
    return ck;
  };
}

/* ------------------------------ refresh-token flow ------------------------------ */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** The refresh token's `jti` — persist it to detect reuse on rotation. */
  refreshJti: string;
}

export interface IssuePairOptions {
  algorithm?: Algorithm;
  /** Access-token lifetime in seconds. Default 900 (15 min). */
  accessTtl?: number;
  /** Refresh-token lifetime in seconds. Default 2592000 (30 days). */
  refreshTtl?: number;
  issuer?: string;
  audience?: string | string[];
  subject?: string;
  keyId?: string;
}

/** Issue a short-lived access token + a long-lived refresh token (with a `jti`). */
export async function issueTokenPair(
  payload: JwtPayload,
  secret: SigningKey,
  opts: IssuePairOptions = {},
): Promise<TokenPair> {
  const subject = opts.subject ?? (payload.sub as string | undefined);
  const common = { algorithm: opts.algorithm, issuer: opts.issuer, audience: opts.audience, subject, keyId: opts.keyId };
  const accessPayload = payload.typ !== undefined ? payload : { typ: "access", ...payload };
  const accessToken = await sign(accessPayload, secret, { ...common, expiresIn: opts.accessTtl ?? 900 });
  const refreshJti = randomToken(16);
  const refreshToken = await sign({ typ: "refresh", jti: refreshJti }, secret, {
    ...common,
    expiresIn: opts.refreshTtl ?? 2592000,
  });
  return { accessToken, refreshToken, refreshJti };
}

/** Verify a refresh token (must carry `typ: "refresh"`). */
export async function verifyRefreshToken<T extends JwtPayload = JwtPayload>(
  token: string,
  key: SigningKey | KeyResolver,
  opts: VerifyOptions = {},
): Promise<T> {
  const payload = await verify<T>(token, key, opts);
  if (payload.typ !== "refresh") throw new JwtError("not a refresh token", "malformed");
  return payload;
}

export interface RotateOptions extends IssuePairOptions, VerifyOptions {
  /** New access-token payload. Defaults to `{ sub }` from the refresh token. */
  payload?: JwtPayload;
  /** Reuse detection: return true if this refresh `jti` was already used/revoked. */
  isUsed?: (jti: string) => boolean | Promise<boolean>;
}

/**
 * Rotate a refresh token: verify it, optionally detect reuse, and issue a fresh
 * pair. Returns the new pair plus `usedJti` (persist it as spent).
 */
export async function rotateRefreshToken(
  refreshToken: string,
  secret: SigningKey,
  opts: RotateOptions = {},
): Promise<TokenPair & { usedJti?: string }> {
  const claims = await verifyRefreshToken(refreshToken, secret, opts);
  const jti = claims.jti;
  if (jti && opts.isUsed && (await opts.isUsed(jti)))
    throw new JwtError("refresh token reuse detected", "reuse");
  const pair = await issueTokenPair(opts.payload ?? { sub: claims.sub }, secret, {
    ...opts,
    subject: opts.subject ?? (claims.sub as string | undefined),
  });
  return { ...pair, usedJti: jti };
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
  secret: SigningKey | KeyResolver,
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
  secret: SigningKey | KeyResolver,
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

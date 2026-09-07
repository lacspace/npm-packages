/**
 * @lacspace/signed-url — secure layer (additive, new in 1.1.0)
 *
 * A superset of the classic {@link sign}/{@link verify} and
 * {@link signUrl}/{@link verifyUrl} helpers that adds, all optional and fully
 * backward compatible with the same on-the-wire `"<payload>.<signature>"`
 * token format and the same `?exp=…&sig=…` URL scheme:
 *
 *   1. Key rotation — sign with one of several named secrets (a key id is
 *      stamped in the signature) and verify against a key *set*, so secrets can
 *      rotate without invalidating live tokens / URLs.
 *   2. Binding constraints — optionally bind a signature to an HTTP method, a
 *      client IP and/or a required path prefix; verify enforces whatever was
 *      bound (unbound behaviour is identical to the classic helpers).
 *   3. One-time / max-uses nonce — embed a random nonce in the signature and a
 *      pure {@link consumeNonce} checker so callers can enforce single-use /
 *      max-N-use against their own store (storage stays the caller's).
 *   4. Clock tolerance — an optional `clockTolerance` (leeway seconds) on expiry.
 *   5. Signed claims — attach arbitrary small, tamper-proof metadata that
 *      verify returns.
 *
 * Built on the same @lacspace/crypto primitives — no new dependencies.
 */
import { hmac, hmacVerify, toBase64url, fromBase64url, randomBytes, toHex } from "@lacspace/crypto";
import type {
  Secret,
  SignAlgorithm,
  TokenData,
  ExpiryOptions,
  FailReason,
} from "./index";

const enc = new TextEncoder();
const dec = new TextDecoder();
const nowSec = (): number => Math.floor(Date.now() / 1000);

function resolveExp(o: ExpiryOptions): number | undefined {
  if (o.expiresAt !== undefined) return Math.floor(o.expiresAt);
  if (o.expiresIn !== undefined) return (o.now ?? nowSec()) + Math.floor(o.expiresIn);
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Shared types
 * ------------------------------------------------------------------ */

/** A named set of secrets for key rotation: `{ "2024": secretA, "2025": secretB }`. */
export type KeySet = Record<string, Secret>;

/**
 * Optional constraints bound into the signature. Whatever is set here must be
 * satisfied by the {@link RequestContext} passed to verify, or verification
 * fails with reason `"binding"`. Anything left unset is not enforced.
 */
export interface BindConstraints {
  /** Required HTTP method (case-insensitive), e.g. `"POST"`. */
  method?: string;
  /** Required exact client IP, e.g. `"203.0.113.7"`. */
  ip?: string;
  /** Required path prefix the request path must start with, e.g. `"/files/"`. */
  pathPrefix?: string;
}

/** Runtime request context supplied to verify, checked against {@link BindConstraints}. */
export interface RequestContext {
  method?: string;
  ip?: string;
  path?: string;
}

/** Reasons a secure verify can fail — the classic reasons plus rotation/binding. */
export type SecureFailReason = FailReason | "unknown-key" | "binding";

export interface SecureSignOptions extends ExpiryOptions {
  /** Single secret (classic mode). Provide this OR `keys`. */
  secret?: Secret;
  /** Named secret set for rotation. When set, `keyId` picks which to sign with. */
  keys?: KeySet;
  /** Which id in `keys` to sign with. Defaults to the first key in `keys`. */
  keyId?: string;
  /** HMAC hash. Default "SHA-256". */
  algorithm?: SignAlgorithm;
  /** Bind the signature to a method / IP / path prefix that verify must match. */
  bind?: BindConstraints;
  /** Embed a random single-use nonce: `true` → 16 bytes, or a byte length. */
  nonce?: boolean | number;
  /** Arbitrary small, tamper-proof metadata returned verbatim by verify. */
  claims?: Record<string, unknown>;
}

export interface SecureVerifyOptions {
  /** Single secret (classic mode). Provide this OR `keys`. */
  secret?: Secret;
  /** Named secret set for rotation. The stamped key id is looked up here. */
  keys?: KeySet;
  algorithm?: SignAlgorithm;
  /** Override "now" (Unix seconds) — for deterministic tests. */
  now?: number;
  /** Allowed clock skew in seconds. Default 0. */
  clockTolerance?: number;
  /** Runtime request context enforced against any bound constraints. */
  context?: RequestContext;
}

export interface SecureVerifyResult<T> {
  valid: boolean;
  /** The original data, present when `valid`. */
  data?: T;
  /** The signed claims, present when `valid` and claims were attached. */
  claims?: Record<string, unknown>;
  /** The embedded nonce (hex), present when one was attached. */
  nonce?: string;
  /** The key id that signed this, present when key rotation was used. */
  keyId?: string;
  /** Why verification failed. */
  reason?: SecureFailReason;
  /** Expiry timestamp (Unix seconds), if the token/URL had one. */
  expiresAt?: number;
}

/* ------------------------------------------------------------------ *
 * Internal helpers
 * ------------------------------------------------------------------ */

interface EncodedBind {
  m?: string;
  i?: string;
  p?: string;
}

interface SecurePayload<T> {
  d: T;
  e?: number;
  /** key id */
  k?: string;
  /** binding */
  b?: EncodedBind;
  /** nonce */
  n?: string;
  /** claims */
  c?: Record<string, unknown>;
}

function encodeBind(bind: BindConstraints | undefined): EncodedBind | undefined {
  if (!bind) return undefined;
  const b: EncodedBind = {};
  if (bind.method !== undefined) b.m = bind.method;
  if (bind.ip !== undefined) b.i = bind.ip;
  if (bind.pathPrefix !== undefined) b.p = bind.pathPrefix;
  return Object.keys(b).length ? b : undefined;
}

/** True iff the request context satisfies the bound constraints. */
function checkBinding(b: EncodedBind | undefined, ctx: RequestContext | undefined): boolean {
  if (!b) return true;
  const c = ctx ?? {};
  if (b.m !== undefined && (c.method ?? "").toUpperCase() !== b.m.toUpperCase()) return false;
  if (b.i !== undefined && c.ip !== b.i) return false;
  if (b.p !== undefined && !(c.path ?? "").startsWith(b.p)) return false;
  return true;
}

function pickSigningKey(opts: { secret?: Secret; keys?: KeySet; keyId?: string }): {
  secret: Secret;
  keyId?: string;
} {
  if (opts.keys) {
    const id = opts.keyId ?? Object.keys(opts.keys)[0];
    if (id === undefined || opts.keys[id] === undefined) {
      throw new Error("@lacspace/signed-url: keyId not found in keys");
    }
    return { secret: opts.keys[id], keyId: id };
  }
  if (opts.secret !== undefined) return { secret: opts.secret };
  throw new Error("@lacspace/signed-url: a `secret` or `keys` must be provided");
}

/** Resolve the verifying secret for a (possibly stamped) key id. */
function resolveVerifyKey(k: string | undefined, opts: { secret?: Secret; keys?: KeySet }): Secret | undefined {
  if (k !== undefined && opts.keys) return opts.keys[k]; // undefined ⇒ unknown-key (wrong set)
  if (opts.secret !== undefined) return opts.secret; // classic single-secret token
  return undefined;
}

function resolveNonceBytes(nonce: boolean | number | undefined): number {
  if (nonce === true) return 16;
  if (typeof nonce === "number" && nonce > 0) return Math.floor(nonce);
  return 0;
}

/* ------------------------------------------------------------------ *
 * Secure tokens
 * ------------------------------------------------------------------ */

/**
 * Sign data into a compact, tamper-proof token like {@link sign}, with optional
 * key rotation, binding, a single-use nonce, and signed claims. The on-the-wire
 * format is identical (`"<payload>.<signature>"`), so a token signed with none
 * of the new options is byte-for-byte what {@link sign} would produce and
 * verifies with plain {@link verify} too.
 *
 * @example
 * const token = await signSecure({ userId: 42 }, {
 *   keys: { "2025": SECRET_A }, keyId: "2025",
 *   bind: { method: "POST", pathPrefix: "/admin/" },
 *   nonce: true, claims: { role: "owner" }, expiresIn: 900,
 * });
 */
export async function signSecure(data: TokenData, opts: SecureSignOptions): Promise<string> {
  const { secret, keyId } = pickSigningKey(opts);
  const exp = resolveExp(opts);
  const payloadObj: SecurePayload<TokenData> = { d: data };
  if (exp !== undefined) payloadObj.e = exp;
  if (keyId !== undefined) payloadObj.k = keyId;
  const b = encodeBind(opts.bind);
  if (b) payloadObj.b = b;
  const nb = resolveNonceBytes(opts.nonce);
  if (nb > 0) payloadObj.n = toHex(randomBytes(nb));
  if (opts.claims !== undefined) payloadObj.c = opts.claims;

  const payload = toBase64url(enc.encode(JSON.stringify(payloadObj)));
  const sig = toBase64url(await hmac(secret, payload, opts.algorithm ?? "SHA-256"));
  return `${payload}.${sig}`;
}

/**
 * Verify a token from {@link signSecure} (or a plain {@link sign} token).
 * Never throws — returns `{ valid, data?, claims?, nonce?, keyId?, reason?, expiresAt? }`.
 * Enforces expiry (with optional `clockTolerance`), key rotation (looks the
 * stamped key id up in `keys`) and any bound constraints against `context`.
 *
 * @example
 * const r = await verifySecure(token, {
 *   keys: { "2024": OLD, "2025": SECRET_A },
 *   context: { method: req.method, ip: clientIp, path: url.pathname },
 *   clockTolerance: 30,
 * });
 * if (r.valid) grant(r.data, r.claims);
 */
export async function verifySecure<T = TokenData>(
  token: string,
  opts: SecureVerifyOptions,
): Promise<SecureVerifyResult<T>> {
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

  let obj: SecurePayload<T>;
  try {
    obj = JSON.parse(dec.decode(fromBase64url(payload))) as SecurePayload<T>;
  } catch {
    return { valid: false, reason: "malformed" };
  }

  const secret = resolveVerifyKey(obj.k, opts);
  if (secret === undefined) return { valid: false, reason: "unknown-key" };

  const okSig = await hmacVerify(secret, payload, sigBytes, opts.algorithm ?? "SHA-256");
  if (!okSig) return { valid: false, reason: "bad-signature" };

  if (obj.e !== undefined) {
    const now = opts.now ?? nowSec();
    if (now > obj.e + (opts.clockTolerance ?? 0)) {
      return { valid: false, reason: "expired", expiresAt: obj.e };
    }
  }

  if (!checkBinding(obj.b, opts.context)) {
    return { valid: false, reason: "binding", expiresAt: obj.e };
  }

  return {
    valid: true,
    data: obj.d,
    claims: obj.c,
    nonce: obj.n,
    keyId: obj.k,
    expiresAt: obj.e,
  };
}

/* ------------------------------------------------------------------ *
 * Secure URLs
 * ------------------------------------------------------------------ */

export interface SecureSignUrlOptions extends SecureSignOptions {
  /** Query param that holds the signature. Default "sig". */
  sigParam?: string;
  /** Query param that holds the expiry. Default "exp". */
  expParam?: string;
}

export interface SecureVerifyUrlOptions extends SecureVerifyOptions {
  sigParam?: string;
  expParam?: string;
}

// Param names for the secure extras (all covered by the signature canonicalisation).
const KID_PARAM = "kid";
const NONCE_PARAM = "nonce";
const BIND_METHOD_PARAM = "bm";
const BIND_IP_PARAM = "bi";
const BIND_PREFIX_PARAM = "bp";
const CLAIMS_PARAM = "cl";

/** Canonical string to sign: origin + path + sorted query (excluding the sig param). */
function canonicalize(u: URL, sigParam: string): string {
  const params = [...u.searchParams.entries()]
    .filter(([k]) => k !== sigParam)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const qs = params.map(([k, v]) => `${k}=${v}`).join("&");
  return `${u.origin}${u.pathname}?${qs}`;
}

/**
 * Like {@link signUrl}, with optional key rotation, binding, a nonce and signed
 * claims stamped into the query and covered by the signature. A URL signed with
 * none of the new options is exactly what {@link signUrl} produces.
 *
 * @example
 * const link = await signSecureUrl("https://cdn.me/files/a.pdf?uid=42", {
 *   keys: { "2025": SECRET_A }, keyId: "2025",
 *   bind: { pathPrefix: "/files/" }, claims: { uid: 42 }, expiresIn: 300,
 * });
 */
export async function signSecureUrl(url: string, opts: SecureSignUrlOptions): Promise<string> {
  const sigParam = opts.sigParam ?? "sig";
  const expParam = opts.expParam ?? "exp";
  const { secret, keyId } = pickSigningKey(opts);
  const u = new URL(url);
  u.searchParams.delete(sigParam);

  const exp = resolveExp(opts);
  if (exp !== undefined) u.searchParams.set(expParam, String(exp));
  if (keyId !== undefined) u.searchParams.set(KID_PARAM, keyId);
  const nb = resolveNonceBytes(opts.nonce);
  if (nb > 0) u.searchParams.set(NONCE_PARAM, toHex(randomBytes(nb)));
  if (opts.bind?.method !== undefined) u.searchParams.set(BIND_METHOD_PARAM, opts.bind.method);
  if (opts.bind?.ip !== undefined) u.searchParams.set(BIND_IP_PARAM, opts.bind.ip);
  if (opts.bind?.pathPrefix !== undefined) u.searchParams.set(BIND_PREFIX_PARAM, opts.bind.pathPrefix);
  if (opts.claims !== undefined) {
    u.searchParams.set(CLAIMS_PARAM, toBase64url(enc.encode(JSON.stringify(opts.claims))));
  }

  const sig = toBase64url(await hmac(secret, canonicalize(u, sigParam), opts.algorithm ?? "SHA-256"));
  u.searchParams.set(sigParam, sig);
  return u.toString();
}

/**
 * Verify a URL from {@link signSecureUrl} (or a plain {@link signUrl} URL).
 * Never throws. Enforces signature, expiry (with optional `clockTolerance`),
 * key rotation and any bound constraints against `context`.
 */
export async function verifySecureUrl(
  url: string,
  opts: SecureVerifyUrlOptions,
): Promise<SecureVerifyResult<never>> {
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

  const keyId = u.searchParams.get(KID_PARAM) ?? undefined;
  const secret = resolveVerifyKey(keyId, opts);
  if (secret === undefined) return { valid: false, reason: "unknown-key" };

  const okSig = await hmacVerify(secret, canonicalize(u, sigParam), sigBytes, opts.algorithm ?? "SHA-256");
  if (!okSig) return { valid: false, reason: "bad-signature" };

  let expiresAt: number | undefined;
  const expStr = u.searchParams.get(expParam);
  if (expStr) {
    const exp = Number(expStr);
    if (Number.isFinite(exp)) {
      expiresAt = exp;
      const now = opts.now ?? nowSec();
      if (now > exp + (opts.clockTolerance ?? 0)) return { valid: false, reason: "expired", expiresAt: exp };
    }
  }

  const b: EncodedBind = {};
  const bm = u.searchParams.get(BIND_METHOD_PARAM);
  const bi = u.searchParams.get(BIND_IP_PARAM);
  const bp = u.searchParams.get(BIND_PREFIX_PARAM);
  if (bm !== null) b.m = bm;
  if (bi !== null) b.i = bi;
  if (bp !== null) b.p = bp;
  if (!checkBinding(Object.keys(b).length ? b : undefined, opts.context)) {
    return { valid: false, reason: "binding", expiresAt };
  }

  let claims: Record<string, unknown> | undefined;
  const cl = u.searchParams.get(CLAIMS_PARAM);
  if (cl) {
    try {
      claims = JSON.parse(dec.decode(fromBase64url(cl))) as Record<string, unknown>;
    } catch {
      return { valid: false, reason: "malformed", expiresAt };
    }
  }

  const nonce = u.searchParams.get(NONCE_PARAM) ?? undefined;
  return { valid: true, claims, nonce, keyId, expiresAt };
}

/* ------------------------------------------------------------------ *
 * Nonce helpers (one-time / max-uses — storage stays the caller's)
 * ------------------------------------------------------------------ */

/** Generate a random nonce (hex). Default 16 bytes. */
export function generateNonce(bytes = 16): string {
  return toHex(randomBytes(Math.max(1, Math.floor(bytes))));
}

export interface ConsumeNonceOptions {
  /** Maximum allowed uses of the nonce. Default 1 (one-time). */
  maxUses?: number;
}

export interface ConsumeNonceResult {
  /** Whether this use is allowed (i.e. the nonce was not already exhausted). */
  ok: boolean;
  /** The new total use count to persist back to your store. */
  uses: number;
  /** How many uses remain after this one. */
  remaining: number;
}

/**
 * Pure single-use / max-N-use checker. The library owns no storage: you read the
 * current use count for a nonce from your own store, call this, and — if `ok` —
 * write the returned `uses` back. `previousUses` is the count you have stored so
 * far (undefined / 0 for a never-seen nonce).
 *
 * @example
 * const prior = await store.get(nonce);          // number | undefined
 * const c = consumeNonce(prior, { maxUses: 1 });
 * if (!c.ok) return reject("already used");
 * await store.set(nonce, c.uses);                // persist
 */
export function consumeNonce(
  previousUses: number | undefined,
  opts: ConsumeNonceOptions = {},
): ConsumeNonceResult {
  const maxUses = opts.maxUses !== undefined && opts.maxUses > 0 ? Math.floor(opts.maxUses) : 1;
  const prior = previousUses !== undefined && previousUses > 0 ? Math.floor(previousUses) : 0;
  if (prior >= maxUses) {
    return { ok: false, uses: prior, remaining: 0 };
  }
  const uses = prior + 1;
  return { ok: true, uses, remaining: maxUses - uses };
}

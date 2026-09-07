/**
 * Trusted-device tokens — issue and verify a signed "remember this device" token
 * so a known device can skip MFA for a window. Uses Web Crypto HMAC-SHA256 with
 * an INJECTABLE secret (never a hard-coded key), a self-describing base64url
 * payload, and an expiry baked into the signed claims. Zero deps · isomorphic
 * (Node 20+ / edge / browser — anywhere `globalThis.crypto.subtle` exists).
 */

/** Claims carried by a trusted-device token. */
export interface TrustedDeviceClaims {
  /** Subject — the user this device is trusted for. */
  sub: string;
  /** Stable device identifier (a fingerprint or random id you persist). */
  device: string;
  /** Issued-at (ms epoch). */
  iat: number;
  /** Expiry (ms epoch). */
  exp: number;
  /** Optional scope, e.g. which factor types this trust stands in for. */
  scope?: string[];
}

type Secret = string | Uint8Array | ArrayBuffer;

export interface IssueTrustedDeviceOptions {
  /** The user this device is trusted for. */
  sub: string;
  /** Stable device identifier. */
  device: string;
  /** HMAC secret — inject it; never hard-code. */
  secret: Secret;
  /** Lifetime of the token in ms. */
  ttlMs: number;
  /** Optional scope claim. */
  scope?: string[];
  /** Injectable clock (ms epoch). Defaults to `Date.now`. */
  now?: () => number;
}

export interface VerifyTrustedDeviceOptions {
  /** Injectable clock (ms epoch). Defaults to `Date.now`. */
  now?: () => number;
  /** If set, the token's `sub` must equal this. */
  sub?: string;
  /** If set, the token's `device` must equal this. */
  device?: string;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64urlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64[b2 & 63];
  }
  return out;
}

function b64urlDecode(str: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of str) {
    const val = B64.indexOf(ch);
    if (val === -1) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function toKeyData(secret: Secret): Uint8Array {
  if (typeof secret === "string") return new TextEncoder().encode(secret);
  if (secret instanceof Uint8Array) return secret;
  return new Uint8Array(secret);
}

async function hmacSha256(secret: Secret, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toKeyData(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, data as BufferSource);
  return new Uint8Array(sig);
}

/** Constant-time-ish comparison of two ASCII strings. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Issue a signed trusted-device token: `base64url(claims).base64url(HMAC)`.
 * The device may present it to skip MFA until `iat + ttlMs`.
 */
export async function issueTrustedDevice(opts: IssueTrustedDeviceOptions): Promise<string> {
  const iat = (opts.now ?? Date.now)();
  const claims: TrustedDeviceClaims = {
    sub: opts.sub,
    device: opts.device,
    iat,
    exp: iat + opts.ttlMs,
    ...(opts.scope ? { scope: opts.scope } : {}),
  };
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const sig = b64urlEncode(await hmacSha256(opts.secret, new TextEncoder().encode(payload)));
  return `${payload}.${sig}`;
}

/**
 * Verify a trusted-device token against `secret`. Returns the {@link
 * TrustedDeviceClaims} when the signature is valid, the token is unexpired, and
 * any `sub`/`device` expectations match — otherwise `null` (never throws).
 */
export async function verifyTrustedDevice(
  token: string,
  secret: Secret,
  opts?: VerifyTrustedDeviceOptions,
): Promise<TrustedDeviceClaims | null> {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, sig] = parts;

  const expected = b64urlEncode(await hmacSha256(secret, new TextEncoder().encode(payload)));
  if (!timingSafeEqual(sig, expected)) return null;

  let claims: TrustedDeviceClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
  } catch {
    return null;
  }
  if (!claims || typeof claims.exp !== "number" || typeof claims.sub !== "string") return null;

  const now = (opts?.now ?? Date.now)();
  if (now > claims.exp) return null;
  if (opts?.sub != null && claims.sub !== opts.sub) return null;
  if (opts?.device != null && claims.device !== opts.device) return null;

  return claims;
}

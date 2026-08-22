/**
 * @lacspace/otp
 * TOTP & HOTP two-factor auth — Google Authenticator compatible.
 *
 * Generate secrets, compute and verify time-based (TOTP) and counter-based
 * (HOTP) one-time codes, and build the `otpauth://` URI you turn into a QR code.
 * Built on the Web Crypto API, so it runs on Node 18+, edge runtimes and the
 * browser alike.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export type OtpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

export interface OtpOptions {
  /** Number of digits in the code (default 6). */
  digits?: number;
  /** HMAC hash (default SHA-1 — what authenticator apps use). */
  algorithm?: OtpAlgorithm;
}

export interface TotpOptions extends OtpOptions {
  /** Time step in seconds (default 30). */
  period?: number;
  /** Override "now" (ms since epoch) — for testing. */
  timestamp?: number;
}

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function getCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) {
    throw new Error("Web Crypto API unavailable — @lacspace/otp needs Node 18+, an edge runtime, or a browser");
  }
  return c;
}

/* ------------------------------ base32 ------------------------------ */

/** Encode bytes to RFC 4648 base32 (no padding). */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Decode an RFC 4648 base32 string (padding and spaces tolerated). */
export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`invalid base32 character "${ch}"`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Generate a random base32 secret (default 20 bytes / 160 bits). */
export function generateSecret(bytes = 20): string {
  const buf = new Uint8Array(bytes);
  getCrypto().getRandomValues(buf);
  return base32Encode(buf);
}

/* ------------------------------ core ------------------------------ */

async function hmac(algorithm: OtpAlgorithm, key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const c = getCrypto();
  const cryptoKey = await c.subtle.importKey(
    "raw",
    key as unknown as BufferSource,
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const sig = await c.subtle.sign("HMAC", cryptoKey, message as unknown as BufferSource);
  return new Uint8Array(sig);
}

function counterBytes(counter: number): Uint8Array {
  const buf = new Uint8Array(8);
  let n = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return buf;
}

function truncate(hash: Uint8Array, digits: number): string {
  const offset = hash[hash.length - 1]! & 0x0f;
  const bin =
    ((hash[offset]! & 0x7f) << 24) |
    ((hash[offset + 1]! & 0xff) << 16) |
    ((hash[offset + 2]! & 0xff) << 8) |
    (hash[offset + 3]! & 0xff);
  return (bin % 10 ** digits).toString().padStart(digits, "0");
}

/** Compute an HOTP code for a given counter. */
export async function hotp(secret: string, counter: number, opts: OtpOptions = {}): Promise<string> {
  const digits = opts.digits ?? 6;
  const algorithm = opts.algorithm ?? "SHA-1";
  const hash = await hmac(algorithm, base32Decode(secret), counterBytes(counter));
  return truncate(hash, digits);
}

/** Compute the current TOTP code. */
export async function totp(secret: string, opts: TotpOptions = {}): Promise<string> {
  const period = opts.period ?? 30;
  const now = opts.timestamp ?? Date.now();
  const counter = Math.floor(now / 1000 / period);
  return hotp(secret, counter, opts);
}

/** Seconds remaining before the current TOTP code rolls over. */
export function timeRemaining(opts: TotpOptions = {}): number {
  const period = opts.period ?? 30;
  const now = opts.timestamp ?? Date.now();
  return period - (Math.floor(now / 1000) % period);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a TOTP token, tolerating clock drift of ±`window` periods (default 1).
 * @returns the matched step offset (0 = current, ±1 = adjacent), or null if no match.
 */
export async function verifyTotp(
  token: string,
  secret: string,
  opts: TotpOptions & { window?: number } = {},
): Promise<number | null> {
  const window = opts.window ?? 1;
  const period = opts.period ?? 30;
  const now = opts.timestamp ?? Date.now();
  const base = Math.floor(now / 1000 / period);
  const digits = opts.digits ?? 6;
  const algorithm = opts.algorithm ?? "SHA-1";
  const key = base32Decode(secret);
  const clean = token.replace(/\s/g, "");
  for (let offset = -window; offset <= window; offset++) {
    const hash = await hmac(algorithm, key, counterBytes(base + offset));
    if (timingSafeEqual(clean, truncate(hash, digits))) return offset;
  }
  return null;
}

/**
 * Verify an HOTP token, scanning forward up to `window` counters (default 0).
 * @returns the matched counter, or null if no match.
 */
export async function verifyHotp(
  token: string,
  secret: string,
  counter: number,
  opts: OtpOptions & { window?: number } = {},
): Promise<number | null> {
  const window = opts.window ?? 0;
  const clean = token.replace(/\s/g, "");
  for (let i = 0; i <= window; i++) {
    if (timingSafeEqual(clean, await hotp(secret, counter + i, opts))) return counter + i;
  }
  return null;
}

/* ------------------------------ provisioning ------------------------------ */

export interface KeyUriInput extends OtpOptions {
  secret: string;
  /** Account label, e.g. the user's email. */
  label: string;
  /** Issuer / app name shown in the authenticator. */
  issuer?: string;
  period?: number;
  type?: "totp" | "hotp";
  /** Required for hotp. */
  counter?: number;
}

/**
 * Build an `otpauth://` URI — feed it to a QR code generator so users can scan
 * it into Google Authenticator, Authy, 1Password, etc.
 */
export function keyuri(o: KeyUriInput): string {
  const type = o.type ?? "totp";
  const label = o.issuer ? `${o.issuer}:${o.label}` : o.label;
  const params = new URLSearchParams({
    secret: o.secret,
    algorithm: (o.algorithm ?? "SHA-1").replace("-", ""),
    digits: String(o.digits ?? 6),
  });
  if (o.issuer) params.set("issuer", o.issuer);
  if (type === "totp") params.set("period", String(o.period ?? 30));
  if (type === "hotp") params.set("counter", String(o.counter ?? 0));
  return `otpauth://${type}/${encodeURIComponent(label)}?${params.toString()}`;
}

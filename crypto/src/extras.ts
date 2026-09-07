/**
 * @lacspace/crypto — additive helpers (v1.2.0)
 *
 * Ergonomic conveniences layered on top of the core primitives:
 *  - `timingSafeEqual` — familiar alias for {@link constantTimeEqual}.
 *  - `sha384` / `sha512` — hex digest convenience (SHA-256 already exists).
 *  - `hmacHex` / `hmacBase64url` — string-encoded HMAC signatures.
 *  - `toBase64` / `fromBase64` — standard (non-url) base64.
 *  - `randomString` / `randomUUID` / `randomInt` — unbiased secure random helpers.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

import { randomBytes, constantTimeEqual, digest, toHex, toBase64url, hmac, type HashAlgorithm } from "./index";

/* ------------------------------ compare ------------------------------ */

/**
 * Constant-time comparison of two byte arrays or strings — a familiar alias
 * for {@link constantTimeEqual}. Returns `false` on length mismatch.
 */
export const timingSafeEqual: typeof constantTimeEqual = constantTimeEqual;

/* ------------------------------ hashing ------------------------------ */

/** SHA-384 hex digest. */
export async function sha384(data: string | Uint8Array): Promise<string> {
  return toHex(await digest(data, "SHA-384"));
}

/** SHA-512 hex digest. */
export async function sha512(data: string | Uint8Array): Promise<string> {
  return toHex(await digest(data, "SHA-512"));
}

/** HMAC signature as a lowercase hex string. */
export async function hmacHex(
  key: string | Uint8Array,
  data: string | Uint8Array,
  algorithm: HashAlgorithm = "SHA-256",
): Promise<string> {
  return toHex(await hmac(key, data, algorithm));
}

/** HMAC signature as a base64url string. */
export async function hmacBase64url(
  key: string | Uint8Array,
  data: string | Uint8Array,
  algorithm: HashAlgorithm = "SHA-256",
): Promise<string> {
  return toBase64url(await hmac(key, data, algorithm));
}

/* ------------------------------ base64 (standard) ------------------------------ */

/** Encode bytes as standard (padded, non-url) base64. */
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
}

/** Decode a standard base64 string (also tolerates base64url input) to bytes. */
export function fromBase64(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const b64 = norm + "===".slice((norm.length + 3) % 4);
  if (typeof atob !== "undefined") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/* ------------------------------ secure random ------------------------------ */

/** Default alphabet for {@link randomString}: URL-safe base62 (no ambiguous separators). */
export const DEFAULT_RANDOM_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generate a cryptographically-secure random string of `length` characters
 * drawn uniformly from `alphabet` (default URL-safe base62). Uses rejection
 * sampling so there is no modulo bias, even for alphabets whose size does not
 * divide 256.
 */
export function randomString(length: number, alphabet: string = DEFAULT_RANDOM_ALPHABET): string {
  if (!Number.isInteger(length) || length < 0) throw new Error("randomString length must be a non-negative integer");
  const n = alphabet.length;
  if (n < 2 || n > 256) throw new Error("randomString alphabet must have between 2 and 256 characters");
  if (length === 0) return "";
  const maxValid = Math.floor(256 / n) * n; // reject bytes >= this to avoid bias
  const out: string[] = [];
  while (out.length < length) {
    const buf = randomBytes(length - out.length);
    for (const b of buf) {
      if (b < maxValid) {
        out.push(alphabet[b % n]!);
        if (out.length >= length) break;
      }
    }
  }
  return out.join("");
}

/** Generate a RFC 4122 version-4 UUID using the platform CSPRNG. */
export function randomUUID(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = randomBytes(16);
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Largest range supported by {@link randomInt} (keeps modulo maths within safe-integer precision). */
const RANDOM_INT_MAX_RANGE = 0x1000000000000; // 2 ** 48

/**
 * Return a uniformly-distributed, unbiased secure random integer.
 * - `randomInt(max)` yields an integer in `[0, max)`.
 * - `randomInt(min, max)` yields an integer in `[min, max)`.
 * Uses rejection sampling to avoid modulo bias. Range must be ≤ 2**48.
 */
export function randomInt(max: number): number;
export function randomInt(min: number, max: number): number;
export function randomInt(a: number, b?: number): number {
  const min = b === undefined ? 0 : a;
  const max = b === undefined ? a : b;
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
    throw new Error("randomInt bounds must be safe integers");
  }
  const range = max - min;
  if (range <= 0) throw new Error("randomInt max must be greater than min");
  if (range > RANDOM_INT_MAX_RANGE) throw new Error("randomInt range must be <= 2**48");
  const bytesNeeded = Math.max(1, Math.ceil(Math.log2(range) / 8));
  const ceiling = Math.pow(256, bytesNeeded);
  const maxValid = Math.floor(ceiling / range) * range; // reject values >= this to avoid bias
  for (;;) {
    const buf = randomBytes(bytesNeeded);
    let val = 0;
    for (const byte of buf) val = val * 256 + byte;
    if (val < maxValid) return min + (val % range);
  }
}

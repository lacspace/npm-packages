/**
 * Recovery-code factor — a self-contained (no `@lacspace/otp` dependency)
 * recovery/backup code factor with the generate → verify → consume lifecycle the
 * package models factors around. Codes are single-use one-time secrets: show the
 * plaintext ONCE at generation, persist only the salted SHA-256 hashes, and
 * remove a hash when its code is consumed. Recovery codes act as a `possession`
 * factor. Zero deps · isomorphic (Web Crypto).
 */

import type { FactorType } from "./index";

/** Recovery codes stand in as a possession factor. */
export const recoveryCodeFactorType: FactorType = "possession";

/** Output of {@link generateRecoveryCodes}. */
export interface RecoveryCodeSet {
  /** Plaintext codes — display ONCE, then discard. */
  codes: string[];
  /** Salted hashes to persist (never store the plaintext). */
  hashes: string[];
}

export interface GenerateRecoveryCodesOptions {
  /** How many codes to mint. Default 10. */
  count?: number;
  /** Characters per code (excluding group separators). Default 10. */
  length?: number;
  /** Group size for readability, e.g. 5 ⇒ "abcde-fghij". 0 disables grouping. Default 5. */
  groupSize?: number;
  /** Alphabet to draw from. Default Crockford-ish base32 without ambiguous chars. */
  alphabet?: string;
  /** Injectable RNG returning `n` random bytes. Defaults to Web Crypto. */
  random?: (n: number) => Uint8Array;
}

/** Result of {@link consumeRecoveryCode}. */
export interface ConsumeRecoveryResult {
  /** True when the code matched and was consumed. */
  consumed: boolean;
  /** Index of the matched hash (or -1). */
  index: number;
  /** Remaining hashes to persist (matched one removed). */
  remaining: string[];
}

const DEFAULT_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i

function defaultRandom(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Normalize a code for hashing: lowercase, strip separators/whitespace. */
function normalizeCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Constant-time-ish comparison of two hex strings. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function digestHex(data: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return toHex(new Uint8Array(d));
}

/** Hash a code with a given salt (hex). Returns the stored form `saltHex$digestHex`. */
async function hashWithSalt(code: string, saltHex: string): Promise<string> {
  const salt = fromHex(saltHex);
  const codeBytes = new TextEncoder().encode(normalizeCode(code));
  const combined = new Uint8Array(salt.length + codeBytes.length);
  combined.set(salt);
  combined.set(codeBytes, salt.length);
  return `${saltHex}$${await digestHex(combined)}`;
}

/**
 * Generate a fresh set of recovery codes. Returns the plaintext `codes` (show
 * once) and the salted `hashes` to persist.
 */
export async function generateRecoveryCodes(
  opts: GenerateRecoveryCodesOptions = {},
): Promise<RecoveryCodeSet> {
  const count = opts.count ?? 10;
  const length = opts.length ?? 10;
  const groupSize = opts.groupSize ?? 5;
  const alphabet = opts.alphabet ?? DEFAULT_ALPHABET;
  const random = opts.random ?? defaultRandom;

  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = random(length);
    let raw = "";
    for (let j = 0; j < length; j++) raw += alphabet[bytes[j]! % alphabet.length] ?? "";
    const code =
      groupSize > 0 ? (raw.match(new RegExp(`.{1,${groupSize}}`, "g")) ?? [raw]).join("-") : raw;
    const saltHex = toHex(random(8));
    codes.push(code);
    hashes.push(await hashWithSalt(code, saltHex));
  }
  return { codes, hashes };
}

/**
 * Verify a recovery code against stored hashes. Returns the matched index (mark
 * or remove it — codes are single-use) or -1 if none match.
 */
export async function verifyRecoveryCode(code: string, hashes: string[]): Promise<number> {
  for (let i = 0; i < hashes.length; i++) {
    const h = hashes[i]!;
    const sep = h.indexOf("$");
    if (sep < 0) continue;
    const saltHex = h.slice(0, sep);
    const candidate = await hashWithSalt(code, saltHex);
    if (timingSafeEqual(candidate, h)) return i;
  }
  return -1;
}

/**
 * Verify AND consume a recovery code in one step. Returns whether it matched, the
 * matched index, and the `remaining` hashes (matched one removed) to persist.
 */
export async function consumeRecoveryCode(
  code: string,
  hashes: string[],
): Promise<ConsumeRecoveryResult> {
  const index = await verifyRecoveryCode(code, hashes);
  if (index < 0) return { consumed: false, index: -1, remaining: hashes };
  return { consumed: true, index, remaining: hashes.filter((_, i) => i !== index) };
}

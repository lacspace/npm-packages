import { getRandom } from "./random";
import { ALPHABETS } from "./alphabets";

/** Options for {@link customId}. */
export interface CustomIdOptions {
  /** The character set to draw from (2..256 unique characters). */
  alphabet: string;
  /** How many characters the id should have (positive integer). */
  size: number;
}

/**
 * Generate a random id over a custom alphabet with **unbiased** sampling.
 *
 * Each character is chosen with byte rejection sampling: bytes landing in the
 * final, short modulo bucket are discarded so every character of the alphabet
 * is equally likely (no modulo bias, unlike a naive `bytes[i] % n`).
 *
 * @example customId({ alphabet: ALPHABETS.base58, size: 10 })
 */
export function customId(options: CustomIdOptions): string {
  const { alphabet, size } = options;
  if (typeof alphabet !== "string" || alphabet.length < 2) {
    throw new Error("customId: `alphabet` must have at least 2 characters.");
  }
  if (alphabet.length > 256) {
    throw new Error("customId: `alphabet` must have at most 256 characters.");
  }
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error("customId: `size` must be a positive integer.");
  }
  const n = alphabet.length;
  // Largest multiple of n that fits in a byte; bytes >= threshold are rejected.
  const threshold = 256 - (256 % n);
  let out = "";
  const buf = new Uint8Array(size);
  while (out.length < size) {
    getRandom(buf);
    for (let i = 0; i < buf.length && out.length < size; i++) {
      const v = buf[i]!;
      if (v < threshold) out += alphabet[v % n];
    }
  }
  return out;
}

/** Short, URL-safe base62 id (0-9A-Za-z), default 12 chars. */
export function base62Id(size = 12): string {
  return customId({ alphabet: ALPHABETS.base62, size });
}

/** Bitcoin-style base58 id (no look-alike chars), default 12 chars. */
export function base58Id(size = 12): string {
  return customId({ alphabet: ALPHABETS.base58, size });
}

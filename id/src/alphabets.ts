/**
 * Common alphabets for building custom ids. Every alphabet here is safe to feed
 * to `customId` (2..256 chars, no duplicate characters). Crockford base32 and
 * base58 deliberately omit look-alike characters (I, L, O, U / 0, O, I, l).
 */
export const ALPHABETS = {
  /** 0-9 */
  numeric: "0123456789",
  /** 0-9a-z (base36) */
  base36: "0123456789abcdefghijklmnopqrstuvwxyz",
  /** 0-9a-f */
  hex: "0123456789abcdef",
  /** a-z */
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  /** Crockford base32 (no I, L, O, U) — used by ULID */
  base32Crockford: "0123456789ABCDEFGHJKMNPQRSTVWXYZ",
  /** Bitcoin base58 (no 0, O, I, l) */
  base58: "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
  /** 0-9A-Za-z (base62) */
  base62: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
} as const;

/** Name of a built-in alphabet in {@link ALPHABETS}. */
export type AlphabetName = keyof typeof ALPHABETS;

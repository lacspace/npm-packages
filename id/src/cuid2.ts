import { customId } from "./customid";
import { getRandom, unbiasedIndex } from "./random";
import { ALPHABETS } from "./alphabets";

/**
 * cuid2-style collision-resistant id: a leading letter (so it is always a valid
 * identifier / never all-digits) followed by a base36 body. Every character is
 * drawn from the Web Crypto CSPRNG with unbiased sampling, and a per-process
 * counter is folded into the tail so ids stay unique even if the RNG stalls.
 */

// Seed the counter with real entropy so it is not predictable across processes.
let counter = new DataView(getRandom(new Uint8Array(4)).buffer).getUint32(0);

/**
 * Generate a cuid2-style id. `length` is 4..32 (default 24). Lowercase, starts
 * with a letter, safe in URLs, filenames, CSS selectors and env var names.
 */
export function cuid2(length = 24): string {
  if (!Number.isInteger(length) || length < 4 || length > 32) {
    throw new Error("cuid2: `length` must be an integer in [4, 32].");
  }
  const first = ALPHABETS.lowercase[unbiasedIndex(26)]!;
  const count = (counter++ >>> 0).toString(36);
  const randLen = Math.max(1, length - 1 - count.length);
  const rand = customId({ alphabet: ALPHABETS.base36, size: randLen });
  return (first + rand + count).slice(0, length);
}

const CUID2_RE = /^[a-z][0-9a-z]{3,31}$/;

/** Is this a well-formed cuid2-style id (leading letter, 4..32 base36 chars)? */
export function isCuid2(s: string): boolean {
  return typeof s === "string" && CUID2_RE.test(s);
}

/**
 * Shared CSPRNG helpers for the multi-format id generators.
 *
 * Randomness always comes from Web Crypto's `getRandomValues` (isomorphic:
 * Node 20+, edge runtimes and browsers all expose it on `globalThis.crypto`).
 */

/** Fill `bytes` with cryptographically-strong randomness via Web Crypto. */
export function getRandom(bytes: Uint8Array): Uint8Array {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("Web Crypto getRandomValues is unavailable in this environment.");
  }
  c.getRandomValues(bytes);
  return bytes;
}

/**
 * Unbiased random integer in `[0, max)` using byte rejection sampling.
 * `max` must be in `[1, 256]`. Bytes that fall in the final, short modulo
 * bucket are rejected so every value is equally likely.
 */
export function unbiasedIndex(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 256) {
    throw new Error("unbiasedIndex: `max` must be an integer in [1, 256].");
  }
  const threshold = 256 - (256 % max);
  const buf = new Uint8Array(1);
  for (;;) {
    getRandom(buf);
    if (buf[0]! < threshold) return buf[0]! % max;
  }
}

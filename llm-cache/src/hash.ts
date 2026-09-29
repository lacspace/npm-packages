// A wide, dependency-free content hash. Two independent FNV-1a passes (64-bit
// each via BigInt, different offset bases) concatenated to 32 hex chars, so the
// collision space is ~2^128 — ample for a cache key without pulling in crypto.
const P = 1099511628211n;
const MASK = (1n << 64n) - 1n;

function fnv(input: string, basis: bigint): bigint {
  let h = basis;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * P) & MASK;
  }
  return h;
}

function hex16(n: bigint): string {
  return n.toString(16).padStart(16, "0");
}

/** Stable 128-bit hex digest of a string. Deterministic across runtimes. */
export function contentHash(input: string): string {
  return hex16(fnv(input, 14695981039346656037n)) + hex16(fnv(input, 1469598103934665603n));
}

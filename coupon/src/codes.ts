/**
 * Coupon-code helpers — normalise entered codes and generate random ones with
 * a CSPRNG (Web Crypto `crypto.getRandomValues`, available in Node 18+, edge
 * and browsers). Zero dependencies, isomorphic.
 */

/** Default character set: digits + uppercase, minus ambiguous 0/O/1/I. */
const DEFAULT_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Options for {@link generateCode} / {@link generateCodes}. */
export interface GenerateCodeOptions {
  /** Number of random characters (excluding any prefix). Default 8. */
  length?: number;
  /** Character set to draw from. Default excludes ambiguous 0/O/1/I. */
  charset?: string;
  /** Optional prefix prepended verbatim (e.g. `"SUMMER-"`). */
  prefix?: string;
}

/**
 * Normalise a coupon code for storage / comparison: trims surrounding
 * whitespace and upper-cases it. Returns `""` for nullish input.
 */
export function normalizeCode(code: string | null | undefined): string {
  if (code == null) return "";
  return String(code).trim().toUpperCase();
}

function randomValues(n: number): Uint32Array {
  const out = new Uint32Array(n);
  const c: Crypto | undefined =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as Crypto | undefined)
      : undefined;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error(
      "@lacspace/coupon: a Web Crypto getRandomValues implementation is required",
    );
  }
  c.getRandomValues(out);
  return out;
}

/**
 * Generate a single random coupon code using a CSPRNG. Uses rejection sampling
 * so the character distribution is unbiased.
 */
export function generateCode(options: GenerateCodeOptions = {}): string {
  const length = Math.max(1, Math.floor(options.length ?? 8));
  const charset = options.charset ?? DEFAULT_CHARSET;
  const prefix = options.prefix ?? "";
  if (charset.length === 0) {
    throw new Error("@lacspace/coupon: charset must not be empty");
  }
  const n = charset.length;
  // Largest multiple of n that fits in 2**32, for unbiased rejection sampling.
  const limit = Math.floor(0x100000000 / n) * n;

  let out = "";
  while (out.length < length) {
    const batch = randomValues(length - out.length);
    for (let i = 0; i < batch.length && out.length < length; i++) {
      const v = batch[i] ?? 0;
      if (v >= limit) continue; // reject to avoid modulo bias
      out += charset[v % n];
    }
  }
  return prefix + out;
}

/**
 * Generate `count` unique random coupon codes. Codes are de-duplicated (after
 * the prefix), so the returned array always has `count` distinct entries.
 */
export function generateCodes(
  count: number,
  options: GenerateCodeOptions = {},
): string[] {
  const target = Math.max(0, Math.floor(count));
  const seen = new Set<string>();
  const out: string[] = [];
  // Generous ceiling to avoid an infinite loop if the keyspace is tiny.
  let guard = target * 50 + 100;
  while (out.length < target && guard-- > 0) {
    const code = generateCode(options);
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  if (out.length < target) {
    throw new Error(
      "@lacspace/coupon: could not generate enough unique codes — increase length or charset",
    );
  }
  return out;
}

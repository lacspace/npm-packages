/**
 * Header normalisation & merging — turn any `HeadersInit` (a `Headers`
 * instance, an array of tuples, or a plain record) into a plain, lower-cased
 * record, and merge several sources with predictable case-insensitive
 * last-one-wins semantics. Pure functions.
 */

/** Normalise any `HeadersInit` into a plain record with lower-cased keys. */
export function normalizeHeaders(input?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  if (typeof Headers !== "undefined" && input instanceof Headers) {
    input.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
    return out;
  }
  if (Array.isArray(input)) {
    for (const pair of input) {
      if (!pair) continue;
      const [k, v] = pair;
      if (k === undefined) continue;
      out[String(k).toLowerCase()] = String(v ?? "");
    }
    return out;
  }
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue;
    out[k.toLowerCase()] = String(v);
  }
  return out;
}

/**
 * Merge several header sources into one lower-cased record. Later sources win
 * on a case-insensitive key match; `undefined` sources are skipped.
 */
export function mergeHeaders(...sources: Array<HeadersInit | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const src of sources) {
    const norm = normalizeHeaders(src);
    for (const [k, v] of Object.entries(norm)) out[k] = v;
  }
  return out;
}

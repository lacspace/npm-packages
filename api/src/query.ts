/**
 * Typed query-string building & parsing — a standalone, dependency-free helper
 * that mirrors how {@link LacspaceApi} encodes `params`, but with an explicit
 * `arrayFormat` and a matching parser. Pure functions; no network, no globals
 * beyond `URLSearchParams` (present in Node 18+, browsers and edge).
 */
import type { QueryParams } from "./index";

/** How array values are serialised into a query string. */
export type ArrayFormat = "repeat" | "comma" | "brackets";

export interface BuildQueryOptions {
  /** How to encode array values. Default `"repeat"` (`a=1&a=2`). */
  arrayFormat?: ArrayFormat;
  /** Prefix the result with `?` when non-empty. Default `false`. */
  leadingQuestionMark?: boolean;
}

/**
 * Build a query string from a params object.
 * - `undefined` / `null` values are dropped.
 * - `"repeat"` → `tags=a&tags=b`; `"comma"` → `tags=a,b`; `"brackets"` → `tags[]=a&tags[]=b`.
 */
export function buildQuery(params?: QueryParams, opts: BuildQueryOptions = {}): string {
  const { arrayFormat = "repeat", leadingQuestionMark = false } = opts;
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (arrayFormat === "comma") {
        sp.append(k, v.map(String).join(","));
      } else {
        const key = arrayFormat === "brackets" ? `${k}[]` : k;
        for (const item of v) sp.append(key, String(item));
      }
    } else {
      sp.append(k, String(v));
    }
  }
  const s = sp.toString();
  if (!s) return "";
  return leadingQuestionMark ? `?${s}` : s;
}

/**
 * Parse a query string back into an object. Repeated keys (and `key[]`) collapse
 * to arrays; a leading `?` is optional. The inverse of {@link buildQuery} for the
 * `"repeat"` and `"brackets"` formats.
 */
export function parseQuery(search?: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!search) return out;
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q) return out;
  const sp = new URLSearchParams(q);
  for (const rawKey of new Set(sp.keys())) {
    const key = rawKey.endsWith("[]") ? rawKey.slice(0, -2) : rawKey;
    const all = sp.getAll(rawKey);
    const existing = out[key];
    const values = existing === undefined ? all : ([] as string[]).concat(existing, all);
    out[key] = values.length > 1 || rawKey.endsWith("[]") ? values : (values[0] as string);
  }
  return out;
}

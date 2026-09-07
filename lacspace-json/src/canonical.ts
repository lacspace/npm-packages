/**
 * Stable key sorting + canonical JSON serialization — for reproducible diffs,
 * hashing and content addressing. Pure, zero-dependency, browser-safe.
 *
 * `sortKeys` returns a deep copy with every object's keys sorted; `canonicalize`
 * renders that as minimal-whitespace JSON so two structurally-equal documents
 * always produce byte-identical output regardless of original key order.
 *
 * ```ts
 * canonicalize({ b: 1, a: 2 });         // '{"a":2,"b":1}'
 * canonicalize({ a: 2, b: 1 });         // '{"a":2,"b":1}'  (same bytes)
 * sortKeys({ b: 1, a: { d: 1, c: 2 } }) // { a: { c: 2, d: 1 }, b: 1 }
 * ```
 */
import { sortKeysDeep } from "./util.js";
import type { JsonValue } from "./util.js";

/** Deep copy of `value` with all object keys recursively sorted. */
export function sortKeys(value: JsonValue): JsonValue {
  return sortKeysDeep(value) as JsonValue;
}

/**
 * Canonical JSON: object keys sorted deeply, no insignificant whitespace. Ideal
 * as the input to a hash for stable content addressing.
 */
export function canonicalize(value: JsonValue): string {
  return JSON.stringify(sortKeysDeep(value));
}

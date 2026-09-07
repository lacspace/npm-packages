/**
 * Deep-merge N JSON values with a configurable array strategy. Prototype-
 * pollution safe (never assigns `__proto__` / `constructor` / `prototype`).
 */
import { safeSet, isForbiddenKey, isPlainObject, deepClone } from "./util.js";
import type { JsonValue } from "./util.js";

export type ArrayStrategy =
  | { mode: "concat" }
  | { mode: "replace" }
  | { mode: "by-key"; key: string };

export interface MergeOptions {
  array?: ArrayStrategy;
}

function mergeArrays(a: JsonValue[], b: JsonValue[], strat: ArrayStrategy): JsonValue[] {
  if (strat.mode === "replace") return deepClone(b);
  if (strat.mode === "concat") return [...deepClone(a), ...deepClone(b)];
  // by-key: match objects by a key field, merge matches, append the rest
  const key = strat.key;
  const out: JsonValue[] = deepClone(a);
  const indexByKey = new Map<string, number>();
  out.forEach((item, i) => {
    if (isPlainObject(item) && item[key] !== undefined) indexByKey.set(JSON.stringify(item[key]), i);
  });
  for (const item of b) {
    if (isPlainObject(item) && item[key] !== undefined) {
      const id = JSON.stringify(item[key]);
      if (indexByKey.has(id)) {
        const idx = indexByKey.get(id)!;
        out[idx] = mergeTwo(out[idx]!, item, { array: strat });
      } else {
        indexByKey.set(id, out.length);
        out.push(deepClone(item));
      }
    } else {
      out.push(deepClone(item));
    }
  }
  return out;
}

function mergeTwo(a: JsonValue, b: JsonValue, opts: MergeOptions): JsonValue {
  const strat = opts.array ?? { mode: "replace" };
  if (Array.isArray(a) && Array.isArray(b)) return mergeArrays(a, b, strat);
  if (isPlainObject(a) && isPlainObject(b)) {
    const out: Record<string, JsonValue> = {};
    for (const k of Object.keys(a)) {
      if (isForbiddenKey(k)) continue;
      safeSet(out, k, deepClone(a[k]));
    }
    for (const k of Object.keys(b)) {
      if (isForbiddenKey(k)) continue;
      if (Object.prototype.hasOwnProperty.call(out, k)) {
        safeSet(out, k, mergeTwo(out[k]!, b[k]!, opts));
      } else {
        safeSet(out, k, deepClone(b[k]));
      }
    }
    return out;
  }
  // scalar / mismatched types: b wins
  return deepClone(b);
}

/** Deep-merge two or more JSON values left-to-right. */
export function merge(values: JsonValue[], opts: MergeOptions = {}): JsonValue {
  if (values.length === 0) return null;
  let acc: JsonValue = deepClone(values[0]!);
  for (let i = 1; i < values.length; i++) acc = mergeTwo(acc, values[i]!, opts);
  return acc;
}

/** Parse a CLI `--array` flag into a strategy. */
export function parseArrayStrategy(spec: string | undefined, byKey?: string): ArrayStrategy {
  if (byKey) return { mode: "by-key", key: byKey };
  if (spec === "concat") return { mode: "concat" };
  if (spec === "replace") return { mode: "replace" };
  if (spec && spec.startsWith("by-key")) {
    const key = spec.split(/[:=]/)[1];
    if (key) return { mode: "by-key", key };
  }
  return { mode: "replace" };
}

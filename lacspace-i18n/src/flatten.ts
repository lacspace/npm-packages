/**
 * Flatten / unflatten helpers.
 *
 * A locale file can be a deeply nested object (`{ a: { b: "x" } }`) or a flat
 * map of dotted keys (`{ "a.b": "x" }`). Internally lacspace-i18n always works
 * with the flat, dotted form — {@link flatten} produces it and {@link unflatten}
 * rebuilds a nested object (turning consecutive integer keys back into arrays)
 * so files can be written out in their original nested shape.
 */

/** Any JSON value a locale file may hold. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A leaf translation value. */
export type Scalar = string | number | boolean | null;

/** A flat map of dotted key → leaf value. */
export type FlatMap = Record<string, Scalar>;

/**
 * Flatten a nested JSON value into a map of dotted keys. Arrays become numeric
 * segments (`items.0`, `items.1`). Empty objects and arrays contribute no keys.
 */
export function flatten(value: JsonValue, prefix = ""): FlatMap {
  const out: FlatMap = {};
  const walk = (node: JsonValue, path: string): void => {
    if (node === null || typeof node !== "object") {
      out[path] = node as Scalar;
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, path ? `${path}.${i}` : String(i)));
      return;
    }
    const keys = Object.keys(node);
    if (keys.length === 0) return;
    for (const k of keys) {
      const child = node[k];
      if (child !== undefined) walk(child, path ? `${path}.${k}` : k);
    }
  };
  walk(value, prefix);
  return out;
}

/**
 * Rebuild a nested object from a flat, dotted map. A container whose keys are
 * exactly `0..n-1` is emitted as an array, so `flatten`→`unflatten` round-trips
 * typical locale data. Later keys win if two paths collide.
 */
export function unflatten(flat: FlatMap): JsonValue {
  const root: Record<string, unknown> = {};
  for (const key of Object.keys(flat)) {
    const parts = key.split(".");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      const existing = node[p];
      if (existing === undefined || existing === null || typeof existing !== "object" || Array.isArray(existing)) {
        node[p] = {};
      }
      node = node[p] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]!] = flat[key]!;
  }
  return arrayify(root) as JsonValue;
}

function arrayify(node: unknown): unknown {
  if (node === null || typeof node !== "object") return node;
  const obj = node as Record<string, unknown>;
  const keys = Object.keys(obj);
  const allInt = keys.length > 0 && keys.every((k) => /^(0|[1-9]\d*)$/.test(k));
  if (allInt) {
    const idxs = keys.map(Number).sort((a, b) => a - b);
    if (idxs[0] === 0 && idxs[idxs.length - 1] === idxs.length - 1) {
      const arr: unknown[] = [];
      for (const i of idxs) arr[i] = arrayify(obj[String(i)]);
      return arr;
    }
  }
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = arrayify(obj[k]);
  return out;
}

/** Numeric-aware comparator for dotted keys (so `a.2` sorts before `a.10`). */
export function compareKeys(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const sa = pa[i]!;
    const sb = pb[i]!;
    const na = /^\d+$/.test(sa);
    const nb = /^\d+$/.test(sb);
    if (na && nb) {
      const d = Number(sa) - Number(sb);
      if (d !== 0) return d;
    } else if (sa !== sb) {
      return sa < sb ? -1 : 1;
    }
  }
  return pa.length - pb.length;
}

/** Return a new flat map with keys sorted by {@link compareKeys}. */
export function sortFlat(flat: FlatMap): FlatMap {
  const out: FlatMap = {};
  for (const k of Object.keys(flat).sort(compareKeys)) out[k] = flat[k]!;
  return out;
}

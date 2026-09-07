/**
 * flatten / unflatten — collapse a nested document into a flat map of path →
 * scalar, and rebuild the nesting from such a map. Pure, zero-dependency,
 * browser-safe. Prototype-pollution safe.
 *
 * Object keys join with a delimiter (default `.`); array items use bracket
 * indices. Keys that contain the delimiter or brackets are emitted in quoted
 * bracket form so the round-trip is lossless.
 *
 * ```ts
 * flatten({ a: { b: [1, 2] } });          // { "a.b[0]": 1, "a.b[1]": 2 }
 * unflatten({ "a.b[0]": 1, "a.b[1]": 2 }); // { a: { b: [1, 2] } }
 * ```
 *
 * Empty objects / arrays are preserved as leaf values so they survive the trip.
 */
import { isPlainObject, safeSet, isForbiddenKey, JsonToolError } from "./util.js";
import type { JsonValue, JsonObject } from "./util.js";

export interface FlattenOptions {
  /** Delimiter between object keys (default "."). */
  delimiter?: string;
}

function needsBracketQuote(key: string, delimiter: string): boolean {
  return key === "" || key.includes(delimiter) || key.includes("[") || key.includes("]") || key.includes('"');
}

function joinKey(prefix: string, key: string, delimiter: string): string {
  if (needsBracketQuote(key, delimiter)) {
    return prefix + '["' + key.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]';
  }
  return prefix === "" ? key : prefix + delimiter + key;
}

/** Collapse a nested value into a flat `{ path: scalar }` map. */
export function flatten(value: JsonValue, opts: FlattenOptions = {}): JsonObject {
  const delimiter = opts.delimiter ?? ".";
  const out: JsonObject = {};
  const walk = (v: JsonValue, prefix: string): void => {
    if (Array.isArray(v)) {
      if (v.length === 0) { safeSet(out, prefix, []); return; }
      v.forEach((item, i) => walk(item, `${prefix}[${i}]`));
    } else if (isPlainObject(v)) {
      const keys = Object.keys(v);
      if (keys.length === 0) { safeSet(out, prefix, {}); return; }
      for (const k of keys) walk(v[k]!, joinKey(prefix, k, delimiter));
    } else {
      safeSet(out, prefix, v);
    }
  };
  if (Array.isArray(value) || isPlainObject(value)) walk(value, "");
  else safeSet(out, "", value);
  // A single top-level scalar/empty flattens to the "" key; drop an empty root prefix
  // when the document was itself an object/array with a real first segment.
  return out;
}

/** Tokenize a flat key (`a.b[0]["x y"]`) into path segments. */
export function parseFlatKey(key: string, delimiter: string): Array<string | number> {
  const segs: Array<string | number> = [];
  let i = 0;
  const n = key.length;
  let cur = "";
  let started = false;
  const flush = (): void => { if (started) { segs.push(cur); cur = ""; started = false; } };
  while (i < n) {
    if (key.startsWith(delimiter, i) && delimiter !== "") {
      flush();
      i += delimiter.length;
      started = true; // a delimiter introduces a (possibly empty) next segment
      continue;
    }
    const ch = key[i]!;
    if (ch === "[") {
      flush();
      const inner = key.slice(i + 1);
      if (inner[0] === '"' || inner[0] === "'") {
        const quote = inner[0]!;
        let j = 1;
        let s = "";
        while (j < inner.length && inner[j] !== quote) {
          if (inner[j] === "\\" && j + 1 < inner.length) { s += inner[j + 1]; j += 2; }
          else { s += inner[j]; j++; }
        }
        if (inner[j + 1] !== "]") throw new JsonToolError(`Malformed bracket in flat key "${key}"`);
        segs.push(s);
        i += 1 + j + 2;
      } else {
        const close = inner.indexOf("]");
        if (close < 0) throw new JsonToolError(`Unbalanced [ in flat key "${key}"`);
        const raw = inner.slice(0, close).trim();
        segs.push(/^-?\d+$/.test(raw) ? Number(raw) : raw);
        i += 1 + close + 1;
      }
      continue;
    }
    cur += ch;
    started = true;
    i++;
  }
  flush();
  return segs;
}

/** Rebuild a nested value from a flat `{ path: scalar }` map. */
export function unflatten(map: JsonValue, opts: FlattenOptions = {}): JsonValue {
  const delimiter = opts.delimiter ?? ".";
  if (!isPlainObject(map)) throw new JsonToolError("unflatten expects a flat object of path → value");
  const keys = Object.keys(map);
  if (keys.length === 1 && keys[0] === "") return (map as JsonObject)[""]!;
  let root: JsonValue = undefined as unknown as JsonValue;
  for (const key of keys) {
    const segs = parseFlatKey(key, delimiter);
    const leaf = (map as JsonObject)[key]!;
    if (segs.length === 0) { root = leaf; continue; }
    if (root === undefined) root = typeof segs[0] === "number" ? [] : {};
    let cur: JsonValue = root;
    for (let s = 0; s < segs.length; s++) {
      const seg = segs[s]!;
      const last = s === segs.length - 1;
      const nextIsIndex = typeof segs[s + 1] === "number";
      if (typeof seg === "number") {
        const arr = cur as JsonValue[];
        if (last) { arr[seg] = leaf; }
        else {
          if (arr[seg] === undefined) arr[seg] = nextIsIndex ? [] : {};
          cur = arr[seg]!;
        }
      } else {
        if (isForbiddenKey(seg)) throw new JsonToolError(`Refusing to unflatten unsafe key "${seg}"`);
        const obj = cur as JsonObject;
        if (last) { safeSet(obj, seg, leaf); }
        else {
          if (obj[seg] === undefined) safeSet(obj, seg, nextIsIndex ? [] : {});
          cur = obj[seg]!;
        }
      }
    }
  }
  return root === undefined ? {} : root;
}

/**
 * Flatten / unflatten rows using dotted paths.
 *
 * ```ts
 * flatten({ address: { city: "Kathmandu" }, items: [{ sku: "A" }] });
 * // { "address.city": "Kathmandu", "items.0.sku": "A" }
 * unflatten({ "address.city": "Kathmandu", "items.0.sku": "A" });
 * // { address: { city: "Kathmandu" }, items: [{ sku: "A" }] }
 * ```
 *
 * Array indices are plain numeric segments (`items.0.sku`) so the keys are
 * valid spreadsheet headers. A key that itself contains the delimiter (or a
 * bracket / quote) is bracket-quoted (`["a.b"]`) so the trip is lossless.
 * Empty objects / arrays and non-plain objects (Dates, typed arrays) are kept
 * as leaf values.
 */
import { isPlainObject, safeSet, isForbiddenKey, ConvertError } from "./util";

export interface FlattenOptions {
  /** Delimiter between path segments (default "."). */
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

/** Collapse a nested row into a flat `{ "a.b.0.c": scalar }` map. */
export function flatten(row: Record<string, unknown>, opts: FlattenOptions = {}): Record<string, unknown> {
  const delimiter = opts.delimiter ?? ".";
  const out: Record<string, unknown> = {};
  const walk = (v: unknown, prefix: string): void => {
    if (Array.isArray(v)) {
      if (v.length === 0) { safeSet(out, prefix, []); return; }
      v.forEach((item, i) => walk(item, prefix === "" ? String(i) : prefix + delimiter + i));
    } else if (isPlainObject(v)) {
      const keys = Object.keys(v);
      if (keys.length === 0) { safeSet(out, prefix, {}); return; }
      for (const k of keys) walk(v[k], joinKey(prefix, k, delimiter));
    } else {
      safeSet(out, prefix, v);
    }
  };
  walk(row, "");
  return out;
}

/** Tokenize a flat key (`a.b.0["x y"]`) into path segments. */
export function parseFlatKey(key: string, delimiter = "."): Array<string | number> {
  const segs: Array<string | number> = [];
  let i = 0;
  const n = key.length;
  let cur = "";
  let started = false;
  const flush = (): void => {
    if (started) { segs.push(/^\d+$/.test(cur) ? Number(cur) : cur); cur = ""; started = false; }
  };
  while (i < n) {
    if (delimiter !== "" && key.startsWith(delimiter, i)) {
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
        if (inner[j + 1] !== "]") throw new ConvertError(`Malformed bracket in flat key "${key}"`);
        segs.push(s);
        i += 1 + j + 2;
      } else {
        const close = inner.indexOf("]");
        if (close < 0) throw new ConvertError(`Unbalanced [ in flat key "${key}"`);
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

/** Rebuild a nested row from a flat `{ "a.b.0.c": scalar }` map. */
export function unflatten(row: Record<string, unknown>, opts: FlattenOptions = {}): Record<string, unknown> {
  const delimiter = opts.delimiter ?? ".";
  if (!isPlainObject(row)) throw new ConvertError("unflatten expects a flat object of path → value");
  const root: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const segs = parseFlatKey(key, delimiter);
    const leaf = row[key];
    if (segs.length === 0) continue;
    let cur: unknown = root;
    for (let s = 0; s < segs.length; s++) {
      const seg = segs[s]!;
      const last = s === segs.length - 1;
      const nextIsIndex = typeof segs[s + 1] === "number";
      if (typeof seg === "number" && Array.isArray(cur)) {
        const arr = cur as unknown[];
        if (last) { arr[seg] = leaf; }
        else {
          if (arr[seg] === undefined) arr[seg] = nextIsIndex ? [] : {};
          cur = arr[seg];
        }
      } else {
        const k = String(seg);
        if (isForbiddenKey(k)) throw new ConvertError(`Refusing to unflatten unsafe key "${k}"`);
        const obj = cur as Record<string, unknown>;
        if (last) { safeSet(obj, k, leaf); }
        else {
          if (obj[k] === undefined) safeSet(obj, k, nextIsIndex ? [] : {});
          cur = obj[k];
        }
      }
    }
  }
  return root;
}

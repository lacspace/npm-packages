/**
 * Shared helpers: JSON value types, deep equality, safe object construction
 * (prototype-pollution guarded) and type classification.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Keys that must never be assigned from untrusted input. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** True if `key` is unsafe to set on a plain object built from external input. */
export function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEYS.has(key);
}

/**
 * Assign `key = value` on a plain object, silently ignoring prototype-pollution
 * keys. Always use this when building objects from parsed/user input.
 */
export function safeSet(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (isForbiddenKey(key)) return;
  Object.defineProperty(obj, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/** A fresh object with a null prototype-safe shape (still a normal literal). */
export function emptyObject(): Record<string, unknown> {
  return {};
}

/** True for a non-null, non-array object. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** jq-style type name for a JSON value. */
export function typeOf(v: unknown): "null" | "boolean" | "number" | "string" | "array" | "object" {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "boolean") return "boolean";
  if (t === "number") return "number";
  if (t === "string") return "string";
  return "object";
}

/** Structural deep equality for JSON values. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  const ta = typeof a;
  const tb = typeof b;
  if (ta !== tb) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (ta === "object") {
    const oa = a as Record<string, unknown>;
    const ob = b as Record<string, unknown>;
    const ka = Object.keys(oa);
    const kb = Object.keys(ob);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(ob, k)) return false;
      if (!deepEqual(oa[k], ob[k])) return false;
    }
    return true;
  }
  return false;
}

/** Deep clone of a JSON value (safe against prototype pollution). */
export function deepClone<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => deepClone(x)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>)) {
    safeSet(out, k, deepClone((v as Record<string, unknown>)[k]));
  }
  return out as unknown as T;
}

/**
 * A stable ordering for JSON values, used by `sort_by`, `unique`, `min`/`max`.
 * Ordering mirrors jq: null < false < true < numbers < strings < arrays < objects.
 */
export function compareValues(a: unknown, b: unknown): number {
  const rank = (v: unknown): number => {
    if (v === null || v === undefined) return 0;
    if (v === false) return 1;
    if (v === true) return 2;
    if (typeof v === "number") return 3;
    if (typeof v === "string") return 4;
    if (Array.isArray(v)) return 5;
    return 6;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 3) return (a as number) - (b as number);
  if (ra === 4) return (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0;
  if (ra === 5) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    const n = Math.min(aa.length, bb.length);
    for (let i = 0; i < n; i++) {
      const c = compareValues(aa[i], bb[i]);
      if (c !== 0) return c;
    }
    return aa.length - bb.length;
  }
  if (ra === 6) {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    const n = Math.min(ka.length, kb.length);
    for (let i = 0; i < n; i++) {
      if (ka[i] !== kb[i]) return ka[i]! < kb[i]! ? -1 : 1;
    }
    if (ka.length !== kb.length) return ka.length - kb.length;
    for (const k of ka) {
      const c = compareValues((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]);
      if (c !== 0) return c;
    }
    return 0;
  }
  return 0;
}

/** Recursively sort object keys (used by `--sort-keys`). */
export function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) safeSet(out, k, sortKeysDeep(v[k]));
    return out;
  }
  return v;
}

/** A rendering-safe error carrying an optional path for CLI display. */
export class JsonToolError extends Error {
  path?: string;
  constructor(message: string, path?: string) {
    super(message);
    this.name = "JsonToolError";
    if (path !== undefined) this.path = path;
  }
}

/**
 * Internal, dependency-free helpers. Not part of the public API.
 */
import type { JsonSchema } from "./types";

/** Clamp a number to `[0, 1]`. */
export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Deep structural equality for JSON-ish values (objects, arrays, primitives). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
      if (!deepEqual(ao[k], bo[k])) return false;
    }
    return true;
  }
  return false;
}

/**
 * Levenshtein edit distance between two strings (iterative, two-row DP).
 * O(n·m) time, O(min(n,m)) space.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Ensure `a` is the shorter string to keep the row small.
  if (a.length > b.length) {
    const t = a;
    a = b;
    b = t;
  }
  let prev = new Array<number>(a.length + 1);
  let curr = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;
  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    const bc = b.charCodeAt(j - 1);
    for (let i = 1; i <= a.length; i++) {
      const cost = a.charCodeAt(i - 1) === bc ? 0 : 1;
      const del = prev[i]! + 1;
      const ins = curr[i - 1]! + 1;
      const sub = prev[i - 1]! + cost;
      curr[i] = Math.min(del, ins, sub);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[a.length]!;
}

/** Lower-cased word tokens (letters/digits runs). Used for token-overlap cosine. */
export function tokenize(s: string): string[] {
  const m = s.toLowerCase().match(/[a-z0-9]+/gi);
  return m ? m : [];
}

/** Term-frequency map for a token list. */
function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/**
 * Cosine similarity of two texts using bag-of-words term-frequency vectors.
 * Returns a value in `[0, 1]` (non-negative because counts are non-negative).
 */
export function tokenOverlapCosine(a: string, b: string): number {
  const ta = termFreq(tokenize(a));
  const tb = termFreq(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let dot = 0;
  for (const [k, va] of ta) {
    const vb = tb.get(k);
    if (vb) dot += va * vb;
  }
  let na = 0;
  for (const v of ta.values()) na += v * v;
  let nb = 0;
  for (const v of tb.values()) nb += v * v;
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : clamp01(dot / denom);
}

/** Cosine similarity of two numeric vectors, mapped from `[-1, 1]` to `[0, 1]`. */
export function vectorCosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  // Map cosine [-1,1] -> [0,1] so the score stays monotonic and normalised.
  return clamp01((dot / denom + 1) / 2);
}

/**
 * Resolve a dot/bracket path (`"a.b.0.c"`, `"a[0].b"`, `"$.a.b"`) against a
 * value. Returns `{ found, value }`.
 */
export function getPath(root: unknown, path: string): { found: boolean; value: unknown } {
  const segments = parsePath(path);
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return { found: false, value: undefined };
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return { found: false, value: undefined };
      cur = cur[idx];
    } else if (typeof cur === "object") {
      const obj = cur as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(obj, seg)) return { found: false, value: undefined };
      cur = obj[seg];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: cur };
}

/** Split a path string into segments, tolerating `$`, dots and `[n]`/`["k"]`. */
function parsePath(path: string): string[] {
  let p = path.trim();
  if (p.startsWith("$")) p = p.slice(1);
  const out: string[] = [];
  const re = /\[\s*(?:"([^"]*)"|'([^']*)'|(\d+))\s*\]|([^.[\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p)) !== null) {
    const seg = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (seg !== undefined && seg !== "") out.push(seg);
  }
  return out;
}

/** Try to parse JSON; returns `{ ok, value }` without throwing. */
export function tryParseJson(s: string): { ok: boolean; value: unknown } {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false, value: undefined };
  }
}

/**
 * Validate a value against a {@link JsonSchema} subset. Returns a list of error
 * strings (empty = valid). `path` is used to build readable messages.
 */
export function validateSchema(value: unknown, schema: JsonSchema, path = "$"): string[] {
  const errors: string[] = [];
  const t = schema.type;
  if (t) {
    if (!typeMatches(value, t)) {
      errors.push(`${path}: expected ${t}, got ${jsonType(value)}`);
      return errors; // further checks are meaningless once the type is wrong
    }
  }
  if (schema.enum && !schema.enum.some((e) => deepEqual(e, value))) {
    errors.push(`${path}: value not in enum`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value))
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${path}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push(`${path}: above maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push(`${path}: fewer than minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push(`${path}: more than maxItems ${schema.maxItems}`);
    if (schema.items) {
      value.forEach((item, i) => {
        errors.push(...validateSchema(item, schema.items!, `${path}[${i}]`));
      });
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const req of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(obj, req))
        errors.push(`${path}: missing required property "${req}"`);
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(obj, key))
          errors.push(...validateSchema(obj[key], sub, `${path}.${key}`));
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(obj))
        if (!allowed.has(key)) errors.push(`${path}: unexpected property "${key}"`);
    }
  }
  return errors;
}

function typeMatches(value: unknown, t: NonNullable<JsonSchema["type"]>): boolean {
  switch (t) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    default:
      return false;
  }
}

function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

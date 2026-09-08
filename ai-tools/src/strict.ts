/**
 * `validateStrict` — an opt-in, dependency-free validator that honours the
 * richer JSON-Schema keywords the built-in {@link validateAgainstSchema}
 * intentionally ignores.
 *
 * It still coerces numeric / boolean strings (so a model that returns
 * `"5"` for an integer keeps working) but additionally enforces:
 *  - strings:  `minLength`, `maxLength`, `pattern`, `format`
 *              (`email` / `url` / `uri` / `uuid` / `date` / `date-time`)
 *  - numbers:  `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`,
 *              `multipleOf`
 *  - arrays:   `minItems`, `maxItems`, `uniqueItems`
 *  - objects:  unknown-property rejection when `additionalProperties: false`
 *  - anywhere: `const`, `enum`, and `anyOf` / `oneOf` combinators, plus `null`
 *              via a `type` array.
 *
 * Turn it on per-tool with `defineTool({ ..., strict: true })`, or call it
 * directly. It reuses {@link ToolArgumentError} so callers catch one error type.
 */
import { ToolArgumentError } from "./validate";
import type { JSONSchema } from "./jsonSchema";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkFormat(format: string, value: string): boolean {
  switch (format) {
    case "email":
      return EMAIL.test(value);
    case "uuid":
      return UUID.test(value);
    case "date":
      return DATE.test(value) && !Number.isNaN(Date.parse(value));
    case "date-time":
      return !Number.isNaN(Date.parse(value));
    case "uri":
    case "url":
      try {
        // eslint-disable-next-line no-new
        new URL(value);
        return true;
      } catch {
        return false;
      }
    default:
      return true; // unknown formats are advisory only
  }
}

function label(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || !a || !b || typeof a !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => k in bo && deepEqual(ao[k], bo[k]));
}

function typeList(schema: JSONSchema): string[] {
  const t = schema.type;
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
}

function num(x: unknown): number | undefined {
  return typeof x === "number" ? x : undefined;
}

function check(value: unknown, schema: JSONSchema, path: string, issues: string[]): unknown {
  if (!schema || typeof schema !== "object") return value;
  const lbl = path || "value";

  // Combinators first.
  if (Array.isArray(schema.anyOf)) {
    for (const sub of schema.anyOf as JSONSchema[]) {
      const local: string[] = [];
      const out = check(value, sub, path, local);
      if (local.length === 0) return out;
    }
    issues.push(`${lbl} did not match any allowed schema`);
    return value;
  }
  if (Array.isArray(schema.oneOf)) {
    let matches = 0;
    let out: unknown = value;
    for (const sub of schema.oneOf as JSONSchema[]) {
      const local: string[] = [];
      const r = check(value, sub, path, local);
      if (local.length === 0) {
        matches += 1;
        out = r;
      }
    }
    if (matches !== 1) {
      issues.push(`${lbl} must match exactly one allowed schema (matched ${matches})`);
    }
    return out;
  }

  // `const` — exact value.
  if ("const" in schema) {
    const c = (schema as Record<string, unknown>).const;
    if (!deepEqual(value, c)) issues.push(`${lbl} must equal ${JSON.stringify(c)}`);
    return value;
  }

  // enum membership takes precedence over type.
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((e) => deepEqual(e, value))) {
      const allowed = schema.enum.map((v) => JSON.stringify(v)).join(", ");
      issues.push(`${lbl} must be one of ${allowed}`);
    }
    return value;
  }

  const types = typeList(schema);
  if (value === null && types.includes("null")) return null;

  let primary = types.find((t) => t !== "null");
  if (!primary) primary = schema.properties ? "object" : schema.items ? "array" : types[0];

  switch (primary) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        issues.push(`${lbl} must be an object`);
        return value;
      }
      const obj = value as Record<string, unknown>;
      const props = (schema.properties ?? {}) as Record<string, JSONSchema>;
      const required = Array.isArray(schema.required) ? schema.required : [];
      for (const key of required) {
        if (!(key in obj) || obj[key] === undefined) issues.push(`${label(path, key)} is required`);
      }
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        if (UNSAFE_KEYS.has(key)) continue;
        const sub = props[key];
        if (sub) {
          out[key] = check(val, sub, label(path, key), issues);
        } else {
          if (schema.additionalProperties === false) {
            issues.push(`${label(path, key)} is not an allowed property`);
          }
          out[key] = val;
        }
      }
      return out;
    }
    case "array": {
      if (!Array.isArray(value)) {
        issues.push(`${lbl} must be an array`);
        return value;
      }
      const itemsSchema = Array.isArray(schema.items) ? undefined : schema.items;
      const arr = itemsSchema
        ? value.map((v, i) => check(v, itemsSchema as JSONSchema, `${path}[${i}]`, issues))
        : value;
      const minItems = num(schema.minItems);
      const maxItems = num(schema.maxItems);
      if (minItems !== undefined && arr.length < minItems) {
        issues.push(`${lbl} must have at least ${minItems} items`);
      }
      if (maxItems !== undefined && arr.length > maxItems) {
        issues.push(`${lbl} must have at most ${maxItems} items`);
      }
      if (schema.uniqueItems === true) {
        outer: for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            if (deepEqual(arr[i], arr[j])) {
              issues.push(`${lbl} must have unique items`);
              break outer;
            }
          }
        }
      }
      return arr;
    }
    case "number":
    case "integer": {
      let v: unknown = value;
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) v = Number(v);
      if (typeof v !== "number" || Number.isNaN(v)) {
        issues.push(`${lbl} must be a number`);
        return value;
      }
      if (primary === "integer" && !Number.isInteger(v)) issues.push(`${lbl} must be an integer`);
      const min = num(schema.minimum);
      const max = num(schema.maximum);
      const exMin = num(schema.exclusiveMinimum);
      const exMax = num(schema.exclusiveMaximum);
      const mult = num(schema.multipleOf);
      if (min !== undefined && v < min) issues.push(`${lbl} must be >= ${min}`);
      if (max !== undefined && v > max) issues.push(`${lbl} must be <= ${max}`);
      if (exMin !== undefined && v <= exMin) issues.push(`${lbl} must be > ${exMin}`);
      if (exMax !== undefined && v >= exMax) issues.push(`${lbl} must be < ${exMax}`);
      if (mult !== undefined && mult > 0) {
        const q = v / mult;
        if (Math.abs(q - Math.round(q)) > 1e-9) issues.push(`${lbl} must be a multiple of ${mult}`);
      }
      return v;
    }
    case "boolean": {
      let v: unknown = value;
      if (v === "true") v = true;
      else if (v === "false") v = false;
      if (typeof v !== "boolean") {
        issues.push(`${lbl} must be a boolean`);
        return value;
      }
      return v;
    }
    case "string": {
      if (typeof value !== "string") {
        issues.push(`${lbl} must be a string`);
        return value;
      }
      const s = value;
      const minLen = num(schema.minLength);
      const maxLen = num(schema.maxLength);
      if (minLen !== undefined && s.length < minLen) {
        issues.push(`${lbl} must be at least ${minLen} characters`);
      }
      if (maxLen !== undefined && s.length > maxLen) {
        issues.push(`${lbl} must be at most ${maxLen} characters`);
      }
      if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(s)) {
        issues.push(`${lbl} must match /${schema.pattern}/`);
      }
      if (typeof schema.format === "string" && !checkFormat(schema.format, s)) {
        issues.push(`${lbl} must be a valid ${schema.format}`);
      }
      return s;
    }
    case "null": {
      if (value !== null) issues.push(`${lbl} must be null`);
      return value;
    }
    default:
      return value;
  }
}

/**
 * Validate & coerce `value` against a plain JSON Schema, enforcing the richer
 * keywords (see the module docs). Returns the (possibly coerced) value, or
 * throws {@link ToolArgumentError}.
 */
export function validateStrict(value: unknown, schema: JSONSchema): unknown {
  const issues: string[] = [];
  const out = check(value, schema, "", issues);
  if (issues.length) {
    throw new ToolArgumentError(`Invalid tool arguments: ${issues.join("; ")}`, issues);
  }
  return out;
}

/**
 * Minimal runtime validation for a *plain* JSON Schema.
 *
 * This is deliberately small — it checks the things an LLM commonly gets wrong
 * (missing required keys, wrong primitive types, bad enum members) and coerces
 * numeric / boolean strings when the schema asks for a number or boolean. For
 * anything richer, pass a real validator (`@lacspace/validate`, Zod, …) whose
 * `.parse()` we delegate to instead.
 */
import type { JSONSchema } from "./jsonSchema";

/** Thrown when raw tool arguments don't satisfy the schema. */
export class ToolArgumentError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "ToolArgumentError";
    this.issues = issues;
  }
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function label(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function coerce(value: unknown, schema: JSONSchema, path: string, issues: string[]): unknown {
  if (!schema || typeof schema !== "object") return value;

  // enum membership takes precedence over type.
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((e) => e === value)) {
      const allowed = schema.enum.map((v) => JSON.stringify(v)).join(", ");
      issues.push(`${path || "value"} must be one of ${allowed}`);
    }
    return value;
  }

  const types = schema.type
    ? Array.isArray(schema.type)
      ? schema.type
      : [schema.type]
    : [];
  const primary = types[0];

  switch (primary) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        issues.push(`${path || "value"} must be an object`);
        return value;
      }
      const obj = value as Record<string, unknown>;
      const props = schema.properties ?? {};
      const required = schema.required ?? [];
      for (const key of required) {
        if (!(key in obj) || obj[key] === undefined) {
          issues.push(`${label(path, key)} is required`);
        }
      }
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        if (UNSAFE_KEYS.has(key)) continue;
        const sub = props[key];
        out[key] = sub ? coerce(val, sub, label(path, key), issues) : val;
      }
      return out;
    }
    case "array": {
      if (!Array.isArray(value)) {
        issues.push(`${path || "value"} must be an array`);
        return value;
      }
      const items = Array.isArray(schema.items) ? undefined : schema.items;
      return items
        ? value.map((v, i) => coerce(v, items, `${path}[${i}]`, issues))
        : value;
    }
    case "number":
    case "integer": {
      let v: unknown = value;
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
        v = Number(v);
      }
      if (typeof v !== "number" || Number.isNaN(v)) {
        issues.push(`${path || "value"} must be a number`);
        return value;
      }
      if (primary === "integer" && !Number.isInteger(v)) {
        issues.push(`${path || "value"} must be an integer`);
      }
      return v;
    }
    case "boolean": {
      let v: unknown = value;
      if (v === "true") v = true;
      else if (v === "false") v = false;
      if (typeof v !== "boolean") {
        issues.push(`${path || "value"} must be a boolean`);
        return value;
      }
      return v;
    }
    case "string": {
      if (typeof value !== "string") {
        issues.push(`${path || "value"} must be a string`);
        return value;
      }
      return value;
    }
    case "null": {
      if (value !== null) issues.push(`${path || "value"} must be null`);
      return value;
    }
    default:
      // "any" / unspecified — accept as-is.
      return value;
  }
}

/**
 * Validate & coerce `value` against a plain JSON Schema.
 * Returns the (possibly coerced) value, or throws {@link ToolArgumentError}.
 */
export function validateAgainstSchema(value: unknown, schema: JSONSchema): unknown {
  const issues: string[] = [];
  const out = coerce(value, schema, "", issues);
  if (issues.length) {
    throw new ToolArgumentError(`Invalid tool arguments: ${issues.join("; ")}`, issues);
  }
  return out;
}

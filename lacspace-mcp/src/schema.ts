/**
 * The subset of JSON Schema that MCP tool input schemas use, as a validator.
 * Returns human-readable problems (empty array = valid). Keywords supported:
 * type, properties, required, additionalProperties, enum, const, minimum,
 * maximum, minLength, maxLength, minItems, maxItems, items, pattern, anyOf.
 */

export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  default?: unknown;
  examples?: unknown[];
  [key: string]: unknown;
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function matchesType(v: unknown, t: string): boolean {
  const actual = typeOf(v);
  if (t === "number") return actual === "number" || actual === "integer";
  return actual === t;
}

export function validate(schema: JsonSchema, value: unknown, path = "arguments"): string[] {
  const errors: string[] = [];
  if (schema.anyOf) {
    const fits = schema.anyOf.some((s) => validate(s, value, path).length === 0);
    if (!fits) errors.push(`${path} matches none of the allowed forms`);
    return errors;
  }
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(`${path} must be ${JSON.stringify(schema.const)}`);
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path} must be ${types.join(" or ")}, got ${typeOf(value)}`);
      return errors;
    }
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push(`${path} must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} must be at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} must be at most ${schema.maxLength} characters`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) errors.push(`${path} must match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} must have at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} must have at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, i) => errors.push(...validate(schema.items!, item, `${path}[${i}]`)));
  }
  if (typeOf(value) === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj) || obj[key] === undefined) errors.push(`${path}.${key} is required`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in obj && obj[key] !== undefined) errors.push(...validate(sub, obj[key], `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in (schema.properties ?? {}))) errors.push(`${path}.${key} is not a known option`);
      }
    } else if (typeof schema.additionalProperties === "object") {
      for (const [key, v] of Object.entries(obj)) {
        if (!(key in (schema.properties ?? {}))) errors.push(...validate(schema.additionalProperties, v, `${path}.${key}`));
      }
    }
  }
  return errors;
}

/** Fill in `default`s for absent top-level properties (one level, which is what tools need). */
export function applyDefaults<T extends Record<string, unknown>>(schema: JsonSchema, value: T): T {
  const out: Record<string, unknown> = { ...value };
  for (const [key, sub] of Object.entries(schema.properties ?? {})) {
    if (out[key] === undefined && sub.default !== undefined) out[key] = sub.default;
  }
  return out as T;
}

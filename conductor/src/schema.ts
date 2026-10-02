/** A deliberately small JSON-Schema checker (type, enum, required, properties, items, min/max) — enough for describe() inputs, zero deps. */
export interface Schema {
  type?: string | string[];
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  description?: string;
  [k: string]: unknown;
}

export interface SchemaError {
  path: string;
  message: string;
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function typeOk(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  if (expected === "number" && actual === "integer") return true;
  return false;
}

/** Validate `value` against `schema`; returns a flat list of errors (empty = valid). */
export function validate(value: unknown, schema: Schema | undefined, path = "$"): SchemaError[] {
  if (!schema) return [];
  const errors: SchemaError[] = [];
  const actual = typeOf(value);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(t, actual))) errors.push({ path, message: `expected ${types.join("|")}, got ${actual}` });
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) errors.push({ path, message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}` });
  if (actual === "object" && schema.properties) {
    const obj = value as Record<string, unknown>;
    for (const r of schema.required ?? []) if (!(r in obj) || obj[r] === undefined) errors.push({ path: `${path}.${r}`, message: "required" });
    for (const [k, sub] of Object.entries(schema.properties)) if (k in obj && obj[k] !== undefined) errors.push(...validate(obj[k], sub, `${path}.${k}`));
  } else if (actual === "object" && schema.required) {
    const obj = value as Record<string, unknown>;
    for (const r of schema.required) if (!(r in obj)) errors.push({ path: `${path}.${r}`, message: "required" });
  }
  if (actual === "array" && schema.items) (value as unknown[]).forEach((v, i) => errors.push(...validate(v, schema.items, `${path}[${i}]`)));
  if ((actual === "number" || actual === "integer") && typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path, message: `must be ≥ ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path, message: `must be ≤ ${schema.maximum}` });
  }
  if (actual === "string" && typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push({ path, message: `must be at least ${schema.minLength} chars` });
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push({ path, message: `must be at most ${schema.maxLength} chars` });
  }
  return errors;
}

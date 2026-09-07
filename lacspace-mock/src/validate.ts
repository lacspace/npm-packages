/**
 * A tiny, dependency-free validator for a pragmatic subset of JSON Schema —
 * enough to guard mock request bodies, query params and path params and reply
 * with a helpful `400`. It intentionally supports only the common keywords
 * (`type`, `required`, `properties`, `items`, `enum`, numeric/length bounds and
 * `pattern`); anything it does not understand is simply not enforced.
 */

/** The supported JSON-Schema-ish node. All fields are optional. */
export interface Schema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  /** Required property names (only meaningful for `type: "object"`). */
  required?: string[];
  /** Per-property sub-schemas. */
  properties?: Record<string, Schema>;
  /** Reject unknown properties when `false` (default: allowed). */
  additionalProperties?: boolean;
  /** Sub-schema for every array element. */
  items?: Schema;
  /** Allowed exact values. */
  enum?: unknown[];
  /** Inclusive numeric bounds. */
  minimum?: number;
  maximum?: number;
  /** String length bounds. */
  minLength?: number;
  maxLength?: number;
  /** Array length bounds. */
  minItems?: number;
  maxItems?: number;
  /** RegExp source a string must match. */
  pattern?: string;
  /** Allow `null` in addition to `type` (OpenAPI style). */
  nullable?: boolean;
}

/** One validation failure: a dotted `path` into the value + a message. */
export interface ValidationError {
  path: string;
  message: string;
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function typeMatches(expected: NonNullable<Schema["type"]>, v: unknown): boolean {
  if (expected === "integer") return typeof v === "number" && Number.isInteger(v);
  if (expected === "number") return typeof v === "number" && !Number.isNaN(v);
  return typeOf(v) === expected;
}

/**
 * Validate `value` against `schema`, collecting every failure. An empty array
 * means the value is valid. `path` seeds the dotted location in messages.
 */
export function validate(value: unknown, schema: Schema, path = ""): ValidationError[] {
  const errors: ValidationError[] = [];
  const at = (p: string): string => p || "(root)";

  if (value === null && schema.nullable) return errors;

  if (schema.type && !typeMatches(schema.type, value)) {
    errors.push({ path: at(path), message: `expected ${schema.type}, got ${typeOf(value)}` });
    return errors; // type is wrong → deeper checks would just be noise
  }

  if (schema.enum && !schema.enum.some((e) => deepEqual(e, value))) {
    errors.push({ path: at(path), message: `must be one of ${JSON.stringify(schema.enum)}` });
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path: at(path), message: `must be >= ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path: at(path), message: `must be <= ${schema.maximum}` });
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path: at(path), message: `must be at least ${schema.minLength} chars` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ path: at(path), message: `must be at most ${schema.maxLength} chars` });
    }
    if (schema.pattern) {
      let re: RegExp | undefined;
      try {
        re = new RegExp(schema.pattern);
      } catch {
        re = undefined;
      }
      if (re && !re.test(value)) {
        errors.push({ path: at(path), message: `must match /${schema.pattern}/` });
      }
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path: at(path), message: `must have at least ${schema.minItems} items` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path: at(path), message: `must have at most ${schema.maxItems} items` });
    }
    if (schema.items) {
      value.forEach((item, i) => {
        errors.push(...validate(item, schema.items!, `${path}[${i}]`));
      });
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        errors.push({ path: path ? `${path}.${key}` : key, message: "is required" });
      }
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          errors.push(...validate(obj[key], sub, path ? `${path}.${key}` : key));
        }
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(obj)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
          errors.push({ path: path ? `${path}.${key}` : key, message: "is not an allowed property" });
        }
      }
    }
  }

  return errors;
}

/** True if the value satisfies the schema with no errors. */
export function isValid(value: unknown, schema: Schema): boolean {
  return validate(value, schema).length === 0;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

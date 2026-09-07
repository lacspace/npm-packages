/**
 * Validate a JSON value against the draft-07 subset this tool emits: `type`,
 * `required`, `properties`, `additionalProperties`, `items` (single + tuple),
 * `enum`, `const`, string `format`, `pattern`, `minLength`/`maxLength`,
 * `minimum`/`maximum`, `minItems`/`maxItems`, `anyOf`/`oneOf`/`allOf`, local
 * `$ref`, and nullability (both `type: [..,"null"]` and OpenAPI `nullable`).
 *
 * Pure and dependency-free (no `node:` imports) so it runs in the browser
 * `/try` playground.
 */
import type { JsonValue, JSONSchema, JsonSchemaType } from "./types.js";
import { isPlainObject } from "./util.js";
import { resolveRef } from "./refs.js";
import { matchesFormat } from "./formats.js";

/** A single validation failure. */
export interface ValidationError {
  /** JSON-pointer-ish path to the offending value (`""` = root). */
  path: string;
  /** The schema keyword that failed (`type`, `required`, `enum`, …). */
  keyword: string;
  /** Human-readable explanation. */
  message: string;
}

/** The result of {@link validate}. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** Options for {@link validate}. */
export interface ValidateOptions {
  /**
   * Root schema used to resolve local `$ref`s (defaults to the schema passed
   * to {@link validate}). Set this when validating against a sub-schema.
   */
  root?: JSONSchema;
}

function typeOf(v: JsonValue): JsonSchemaType {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  switch (typeof v) {
    case "boolean":
      return "boolean";
    case "number":
      return Number.isInteger(v) ? "integer" : "number";
    case "string":
      return "string";
    default:
      return "object";
  }
}

/** Does a concrete value's type satisfy a schema type name? */
function typeMatches(expected: JsonSchemaType, actual: JsonSchemaType): boolean {
  if (expected === actual) return true;
  // An integer value also satisfies `number`.
  if (expected === "number" && actual === "integer") return true;
  return false;
}

function jsonEqual(a: JsonValue, b: JsonValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function join(base: string, key: string | number): string {
  return `${base}/${key}`;
}

class Validator {
  constructor(private root: JSONSchema) {}

  validate(schema: JSONSchema, data: JsonValue, path: string, out: ValidationError[]): void {
    if (!schema || typeof schema !== "object") return;

    // $ref — validate against the target.
    if (typeof schema.$ref === "string") {
      const target = resolveRef(this.root, schema.$ref);
      if (!target) {
        out.push({ path, keyword: "$ref", message: `unresolved $ref "${schema.$ref}"` });
        return;
      }
      this.validate(target, data, path, out);
      return;
    }

    // Nullability: OpenAPI `nullable` or a `null` member of a type union.
    if (data === null) {
      const t = schema.type;
      const nullable =
        schema.nullable === true ||
        t === "null" ||
        (Array.isArray(t) && t.includes("null")) ||
        (Array.isArray(schema.enum) && schema.enum.some((v) => v === null));
      if (nullable) return;
    }

    // const / enum
    if (schema.const !== undefined && !jsonEqual(data, schema.const as JsonValue)) {
      out.push({ path, keyword: "const", message: `must equal ${JSON.stringify(schema.const)}` });
    }
    if (Array.isArray(schema.enum) && !schema.enum.some((v) => jsonEqual(v, data))) {
      out.push({
        path,
        keyword: "enum",
        message: `must be one of ${JSON.stringify(schema.enum)}`,
      });
    }

    // combinators
    if (Array.isArray(schema.allOf)) {
      for (const sub of schema.allOf) this.validate(sub, data, path, out);
    }
    if (Array.isArray(schema.anyOf)) {
      const ok = schema.anyOf.some((sub) => this.isValid(sub, data));
      if (!ok) out.push({ path, keyword: "anyOf", message: "does not match any of the allowed schemas" });
    }
    if (Array.isArray(schema.oneOf)) {
      const matches = schema.oneOf.filter((sub) => this.isValid(sub, data)).length;
      if (matches !== 1) {
        out.push({
          path,
          keyword: "oneOf",
          message: `must match exactly one schema (matched ${matches})`,
        });
      }
    }

    // type
    const actual = typeOf(data);
    const t = schema.type;
    if (t !== undefined) {
      const list = (Array.isArray(t) ? t : [t]) as JsonSchemaType[];
      if (!list.some((exp) => typeMatches(exp, actual))) {
        out.push({
          path,
          keyword: "type",
          message: `expected ${list.join(" | ")}, got ${actual}`,
        });
        return; // wrong type: further per-type checks are meaningless
      }
    }

    switch (actual) {
      case "string":
        this.checkString(schema, data as string, path, out);
        break;
      case "integer":
      case "number":
        this.checkNumber(schema, data as number, path, out);
        break;
      case "array":
        this.checkArray(schema, data as JsonValue[], path, out);
        break;
      case "object":
        this.checkObject(schema, data as Record<string, JsonValue>, path, out);
        break;
      default:
        break;
    }
  }

  private isValid(schema: JSONSchema, data: JsonValue): boolean {
    const errs: ValidationError[] = [];
    this.validate(schema, data, "", errs);
    return errs.length === 0;
  }

  private checkString(schema: JSONSchema, v: string, path: string, out: ValidationError[]): void {
    if (typeof schema.minLength === "number" && v.length < schema.minLength) {
      out.push({ path, keyword: "minLength", message: `shorter than minLength ${schema.minLength}` });
    }
    if (typeof schema.maxLength === "number" && v.length > schema.maxLength) {
      out.push({ path, keyword: "maxLength", message: `longer than maxLength ${schema.maxLength}` });
    }
    if (typeof schema.pattern === "string") {
      let re: RegExp | null = null;
      try {
        re = new RegExp(schema.pattern);
      } catch {
        re = null;
      }
      if (re && !re.test(v)) {
        out.push({ path, keyword: "pattern", message: `does not match pattern /${schema.pattern}/` });
      }
    }
    if (typeof schema.format === "string" && !matchesFormat(schema.format, v)) {
      out.push({ path, keyword: "format", message: `not a valid ${schema.format}` });
    }
  }

  private checkNumber(schema: JSONSchema, v: number, path: string, out: ValidationError[]): void {
    if (typeof schema.minimum === "number" && v < schema.minimum) {
      out.push({ path, keyword: "minimum", message: `less than minimum ${schema.minimum}` });
    }
    if (typeof schema.maximum === "number" && v > schema.maximum) {
      out.push({ path, keyword: "maximum", message: `greater than maximum ${schema.maximum}` });
    }
  }

  private checkArray(schema: JSONSchema, v: JsonValue[], path: string, out: ValidationError[]): void {
    if (typeof schema.minItems === "number" && v.length < schema.minItems) {
      out.push({ path, keyword: "minItems", message: `fewer than minItems ${schema.minItems}` });
    }
    if (typeof schema.maxItems === "number" && v.length > schema.maxItems) {
      out.push({ path, keyword: "maxItems", message: `more than maxItems ${schema.maxItems}` });
    }
    const items = schema.items;
    if (Array.isArray(items)) {
      // tuple validation
      v.forEach((el, i) => {
        const s = items[i];
        if (s) this.validate(s, el, join(path, i), out);
      });
    } else if (items && typeof items === "object") {
      v.forEach((el, i) => this.validate(items, el, join(path, i), out));
    }
  }

  private checkObject(
    schema: JSONSchema,
    v: Record<string, JsonValue>,
    path: string,
    out: ValidationError[],
  ): void {
    const props = (schema.properties ?? {}) as Record<string, JSONSchema>;
    const required = schema.required ?? [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(v, key)) {
        out.push({ path: join(path, key), keyword: "required", message: `missing required property "${key}"` });
      }
    }
    for (const key of Object.keys(v)) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        this.validate(props[key]!, v[key]!, join(path, key), out);
      } else {
        const ap = schema.additionalProperties;
        if (ap === false) {
          out.push({
            path: join(path, key),
            keyword: "additionalProperties",
            message: `additional property "${key}" is not allowed`,
          });
        } else if (ap && typeof ap === "object") {
          this.validate(ap as JSONSchema, v[key]!, join(path, key), out);
        }
      }
    }
  }
}

/**
 * Validate `data` against `schema`. Returns `{ valid, errors }`; `errors` is
 * empty when `valid` is `true`.
 */
export function validate(
  schema: JSONSchema,
  data: JsonValue,
  opts: ValidateOptions = {},
): ValidationResult {
  if (!isPlainObject(schema)) {
    return { valid: false, errors: [{ path: "", keyword: "schema", message: "schema must be an object" }] };
  }
  const errors: ValidationError[] = [];
  new Validator(opts.root ?? schema).validate(schema, data, "", errors);
  return { valid: errors.length === 0, errors };
}

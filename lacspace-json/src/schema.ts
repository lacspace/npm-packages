/**
 * A pragmatic JSON Schema validator (draft-07 subset), dependency-free.
 *
 * Supported keywords: `type` (incl. arrays of types + "integer"), `required`,
 * `properties`, `patternProperties`, `additionalProperties`, `items` (schema or
 * tuple), `enum`, `const`, `minimum`/`maximum`/`exclusiveMinimum`/
 * `exclusiveMaximum`, `multipleOf`, `minLength`/`maxLength`, `pattern`,
 * `minItems`/`maxItems`/`uniqueItems`, `minProperties`/`maxProperties`,
 * `anyOf`/`allOf`/`oneOf`/`not`, and `format` basics (email, uri/url, uuid,
 * date, date-time, ipv4, hostname). `$ref` to local `#/definitions/*` and
 * `#/$defs/*` is resolved; remote refs are not.
 *
 * NOT supported (documented): `$id` scoping, remote `$ref`, `if/then/else`,
 * `dependencies`, `contains`, `propertyNames`, and draft 2020 keywords.
 */
import { typeOf, deepEqual } from "./util.js";
import type { JsonValue } from "./util.js";

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

type Schema = boolean | { [key: string]: unknown };

const FORMATS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uri: /^[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+$/,
  url: /^https?:\/\/\S+$/i,
  uuid: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  "date-time": /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
  time: /^\d{2}:\d{2}:\d{2}(\.\d+)?$/,
  ipv4: /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  hostname: /^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/,
};

class Validator {
  private root: Schema;
  private errors: ValidationError[] = [];
  constructor(root: Schema) { this.root = root; }

  validate(data: JsonValue, schema: Schema, path: string): void {
    if (schema === true || schema === undefined) return;
    if (schema === false) { this.err(path, "schema is `false` — no value is valid here"); return; }
    if (typeof schema !== "object") return;

    if (typeof schema["$ref"] === "string") {
      const resolved = this.resolveRef(schema["$ref"] as string);
      if (resolved === undefined) this.err(path, `cannot resolve $ref "${schema["$ref"]}"`);
      else this.validate(data, resolved, path);
      return;
    }

    this.checkType(data, schema, path);
    this.checkEnumConst(data, schema, path);
    this.checkNumber(data, schema, path);
    this.checkString(data, schema, path);
    this.checkArray(data, schema, path);
    this.checkObject(data, schema, path);
    this.checkCombinators(data, schema, path);
  }

  private err(path: string, message: string): void { this.errors.push({ path, message }); }

  private resolveRef(ref: string): Schema | undefined {
    if (!ref.startsWith("#/")) return undefined;
    const parts = ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
    let cur: unknown = this.root;
    for (const p of parts) {
      if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[p];
      else return undefined;
    }
    return cur as Schema | undefined;
  }

  private checkType(data: JsonValue, schema: Record<string, unknown>, path: string): void {
    const t = schema["type"];
    if (t === undefined) return;
    const types = Array.isArray(t) ? t : [t];
    const actual = typeOf(data);
    const ok = types.some((want) => {
      if (want === "integer") return actual === "number" && Number.isInteger(data as number);
      return want === actual;
    });
    if (!ok) this.err(path, `expected type ${types.join(" | ")}, got ${actual}`);
  }

  private checkEnumConst(data: JsonValue, schema: Record<string, unknown>, path: string): void {
    if ("const" in schema && !deepEqual(data, schema["const"])) {
      this.err(path, `must equal const ${JSON.stringify(schema["const"])}`);
    }
    if (Array.isArray(schema["enum"])) {
      const list = schema["enum"] as JsonValue[];
      if (!list.some((e) => deepEqual(e, data))) {
        this.err(path, `must be one of ${JSON.stringify(list)}`);
      }
    }
  }

  private checkNumber(data: JsonValue, schema: Record<string, unknown>, path: string): void {
    if (typeof data !== "number") return;
    if (typeof schema["minimum"] === "number" && data < schema["minimum"]) this.err(path, `must be >= ${schema["minimum"]}`);
    if (typeof schema["maximum"] === "number" && data > schema["maximum"]) this.err(path, `must be <= ${schema["maximum"]}`);
    if (typeof schema["exclusiveMinimum"] === "number" && data <= schema["exclusiveMinimum"]) this.err(path, `must be > ${schema["exclusiveMinimum"]}`);
    if (typeof schema["exclusiveMaximum"] === "number" && data >= schema["exclusiveMaximum"]) this.err(path, `must be < ${schema["exclusiveMaximum"]}`);
    if (typeof schema["multipleOf"] === "number" && schema["multipleOf"] > 0) {
      const q = data / (schema["multipleOf"] as number);
      if (Math.abs(q - Math.round(q)) > 1e-9) this.err(path, `must be a multiple of ${schema["multipleOf"]}`);
    }
  }

  private checkString(data: JsonValue, schema: Record<string, unknown>, path: string): void {
    if (typeof data !== "string") return;
    if (typeof schema["minLength"] === "number" && data.length < schema["minLength"]) this.err(path, `must be at least ${schema["minLength"]} characters`);
    if (typeof schema["maxLength"] === "number" && data.length > schema["maxLength"]) this.err(path, `must be at most ${schema["maxLength"]} characters`);
    if (typeof schema["pattern"] === "string") {
      let re: RegExp | null = null;
      try { re = new RegExp(schema["pattern"] as string); } catch { /* invalid pattern in schema */ }
      if (re && !re.test(data)) this.err(path, `must match pattern /${schema["pattern"]}/`);
    }
    if (typeof schema["format"] === "string") {
      const fmt = FORMATS[schema["format"] as string];
      if (fmt && !fmt.test(data)) this.err(path, `must be a valid ${schema["format"]}`);
      if ((schema["format"] === "ipv4") && fmt && fmt.test(data)) {
        if (!data.split(".").every((o) => Number(o) <= 255)) this.err(path, `must be a valid ipv4`);
      }
    }
  }

  private checkArray(data: JsonValue, schema: Record<string, unknown>, path: string): void {
    if (!Array.isArray(data)) return;
    if (typeof schema["minItems"] === "number" && data.length < schema["minItems"]) this.err(path, `must have at least ${schema["minItems"]} items`);
    if (typeof schema["maxItems"] === "number" && data.length > schema["maxItems"]) this.err(path, `must have at most ${schema["maxItems"]} items`);
    if (schema["uniqueItems"] === true) {
      for (let i = 0; i < data.length; i++) {
        for (let j = i + 1; j < data.length; j++) {
          if (deepEqual(data[i], data[j])) { this.err(path, `items must be unique (indexes ${i} and ${j})`); break; }
        }
      }
    }
    const items = schema["items"];
    if (Array.isArray(items)) {
      for (let i = 0; i < items.length && i < data.length; i++) {
        this.validate(data[i]!, items[i] as Schema, `${path}[${i}]`);
      }
      const additional = schema["additionalItems"];
      if (additional !== undefined && data.length > items.length) {
        for (let i = items.length; i < data.length; i++) {
          if (additional === false) this.err(`${path}[${i}]`, "additional items are not allowed");
          else this.validate(data[i]!, additional as Schema, `${path}[${i}]`);
        }
      }
    } else if (items !== undefined) {
      for (let i = 0; i < data.length; i++) this.validate(data[i]!, items as Schema, `${path}[${i}]`);
    }
  }

  private checkObject(data: JsonValue, schema: Record<string, unknown>, path: string): void {
    if (data === null || typeof data !== "object" || Array.isArray(data)) return;
    const obj = data as Record<string, JsonValue>;
    const keys = Object.keys(obj);
    if (Array.isArray(schema["required"])) {
      for (const req of schema["required"] as string[]) {
        if (!Object.prototype.hasOwnProperty.call(obj, req)) this.err(path, `missing required property "${req}"`);
      }
    }
    if (typeof schema["minProperties"] === "number" && keys.length < schema["minProperties"]) this.err(path, `must have at least ${schema["minProperties"]} properties`);
    if (typeof schema["maxProperties"] === "number" && keys.length > schema["maxProperties"]) this.err(path, `must have at most ${schema["maxProperties"]} properties`);

    const props = (schema["properties"] as Record<string, Schema>) || {};
    const patternProps = (schema["patternProperties"] as Record<string, Schema>) || {};
    const additional = schema["additionalProperties"];

    for (const key of keys) {
      const childPath = `${path}.${key}`;
      let matched = false;
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        matched = true;
        this.validate(obj[key]!, props[key] as Schema, childPath);
      }
      for (const pat of Object.keys(patternProps)) {
        let re: RegExp | null = null;
        try { re = new RegExp(pat); } catch { /* skip */ }
        if (re && re.test(key)) { matched = true; this.validate(obj[key]!, patternProps[pat] as Schema, childPath); }
      }
      if (!matched && additional !== undefined) {
        if (additional === false) this.err(childPath, `additional property "${key}" is not allowed`);
        else if (additional !== true) this.validate(obj[key]!, additional as Schema, childPath);
      }
    }
  }

  private checkCombinators(data: JsonValue, schema: Record<string, unknown>, path: string): void {
    if (Array.isArray(schema["allOf"])) {
      for (const sub of schema["allOf"] as Schema[]) this.validate(data, sub, path);
    }
    if (Array.isArray(schema["anyOf"])) {
      const subs = schema["anyOf"] as Schema[];
      const ok = subs.some((sub) => this.subValid(data, sub, path));
      if (!ok) this.err(path, "must match at least one schema in anyOf");
    }
    if (Array.isArray(schema["oneOf"])) {
      const subs = schema["oneOf"] as Schema[];
      const count = subs.filter((sub) => this.subValid(data, sub, path)).length;
      if (count !== 1) this.err(path, `must match exactly one schema in oneOf (matched ${count})`);
    }
    if (schema["not"] !== undefined) {
      if (this.subValid(data, schema["not"] as Schema, path)) this.err(path, "must not match the `not` schema");
    }
  }

  private subValid(data: JsonValue, schema: Schema, path: string): boolean {
    const probe = new Validator(this.root);
    probe.validate(data, schema, path);
    return probe.errors.length === 0;
  }

  result(): ValidationResult { return { valid: this.errors.length === 0, errors: this.errors }; }
}

/** Validate `data` against a JSON Schema. Returns `{ valid, errors[] }`. */
export function validateSchema(data: JsonValue, schema: JsonValue): ValidationResult {
  const v = new Validator(schema as Schema);
  v.validate(data, schema as Schema, "$");
  return v.result();
}

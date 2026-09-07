/**
 * Generate a minimal-but-realistic example instance that satisfies a draft-07
 * JSON Schema: it honours `const`, `enum`, `default`, `required`, string
 * `format`s and numeric `minimum`/`maximum`, resolves local `$ref`s and guards
 * against cyclic references.
 */
import type { JsonValue, JSONSchema, JsonSchemaType } from "./types.js";
import { safeSet } from "./util.js";
import { resolveRef } from "./refs.js";

/** Options for {@link schemaToExample}. */
export interface ExampleOptions {
  /** Include optional properties too, not just required ones (default true). */
  includeOptional?: boolean;
  /** Prefer a schema's declared `examples`/`default` when present (default true). */
  useExamples?: boolean;
}

const FORMAT_SAMPLES: Record<string, string> = {
  "date-time": "2020-01-01T00:00:00Z",
  date: "2020-01-01",
  time: "00:00:00",
  email: "user@example.com",
  uri: "https://example.com",
  url: "https://example.com",
  uuid: "00000000-0000-4000-8000-000000000000",
  ipv4: "127.0.0.1",
  ipv6: "::1",
  hostname: "example.com",
};

function pickType(schema: JSONSchema): JsonSchemaType | undefined {
  const t = schema.type;
  if (typeof t === "string") return t;
  if (Array.isArray(t) && t.length) {
    const nonNull = t.find((x) => x !== "null");
    return (nonNull ?? t[0]) as JsonSchemaType;
  }
  if (schema.properties) return "object";
  if (schema.items) return "array";
  return undefined;
}

function stringExample(schema: JSONSchema): string {
  if (schema.format && FORMAT_SAMPLES[schema.format]) return FORMAT_SAMPLES[schema.format]!;
  // Derive a hint from the schema's title/description when available.
  let s = typeof schema.title === "string" && schema.title ? schema.title.toLowerCase() : "string";
  if (typeof schema.minLength === "number" && schema.minLength > s.length) {
    s = s.padEnd(schema.minLength, "x");
  }
  if (typeof schema.maxLength === "number" && schema.maxLength >= 0 && s.length > schema.maxLength) {
    s = s.slice(0, schema.maxLength);
  }
  return s;
}

function numberExample(schema: JSONSchema, integer: boolean): number {
  let n = 0;
  if (typeof schema.minimum === "number") n = schema.minimum;
  else if (typeof schema.maximum === "number") n = Math.min(0, schema.maximum);
  if (typeof schema.maximum === "number" && n > schema.maximum) n = schema.maximum;
  return integer ? Math.trunc(n) : n;
}

function walk(schema: JSONSchema, root: JSONSchema, opts: ExampleOptions, seen: Set<JSONSchema>): JsonValue {
  if (!schema || typeof schema !== "object") return null;

  if (typeof schema.$ref === "string") {
    const target = resolveRef(root, schema.$ref);
    if (!target || seen.has(target)) return null;
    return walk(target, root, opts, seen);
  }

  if (opts.useExamples !== false) {
    if (schema.default !== undefined) return schema.default;
    if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0]!;
  }
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]!;

  if (Array.isArray(schema.anyOf) && schema.anyOf.length) return walk(schema.anyOf[0]!, root, opts, seen);
  if (Array.isArray(schema.oneOf) && schema.oneOf.length) return walk(schema.oneOf[0]!, root, opts, seen);
  if (Array.isArray(schema.allOf) && schema.allOf.length) {
    const merged: Record<string, JsonValue> = {};
    for (const part of schema.allOf) {
      const v = walk(part, root, opts, seen);
      if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(merged, v);
    }
    return merged;
  }

  if (seen.has(schema)) return null;
  seen.add(schema);
  try {
    const type = pickType(schema);
    switch (type) {
      case "object": {
        const out: Record<string, JsonValue> = {};
        const props = (schema.properties ?? {}) as Record<string, JSONSchema>;
        const required = new Set(schema.required ?? []);
        const includeOptional = opts.includeOptional !== false;
        for (const key of Object.keys(props)) {
          if (includeOptional || required.has(key)) {
            safeSet(out, key, walk(props[key]!, root, opts, seen));
          }
        }
        if (Object.keys(out).length === 0 && schema.additionalProperties && typeof schema.additionalProperties === "object") {
          safeSet(out, "key", walk(schema.additionalProperties, root, opts, seen));
        }
        return out;
      }
      case "array": {
        const items = schema.items;
        const min = typeof schema.minItems === "number" ? schema.minItems : 1;
        if (Array.isArray(items)) return items.map((it) => walk(it, root, opts, seen));
        if (!items) return [];
        const count = Math.max(1, min);
        const el = walk(items, root, opts, seen);
        return Array.from({ length: count }, () => el);
      }
      case "string":
        return stringExample(schema);
      case "integer":
        return numberExample(schema, true);
      case "number":
        return numberExample(schema, false);
      case "boolean":
        return true;
      case "null":
        return null;
      default:
        return null;
    }
  } finally {
    seen.delete(schema);
  }
}

/** Build an example JSON value that satisfies `schema`. */
export function schemaToExample(schema: JSONSchema, opts: ExampleOptions = {}): JsonValue {
  return walk(schema, schema, opts, new Set());
}

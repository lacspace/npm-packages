/**
 * Infer a draft-07 JSON Schema from one or many JSON samples.
 *
 * The engine merges every sample into a single schema: object properties are
 * unified (present-in-all -> `required`, present-in-some -> optional), array
 * item schemas are unified across all elements, and differing scalar types
 * collapse into a `type: [...]` union (or `anyOf` when objects/arrays are mixed
 * in). It optionally detects `enum`s (small fixed value sets) and string
 * `format`s (date-time, date, email, uri, uuid, ipv4).
 */
import type { JsonValue, JSONSchema, JsonSchemaType } from "./types.js";
import { isPlainObject, safeKeys, safeSet } from "./util.js";

/** Options controlling schema inference. */
export interface InferOptions {
  /**
   * Max distinct primitive values for a field to be treated as an `enum`.
   * `0` (the default) disables enum detection.
   */
  enumThreshold?: number;
  /** `"all-required"` marks every property required; `"none"` marks none. */
  required?: "detected" | "all" | "none";
  /** Attach the first sample value as `examples` on scalar leaves (for JSDoc). */
  collectExamples?: boolean;
  /** Value for the schema's `title`. */
  title?: string;
  /** Emit the `$schema` draft-07 declaration on the root (default true). */
  declareDraft?: boolean;
}

const DRAFT_07 = "http://json-schema.org/draft-07/schema#";

type Kind = JsonSchemaType;

function kindOf(v: JsonValue): Kind {
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

// --- string format detection ------------------------------------------------

const FORMATS: Array<[string, RegExp]> = [
  ["uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
  ["date-time", /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/],
  ["date", /^\d{4}-\d{2}-\d{2}$/],
  ["email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/],
  ["ipv4", /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/],
  ["uri", /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i],
];

function detectFormat(values: string[]): string | undefined {
  if (values.length === 0) return undefined;
  for (const [name, re] of FORMATS) {
    if (values.every((v) => re.test(v))) return name;
  }
  return undefined;
}

// --- enum detection ---------------------------------------------------------

function detectEnum(values: JsonValue[], threshold: number): JsonValue[] | undefined {
  if (threshold <= 0 || values.length === 0) return undefined;
  const seen: JsonValue[] = [];
  const keys = new Set<string>();
  for (const v of values) {
    const k = typeof v + ":" + String(v);
    if (!keys.has(k)) {
      keys.add(k);
      seen.push(v);
    }
    if (seen.length > threshold) return undefined;
  }
  return seen.length >= 1 && seen.length <= threshold ? seen : undefined;
}

// --- core recursion ---------------------------------------------------------

function scalarSchema(kind: Kind, values: JsonValue[], opts: InferOptions): JSONSchema {
  const schema: JSONSchema = { type: kind };
  const threshold = opts.enumThreshold ?? 0;
  const en = detectEnum(values, threshold);
  if (en) {
    schema.enum = en;
  } else if (kind === "string") {
    const fmt = detectFormat(values as string[]);
    if (fmt) schema.format = fmt;
  }
  if (opts.collectExamples && values.length && !en) {
    const first = values[0];
    if (first !== undefined) schema.examples = [first];
  }
  return schema;
}

function mergeObjects(objs: Array<Record<string, JsonValue>>, opts: InferOptions): JSONSchema {
  const properties: Record<string, JSONSchema> = {};
  const order: string[] = [];
  const perKey = new Map<string, JsonValue[]>();
  const presence = new Map<string, number>();

  for (const obj of objs) {
    for (const key of safeKeys(obj)) {
      if (!perKey.has(key)) {
        perKey.set(key, []);
        order.push(key);
      }
      perKey.get(key)!.push(obj[key] as JsonValue);
      presence.set(key, (presence.get(key) ?? 0) + 1);
    }
  }

  for (const key of order) {
    safeSet(properties, key, inferNode(perKey.get(key)!, opts));
  }

  const schema: JSONSchema = { type: "object", properties };

  const mode = opts.required ?? "detected";
  let required: string[];
  if (mode === "none") required = [];
  else if (mode === "all") required = [...order];
  else required = order.filter((k) => (presence.get(k) ?? 0) === objs.length);
  if (required.length) schema.required = required;

  return schema;
}

function mergeArrays(arrs: JsonValue[][], opts: InferOptions): JSONSchema {
  const items: JsonValue[] = [];
  for (const a of arrs) for (const el of a) items.push(el);
  const schema: JSONSchema = { type: "array" };
  schema.items = items.length ? inferNode(items, opts) : {};
  return schema;
}

/**
 * Infer a schema describing every value in `values` (a set of samples that
 * should all validate against the returned node).
 */
export function inferNode(values: JsonValue[], opts: InferOptions = {}): JSONSchema {
  const byKind = new Map<Kind, JsonValue[]>();
  for (const v of values) {
    const k = kindOf(v);
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(v);
  }

  const hasNull = byKind.has("null");
  const kinds = new Set<Kind>([...byKind.keys()].filter((k) => k !== "null"));
  // Collapse integer into number when both appear.
  if (kinds.has("number") && kinds.has("integer")) kinds.delete("integer");

  // Nothing but nulls (or nothing at all).
  if (kinds.size === 0) return hasNull ? { type: "null" } : {};

  const buildFor = (kind: Kind): JSONSchema => {
    if (kind === "object") {
      return mergeObjects(byKind.get("object") as Array<Record<string, JsonValue>>, opts);
    }
    if (kind === "array") {
      return mergeArrays(byKind.get("array") as JsonValue[][], opts);
    }
    // scalar; for a collapsed number, gather both integer+number samples
    const vals =
      kind === "number"
        ? [...(byKind.get("number") ?? []), ...(byKind.get("integer") ?? [])]
        : byKind.get(kind) ?? [];
    return scalarSchema(kind, vals, opts);
  };

  const applyNull = (schema: JSONSchema): JSONSchema => {
    if (!hasNull) return schema;
    const base = schema.type;
    if (typeof base === "string") schema.type = [base, "null"];
    else if (Array.isArray(base) && !base.includes("null")) schema.type = [...base, "null"];
    else if (base === undefined) schema.type = "null";
    return schema;
  };

  if (kinds.size === 1) {
    return applyNull(buildFor([...kinds][0]!));
  }

  const kindList = [...kinds];
  const allScalar = kindList.every((k) => k !== "object" && k !== "array");

  if (allScalar) {
    const typeList = kindList.sort() as JsonSchemaType[];
    const schema: JSONSchema = { type: hasNull ? [...typeList, "null"] : typeList };
    const en = detectEnum(
      kindList.flatMap((k) =>
        k === "number"
          ? [...(byKind.get("number") ?? []), ...(byKind.get("integer") ?? [])]
          : byKind.get(k) ?? [],
      ),
      opts.enumThreshold ?? 0,
    );
    if (en) schema.enum = en;
    return schema;
  }

  // Mixed scalar + complex -> anyOf branches.
  const branches: JSONSchema[] = kindList.sort().map(buildFor);
  if (hasNull) branches.push({ type: "null" });
  return { anyOf: branches };
}

/**
 * Infer a complete draft-07 JSON Schema from a list of top-level samples.
 * Passing one sample describes that value; passing many merges them.
 */
export function inferSchema(samples: JsonValue[], opts: InferOptions = {}): JSONSchema {
  const body = inferNode(samples, opts);
  const root: JSONSchema = {};
  if (opts.declareDraft !== false) root.$schema = DRAFT_07;
  if (opts.title) root.title = opts.title;
  Object.assign(root, body);
  return root;
}

/**
 * The schema engine. A schema turns into N rows. Two input forms are supported:
 *
 *   1. An inline field string:
 *      `id:autoincrement,name:fullName,age:int(18..65),role:oneOf(admin|user)`
 *   2. A JSON schema object mapping field → spec, supporting nested objects and
 *      arrays: `{ "id": "autoincrement", "tags": { "type": "array", "of": "word", "count": 3 } }`
 *
 * Both compile to a `Spec` (a resolver `(ctx) => value`). Fields are evaluated
 * in declaration order and written into the row as they go, so a later field
 * (`email`) can derive from an earlier one (`firstName`).
 */
import { RNG } from "./prng.js";
import type { Locale } from "./data.js";
import { callGen } from "./generators.js";
import type { GenArg, GenContext } from "./generators.js";
import { compileTemplate, isTemplateSpec, templateBody } from "./template.js";

export type Spec = (ctx: GenContext) => unknown;
export interface Field {
  key: string;
  spec: Spec;
  /** When true, no two rows may share this field's value (see `generateRows`). */
  unique?: boolean;
}

/** Split "field=a,b,c" on top-level commas, respecting (...) nesting. */
function splitTopLevel(input: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== "" || out.length) out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Coerce a raw arg token to a number when it looks numeric. */
function coerceArg(token: string): GenArg {
  const t = token.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

/** Parse the inner arg string of `gen(...)` into positional args. */
export function parseArgString(inner: string): GenArg[] {
  const trimmed = inner.trim();
  if (trimmed === "") return [];
  // Precedence: `|` (enum/weighted) → `..` (ranges) → `,`
  let parts: string[];
  if (trimmed.includes("|")) parts = trimmed.split("|");
  else if (trimmed.includes("..")) parts = trimmed.split("..");
  else parts = splitTopLevel(trimmed, ",");
  return parts.map((p) => coerceArg(p));
}

/** Compile a string spec like `fullName`, `int(18..65)` or `template(...)`. */
export function specFromString(raw: string): Spec {
  const s = raw.trim();
  // Template / expression fields: `template({{firstName}} {{lastName}})`.
  if (isTemplateSpec(s)) return compileTemplate(templateBody(s), specFromString);
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\((.*)\))?$/.exec(s);
  if (!m) throw new Error(`Invalid generator spec: "${raw}"`);
  const name = m[1]!;
  const args = m[2] !== undefined ? parseArgString(m[2]) : [];
  // Validate the generator exists eagerly (clear error at parse time).
  callGen(name, probeCtx(), args);
  return (ctx) => callGen(name, ctx, args);
}

/**
 * Compile a raw field spec, unwrapping a `unique(...)` constraint wrapper. The
 * wrapper marks the field for cross-row de-duplication in `generateRows`; the
 * inner spec is any normal generator/template spec.
 */
export function compileFieldSpecString(raw: string): { spec: Spec; unique?: boolean } {
  const s = raw.trim();
  const u = /^unique\(([\s\S]*)\)$/.exec(s);
  if (u && !isTemplateSpec(s)) return { spec: specFromString(u[1]!.trim()), unique: true };
  return { spec: specFromString(s) };
}

/** Compile any JSON schema value into a spec + optional `unique` flag. */
export function compileFieldValue(value: unknown): { spec: Spec; unique?: boolean } {
  if (typeof value === "string") return compileFieldSpecString(value);
  const unique = isRecord(value) && value["unique"] === true;
  return { spec: specFromJson(value), unique };
}

// A throwaway context used only to validate a generator name at parse time.
function probeCtx(): GenContext {
  return { rng: new RNG(1), locale: "en", index: 0, row: {} };
}

interface JsonArraySpec {
  type: "array";
  of: unknown;
  count?: number;
  min?: number;
  max?: number;
}
interface JsonObjectSpec {
  type: "object";
  properties: Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Compile any JSON schema value (string | object | primitive) into a resolver. */
export function specFromJson(value: unknown): Spec {
  if (typeof value === "string") return specFromString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return () => value;
  }
  if (Array.isArray(value)) {
    // A literal tuple — pick one at random.
    const specs = value.map((v) => specFromJson(v));
    return (ctx) => specs[ctx.rng.int(0, specs.length - 1)]!(ctx);
  }
  if (isRecord(value)) {
    const type = value["type"];
    if (type === "array") {
      const a = value as unknown as JsonArraySpec;
      if (a.of === undefined) throw new Error('array spec needs an "of" field');
      const itemSpec = specFromJson(a.of);
      return (ctx) => {
        const n =
          typeof a.count === "number"
            ? a.count
            : ctx.rng.int(typeof a.min === "number" ? a.min : 1, typeof a.max === "number" ? a.max : 3);
        const out: unknown[] = [];
        for (let i = 0; i < n; i++) out.push(itemSpec(ctx));
        return out;
      };
    }
    if (type === "object") {
      const o = value as unknown as JsonObjectSpec;
      if (!isRecord(o.properties)) throw new Error('object spec needs a "properties" map');
      const fields = fieldsFromRecord(o.properties);
      return (ctx) => buildObject(fields, ctx);
    }
    if (typeof type === "string") {
      // A generator call in object form: { type: "int", min, max } | { args: [...] } | { values: [...] }
      const args = argsFromJsonObject(value);
      return (ctx) => callGen(type, ctx, args);
    }
    // No `type`: treat the object itself as a nested field map.
    const fields = fieldsFromRecord(value);
    return (ctx) => buildObject(fields, ctx);
  }
  throw new Error(`Unsupported schema value: ${JSON.stringify(value)}`);
}

function argsFromJsonObject(obj: Record<string, unknown>): GenArg[] {
  if (Array.isArray(obj["args"])) return (obj["args"] as unknown[]).map((v) => (typeof v === "number" ? v : String(v)));
  if (Array.isArray(obj["values"])) return (obj["values"] as unknown[]).map((v) => (typeof v === "number" ? v : String(v)));
  const out: GenArg[] = [];
  if (typeof obj["min"] === "number") out.push(obj["min"] as number);
  if (typeof obj["max"] === "number") out.push(obj["max"] as number);
  if (typeof obj["decimals"] === "number") out.push(obj["decimals"] as number);
  if (out.length === 0 && typeof obj["prob"] === "number") out.push(obj["prob"] as number);
  if (out.length === 0 && typeof obj["count"] === "number") out.push(obj["count"] as number);
  return out;
}

function fieldsFromRecord(rec: Record<string, unknown>): Field[] {
  return Object.keys(rec).map((key) => ({ key, spec: specFromJson(rec[key]) }));
}

function buildObject(fields: Field[], parent: GenContext): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const ctx: GenContext = { rng: parent.rng, locale: parent.locale, index: parent.index, row };
  for (const f of fields) row[f.key] = f.spec(ctx);
  return row;
}

/** Parse an inline `--fields` string into an ordered list of fields. */
export function parseFields(input: string): Field[] {
  const specs = splitTopLevel(input, ",");
  if (specs.length === 0) throw new Error("--fields is empty");
  return specs.map((chunk) => {
    const idx = chunk.indexOf(":");
    if (idx < 0) throw new Error(`Field "${chunk}" must be in the form key:generator`);
    const key = chunk.slice(0, idx).trim();
    const specStr = chunk.slice(idx + 1).trim();
    if (!key) throw new Error(`Field "${chunk}" has an empty key`);
    const { spec, unique } = compileFieldSpecString(specStr);
    return { key, spec, unique };
  });
}

/** Parse a JSON schema object into an ordered list of fields. */
export function parseJsonSchema(schema: unknown): Field[] {
  if (!isRecord(schema)) throw new Error("A JSON schema must be an object mapping field → spec");
  // Allow a wrapper: { fields: {...} } or { properties: {...} }.
  const body =
    isRecord(schema["fields"]) ? (schema["fields"] as Record<string, unknown>) :
    isRecord(schema["properties"]) && schema["type"] === "object" ? (schema["properties"] as Record<string, unknown>) :
    schema;
  const fields = Object.keys(body).map((key) => {
    const { spec, unique } = compileFieldValue(body[key]);
    return { key, spec, unique };
  });
  if (fields.length === 0) throw new Error("The JSON schema has no fields");
  return fields;
}

export interface GenerateOptions {
  count?: number;
  seed?: number | string;
  locale?: Locale;
}

/** How many times a `unique` field is re-rolled before giving up. */
const UNIQUE_MAX_TRIES = 10_000;

/** Stable comparison key for uniqueness/dedupe sets. */
export function dedupeKey(v: unknown): string {
  return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
}

/**
 * Draw a value for a field, honouring a cross-row `unique` constraint by
 * re-rolling (which advances the RNG) until an unseen value appears. Throws a
 * clear error if the generator can't supply enough distinct values.
 */
function drawUnique(f: Field, ctx: GenContext, seen: Set<string>): unknown {
  let val = f.spec(ctx);
  let tries = 0;
  while (seen.has(dedupeKey(val)) && tries < UNIQUE_MAX_TRIES) {
    val = f.spec(ctx);
    tries++;
  }
  if (seen.has(dedupeKey(val))) {
    throw new Error(
      `Could not generate a unique value for "${f.key}" after ${UNIQUE_MAX_TRIES} tries — the generator's value space is too small; use a higher-cardinality generator (e.g. uuid, ulid) or fewer rows.`,
    );
  }
  seen.add(dedupeKey(val));
  return val;
}

/** Generate `count` rows from a compiled field list. Deterministic under `seed`. */
export function generateRows(fields: Field[], opts: GenerateOptions = {}): Record<string, unknown>[] {
  const count = Math.max(0, opts.count ?? 10);
  const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
  const locale = opts.locale ?? "en";
  const rng = new RNG(seed);
  const uniqueSeen = new Map<string, Set<string>>();
  for (const f of fields) if (f.unique) uniqueSeen.set(f.key, new Set());
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const row: Record<string, unknown> = {};
    const ctx: GenContext = { rng, locale, index: i, row };
    for (const f of fields) {
      row[f.key] = f.unique ? drawUnique(f, ctx, uniqueSeen.get(f.key)!) : f.spec(ctx);
    }
    rows.push(row);
  }
  return rows;
}

/** Generate `count` scalar values from a single generator spec string. */
export function generateValues(specStr: string, opts: GenerateOptions = {}): unknown[] {
  const spec = specFromString(specStr);
  const count = Math.max(0, opts.count ?? 10);
  const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
  const locale = opts.locale ?? "en";
  const rng = new RNG(seed);
  const out: unknown[] = [];
  for (let i = 0; i < count; i++) {
    out.push(spec({ rng, locale, index: i, row: {} }));
  }
  return out;
}

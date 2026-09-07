/**
 * A deliberately minimal GraphQL resolver over the db collections — NOT a spec
 * implementation. It handles the pragmatic subset most frontends need while
 * prototyping:
 *
 *   { users { id name } }                 → every user, projected to {id,name}
 *   { users(id: 1) { id name } }          → the single user with id 1 (or null)
 *   { users(limit: 5) { id } posts { id } } → multiple top-level fields
 *
 * Supported: top-level fields named after a collection; an optional single
 * argument that is either `id` (→ one object) or `limit`/`offset` (→ slice);
 * field selection (a flat list of scalar/object field names); nested selection
 * sets simply project the matching sub-object's fields. Variables (`$id`) are
 * substituted from the request's `variables`. Aliases, fragments, mutations,
 * directives, interfaces and introspection are NOT supported.
 */
import type { Store, Record_ } from "./db.js";

/** A parsed GraphQL field selection. */
export interface Field {
  name: string;
  args: Record<string, unknown>;
  selection: Field[];
}

/** The result of a resolve: `data` and/or `errors`, mirroring GraphQL shape. */
export interface GraphQLResult {
  data?: Record<string, unknown> | null;
  errors?: { message: string }[];
}

const WS = /\s/;
const IDENT = /[_A-Za-z0-9]/;

function isWs(ch: string): boolean {
  return WS.test(ch);
}

/** Parse a selection set starting at `src[i] === "{"`. Returns fields + new index. */
function parseSelectionSet(src: string, start: number, vars: Record<string, unknown>): [Field[], number] {
  let i = start + 1; // skip "{"
  const fields: Field[] = [];
  while (i < src.length) {
    while (i < src.length && (isWs(src[i]!) || src[i] === ",")) i++;
    if (src[i] === "}") return [fields, i + 1];
    if (i >= src.length) break;

    // Field name.
    let name = "";
    while (i < src.length && IDENT.test(src[i]!)) name += src[i++]!;
    if (!name) throw new Error(`Unexpected token '${src[i]}' at ${i}`);

    while (i < src.length && isWs(src[i]!)) i++;

    let args: Record<string, unknown> = {};
    if (src[i] === "(") {
      const [parsed, next] = parseArgs(src, i, vars);
      args = parsed;
      i = next;
    }

    while (i < src.length && isWs(src[i]!)) i++;

    let selection: Field[] = [];
    if (src[i] === "{") {
      const [sub, next] = parseSelectionSet(src, i, vars);
      selection = sub;
      i = next;
    }

    fields.push({ name, args, selection });
  }
  throw new Error("Unterminated selection set");
}

/** Parse an argument list starting at `src[i] === "("`. */
function parseArgs(src: string, start: number, vars: Record<string, unknown>): [Record<string, unknown>, number] {
  let i = start + 1; // skip "("
  const args: Record<string, unknown> = {};
  while (i < src.length) {
    while (i < src.length && (isWs(src[i]!) || src[i] === ",")) i++;
    if (src[i] === ")") return [args, i + 1];

    let key = "";
    while (i < src.length && IDENT.test(src[i]!)) key += src[i++]!;
    while (i < src.length && isWs(src[i]!)) i++;
    if (src[i] !== ":") throw new Error(`Expected ':' after argument '${key}'`);
    i++; // skip ":"
    while (i < src.length && isWs(src[i]!)) i++;

    const [value, next] = parseValue(src, i, vars);
    args[key] = value;
    i = next;
  }
  throw new Error("Unterminated argument list");
}

function parseValue(src: string, start: number, vars: Record<string, unknown>): [unknown, number] {
  let i = start;
  const ch = src[i];
  if (ch === '"') {
    i++;
    let out = "";
    while (i < src.length && src[i] !== '"') {
      if (src[i] === "\\") {
        out += src[i + 1] ?? "";
        i += 2;
      } else out += src[i++]!;
    }
    return [out, i + 1];
  }
  if (ch === "$") {
    i++;
    let vname = "";
    while (i < src.length && IDENT.test(src[i]!)) vname += src[i++]!;
    return [vars[vname], i];
  }
  // Bare token: number, boolean, null or enum.
  let tok = "";
  while (i < src.length && /[^\s,)]/.test(src[i]!)) tok += src[i++]!;
  if (tok === "true") return [true, i];
  if (tok === "false") return [false, i];
  if (tok === "null") return [null, i];
  const n = Number(tok);
  return [Number.isNaN(n) ? tok : n, i];
}

/** Strip a leading `query`/`mutation` keyword + optional name + var defs. */
function findOperationBody(query: string): number {
  const brace = query.indexOf("{");
  if (brace === -1) throw new Error("No selection set found");
  return brace;
}

/** Parse a query string into its top-level field selections. */
export function parseQuery(query: string, variables: Record<string, unknown> = {}): Field[] {
  const trimmed = query.trim();
  if (trimmed.toLowerCase().startsWith("mutation")) {
    throw new Error("mutations are not supported by the mock GraphQL resolver");
  }
  const brace = findOperationBody(trimmed);
  const [fields] = parseSelectionSet(trimmed, brace, variables);
  return fields;
}

/** Project a record down to the requested field selection. */
function project(record: Record_, selection: Field[]): Record_ {
  if (selection.length === 0) return record;
  const out: Record_ = {};
  for (const f of selection) {
    const val = record[f.name];
    if (f.selection.length > 0 && val && typeof val === "object") {
      out[f.name] = Array.isArray(val)
        ? (val as Record_[]).map((v) => project(v, f.selection))
        : project(val as Record_, f.selection);
    } else {
      out[f.name] = val;
    }
  }
  return out;
}

/** Resolve one top-level field against the store. */
function resolveField(store: Store, field: Field): unknown {
  if (!store.has(field.name)) {
    const singular = store.singular(field.name);
    if (singular !== undefined) return singular;
    throw new Error(`Cannot query field "${field.name}" — no such collection`);
  }
  const idKey = store.idKey;
  const args = field.args;

  if (args["id"] !== undefined) {
    const rec = store.get(field.name, String(args["id"]));
    return rec ? project(rec, field.selection) : null;
  }

  let rows = store.list(field.name).slice();

  // Simple equality filters from any remaining scalar args.
  for (const [k, v] of Object.entries(args)) {
    if (k === "limit" || k === "offset") continue;
    rows = rows.filter((r) => String(r[k === "id" ? idKey : k]) === String(v));
  }

  const offset = typeof args["offset"] === "number" ? args["offset"] : 0;
  const limit = typeof args["limit"] === "number" ? args["limit"] : undefined;
  if (offset) rows = rows.slice(offset);
  if (limit !== undefined) rows = rows.slice(0, limit);

  return rows.map((r) => project(r, field.selection));
}

/** Execute a GraphQL query against the db store. Never throws — errors go in `errors`. */
export function resolveGraphQL(
  store: Store,
  query: string,
  variables: Record<string, unknown> = {},
): GraphQLResult {
  let fields: Field[];
  try {
    fields = parseQuery(query, variables);
  } catch (err) {
    return { errors: [{ message: (err as Error).message }] };
  }

  const data: Record<string, unknown> = {};
  const errors: { message: string }[] = [];
  for (const field of fields) {
    try {
      data[field.name] = resolveField(store, field);
    } catch (err) {
      errors.push({ message: (err as Error).message });
      data[field.name] = null;
    }
  }
  return errors.length ? { data, errors } : { data };
}

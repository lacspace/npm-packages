import type { SearchAst, SearchClause } from "./parse";

/**
 * Returns the record's value for a clause's field. Return:
 * - a boolean to answer the clause directly (handy for `is:` / `has:` / `in:`);
 * - a string, number, Date, or an array of them (objects are searched by their string values);
 * - undefined / null when the record has no such value (the clause fails, or passes if negated).
 */
export type Accessor<R> = (record: R, field: string, clause: SearchClause) => unknown;

function collectStrings(v: unknown, out: string[], depth = 0): void {
  if (v == null || depth > 3) return;
  if (typeof v === "string") out.push(v);
  else if (typeof v === "number" || typeof v === "bigint") out.push(String(v));
  else if (v instanceof Date) out.push(v.toISOString());
  else if (Array.isArray(v)) for (const x of v) collectStrings(x, out, depth + 1);
  else if (typeof v === "object") for (const x of Object.values(v as Record<string, unknown>)) collectStrings(x, out, depth + 1);
}

/**
 * The default accessor: `record[field]`. For the "text" field it searches every
 * string value in the record (one level of nesting), unless the record has its own `text`.
 */
export function defaultAccessor(record: unknown, field: string): unknown {
  if (!record || typeof record !== "object") return undefined;
  const r = record as Record<string, unknown>;
  if (field === "__proto__" || field === "constructor" || field === "prototype") return undefined;
  if (Object.prototype.hasOwnProperty.call(r, field)) return r[field];
  if (field === "text") {
    const out: string[] = [];
    for (const v of Object.values(r)) collectStrings(v, out, 2);
    return out;
  }
  return undefined;
}

function toMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") return Date.parse(v);
  return NaN;
}

function testClause<R>(c: SearchClause, record: R, accessor: Accessor<R>): boolean {
  let v: unknown;
  try {
    v = accessor(record, c.field, c);
  } catch {
    v = undefined;
  }
  let ok: boolean;
  if (typeof v === "boolean") ok = v;
  else if (v == null) ok = false;
  else if (c.op === "before" || c.op === "after") {
    const want = toMs(c.value);
    const vals = Array.isArray(v) ? v : [v];
    ok = Number.isFinite(want) && vals.some((x) => {
      const t = toMs(x);
      return Number.isFinite(t) && (c.op === "before" ? t < want : t >= want);
    });
  } else if (c.op === "gt" || c.op === "lt") {
    const want = Number(c.value);
    const vals = Array.isArray(v) ? v : [v];
    ok = Number.isFinite(want) && vals.some((x) => {
      const n = typeof x === "number" ? x : Number(x);
      return Number.isFinite(n) && (c.op === "gt" ? n > want : n < want);
    });
  } else {
    const strs: string[] = [];
    collectStrings(v, strs);
    const want = String(c.value).toLowerCase();
    ok = c.op === "contains" ? strs.some((s) => s.toLowerCase().includes(want)) : strs.some((s) => s.toLowerCase() === want);
  }
  return c.negated ? !ok : ok;
}

/**
 * Evaluate an AST against one in-memory record. All `clauses` must match and every
 * OR group needs at least one match. An empty AST matches everything. Never throws.
 */
export function matchesAst<R>(ast: Partial<SearchAst> | null | undefined, record: R, accessor?: Accessor<R>): boolean {
  if (!ast || typeof ast !== "object") return true;
  const get: Accessor<R> = typeof accessor === "function" ? accessor : (r, f) => defaultAccessor(r, f);
  for (const c of Array.isArray(ast.clauses) ? ast.clauses : []) {
    if (c && typeof c === "object" && !testClause(c, record, get)) return false;
  }
  for (const g of Array.isArray(ast.orGroups) ? ast.orGroups : []) {
    if (!Array.isArray(g) || !g.length) continue;
    if (!g.some((c) => c && typeof c === "object" && testClause(c, record, get))) return false;
  }
  return true;
}

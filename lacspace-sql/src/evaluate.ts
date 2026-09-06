/**
 * The evaluator: runs a parsed {@link SelectStatement} against an in-memory
 * array of rows. Read-only, single table. Column names match row keys
 * case-insensitively.
 */
import { SqlError } from "./tokenize.js";
import type { DataRow } from "lacspace-scraper";
import type { AggregateFn, Expr, Operand, SelectItem, SelectStatement } from "./parse.js";

// ---- value helpers ----

/** Case-insensitive cell lookup. Returns null when the column is absent/empty. */
function getCell(row: DataRow, name: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, name)) return normalize(row[name]);
  const lower = name.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) return normalize(row[k]);
  }
  return null;
}

function normalize(v: unknown): unknown {
  if (v === undefined || v === "") return null;
  return v;
}

/** Coerce to a finite number, or undefined when not numeric. */
function asNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function operandValue(op: Operand, row: DataRow): unknown {
  return op.kind === "column" ? getCell(row, op.name) : op.value;
}

/** SQL `LIKE` → RegExp. `%` = any run, `_` = one char. Case-insensitive. */
function likeToRegex(pattern: string): RegExp {
  let out = "^";
  for (const ch of pattern) {
    if (ch === "%") out += ".*";
    else if (ch === "_") out += ".";
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(out + "$", "is");
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return false;
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== undefined && nb !== undefined) return na === nb;
  return String(a) === String(b);
}

function compare(op: string, a: unknown, b: unknown): boolean {
  if (a === null || b === null) return false; // NULLs never satisfy a comparison
  const na = asNumber(a);
  const nb = asNumber(b);
  let cmp: number;
  if (na !== undefined && nb !== undefined) cmp = na < nb ? -1 : na > nb ? 1 : 0;
  else {
    const sa = String(a);
    const sb = String(b);
    cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  switch (op) {
    case "=": return cmp === 0;
    case "!=": return cmp !== 0;
    case "<": return cmp < 0;
    case "<=": return cmp <= 0;
    case ">": return cmp > 0;
    case ">=": return cmp >= 0;
    default: return false;
  }
}

/** Evaluate a WHERE/HAVING expression against a row. */
export function evalExpr(expr: Expr, row: DataRow): boolean {
  switch (expr.type) {
    case "or": return evalExpr(expr.left, row) || evalExpr(expr.right, row);
    case "and": return evalExpr(expr.left, row) && evalExpr(expr.right, row);
    case "not": return !evalExpr(expr.expr, row);
    case "compare": return compare(expr.op, operandValue(expr.left, row), operandValue(expr.right, row));
    case "like": {
      const v = operandValue(expr.left, row);
      const match = v === null ? false : likeToRegex(expr.pattern).test(String(v));
      return expr.negate ? !match : match;
    }
    case "in": {
      const v = operandValue(expr.left, row);
      const found = v !== null && expr.values.some((cand) => looseEquals(v, cand));
      return expr.negate ? !found : found;
    }
    case "isnull": {
      const v = operandValue(expr.left, row);
      const isNull = v === null;
      return expr.negate ? !isNull : isNull;
    }
  }
}

// ---- aggregates ----

function aggregateKey(item: Extract<SelectItem, { kind: "aggregate" }>): string {
  if (item.alias) return item.alias;
  const inner = item.arg === "*" ? "*" : item.arg;
  return `${item.fn.toUpperCase()}(${item.distinct ? "DISTINCT " : ""}${inner})`;
}

function computeAggregate(item: Extract<SelectItem, { kind: "aggregate" }>, rows: DataRow[]): unknown {
  const fn: AggregateFn = item.fn;
  if (fn === "count") {
    if (item.arg === "*") return rows.length;
    let values = rows.map((r) => getCell(r, item.arg)).filter((v) => v !== null);
    if (item.distinct) values = [...new Map(values.map((v) => [String(v), v])).values()];
    return values.length;
  }
  let values = rows.map((r) => getCell(r, item.arg)).filter((v) => v !== null);
  if (item.distinct) values = [...new Map(values.map((v) => [String(v), v])).values()];
  if (values.length === 0) return null;

  if (fn === "sum" || fn === "avg") {
    let sum = 0;
    let count = 0;
    for (const v of values) {
      const n = asNumber(v);
      if (n === undefined) throw new SqlError(`${fn.toUpperCase()}(${item.arg}) needs numeric values, got '${String(v)}'`);
      sum += n; count++;
    }
    if (count === 0) return null;
    return fn === "sum" ? sum : sum / count;
  }

  // MIN / MAX — numeric when every value is numeric, else lexicographic
  const nums = values.map(asNumber);
  const allNumeric = nums.every((n) => n !== undefined);
  if (allNumeric) {
    let best = nums[0]!;
    for (const n of nums) if (fn === "min" ? n! < best : n! > best) best = n!;
    return best;
  }
  let best = String(values[0]);
  for (const v of values) {
    const s = String(v);
    if (fn === "min" ? s < best : s > best) best = s;
  }
  return best;
}

function hasAggregate(columns: SelectItem[]): boolean {
  return columns.some((c) => c.kind === "aggregate");
}

// ---- projection ----

function projectRow(columns: SelectItem[], row: DataRow): DataRow {
  const out: DataRow = {};
  for (const item of columns) {
    if (item.kind === "star") {
      for (const [k, v] of Object.entries(row)) out[k] = v;
    } else if (item.kind === "column") {
      out[item.alias ?? item.name] = getCell(row, item.name);
    } else {
      // aggregate in a non-grouped, non-aggregate projection shouldn't happen here
      out[aggregateKey(item)] = getCell(row, item.arg === "*" ? "*" : item.arg);
    }
  }
  return out;
}

function projectGroup(columns: SelectItem[], groupRows: DataRow[], sample: DataRow): DataRow {
  const out: DataRow = {};
  for (const item of columns) {
    if (item.kind === "star") {
      for (const [k, v] of Object.entries(sample)) out[k] = v;
    } else if (item.kind === "column") {
      out[item.alias ?? item.name] = getCell(sample, item.name);
    } else {
      out[aggregateKey(item)] = computeAggregate(item, groupRows);
    }
  }
  return out;
}

// ---- ordering ----

/**
 * Order rows. `fallbacks[i]` (when given) is the source row for `rows[i]`, so
 * ORDER BY can reference a source column that isn't in the projected output.
 */
function orderRows(rows: DataRow[], stmt: SelectStatement, fallbacks?: DataRow[]): DataRow[] {
  if (stmt.orderBy.length === 0) return rows;
  const lookup = (row: DataRow, fb: DataRow | undefined, col: string): unknown => {
    const v = getCell(row, col);
    if (v !== null || !fb) return v;
    return getCell(fb, col);
  };
  const decorated = rows.map((row, idx) => ({ row, idx, fb: fallbacks?.[idx] }));
  decorated.sort((a, b) => {
    for (const o of stmt.orderBy) {
      const av = lookup(a.row, a.fb, o.column);
      const bv = lookup(b.row, b.fb, o.column);
      let cmp: number;
      if (av === null && bv === null) cmp = 0;
      else if (av === null) cmp = -1;
      else if (bv === null) cmp = 1;
      else {
        const na = asNumber(av);
        const nb = asNumber(bv);
        if (na !== undefined && nb !== undefined) cmp = na < nb ? -1 : na > nb ? 1 : 0;
        else {
          const sa = String(av);
          const sb = String(bv);
          cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
        }
      }
      if (cmp !== 0) return o.dir === "desc" ? -cmp : cmp;
    }
    return a.idx - b.idx; // stable
  });
  return decorated.map((d) => d.row);
}

function distinctRows(rows: DataRow[]): DataRow[] {
  const seen = new Set<string>();
  const out: DataRow[] = [];
  for (const r of rows) {
    const key = JSON.stringify(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : 1)));
    if (!seen.has(key)) { seen.add(key); out.push(r); }
  }
  return out;
}

/** Run a parsed statement against already-loaded rows. Pure — no file access. */
export function evaluate(stmt: SelectStatement, rows: DataRow[]): DataRow[] {
  // WHERE
  const working = stmt.where ? rows.filter((r) => evalExpr(stmt.where!, r)) : rows.slice();

  let result: DataRow[];
  let fallbacks: DataRow[] | undefined;

  if (stmt.groupBy.length > 0 || hasAggregate(stmt.columns)) {
    // group
    const groups = new Map<string, DataRow[]>();
    const order: string[] = [];
    if (stmt.groupBy.length > 0) {
      for (const row of working) {
        const key = JSON.stringify(stmt.groupBy.map((g) => {
          const v = getCell(row, g);
          return v === null ? null : String(v);
        }));
        let bucket = groups.get(key);
        if (!bucket) { bucket = []; groups.set(key, bucket); order.push(key); }
        bucket.push(row);
      }
    } else {
      // whole-table aggregate → single group (even when empty)
      groups.set("__all__", working);
      order.push("__all__");
    }
    result = order.map((key) => {
      const groupRows = groups.get(key)!;
      const sample = groupRows[0] ?? {};
      return projectGroup(stmt.columns, groupRows, sample);
    });
    // HAVING — evaluate against the projected group row
    if (stmt.having) result = result.filter((r) => evalExpr(stmt.having!, r));
  } else {
    result = working.map((r) => projectRow(stmt.columns, r));
    fallbacks = working; // ORDER BY may reference a source column not selected
  }

  // ORDER BY before DISTINCT so it can see source columns; DISTINCT keeps order.
  result = orderRows(result, stmt, fallbacks);
  if (stmt.distinct) result = distinctRows(result);

  // OFFSET / LIMIT
  const offset = stmt.offset ?? 0;
  if (offset > 0) result = result.slice(offset);
  if (stmt.limit !== undefined) result = result.slice(0, stmt.limit);

  return result;
}

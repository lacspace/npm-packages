/**
 * The evaluator: runs a parsed {@link SelectStatement} against an in-memory
 * array of rows. Read-only. Column names match row keys case-insensitively.
 *
 * v0.2.0: rows may be *combined* rows from a JOIN whose keys are qualified
 * (`alias.col`). A {@link SelectContext} describes the tables in scope so that
 * bare and qualified column references, and `*` / `alias.*`, resolve correctly.
 * Single-table evaluation (no context) behaves exactly as in v0.1.0.
 */
import { SqlError } from "./tokenize.js";
import type { DataRow } from "lacspace-scraper";
import type { AggregateFn, Expr, SelectItem, SelectStatement, ValueExpr } from "./parse.js";
import { describeExpr } from "./parse.js";

// ---- value helpers ----

function normalize(v: unknown): unknown {
  if (v === undefined || v === "") return null;
  return v;
}

/** Case-insensitive cell lookup over a row's own keys. Returns null when absent/empty. */
function getCell(row: DataRow, name: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, name)) return normalize(row[name]);
  const lower = name.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) return normalize(row[k]);
  }
  return null;
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

// ---- column resolution / context ----

/** Metadata for one table in scope: its alias and its column names. */
export interface TableMeta {
  alias: string;
  columns: string[];
}

/** Describes the tables backing a set of rows (empty/absent ⇒ single bare table). */
export interface SelectContext {
  tables?: TableMeta[];
}

/** A row accessor: reads a (bare or qualified) column name from a row. */
export type Getter = (row: DataRow, name: string) => unknown;

function splitQualified(name: string): { alias: string; col: string } | null {
  const dot = name.indexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return { alias: name.slice(0, dot), col: name.slice(dot + 1) };
}

/** Build the column getter for a context. Qualified when the context has tables. */
export function makeGetter(ctx?: SelectContext): Getter {
  const tables = ctx?.tables;
  if (!tables || tables.length === 0) return getCell;

  const aliasSet = new Set(tables.map((t) => t.alias.toLowerCase()));
  return (row: DataRow, name: string): unknown => {
    const q = splitQualified(name);
    if (q && aliasSet.has(q.alias.toLowerCase())) {
      return getCell(row, `${q.alias}.${q.col}`);
    }
    // bare name: find the table(s) that own this column
    const lower = name.toLowerCase();
    const owners = tables.filter((t) => t.columns.some((c) => c.toLowerCase() === lower));
    if (owners.length > 1) {
      throw new SqlError(`Column '${name}' is ambiguous — qualify it as ${owners.map((t) => `${t.alias}.${name}`).join(" or ")}`);
    }
    if (owners.length === 1) return getCell(row, `${owners[0]!.alias}.${name}`);
    // fall back to a direct key hit (e.g. a computed/output column)
    return getCell(row, name);
  };
}

// ---- LIKE ----

/** SQL `LIKE` → RegExp. `%` = any run, `_` = one char, `ESCAPE c` escapes the next. Case-insensitive. */
function likeToRegex(pattern: string, escape?: string): RegExp {
  const esc = escape && escape.length > 0 ? escape[0] : undefined;
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (esc && ch === esc && i + 1 < pattern.length) {
      out += pattern[++i]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      continue;
    }
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

function compareValues(a: unknown, b: unknown): number {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== undefined && nb !== undefined) return na < nb ? -1 : na > nb ? 1 : 0;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function compare(op: string, a: unknown, b: unknown): boolean {
  if (a === null || b === null) return false; // NULLs never satisfy a comparison
  const cmp = compareValues(a, b);
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

// ---- scalar functions ----

function toStr(v: unknown): string {
  return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
}

function numArg(fn: string, v: unknown): number | null {
  if (v === null) return null;
  const n = asNumber(v);
  if (n === undefined) throw new SqlError(`${fn.toUpperCase()}() needs a numeric argument, got '${toStr(v)}'`);
  return n;
}

function callFunc(name: string, args: unknown[]): unknown {
  const arg = (i: number): unknown => args[i] ?? null;
  switch (name) {
    case "upper": return arg(0) === null ? null : toStr(arg(0)).toUpperCase();
    case "lower": return arg(0) === null ? null : toStr(arg(0)).toLowerCase();
    case "trim": return arg(0) === null ? null : toStr(arg(0)).trim();
    case "length": return arg(0) === null ? null : toStr(arg(0)).length;
    case "substr":
    case "substring": {
      if (arg(0) === null) return null;
      const s = toStr(arg(0));
      let start = Math.trunc(numArg(name, arg(1)) ?? 1);
      if (start < 0) start = Math.max(s.length + start, 0); else start = Math.max(start - 1, 0);
      if (args.length >= 3) {
        const len = Math.trunc(numArg(name, arg(2)) ?? 0);
        return s.slice(start, start + Math.max(len, 0));
      }
      return s.slice(start);
    }
    case "replace": {
      if (arg(0) === null) return null;
      return toStr(arg(0)).split(toStr(arg(1))).join(toStr(arg(2)));
    }
    case "concat": return args.map(toStr).join("");
    case "coalesce": {
      for (const a of args) if (a !== null && a !== undefined) return a;
      return null;
    }
    case "round": {
      const x = numArg(name, arg(0));
      if (x === null) return null;
      const d = args.length >= 2 ? Math.trunc(numArg(name, arg(1)) ?? 0) : 0;
      const f = Math.pow(10, d);
      return Math.round(x * f) / f;
    }
    case "abs": { const x = numArg(name, arg(0)); return x === null ? null : Math.abs(x); }
    case "floor": { const x = numArg(name, arg(0)); return x === null ? null : Math.floor(x); }
    case "ceil":
    case "ceiling": { const x = numArg(name, arg(0)); return x === null ? null : Math.ceil(x); }
    case "mod": {
      const a = numArg(name, arg(0));
      const b = numArg(name, arg(1));
      if (a === null || b === null || b === 0) return null;
      return a % b;
    }
    default:
      throw new SqlError(`Unknown function '${name}'`);
  }
}

function arith(op: string, a: unknown, b: unknown): unknown {
  if (a === null || b === null) return null;
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na === undefined || nb === undefined) {
    throw new SqlError(`Arithmetic '${op}' needs numbers, got '${toStr(a)}' and '${toStr(b)}'`);
  }
  switch (op) {
    case "+": return na + nb;
    case "-": return na - nb;
    case "*": return na * nb;
    case "/": return nb === 0 ? null : na / nb;
    case "%": return nb === 0 ? null : na % nb;
    default: return null;
  }
}

// ---- expression evaluation ----

/** Evaluate a scalar value expression against a row. `groupRows` enables aggregates. */
export function evalValue(expr: ValueExpr, row: DataRow, get: Getter = getCell, groupRows?: DataRow[]): unknown {
  switch (expr.kind) {
    case "column": return get(row, expr.name);
    case "literal": return expr.value;
    case "unary": {
      const v = evalValue(expr.expr, row, get, groupRows);
      if (v === null) return null;
      const n = asNumber(v);
      if (n === undefined) throw new SqlError(`Unary '${expr.op}' needs a number, got '${toStr(v)}'`);
      return expr.op === "-" ? -n : n;
    }
    case "binary":
      return arith(expr.op, evalValue(expr.left, row, get, groupRows), evalValue(expr.right, row, get, groupRows));
    case "func":
      return callFunc(expr.name, expr.args.map((a) => evalValue(a, row, get, groupRows)));
    case "case": {
      for (const b of expr.branches) {
        if (evalExpr(b.when, row, get, groupRows)) return evalValue(b.then, row, get, groupRows);
      }
      return expr.else ? evalValue(expr.else, row, get, groupRows) : null;
    }
    case "aggregate": {
      if (!groupRows) throw new SqlError(`Aggregate ${expr.fn.toUpperCase()}() is not allowed here`);
      return computeAggregate(expr.fn, expr.arg, expr.distinct ?? false, groupRows, get);
    }
  }
}

/** Evaluate a WHERE/HAVING/ON expression against a row. */
export function evalExpr(expr: Expr, row: DataRow, get: Getter = getCell, groupRows?: DataRow[]): boolean {
  switch (expr.type) {
    case "or": return evalExpr(expr.left, row, get, groupRows) || evalExpr(expr.right, row, get, groupRows);
    case "and": return evalExpr(expr.left, row, get, groupRows) && evalExpr(expr.right, row, get, groupRows);
    case "not": return !evalExpr(expr.expr, row, get, groupRows);
    case "compare":
      return compare(expr.op, evalValue(expr.left, row, get, groupRows), evalValue(expr.right, row, get, groupRows));
    case "like": {
      const v = evalValue(expr.left, row, get, groupRows);
      const match = v === null ? false : likeToRegex(expr.pattern, expr.escape).test(String(v));
      return expr.negate ? !match : match;
    }
    case "in": {
      const v = evalValue(expr.left, row, get, groupRows);
      const found = v !== null && expr.values.some((cand) => looseEquals(v, cand));
      return expr.negate ? !found : found;
    }
    case "between": {
      const v = evalValue(expr.left, row, get, groupRows);
      const lo = evalValue(expr.lo, row, get, groupRows);
      const hi = evalValue(expr.hi, row, get, groupRows);
      const inRange = v !== null && compare(">=", v, lo) && compare("<=", v, hi);
      return expr.negate ? !inRange : inRange;
    }
    case "isnull": {
      const v = evalValue(expr.left, row, get, groupRows);
      const isNull = v === null;
      return expr.negate ? !isNull : isNull;
    }
  }
}

// ---- aggregates ----

function computeAggregate(
  fn: AggregateFn,
  arg: "*" | ValueExpr,
  distinct: boolean,
  rows: DataRow[],
  get: Getter,
): unknown {
  if (fn === "count" && arg === "*") return rows.length;
  const raw = arg === "*" ? rows.map(() => 1) : rows.map((r) => evalValue(arg, r, get));
  let values = raw.filter((v) => v !== null);
  if (distinct) values = [...new Map(values.map((v) => [String(v), v])).values()];

  if (fn === "count") return values.length;
  if (values.length === 0) return null;

  if (fn === "sum" || fn === "avg") {
    let sum = 0;
    let count = 0;
    for (const v of values) {
      const n = asNumber(v);
      if (n === undefined) throw new SqlError(`${fn.toUpperCase()} needs numeric values, got '${toStr(v)}'`);
      sum += n; count++;
    }
    if (count === 0) return null;
    return fn === "sum" ? sum : sum / count;
  }

  // MIN / MAX — numeric when every value is numeric, else lexicographic
  const nums = values.map(asNumber);
  if (nums.every((n) => n !== undefined)) {
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

function aggregateItemKey(item: Extract<SelectItem, { kind: "aggregate" }>): string {
  if (item.alias) return item.alias;
  const inner = item.arg;
  return `${item.fn.toUpperCase()}(${item.distinct ? "DISTINCT " : ""}${inner})`;
}

function exprHasAggregate(e: ValueExpr): boolean {
  switch (e.kind) {
    case "aggregate": return true;
    case "unary": return exprHasAggregate(e.expr);
    case "binary": return exprHasAggregate(e.left) || exprHasAggregate(e.right);
    case "func": return e.args.some(exprHasAggregate);
    case "case": return e.branches.some((b) => exprHasAggregate(b.then)) || (e.else ? exprHasAggregate(e.else) : false);
    default: return false;
  }
}

function itemIsAggregate(item: SelectItem): boolean {
  if (item.kind === "aggregate") return true;
  if (item.kind === "expr") return exprHasAggregate(item.expr);
  return false;
}

function hasAggregate(columns: SelectItem[]): boolean {
  return columns.some(itemIsAggregate);
}

// ---- projection ----

function exprKey(item: Extract<SelectItem, { kind: "expr" }>): string {
  return item.alias ?? describeExpr(item.expr);
}

/** Output key for a bare column reference: strips a known `alias.` qualifier for display. */
function columnKey(name: string, ctx: SelectContext | undefined): string {
  const tables = ctx?.tables;
  if (!tables || tables.length === 0) return name;
  const q = splitQualified(name);
  if (q && tables.some((t) => t.alias.toLowerCase() === q.alias.toLowerCase())) return q.col;
  return name;
}

/** Expand `*` / `alias.*` into output cells on `out`. */
function expandStar(item: Extract<SelectItem, { kind: "star" }>, row: DataRow, ctx: SelectContext | undefined, get: Getter, out: DataRow): void {
  const tables = ctx?.tables;
  if (!tables || tables.length === 0) {
    // legacy single table: copy the row's own cells
    for (const [k, v] of Object.entries(row)) out[k] = v;
    return;
  }
  if (item.table) {
    const meta = tables.find((t) => t.alias.toLowerCase() === item.table!.toLowerCase());
    if (!meta) throw new SqlError(`Unknown table '${item.table}' in ${item.table}.*`);
    for (const col of meta.columns) out[col] = get(row, `${meta.alias}.${col}`);
    return;
  }
  // `*` across all tables: bare names when unique, else qualified
  const counts = new Map<string, number>();
  for (const t of tables) for (const c of t.columns) counts.set(c.toLowerCase(), (counts.get(c.toLowerCase()) ?? 0) + 1);
  for (const t of tables) {
    for (const col of t.columns) {
      const key = (counts.get(col.toLowerCase()) ?? 0) > 1 ? `${t.alias}.${col}` : col;
      out[key] = get(row, `${t.alias}.${col}`);
    }
  }
}

function projectRow(columns: SelectItem[], row: DataRow, ctx: SelectContext | undefined, get: Getter): DataRow {
  const out: DataRow = {};
  for (const item of columns) {
    if (item.kind === "star") expandStar(item, row, ctx, get, out);
    else if (item.kind === "column") out[item.alias ?? columnKey(item.name, ctx)] = get(row, item.name);
    else if (item.kind === "expr") out[exprKey(item)] = evalValue(item.expr, row, get);
    else out[aggregateItemKey(item)] = get(row, typeof item.arg === "string" ? item.arg : ""); // aggregate w/o GROUP handled elsewhere
  }
  return out;
}

function projectGroup(columns: SelectItem[], groupRows: DataRow[], sample: DataRow, ctx: SelectContext | undefined, get: Getter): DataRow {
  const out: DataRow = {};
  for (const item of columns) {
    if (item.kind === "star") expandStar(item, sample, ctx, get, out);
    else if (item.kind === "column") out[item.alias ?? columnKey(item.name, ctx)] = get(sample, item.name);
    else if (item.kind === "expr") out[exprKey(item)] = evalValue(item.expr, sample, get, groupRows);
    else {
      const arg: "*" | ValueExpr = item.arg === "*" ? "*" : (item.argExpr ?? { kind: "column", name: item.arg });
      out[aggregateItemKey(item)] = computeAggregate(item.fn, arg, item.distinct ?? false, groupRows, get);
    }
  }
  return out;
}

// ---- ordering ----

/**
 * Order rows. `fallbacks[i]` (when given) is the source row for `rows[i]`, so
 * ORDER BY can reference a source column that isn't in the projected output.
 */
function orderRows(
  rows: DataRow[],
  stmt: SelectStatement,
  fallbacks: DataRow[] | undefined,
  sourceGet: Getter,
): DataRow[] {
  if (stmt.orderBy.length === 0) return rows;
  const lookup = (row: DataRow, fb: DataRow | undefined, col: string): unknown => {
    const v = getCell(row, col); // projected output row keyed by output names
    if (v !== null || !fb) return v;
    return sourceGet(fb, col);
  };
  const decorated = rows.map((row, idx) => ({ row, idx, fb: fallbacks?.[idx] }));
  decorated.sort((a, b) => {
    for (const o of stmt.orderBy) {
      const av = lookup(a.row, a.fb, o.column);
      const bv = lookup(b.row, b.fb, o.column);
      if (av === null || bv === null) {
        if (av === null && bv === null) continue;
        if (o.nulls) {
          // explicit NULLS placement, independent of ASC/DESC
          const nullFirst = o.nulls === "first";
          if (av === null) return nullFirst ? -1 : 1;
          return nullFirst ? 1 : -1;
        }
        // legacy default: NULLs sort low (before ASC negation by dir)
        const cmp = av === null ? -1 : 1;
        return o.dir === "desc" ? -cmp : cmp;
      }
      const cmp = compareValues(av, bv);
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

// ---- driver ----

/** Run a parsed SELECT against already-loaded rows, with an optional table context. */
export function evaluateSelect(stmt: SelectStatement, rows: DataRow[], ctx?: SelectContext): DataRow[] {
  const get = makeGetter(ctx);

  // WHERE
  const working = stmt.where ? rows.filter((r) => evalExpr(stmt.where!, r, get)) : rows.slice();

  let result: DataRow[];
  let fallbacks: DataRow[] | undefined;

  if (stmt.groupBy.length > 0 || hasAggregate(stmt.columns)) {
    const groups = new Map<string, DataRow[]>();
    const order: string[] = [];
    if (stmt.groupBy.length > 0) {
      for (const row of working) {
        const key = JSON.stringify(stmt.groupBy.map((g) => {
          const v = get(row, g);
          return v === null ? null : String(v);
        }));
        let bucket = groups.get(key);
        if (!bucket) { bucket = []; groups.set(key, bucket); order.push(key); }
        bucket.push(row);
      }
    } else {
      groups.set("__all__", working);
      order.push("__all__");
    }
    result = order.map((key) => {
      const groupRows = groups.get(key)!;
      const sample = groupRows[0] ?? {};
      return projectGroup(stmt.columns, groupRows, sample, ctx, get);
    });
    if (stmt.having) result = result.filter((r) => evalExpr(stmt.having!, r, getCell));
  } else {
    result = working.map((r) => projectRow(stmt.columns, r, ctx, get));
    fallbacks = working;
  }

  result = orderRows(result, stmt, fallbacks, get);
  if (stmt.distinct) result = distinctRows(result);

  const offset = stmt.offset ?? 0;
  if (offset > 0) result = result.slice(offset);
  if (stmt.limit !== undefined) result = result.slice(0, stmt.limit);

  return result;
}

/** Run a parsed statement against already-loaded rows. Pure — no file access. Single-table. */
export function evaluate(stmt: SelectStatement, rows: DataRow[]): DataRow[] {
  if (stmt.joins.length > 0) {
    throw new SqlError("This query joins multiple tables — use query() so the joined files can be loaded.");
  }
  return evaluateSelect(stmt, rows);
}

/**
 * Glue between the SQL engine and the filesystem. Uses lacspace-scraper's
 * file I/O (`readRows`) to load CSV / JSON / NDJSON / Excel into rows, then runs
 * the parsed query over them.
 *
 * v0.2.0 loads multiple tables for JOINs, unions glob-matched files, evaluates
 * UNION [ALL] across statements, and lets you bind named tables (e.g. piped
 * stdin) via `opts.tables` / `opts.preloaded`.
 */
import { readdirSync } from "node:fs";
import { dirname, basename, resolve as resolvePath } from "node:path";
import { readRows, columnsOf } from "lacspace-scraper";
import type { DataRow } from "lacspace-scraper";
import { parseSql, parseStatement } from "./parse.js";
import { evaluate, evaluateSelect, makeGetter, evalExpr } from "./evaluate.js";
import type { TableMeta } from "./evaluate.js";
import { SqlError } from "./tokenize.js";
import type { SelectStatement, Statement, TableRef } from "./parse.js";

export interface QueryOptions {
  /** The default table: bound to any bare table name in FROM. */
  file?: string;
  /** Bind specific bare table names (any case) to file paths. Takes priority over `file`. */
  tables?: Record<string, string>;
  /** Bind bare table names (any case) to already-loaded rows (e.g. piped stdin). Highest priority. */
  preloaded?: Record<string, DataRow[]>;
}

/** Run a parsed or string query against already-loaded rows. Pure, single-table (no JOIN/glob). */
export function runQuery(sql: string, rows: DataRow[]): DataRow[] {
  const stmt = parseStatement(sql);
  return runStatementInMemory(stmt, rows);
}

function runStatementInMemory(stmt: Statement, rows: DataRow[]): DataRow[] {
  if (stmt.type === "union") {
    const left = runStatementInMemory(stmt.left, rows);
    const right = runStatementInMemory(stmt.right, rows);
    const combined = unionRows(left, right);
    return stmt.all ? combined : uniqueRows(combined);
  }
  return evaluate(stmt, rows);
}

/** Resolve the file a single-table statement reads (kept for backward compatibility). */
export function resolveSource(stmt: SelectStatement, opts: QueryOptions = {}): string {
  const first = stmt.tables[0]!;
  if (first.source.kind === "path") return first.source.value;
  if (first.source.kind === "glob") {
    const files = globFiles(first.source.value);
    if (files.length === 0) throw new SqlError(`No files match "${first.source.value}"`);
    return files[0]!;
  }
  const bound = resolveBinding(first.source.value, opts);
  if (bound) return bound;
  throw new SqlError(
    `FROM "${first.source.value}" is a bare table name — pass a file with --file, or use a path in FROM (e.g. FROM ./${first.source.value}.csv).`,
  );
}

function resolveBinding(name: string, opts: QueryOptions): string | undefined {
  const lower = name.toLowerCase();
  if (opts.tables) {
    for (const [k, v] of Object.entries(opts.tables)) if (k.toLowerCase() === lower) return v;
  }
  return opts.file;
}

/** Parse, load whatever the query reads (files, globs, joined tables), and run it. */
export async function query(sql: string, opts: QueryOptions = {}): Promise<DataRow[]> {
  const stmt = parseStatement(sql);
  return executeStatement(stmt, opts);
}

async function executeStatement(stmt: Statement, opts: QueryOptions): Promise<DataRow[]> {
  if (stmt.type === "union") {
    const [left, right] = await Promise.all([
      executeStatement(stmt.left, opts),
      executeStatement(stmt.right, opts),
    ]);
    const combined = unionRows(left, right);
    return stmt.all ? combined : uniqueRows(combined);
  }
  return executeSelect(stmt, opts);
}

async function executeSelect(stmt: SelectStatement, opts: QueryOptions): Promise<DataRow[]> {
  // single table → legacy path (bare column resolution, unchanged output shape)
  if (stmt.joins.length === 0) {
    const rows = await loadTable(stmt.tables[0]!, opts);
    return evaluateSelect(stmt, rows);
  }

  // multi-table: build combined rows with qualified (`alias.col`) keys
  const metas: TableMeta[] = [];
  const firstRows = await loadTable(stmt.tables[0]!, opts);
  metas.push({ alias: stmt.tables[0]!.alias, columns: columnsOf(firstRows) });
  let combined: DataRow[] = firstRows.map((r) => qualify(stmt.tables[0]!.alias, r));

  for (const join of stmt.joins) {
    const rightRows = await loadTable(join.table, opts);
    metas.push({ alias: join.table.alias, columns: columnsOf(rightRows) });
    combined = joinCombine(combined, rightRows, join.table.alias, join.kind, join.on, metas);
  }

  return evaluateSelect(stmt, combined, { tables: metas });
}

/** Prefix a row's keys with `alias.` so joined tables never collide. */
function qualify(alias: string, row: DataRow): DataRow {
  const out: DataRow = {};
  for (const [k, v] of Object.entries(row)) out[`${alias}.${k}`] = v;
  return out;
}

function joinCombine(
  left: DataRow[],
  rightRows: DataRow[],
  rightAlias: string,
  kind: "inner" | "left" | "cross",
  on: SelectStatement["joins"][number]["on"],
  metas: TableMeta[],
): DataRow[] {
  const right = rightRows.map((r) => qualify(rightAlias, r));
  const out: DataRow[] = [];
  // an ON-getter that can see every table added so far, including the right one
  const get = makeGetter({ tables: metas });

  for (const lc of left) {
    let matched = 0;
    for (const rc of right) {
      const merged = { ...lc, ...rc };
      if (kind === "cross" || !on || evalExpr(on, merged, get)) {
        out.push(merged);
        matched++;
      }
    }
    if (matched === 0 && kind === "left") out.push({ ...lc }); // unmatched right side ⇒ nulls
  }
  return out;
}

/** Load a single table reference (path, glob-union, or a bound bare name) into rows. */
async function loadTable(ref: TableRef, opts: QueryOptions): Promise<DataRow[]> {
  if (ref.source.kind === "glob") {
    const files = globFiles(ref.source.value);
    if (files.length === 0) throw new SqlError(`No files match "${ref.source.value}"`);
    const parts = await Promise.all(files.map((f) => readSafe(f)));
    return parts.flat();
  }
  if (ref.source.kind === "path") return readSafe(ref.source.value);

  // bare name
  const name = ref.source.value;
  if (opts.preloaded) {
    for (const [k, v] of Object.entries(opts.preloaded)) if (k.toLowerCase() === name.toLowerCase()) return v;
  }
  const bound = resolveBinding(name, opts);
  if (!bound) {
    throw new SqlError(
      `FROM "${name}" is a bare table name — pass a file with --file / --stdin, or use a path in FROM (e.g. FROM ./${name}.csv).`,
    );
  }
  return readSafe(bound);
}

async function readSafe(file: string): Promise<DataRow[]> {
  try {
    return await readRows(file);
  } catch (err) {
    throw new SqlError(`Could not read "${file}": ${(err as Error).message}`);
  }
}

/** Every on-disk file a query reads (paths + glob matches + bound bare names), for `--watch`. */
export function statementFiles(sql: string, opts: QueryOptions = {}): string[] {
  const stmt = parseStatement(sql);
  const files: string[] = [];
  const visit = (s: Statement): void => {
    if (s.type === "union") { visit(s.left); visit(s.right); return; }
    for (const t of s.tables) {
      if (t.source.kind === "path") files.push(t.source.value);
      else if (t.source.kind === "glob") files.push(...globFiles(t.source.value));
      else { const b = resolveBinding(t.source.value, opts); if (b) files.push(b); }
    }
  };
  visit(stmt);
  return [...new Set(files.map((f) => resolvePath(f)))];
}

// ---- glob ----

/** Expand a single-level glob (`*`, `?`) in the filename against its directory. */
export function globFiles(pattern: string): string[] {
  const dir = dirname(pattern);
  const base = basename(pattern);
  const rx = new RegExp("^" + base.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => rx.test(n)).sort().map((n) => resolvePath(dir, n));
}

// ---- UNION helpers ----

/** Append `right`'s rows to `left`, aligning columns positionally (SQL UNION semantics). */
function unionRows(left: DataRow[], right: DataRow[]): DataRow[] {
  const targetCols = columnsOf(left.length > 0 ? left : right);
  const rightCols = columnsOf(right);
  const out = left.slice();
  for (const row of right) {
    const o: DataRow = {};
    targetCols.forEach((c, i) => {
      const src = rightCols[i];
      o[c] = src !== undefined ? (row[src] ?? null) : null;
    });
    out.push(o);
  }
  return out;
}

function uniqueRows(rows: DataRow[]): DataRow[] {
  const seen = new Set<string>();
  const out: DataRow[] = [];
  for (const r of rows) {
    const key = JSON.stringify(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : 1)));
    if (!seen.has(key)) { seen.add(key); out.push(r); }
  }
  return out;
}

// re-export for convenience / backward compatibility
export { parseSql };

/**
 * Glue between the SQL engine and the filesystem. Uses lacspace-scraper's
 * file I/O (`readRows`) to load CSV / JSON / NDJSON / Excel into rows, then runs
 * the parsed query over them.
 */
import { readRows } from "lacspace-scraper";
import type { DataRow } from "lacspace-scraper";
import { parseSql } from "./parse.js";
import { evaluate } from "./evaluate.js";
import { SqlError } from "./tokenize.js";
import type { SelectStatement } from "./parse.js";

export interface QueryOptions {
  /** The default table: bound to any bare table name in FROM. */
  file?: string;
}

/** Run a parsed or string query against already-loaded rows. Pure. */
export function runQuery(sql: string, rows: DataRow[]): DataRow[] {
  const stmt = parseSql(sql);
  return evaluate(stmt, rows);
}

/** Resolve the file a statement reads, honouring `opts.file` for bare names. */
export function resolveSource(stmt: SelectStatement, opts: QueryOptions = {}): string {
  if (stmt.from.kind === "path") return stmt.from.value;
  // bare table name → must be bound with --file
  if (!opts.file) {
    throw new SqlError(
      `FROM "${stmt.from.value}" is a bare table name — pass a file with --file, or use a path in FROM (e.g. FROM ./${stmt.from.value}.csv).`,
    );
  }
  return opts.file;
}

/** Parse, load the file named in FROM (or bound via `opts.file`), and run. */
export async function query(sql: string, opts: QueryOptions = {}): Promise<DataRow[]> {
  const stmt = parseSql(sql);
  const source = resolveSource(stmt, opts);
  let rows: DataRow[];
  try {
    rows = await readRows(source);
  } catch (err) {
    throw new SqlError(`Could not read "${source}": ${(err as Error).message}`);
  }
  return evaluate(stmt, rows);
}

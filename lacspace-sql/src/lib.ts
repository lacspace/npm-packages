/**
 * lacspace-sql — run SQL over your CSV, JSON, NDJSON and Excel files. A tiny,
 * read-only, in-memory SQL engine: `SELECT` (with `*`, aliases, `DISTINCT`),
 * `WHERE` (`=` `!=` `<` `<=` `>` `>=` `LIKE` `IN` `IS NULL`, `AND`/`OR`/`NOT`,
 * parentheses), `GROUP BY` with `COUNT`/`SUM`/`AVG`/`MIN`/`MAX`, `ORDER BY` and
 * `LIMIT`/`OFFSET`. No database, no API keys. Built on the lacspace-scraper file
 * engine, so it reads and writes JSON, NDJSON, CSV and Excel both ways.
 *
 * ```ts
 * import { query, runQuery } from "lacspace-sql";
 *
 * // Straight from a file:
 * const top = await query("SELECT name, city FROM ./leads.csv WHERE city = 'Kathmandu' ORDER BY name LIMIT 10");
 *
 * // Or over rows you already have in memory:
 * const rows = [{ city: "A", n: 3 }, { city: "A", n: 5 }, { city: "B", n: 1 }];
 * const byCity = runQuery("SELECT city, SUM(n) AS total FROM t GROUP BY city", rows);
 * ```
 *
 * v0.2.0 adds JOINs (INNER / LEFT / cross), qualified columns and table
 * aliases, scalar/arithmetic expressions and CASE, BETWEEN / NOT IN /
 * LIKE … ESCAPE, UNION [ALL], glob FROM, and multi-key ORDER BY … NULLS
 * FIRST|LAST — all backward compatible. Read-only, still single-file per table.
 */
export { query, runQuery, resolveSource, globFiles, type QueryOptions } from "./run.js";
export { parseSql, parseStatement, deriveAlias, describeExpr } from "./parse.js";
export {
  evaluate,
  evaluateSelect,
  evalExpr,
  evalValue,
  makeGetter,
  type SelectContext,
  type TableMeta,
  type Getter,
} from "./evaluate.js";
export { toMarkdown, cellText, type MarkdownOptions } from "./format.js";
export { tokenize, SqlError } from "./tokenize.js";
export type { Token, TokenType } from "./tokenize.js";
export type {
  Statement,
  SelectStatement,
  SelectItem,
  Operand,
  ValueExpr,
  Expr,
  OrderItem,
  AggregateFn,
  TableRef,
  TableSource,
  JoinClause,
} from "./parse.js";
export type { DataRow } from "lacspace-scraper";

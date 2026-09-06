# lacspace-sql

**Run SQL over your CSV, JSON, NDJSON and Excel files** — `SELECT`, `JOIN`, expressions, `WHERE`, `GROUP BY`, aggregates, `UNION` — **no database, no API keys.** A tiny, read-only, in-memory SQL engine that treats a data file as a table. Built on the [lacspace-scraper](https://www.npmjs.com/package/lacspace-scraper) file engine, so it reads *and* writes JSON, NDJSON, CSV and Excel both ways.

> **New in v0.2.0:** `JOIN` (INNER / LEFT / cross) with table aliases and qualified columns, arithmetic + scalar functions + `CASE` in `SELECT`/`WHERE`, `BETWEEN` / `NOT IN` / `NOT LIKE` / `LIKE … ESCAPE`, `UNION [ALL]`, glob `FROM` (union many files), piped `--stdin`, Markdown output, `--watch`, and `ORDER BY … NULLS FIRST|LAST`. All 100% backward compatible.

```bash
npx lacspace-sql "SELECT city, COUNT(*) AS n FROM ./leads.csv GROUP BY city ORDER BY n DESC"
```

```
  city       n  avg_rev
  ─────────  ─  ─────────
  Kathmandu  3  106.67
  Lalitpur   1  95
  Pokhara    1  90

  3 rows
```

## Install

```bash
npm i -g lacspace-sql     # then: lacspace-sql "<query>"
# or, no install:
npx lacspace-sql "<query>"
```

Programmatic use: `npm i lacspace-sql`.

## The `FROM` clause

Point `FROM` straight at a **file path**, or bind a **bare table name** with `--file`:

```bash
# file path in the query (quote it if it has spaces)
lacspace-sql "SELECT * FROM ./leads.csv LIMIT 5"
lacspace-sql "SELECT * FROM 'my data.xlsx' WHERE region = 'APAC'"

# bare table name bound to a file
lacspace-sql "SELECT * FROM t WHERE age >= 30" --file ./leads.csv
```

The format is inferred from the extension: `.csv` / `.tsv`, `.json`, `.ndjson` / `.jsonl`, `.xlsx` / `.xls`.

You can also **union a glob** of same-shaped files, or pipe a table in on **stdin**:

```bash
# every daily export, unioned into one table (quote the glob so `*` isn't the multiply operator)
lacspace-sql "SELECT city, COUNT(*) AS n FROM './exports/*.csv' GROUP BY city"

# read the table from a pipe — bound to the table name `stdin`
cat leads.csv | lacspace-sql "SELECT * FROM stdin WHERE city = 'Kathmandu'" --stdin csv
```

## JOINs

Join a second (or third, …) file. Give each table an **alias** and reference columns as `alias.col`:

```bash
# INNER join CSV × JSON on a key, with a computed column
lacspace-sql "SELECT u.name, o.amount, o.qty * o.price AS total
              FROM users.csv u JOIN orders.json o ON u.id = o.user_id
              ORDER BY total DESC"

# LEFT join keeps every left row (unmatched right columns become NULL)
lacspace-sql "SELECT u.name, o.amount FROM users.csv u LEFT JOIN orders.json o ON u.id = o.user_id"

# comma = cross join
lacspace-sql "SELECT * FROM sizes.csv, colors.csv"
```

`INNER`, `LEFT` and cross (comma) joins are supported. In a `SELECT *` across joined tables, columns keep bare names when unique and become `alias.col` on a clash.

## Expressions, functions & CASE

Anywhere a value is expected (SELECT list, WHERE, HAVING, ON):

```bash
lacspace-sql "SELECT
  UPPER(name)                                   AS name,
  ROUND(revenue / months, 2)                    AS monthly,
  CASE WHEN revenue >= 1000 THEN 'A'
       WHEN revenue >= 500  THEN 'B'
       ELSE 'C' END                             AS grade
  FROM ./leads.csv
  WHERE revenue % 2 = 0 AND LENGTH(name) > 3"
```

- **Arithmetic:** `+` `-` `*` `/` `%` with the usual precedence and parentheses.
- **String:** `UPPER`, `LOWER`, `TRIM`, `LENGTH`, `SUBSTR(s, start[, len])` (1-based), `REPLACE`, `CONCAT`, `COALESCE`.
- **Numeric:** `ROUND(x[, d])`, `ABS`, `FLOOR`, `CEIL`, `MOD(a, b)`.
- **`CASE WHEN … THEN … [ELSE …] END`** — first matching branch wins; no match and no `ELSE` → `NULL`.
- Aggregates may wrap expressions: `SUM(price * qty)`, `ROUND(AVG(salary), 2)`.

## UNION

```bash
lacspace-sql "SELECT name FROM q1.csv UNION SELECT name FROM q2.csv ORDER BY name"
lacspace-sql "SELECT name FROM q1.csv UNION ALL SELECT name FROM q2.csv"
```

`UNION` combines two queries by **position** and removes duplicate rows; `UNION ALL` keeps them.

## Examples

```bash
# Filter + sort + limit, pretty table (default output)
lacspace-sql "SELECT name, city FROM ./leads.csv WHERE city LIKE 'K%' ORDER BY name LIMIT 10"

# Aggregate the whole table
lacspace-sql "SELECT COUNT(*) AS rows, AVG(revenue) AS avg_rev, MAX(revenue) AS top FROM ./leads.csv"

# Group + having, most-common first
lacspace-sql "SELECT city, COUNT(*) AS n FROM ./leads.csv GROUP BY city HAVING n > 2 ORDER BY n DESC"

# Complex WHERE with AND/OR/NOT, parentheses, IN and IS NULL
lacspace-sql "SELECT * FROM data.json WHERE (dept = 'eng' AND age < 30) OR city IN ('Pokhara','Lalitpur') AND manager IS NOT NULL"

# Convert while you query: JSON in, CSV out
lacspace-sql "SELECT name, email FROM contacts.json WHERE email IS NOT NULL" -f csv -o contacts.csv

# Join two files and roll up per user, as Markdown
lacspace-sql "SELECT u.name, SUM(o.amount) AS spent
              FROM users.csv u JOIN orders.json o ON u.id = o.user_id
              GROUP BY u.name HAVING spent > 100 ORDER BY spent DESC" -f md
```

## What's supported

| Clause | Supported |
| --- | --- |
| `SELECT` | `*`, `alias.*`, `col`, `expr AS alias`, `DISTINCT`, arithmetic, scalar functions, `CASE` |
| Aggregates | `COUNT(*)`, `COUNT(col)`, `COUNT(DISTINCT col)`, `SUM`, `AVG`, `MIN`, `MAX` — over columns or expressions |
| `FROM` | a file path, a bare name (+ `--file` / `--stdin`), a quoted glob (unions files) |
| `JOIN` | `[INNER] JOIN … ON …`, `LEFT JOIN … ON …`, cross join (comma), with table aliases + qualified `alias.col` |
| `WHERE` | `=` `!=` `<>` `<` `<=` `>` `>=`, `LIKE [ESCAPE]`, `IN`, `BETWEEN … AND …`, `IS [NOT] NULL`, `NOT IN` / `NOT LIKE` / `NOT BETWEEN`, `AND` / `OR` / `NOT`, parentheses, expressions on either side |
| `GROUP BY` | one or more columns, with the aggregates above |
| `HAVING` | filter groups (reference aggregates by their `AS` alias) |
| `ORDER BY` | `col [ASC|DESC] [NULLS FIRST|LAST][, …]` (multi-key) |
| `LIMIT` / `OFFSET` | `LIMIT n [OFFSET m]`, or a bare `OFFSET m` |
| `UNION` | `UNION` (distinct) / `UNION ALL`, combined by column position |

Column names match your file's headers **case-insensitively**. Comparisons are **numeric when both sides look like numbers** (so `WHERE age > 30` works even when a CSV loads everything as strings), otherwise lexicographic. `NULL` (missing / empty cells) never satisfies a comparison, matching SQL.

## CLI options

| Option | Meaning |
| --- | --- |
| `--file <path>` | Bind a bare table name in `FROM` to this file |
| `-f, --format <fmt>` | Output format: `table` (default) · `json` · `ndjson` · `csv` · `md` |
| `--no-header` | Omit the header row (applies to `table`, `md` and `csv`) |
| `-o, --out <file>` | Write output to a file instead of stdout |
| `--stdin <fmt>` | Read the table from piped stdin (`csv` \| `json` \| `ndjson`) |
| `--stdin-table <name>` | Table name the stdin data is bound to (default `stdin`) |
| `--watch` | Re-run the query whenever a source file changes; reprints the result (Ctrl-C to stop) |
| `-h, --help` | Show help |
| `-v, --version` | Print the version |

Default output is a **pretty aligned table** with a row-count footer (printed to stderr, so it won't pollute piped data). `-f json|ndjson|csv|md` serializes the result set to stdout, or to `-o <file>`. `-f md` produces a GitHub-flavoured Markdown table — handy for pasting into a PR or a doc.

```bash
# live dashboard: re-runs every time leads.csv is saved
lacspace-sql "SELECT city, COUNT(*) AS n FROM ./leads.csv GROUP BY city ORDER BY n DESC" --watch
```

## Library

```ts
import { query, runQuery, parseSql } from "lacspace-sql";

// Load a file and query it:
const top = await query(
  "SELECT name, revenue FROM ./leads.csv WHERE revenue >= 100 ORDER BY revenue DESC",
);

// Run against rows you already have in memory (pure, no I/O):
const rows = [
  { city: "A", n: 3 },
  { city: "A", n: 5 },
  { city: "B", n: 1 },
];
const byCity = runQuery("SELECT city, SUM(n) AS total FROM t GROUP BY city", rows);
// → [ { city: "A", total: 8 }, { city: "B", total: 1 } ]

// Join files, or bind a table by name / preloaded rows:
const joined = await query(
  "SELECT u.name, o.amount FROM users.csv u JOIN orders.json o ON u.id = o.user_id",
);
const bound = await query("SELECT * FROM feed", { preloaded: { feed: myRows } });

// Inspect the AST for advanced use:
const ast = parseSql("SELECT * FROM ./x.csv WHERE a > 1 LIMIT 10");
```

```js
// CommonJS
const { runQuery } = require("lacspace-sql");
```

### API

| Export | Signature |
| --- | --- |
| `query(sql, opts?)` | `(sql: string, opts?: QueryOptions) => Promise<DataRow[]>` — parse, load every file/glob/joined table (or bound name), run |
| `runQuery(sql, rows)` | `(sql: string, rows: DataRow[]) => DataRow[]` — pure: run against already-loaded rows (single table; `UNION` over the same rows is fine) |
| `parseSql(sql)` | `(sql: string) => SelectStatement` — the typed AST for a single `SELECT` |
| `parseStatement(sql)` | `(sql: string) => Statement` — AST including `UNION` chains |
| `evaluate(stmt, rows)` | `(stmt: SelectStatement, rows: DataRow[]) => DataRow[]` — single table |
| `evaluateSelect(stmt, rows, ctx?)` | run a `SELECT` against rows with an optional multi-table `SelectContext` |
| `evalExpr(expr, row, get?, groupRows?)` | evaluate a boolean `Expr` against a row |
| `evalValue(expr, row, get?, groupRows?)` | evaluate a scalar `ValueExpr` against a row |
| `makeGetter(ctx?)` | build the column accessor for a `SelectContext` |
| `toMarkdown(rows, opts?)` | `(rows: DataRow[], opts?: { noHeader?: boolean }) => string` — GFM table |
| `globFiles(pattern)` | `(pattern: string) => string[]` — expand a single-level glob |
| `tokenize(sql)` | `(sql: string) => Token[]` |
| `SqlError` | error class with an optional `.pos` (source index) |
| `QueryOptions` | `{ file?: string; tables?: Record<string,string>; preloaded?: Record<string,DataRow[]> }` |
| types | `DataRow`, `Statement`, `SelectStatement`, `SelectItem`, `Expr`, `ValueExpr`, `Operand`, `OrderItem`, `AggregateFn`, `TableRef`, `TableSource`, `JoinClause`, `SelectContext`, `TableMeta`, `Token` |

`query()` binds tables three ways, in priority order: `opts.preloaded[name]` (in-memory rows) → `opts.tables[name]` (a file path) → `opts.file` (the catch-all). Bare table names in `FROM` and `JOIN` resolve through the same rules, which is how `--stdin` and `--file` work under the hood.

## How it works

A classic three-stage pipeline: a **tokenizer** turns the query into tokens (with source positions for error messages), a **recursive-descent parser** builds a typed AST, and an **evaluator** runs it over rows in memory. File reading and writing is delegated to `lacspace-scraper` (`readRows` / `serializeRows`), which handles JSON, NDJSON, CSV and Excel in both directions. Everything happens in your process — nothing is uploaded, and there's no database to install.

## Limitations (v0.2.0)

- **Read-only** — no `INSERT` / `UPDATE` / `DELETE` / `CREATE`.
- **No subqueries** and no window functions.
- **One file per table.** A single table reads a single file (or a glob-union of same-shaped files). Joins load each side into memory (a nested-loop join), so they're for the millions-of-rows-and-under range, not billion-row warehouses.
- **Qualified `alias.col` references are a JOIN feature.** In a single-table query, use the bare column name.
- **Globs must be quoted** — `FROM './data/*.csv'` — because an unquoted `*` is the multiply operator. Subtraction and division need spaces around the operator (`price - qty`, `price / qty`), since `-` and `/` are legal inside identifiers and file paths.
- **`runQuery()` is single-table** (it takes one rows array); use `query()` for JOINs, globs and file-backed `UNION`.
- `HAVING` references aggregates by their `AS` alias (e.g. `... COUNT(*) AS n ... HAVING n > 2`).
- `--watch` watches files by path via `fs.watch`; it can't watch a stdin pipe.

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).

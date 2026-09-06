# lacspace-sql

**Run SQL over your CSV, JSON, NDJSON and Excel files** — `SELECT`, `WHERE`, `ORDER BY`, `GROUP BY`, aggregates — **no database, no API keys.** A tiny, read-only, in-memory SQL engine that treats a data file as a table. Built on the [lacspace-scraper](https://www.npmjs.com/package/lacspace-scraper) file engine, so it reads *and* writes JSON, NDJSON, CSV and Excel both ways.

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
```

## What's supported

| Clause | Supported |
| --- | --- |
| `SELECT` | `*`, `col`, `col AS alias`, `DISTINCT` |
| Aggregates | `COUNT(*)`, `COUNT(col)`, `COUNT(DISTINCT col)`, `SUM`, `AVG`, `MIN`, `MAX` |
| `WHERE` | `=` `!=` `<>` `<` `<=` `>` `>=`, `LIKE` (`%`/`_`, case-insensitive), `IN (…)`, `IS [NOT] NULL`, `AND` / `OR` / `NOT`, parentheses |
| `GROUP BY` | one or more columns, with the aggregates above |
| `HAVING` | filter groups (reference aggregates by their `AS` alias) |
| `ORDER BY` | `col [ASC|DESC][, …]` |
| `LIMIT` / `OFFSET` | `LIMIT n [OFFSET m]`, or a bare `OFFSET m` |

Column names match your file's headers **case-insensitively**. Comparisons are **numeric when both sides look like numbers** (so `WHERE age > 30` works even when a CSV loads everything as strings), otherwise lexicographic. `NULL` (missing / empty cells) never satisfies a comparison, matching SQL.

## CLI options

| Option | Meaning |
| --- | --- |
| `--file <path>` | Bind a bare table name in `FROM` to this file |
| `-f, --format <fmt>` | Output format: `table` (default) · `json` · `ndjson` · `csv` |
| `-o, --out <file>` | Write output to a file instead of stdout |
| `-h, --help` | Show help |
| `-v, --version` | Print the version |

Default output is a **pretty aligned table** with a row-count footer (printed to stderr, so it won't pollute piped data). `-f json|ndjson|csv` serializes the result set to stdout, or to `-o <file>`.

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
| `query(sql, opts?)` | `(sql: string, opts?: { file?: string }) => Promise<DataRow[]>` — parse, load the file named in `FROM` (or `opts.file`), run |
| `runQuery(sql, rows)` | `(sql: string, rows: DataRow[]) => DataRow[]` — pure: run against already-loaded rows |
| `parseSql(sql)` | `(sql: string) => SelectStatement` — the typed AST |
| `evaluate(stmt, rows)` | `(stmt: SelectStatement, rows: DataRow[]) => DataRow[]` |
| `tokenize(sql)` | `(sql: string) => Token[]` |
| `SqlError` | error class with an optional `.pos` (source index) |
| types | `DataRow`, `SelectStatement`, `SelectItem`, `Expr`, `Operand`, `OrderItem`, `AggregateFn`, `Token` |

## How it works

A classic three-stage pipeline: a **tokenizer** turns the query into tokens (with source positions for error messages), a **recursive-descent parser** builds a typed AST, and an **evaluator** runs it over rows in memory. File reading and writing is delegated to `lacspace-scraper` (`readRows` / `serializeRows`), which handles JSON, NDJSON, CSV and Excel in both directions. Everything happens in your process — nothing is uploaded, and there's no database to install.

## Limitations (v0.1.0)

- **Single table only** — no `JOIN`, `UNION` or subqueries.
- **Read-only** — no `INSERT` / `UPDATE` / `DELETE` / `CREATE`.
- No scalar/window functions or arithmetic expressions (`price * qty`) in the SELECT list yet.
- `HAVING` references aggregates by their `AS` alias (e.g. `... COUNT(*) AS n ... HAVING n > 2`).
- The whole file is loaded into memory, so it's built for the millions-of-rows-and-under range, not billion-row warehouses.

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).

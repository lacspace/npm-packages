# @lacspace/convert

The **data-conversion hub** of the Lacspace Sheets Kit — read tabular or structured data in any of ten formats, reshape it, and write it back out in any other. JSON · NDJSON · CSV · TSV · XLSX · YAML · TOML · Markdown · HTML · SQL. Format sniffing, conservative type inference, flatten/unflatten, column select/rename, a streaming row iterator. No external dependencies (only the sibling `@lacspace/csv` and `@lacspace/xlsx`), isomorphic, TypeScript-first.

One call in, one call out — the format in between is always plain `Table[]`.

```bash
npm i @lacspace/convert
```

## Quick start

```ts
import { convert } from "@lacspace/convert";

// csv → json (format sniffed, types inferred)
await convert("id,name,born\n1,Ada,1815-12-10", { to: "json" });
// [{ "id": 1, "name": "Ada", "born": "1815-12-10" }]

// json → xlsx (Uint8Array, one sheet per table, real Date cells)
const bytes = await convert(JSON.stringify(rows), { to: "xlsx" });

// xlsx → sql, one sheet only, two columns, with DDL
await convert(bytes, { to: "sql", sheet: "Orders", columns: ["id", "total"], ddl: true });
// CREATE TABLE "Orders" ("id" INTEGER, "total" REAL);
// INSERT INTO "Orders" ("id", "total") VALUES (1, 9.5);

// nested json → flat csv, and back again
await convert(nested, { to: "csv", flatten: true });   // address.city, items.0.sku …
await convert(flatCsv, { to: "json", unflatten: true });
```

`convert` returns a `Uint8Array` for `to: "xlsx"` and a string for everything else. Input can be a string, bytes, or already-parsed `Row[]` / `Table[]`.

## The model

Everything normalises to tables:

```ts
type Row   = Record<string, unknown>;
type Table = { name?: string; rows: Row[] };   // a workbook is Table[]
```

| Source | Becomes |
|---|---|
| xlsx | one table per sheet (named) |
| json / yaml / toml | array of objects → one table · object of row-arrays → one table per key · single object → one row |
| ndjson | one table, one row per line |
| csv / tsv | one table, header row → keys, types inferred |
| html | one table per `<table>` (headers from `<th>` or the first row, name from `<caption>` / `id`) |
| markdown | one table per pipe table (name from the heading above it) |
| sql | one table per `INSERT INTO` target (columns from the statement or a `CREATE TABLE`) |

## Detection

```ts
import { detect } from "@lacspace/convert";

detect('[{"a":1}]');                 // "json"
detect('{"a":1}\n{"a":2}');          // "ndjson"
detect("a,b\n1,2");                  // "csv"
detect("a\tb\n1\t2");                // "tsv"
detect("- id: 1\n  name: Ada");      // "yaml"
detect('[server]\nport = 8080');     // "toml"
detect("| a |\n|---|\n| 1 |");       // "markdown"
detect("<table>…</table>");          // "html"
detect('INSERT INTO "t" …');         // "sql"
detect(xlsxBytes);                   // "xlsx" (PK zip magic)
detect("");                          // null — pass `from` explicitly
```

Order: xlsx → json → ndjson → html → markdown → sql → toml → yaml → csv/tsv (by delimiter count on the first lines).

## Parse and serialize separately

```ts
import { parseInput, serialize } from "@lacspace/convert";

const tables = await parseInput(csvText);            // Table[] (format sniffed)
const tables = await parseInput(bytes, "xlsx");
const md   = await serialize(tables, "markdown");
const xlsx = await serialize(tables, "xlsx");        // Uint8Array
```

Output rules per format:

- **json** — single table → array; multiple → `{ [name]: rows }`. `pretty` (default `true`) controls indentation.
- **ndjson** — one object per line; with multiple tables each line gets a `_table` field.
- **csv / tsv** — header row, `\n` line endings (`eol` to change), `escapeFormulas: true` by default so `=1+1` becomes `'=1+1` and never executes in a spreadsheet; `bom: true` prepends a UTF-8 BOM for Excel.
- **xlsx** — one sheet per table, columns in first-seen order, Date cells stay Dates with a `yyyy-mm-dd` / `yyyy-mm-dd hh:mm:ss` number format.
- **markdown** — GitHub pipe table, `|` escaped as `\|`, newlines as `<br>`, a `### name` heading when the table is named.
- **html** — `<table><thead><tr><th>…` with every value escaped; `pretty: false` for a single line.
- **sql** — `INSERT INTO "table" ("col", …) VALUES (…);` with `''`-escaped strings, `NULL` for null/undefined, `TRUE`/`FALSE`; `ddl: true` adds a `CREATE TABLE` with inferred `TEXT` / `INTEGER` / `REAL` / `BOOLEAN` / `TIMESTAMP` types. `tableName` names a nameless table (default `"data"`).
- **yaml / toml** — via the built-in codecs. TOML needs a top-level table, so a nameless table is written as `[[data]]`.

`dateFormat` picks how Dates print in text formats: `"iso"` (default, `2024-01-05` or a full timestamp), `"excel"` (serial day number) or `"keep"`.

## Transforms

`convert` runs these in order: `sheet` → `flatten` → `columns` → `rename` → `unflatten`.

```ts
await convert(src, { to: "csv", sheet: 1 });                        // by index or name
await convert(src, { to: "csv", columns: ["name", "id"] });         // select + reorder
await convert(src, { to: "csv", rename: { id: "ID" } });
await convert(src, { to: "xlsx", flatten: true });                  // address.city, items.0.sku
await convert(src, { to: "json", unflatten: true });                // dotted keys → nested objects
```

`flatten` / `unflatten` are exported on their own too. Keys that contain the delimiter are bracket-quoted (`["a.b"]`) so the trip is lossless; Dates and empty objects are kept as leaves; `__proto__`-style keys are refused.

## Type inference

Text formats (csv, tsv, html, markdown, sql) run `inferTypes` by default (`infer: false` to keep strings). It is deliberately conservative: a column is converted only when **every** non-blank cell agrees — all numbers, all `true`/`false`, or all ISO / `dd-mm-yyyy` dates. `"007"` and 16+ digit IDs stay strings; blanks in a converted column become `null`.

```ts
import { inferTypes, inferSchema } from "@lacspace/convert";

inferTypes([{ n: "1", ok: "true", at: "2024-01-05" }]);
// [{ n: 1, ok: true, at: Date }]

inferSchema(rows);
// [{ name: "id", type: "number", nullable: false, samples: [1, 2] }, …]
```

## Excel helpers

```ts
import { toExcel, fromExcel } from "@lacspace/convert";

const bytes = toExcel(rows);                          // sync, Uint8Array
const bytes = toExcel([{ name: "Users", rows }, { name: "Orders", rows: orders }]);
const tables = await fromExcel(bytes);                // Table[]
const users = await fromExcel(bytes, { sheet: "Users" }); // Row[]
```

## Streaming

`parseLines` is a generator — it never builds one giant array, so multi-hundred-megabyte csv / ndjson text is fine. Inference here is per cell (a streaming reader can't see the whole column).

```ts
import { parseLines } from "@lacspace/convert";

for (const row of parseLines(bigCsv, "csv")) enqueue(row);
for (const _ of parseLines(bigNdjson, "ndjson", (row, i) => enqueue(row)));
```

## API

| Export | What |
|---|---|
| `convert(input, options)` | detect → parse → transform → serialize. `Uint8Array` for xlsx, string otherwise. |
| `detect(input)` | Sniff the format of text or bytes, or `null`. |
| `parseInput(input, from?, opts?)` | Any input → `Table[]`. |
| `serialize(tables, to, opts?)` | `Table[]` → text or xlsx bytes. |
| `toExcel(rows \| tables, opts?)` / `fromExcel(bytes, { sheet? })` | Excel convenience wrappers. |
| `parseLines(text, "csv" \| "ndjson", onRow?)` | Lazy row generator. |
| `flatten(row, { delimiter? })` / `unflatten(row, { delimiter? })` / `parseFlatKey(key)` | Dot-path helpers. |
| `inferTypes(rows)` / `inferSchema(rows)` / `inferCell(v)` | Conservative type coercion and column schema. |
| `parseNumber` / `parseBoolean` / `parseDate` | The single-value coercers behind inference. |
| `transformTable(table, opts)` / `toTables(rowsOrTables)` / `tablesFromValue(value)` | The building blocks `convert` uses. |
| `parseYaml` / `stringifyYaml` / `parseToml` / `stringifyToml` | The built-in YAML and TOML codecs. |
| `dateToExcelSerial` / `excelSerialToDate` / `dateToIso` / `sniffDelimiter` | Small utilities. |
| `ConvertError`, `FORMATS` | Error class; the list of formats. |

Types: `Format`, `Row`, `Table`, `ConvertOptions`, `ParseOptions`, `SerializeOptions`, `ColumnSchema`, `ColumnType`, `DateFormat`, `FlattenOptions`, `ParseLinesOptions`.

## Limits worth knowing

- The YAML codec is a practical subset: no anchors/aliases, tags, merge keys or multi-document streams. The TOML codec keeps datetimes as strings and has no multi-line strings; TOML has no `null`, so nulls are written as `""`.
- The SQL reader understands `INSERT INTO … VALUES (…)[, (…)]` and `CREATE TABLE` column lists — not arbitrary SQL.
- The HTML reader is regex-based and expects well-formed `<table>` markup (no DOM required, works in Node).
- Detection is heuristic; when the input is ambiguous, pass `from`.

## Why

- **Zero external dependencies** — nothing to audit beyond the Lacspace kit itself.
- **Isomorphic** — identical API in Node, the browser, edge runtimes and workers.
- **Safe by default** — formula-injection escaping in csv, HTML escaping, prototype-pollution-guarded object building.
- **One shape** — every reader produces `Table[]`, every writer consumes it, so any pair of formats just works.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Part of the [@lacspace](https://developer.lacspace.com) developer platform.

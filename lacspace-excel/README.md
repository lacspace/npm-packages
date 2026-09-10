# lacspace-excel

**The Excel Swiss-army knife.** A keyless, zero-dependency CLI + typed library to **convert anything ⇄ `.xlsx`**, **add formula columns**, **inspect**, **dedupe**, **split** and **merge** spreadsheets, and **generate ready-to-fill business templates** — invoice, inventory, payroll, loan schedule, grade book and twelve more — with live formulas that recalculate in Excel, Numbers, LibreOffice and Google Sheets.

```bash
npx lacspace-excel convert orders.json -o orders.xlsx --flatten
# ✓ 1,204 rows → orders.xlsx (96.3 KB)

npx lacspace-excel template invoice -o invoice.xlsx
# ✓ Invoice template → invoice.xlsx (14.4 KB) · sheets: Invoice, Details
```

Everything runs locally. No API key, no account, no network, no telemetry — your data never leaves your machine. Built on the Lacspace Sheets Kit (`@lacspace/xlsx`, `@lacspace/csv`, `@lacspace/convert`, `@lacspace/formula`), which are themselves dependency-free.

## Why it exists

Getting data in and out of Excel from a terminal or a script usually means a 5 MB dependency, a Python detour, or hand-rolled CSV that breaks on the first comma. `lacspace-excel` gives you one small binary that reads and writes **ten formats** — JSON, NDJSON, CSV, TSV, XLSX, YAML, TOML, Markdown, HTML and SQL — understands nested objects (`--flatten` / `--unflatten`), infers column types, evaluates spreadsheet-style formulas over your rows (`--add "amount=qty*rate"`), and ships **17 business templates** as real workbooks with formulas, number formats, widths and totals rows already in place.

## Install

```bash
# one-off, no install
npx lacspace-excel convert data.csv -o data.xlsx

# or globally
npm i -g lacspace-excel

# or as a library
npm i lacspace-excel
```

Node 20 or newer.

## Quick start

```bash
# JSON → Excel (nested objects become dotted columns)
npx lacspace-excel convert orders.json -o orders.xlsx --flatten

# Excel → CSV, one sheet, to stdout
npx lacspace-excel convert report.xlsx --sheet Sales --to csv > sales.csv

# What's in this workbook?
npx lacspace-excel inspect report.xlsx

# Add computed columns, keep the format
npx lacspace-excel formula orders.csv --add "amount=qty*rate" --add "tax=ROUND(amount*0.13,2)" -o priced.xlsx

# A ready-to-fill payroll sheet with live formulas
npx lacspace-excel template payroll -o payroll.xlsx

# Clean a lead list
npx lacspace-excel dedupe leads.csv --by email -o clean.csv

# One workbook → one file per sheet, and back
npx lacspace-excel split report.xlsx --out-dir sheets --to csv
npx lacspace-excel merge sheets/*.csv -o report-rebuilt.xlsx

# Pipe in, pipe out
cat rows.ndjson | npx lacspace-excel convert --to markdown
```

## CLI

```
lacspace-excel <command> [input|-] [flags]
cat data.csv | lacspace-excel <command> [flags]
```

| Command | Purpose |
| --- | --- |
| `convert` | Convert between json · ndjson · csv · tsv · xlsx · yaml · toml · markdown · html · sql |
| `inspect` | Sheets, row counts, column types (with nullable flags) and sample rows |
| `formula` | Add computed columns with `--add "key=<formula>"` (chainable) |
| `template` | `list` the 17 templates, or generate one: `template <id> -o file.xlsx` |
| `dedupe` | Drop duplicate rows — by every column, or `--by a,b` (keeps the first) |
| `split` | One file per sheet of a workbook |
| `merge` | One sheet per input file, into a single workbook |
| `functions` | Formula function reference, grouped by category, or one function's details |

| Flag | Description |
| --- | --- |
| `-o, --out <file>` | Output file. **Required for xlsx.** The format defaults from its extension |
| `--from <fmt>` | Input format (defaults from the input extension, else sniffed) |
| `--to <fmt>` | Output format (defaults from `-o`, else `json`) |
| `--sheet <name\|index>` | Pick one sheet / table (0-based index or name) |
| `--columns a,b,c` | Keep only these columns, in this order |
| `--rename old=new,...` | Rename columns |
| `--flatten` | Nested objects → dotted columns (`address.city`, `items.0.sku`) |
| `--unflatten` | Dotted columns → nested objects |
| `--no-infer` | Keep csv/tsv/markdown cells as text (no number / boolean / date coercion) |
| `--table <name>` | Table / sheet name for nameless data (sql, toml, multi-sheet output) |
| `--ddl` | sql: emit `CREATE TABLE` before the `INSERT`s |
| `--pretty` | Pretty-print json / html |
| `--bom` | csv / tsv: prefix a UTF-8 BOM so Excel opens it as UTF-8 |
| `--add key=<formula>` | `formula`: a computed column (repeatable; later adds can reference earlier keys) |
| `--by a,b` | `dedupe`: key columns |
| `--out-dir <dir>` | `split`: destination directory (default `.`) |
| `--no-sample` | `template`: omit the sample rows |
| `--blank-rows <n>` | `template`: extra pre-formatted empty rows with formulas (default `20`) |
| `--currency-format <f>` | `template`: number format for currency columns (default `#,##0.00`) |
| `--json` | Machine-readable output (`inspect`, `template list`, `functions`) |
| `-h, --help` / `-v, --version` | Help / version |

Data goes to **stdout**, summaries and errors to **stderr**, so `lacspace-excel convert a.xlsx --to csv > a.csv` is clean. Every failure exits **1** with a one-line message. Input is `-` or omitted for stdin (bytes are sniffed — a piped `.xlsx` works too). Colours only when stdout is a TTY, and never when `NO_COLOR` is set.

### `convert`

```bash
lacspace-excel convert <input|-> [-o <out>] [--from <fmt>] [--to <fmt>] [--sheet <name|index>]
                       [--columns a,b,c] [--rename old=new,...] [--flatten] [--unflatten] [--no-infer]
                       [--table <name>] [--ddl] [--pretty] [--bom]
```

Transforms run in this order: `--sheet` → `--flatten` → `--columns` → `--rename` → `--unflatten`.

```bash
lacspace-excel convert users.json -o users.xlsx                         # one sheet, header row, dates typed
lacspace-excel convert users.xlsx --to json --sheet 0                   # first sheet → JSON array
lacspace-excel convert users.xlsx --to csv --columns id,email --bom     # Excel-friendly CSV subset
lacspace-excel convert users.csv --to sql --table users --ddl           # CREATE TABLE + INSERTs
lacspace-excel convert orders.json -o flat.csv --flatten                # customer.address.city columns
lacspace-excel convert flat.csv --to json --unflatten                   # …and back to nested objects
lacspace-excel convert config.toml --to yaml                            # any-to-any
lacspace-excel convert legacy.tsv --to markdown --rename usr_nm=name    # for a README or a PR
```

A JSON object whose values are all arrays of objects (`{ "orders": [...], "items": [...] }`) becomes a **multi-sheet** workbook, one sheet per key; multi-sheet input written to a text format is emitted as an object keyed by sheet name (json / yaml / toml), stacked blocks (csv / markdown / html) or a `_table` column (ndjson).

The summary on stderr looks like `✓ 3 rows → orders.xlsx (12.4 KB)`.

### `inspect`

```bash
lacspace-excel inspect <input|-> [--from <fmt>] [--sheet <name|index>] [--no-infer] [--json]
```

```
◆ Invoice · 26 rows × 8 columns
  Item         string  (nullable)
  Qty          number  (nullable)
  Amount       number
  Total        number
  sample:
  | Item | Qty | Amount | Total |
  | --- | --- | --- | --- |
  | Web design | 1 | 1800 | 2070 |
```

`--json` emits `{ format, tables: [{ name, rows, columns: [{ name, type, nullable, samples }], sample }] }` — handy for generating schemas or validating uploads in CI.

### `formula`

```bash
lacspace-excel formula <input|-> --add "key=<formula>" [--add ...] [-o <out>] [--to <fmt>] [--sheet ...]
```

Formulas use `@lacspace/formula` syntax — spreadsheet-style, column names instead of cell references, 100+ built-in functions, **no `eval`**. Rows are flattened first so nested fields are addressable as `customer.city`. Adds are evaluated in order, so a later column can use an earlier one; a bare column name inside an aggregate (`SUM(qty)`) sees the whole column.

```bash
lacspace-excel formula orders.csv \
  --add "amount=qty*rate" \
  --add "tax=ROUND(amount*0.13,2)" \
  --add "total=amount+tax" \
  --add 'tier=IF(total>1000,"A",IF(total>100,"B","C"))' \
  --add "share=ROUND(amount/SUM(amount),4)" \
  -o priced.xlsx
# ✓ 120 rows, +5 columns (amount, tax, total, tier, share) → priced.xlsx (18.2 KB)
```

Every formula is validated **before** the input is read; a syntax error exits 1 with the offending column and position: `✗ Invalid formula for "tax" at position 12: Unexpected token ")"`. Output defaults to the input's format for text inputs and to `json` for `.xlsx` (unless `-o` ends in `.xlsx`).

### `template`

```bash
lacspace-excel template list [--json]
lacspace-excel template <id> [-o <file.xlsx>] [--no-sample] [--blank-rows N] [--currency-format "<numFmt>"] [--to csv|json|...]
```

`template <id>` writes `<id>.xlsx` by default: bold frozen header, sensible widths, number formats for currency / percent / date columns, **live formulas** on every data row (sample rows plus `--blank-rows`, default 20) with cached values so the file looks right even in viewers that never recalculate, and a totals row (`SUM`, `AVERAGE`, …) where it makes sense. Pass `--to csv` (or json, markdown…) to get the sample rows with formula columns already computed instead of a workbook.

```bash
lacspace-excel template list
lacspace-excel template invoice -o invoice.xlsx
lacspace-excel template inventory -o stock.xlsx --no-sample --blank-rows 200
lacspace-excel template payroll -o payroll.xlsx --currency-format '"$"#,##0.00'
lacspace-excel template grade-book --to csv > grades.csv
```

### `dedupe`

```bash
lacspace-excel dedupe <input|-> [--by col,col] [-o <out>] [--to <fmt>]
```

Drops duplicate rows, keeping the first occurrence. Without `--by`, rows are compared on every column (key order does not matter; `null`, `undefined` and `""` count as the same blank); with `--by email` only those keys are compared. Prints `✓ removed 4 duplicates · 96 rows kept → clean.csv (5.1 KB)`.

### `split` and `merge`

```bash
lacspace-excel split <book.xlsx> [--out-dir <dir>] [--to csv|json|...]
lacspace-excel merge <file...> -o <book.xlsx>
```

`split` writes one file per sheet (default `.xlsx`, named after the sheet) into `--out-dir` and prints the file list on stdout — pipe it into `xargs`. `merge` reads any supported inputs (globs like `sheets/*.csv` are expanded) and writes one sheet per file, named after the file's basename without its extension; a multi-sheet input contributes `basename-sheet` sheets. Names are sanitized to Excel's rules (31 chars, no `[ ] : * ? / \`) and de-duplicated (`Orders`, `Orders (2)`).

```bash
lacspace-excel split quarterly.xlsx --out-dir q --to csv
# q/Jan.csv
# q/Feb.csv
# q/Mar.csv
lacspace-excel merge q/Jan.csv q/Feb.csv q/Mar.csv -o quarterly-rebuilt.xlsx
# ✓ 3 sheets, 1,410 rows → quarterly-rebuilt.xlsx (58.0 KB)
```

### `functions`

```bash
lacspace-excel functions [name] [--json]
```

The full formula reference grouped by category (math, statistics, logic, text, date, lookup, info), or one function's signature, description and example:

```
◆ SUMIF · math
  Signature    SUMIF(column, criterion, [sumColumn])
  Description  Sum the rows whose value matches a criterion like ">10" or "Foods".
  Example      =SUMIF(category, "Foods", price)  → 310
```

## The 17 templates

Realistic, country-neutral, currency-neutral sample data. Every formula column is a real Excel formula on every row; "chained" columns reference the previous row.

| id | What it is | Formula columns |
| --- | --- | --- |
| `invoice` | Line-item invoice + a Details sheet for parties and dates | `amount = qty*rate` · `tax = ROUND(amount*taxRate,2)` · `total = amount+tax` · totals row |
| `quotation` | Sales quote with per-line discounts + validity/terms sheet | `lineTotal = ROUND(qty*unitPrice*(1-discount),2)` · totals |
| `purchase-order` | PO lines with supplier and a received-vs-pending tracker | `amount = qty*unitCost` · `pending = qty-received` · totals |
| `inventory` | Stock register with reorder levels and stock value | `stockValue = inStock*unitCost` · `reorder = IF(inStock<=reorderLevel,"YES","")` · totals |
| `price-list` | Cost + markup → selling price and margin | `price = ROUND(cost*(1+markup),2)` · `margin = IF(price=0,0,(price-cost)/price)` |
| `customers` | Customer master with order count and lifetime value | `avgOrder = IF(orders=0,0,ROUND(lifetimeValue/orders,2))` · totals |
| `orders` | Order log with shipping and fulfilment status | `total = qty*unitPrice+shipping` · totals |
| `expenses` | Expense claims with tax and a reimbursable flag | `tax = ROUND(amount*taxRate,2)` · `total = amount+tax` · totals |
| `payroll` | Monthly payroll: basic, allowances, overtime, deductions | `overtime = ROUND(overtimeHours*overtimeRate,2)` · `gross = basic+allowances+overtime` · `deductions = ROUND(gross*deductionRate,2)` · `net = gross-deductions` · totals |
| `cashbook` | Inflows / outflows with a running balance | `net = inflow-outflow` · `balance` chained from the previous row · totals |
| `attendance` | Monthly attendance register per employee | `absent = workingDays-present-leave` · `attendanceRate = IF(workingDays=0,0,present/workingDays)` |
| `budget` | Planned vs actual by category | `variance = planned-actual` · `used = IF(planned=0,0,actual/planned)` · `status = IF(actual>planned,"Over","OK")` · totals |
| `sales-register` | Tax-ready sales register with payment mode | `tax = ROUND(taxable*taxRate,2)` · `total = taxable+tax` · totals |
| `timesheet` | Hours by project / task with billable flag | `amount = IF(billable,ROUND(hours*rate,2),0)` · totals |
| `project-tracker` | Tasks with owner, priority, progress and effort | `remaining = MAX(estimateHours-spentHours,0)` · `status = IF(progress>=1,"Done",IF(spentHours>estimateHours,"Over budget","On track"))` |
| `loan-schedule` | EMI amortisation schedule, period by period | `interest = ROUND(opening*rate/12,2)` · `principal = payment-interest` · `closing = opening-principal` · `opening` chained from the previous closing · totals |
| `grade-book` | Marks per subject with total, percentage and letter grade | `total = maths+science+english+history` · `percentage = total/400` · `grade = IF(percentage>=0.9,"A",IF(…"B",…"C",…"D","F"))` |

Templates are plain data (`TEMPLATES` is exported): columns, sample rows, footer totals. Build your own `Template` object and hand it to `buildTemplate()`.

## Library API

```ts
import {
  convertData, inspectData, addFormulaColumns, dedupeRows, splitWorkbook, mergeTables,
  functionReference, formatFromPath, formatFromExtension,
  listTemplates, getTemplate, buildTemplate, templateToTables, TEMPLATES,
} from "lacspace-excel";
```

```ts
// convert — detect → parse → reshape → serialize
const { output, rows, bytes } = await convertData(jsonText, { to: "xlsx", flatten: true });
await fs.writeFile("orders.xlsx", output);                       // Uint8Array for xlsx
const csv = await convertData(xlsxBytes, { to: "csv", sheet: "Orders", columns: ["id", "total"] });
csv.output;                                                      // string for text formats

// inspect
const report = await inspectData(csvText, "csv");
report.tables[0].columns;   // [{ name: "qty", type: "number", nullable: false, samples: [2, 1, 4] }, …]

// formula columns (throws FormulaColumnError with .position on a bad formula)
const priced = addFormulaColumns(rows, [
  { key: "amount", formula: "=qty*rate" },
  { key: "tax", formula: "=ROUND(amount*0.13,2)" },
]);

// templates
const bytes = buildTemplate("invoice", { blankRows: 50, currencyFormat: '"€"#,##0.00' });
const tables = templateToTables("payroll");                      // sample rows with formulas computed

// dedupe / split / merge
const { rows: unique, removed } = dedupeRows(rows, ["email"]);
const sheets = await splitWorkbook(bytes);                       // [{ name, rows }, …]
const book = mergeTables([{ name: "Jan", rows: jan }, { name: "Feb", rows: feb }]);  // Uint8Array

// reference
functionReference();          // [{ category: "math", functions: [FunctionDoc, …] }, …]
functionReference("SUMIF");   // { name, category, signature, description, example, result }
```

| Export | Signature |
| --- | --- |
| `convertData` | `(input: string \| Uint8Array \| Row[] \| Table[], opts?: ConvertDataOptions) => Promise<ConvertResult>` — `{ output, format, from, rows, tables, bytes }` |
| `inspectData` | `(input, from?, { samples?, infer?, sheet? }) => Promise<InspectReport>` |
| `addFormulaColumns` | `(rows: Row[], adds: { key, formula }[]) => Row[]` — new rows, input untouched; throws `FormulaColumnError` |
| `parseFormulaAdd` / `validateFormulaAdds` | `"key=formula"` → `{ key, formula }` · validate a batch up front |
| `dedupeRows` | `(rows, by?: string[]) => { rows, removed }` |
| `splitWorkbook` | `(bytes, { infer? }) => Promise<{ name, rows }[]>` |
| `mergeTables` | `({ name?, rows }[]) => Uint8Array` — sheet names sanitized + de-duplicated |
| `functionReference` | `() => FunctionGroup[]` · `(name) => FunctionDoc \| undefined` |
| `formatFromPath` / `formatFromExtension` | `"out/a.xlsx"` / `".yml"` → `Format \| undefined` |
| `listTemplates` / `getTemplate` | catalogue `{ id, name, description, category }[]` · one `Template` |
| `buildTemplate` | `(id \| Template, { sample?, blankRows?, currencyFormat? }) => Uint8Array` |
| `templateToTables` | `(id \| Template) => { name, rows }[]` — sample rows with formula columns computed |
| `toExcelFormula` | `(formula, columns, row) => string \| undefined` — `@lacspace/formula` → A1 Excel formula |
| `loadTables` / `reshapeTables` / `sanitizeSheetName` / `uniqueSheetNames` / `formatBytes` | building blocks used by the CLI |

`Format` is `"json" | "ndjson" | "csv" | "tsv" | "xlsx" | "yaml" | "toml" | "markdown" | "html" | "sql"`. Types (`Row`, `Table`, `ColumnSchema`, `Template`, `TemplateColumn`, `FunctionDoc`, `InspectReport`, …) are exported too. Fully typed, dual ESM + CJS. The library never touches the file system — read and write bytes yourself, so it drops into a server route or a serverless function as easily as a script.

## Sheets Kit

`lacspace-excel` is the CLI face of the Lacspace **Sheets Kit** — four zero-dependency, isomorphic packages you can use directly:

| Package | What it does |
| --- | --- |
| [`@lacspace/xlsx`](https://www.npmjs.com/package/@lacspace/xlsx) | Write and read `.xlsx` workbooks — sheets, columns, number formats, widths, frozen headers, real formulas with cached values. No zip library, no DOM |
| [`@lacspace/csv`](https://www.npmjs.com/package/@lacspace/csv) | RFC 4180 CSV / TSV parse and stringify, delimiter sniffing, streaming, formula-injection escaping |
| [`@lacspace/convert`](https://www.npmjs.com/package/@lacspace/convert) | The ten-format conversion hub: detect, parse to `Table[]`, flatten / unflatten, infer types, serialize |
| [`@lacspace/formula`](https://www.npmjs.com/package/@lacspace/formula) | Spreadsheet-style formulas over rows and columns — 100+ functions, `compile` / `check` / `computeColumn`, no `eval` |

## Security

- **No `eval`, ever.** Formulas are parsed by `@lacspace/formula`'s hand-written tokenizer and evaluator; a formula can only read the row's columns and call the built-in functions.
- **Formula-injection safe CSV / TSV.** Cells starting with `=`, `+`, `-` or `@` are prefixed with `'` on write (default in `@lacspace/convert`), so a malicious `=HYPERLINK(...)` in your data never executes when someone opens the export in Excel.
- **SQL output is quoted and escaped** — identifiers in double quotes, string literals with `'` doubled, no interpolation of raw values.
- **Prototype-pollution guarded.** Column keys such as `__proto__`, `constructor` and `prototype` are refused when reading data, renaming columns or adding formula columns.
- **Local only.** No network, no telemetry, no temp files beyond what you ask to write.

## Limitations (honest)

- `.xlsx` only — no legacy `.xls`, no `.ods`. Reading covers cell values, shared strings, dates and formula cached values; styles, charts, images and merged-cell metadata are not round-tripped.
- Formulas in templates are translated to A1 references for the row-scoped functions Excel and `@lacspace/formula` agree on (`IF`, `ROUND`, `MAX`, `MIN`, `ABS`, `AND`, `OR`, `MOD`, `POWER`, …); a column that uses an aggregate (`SUM(qty)`) is written as a plain value with its computed result.
- `formula` evaluates over the **flattened** rows, so its output keys are dotted (`customer.city`) — add `--unflatten` on a following `convert` if you need nesting back.
- YAML and TOML support is the practical subset provided by `@lacspace/convert` (no anchors, tags or multi-document streams).

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use, permissive, Lacspace-branded.

---

Part of the free [Lacspace developer tools](https://developer.lacspace.com/tools). Built keyless, local-first and zero-dependency.

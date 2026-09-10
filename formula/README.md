# @lacspace/formula

A **safe spreadsheet formula engine** — parse and evaluate Excel-style formulas over rows and columns with **no `eval`, no `new Function`, no dependencies**. 110+ functions (maths, statistics, logic, text, dates, lookups), isomorphic (Node, browser, edge), TypeScript-first, and every function ships its own reference entry.

It is the engine behind **LUMIFORM**, the editable grid inside Lacspace's ERPs, extracted for everyone.

```bash
npm i @lacspace/formula
```

## Quick start

```ts
import { compile, run, computeColumn } from "@lacspace/formula";

const rows = [
  { item: "Shirt",  qty: 2, rate: 850,  cost: 600 },
  { item: "Jacket", qty: 1, rate: 2400, cost: 1900 },
  { item: "Scarf",  qty: 5, rate: 450,  cost: 300 },
];

// One formula, evaluated down a whole table:
computeColumn("=qty * rate", rows);                 // [1700, 2400, 2250]
computeColumn("=(rate - cost) / rate * 100", rows); // margins, per row
computeColumn("=rate / SUM(rate) * 100", rows);     // share of the column total

// Or compile once and evaluate against any scope:
const margin = compile("=IF(rate = 0, 0, (rate - cost) / rate * 100)");
margin({ field: (n) => rows[0][n], column: (n) => rows.map((r) => r[n]) }); // 29.4…
```

## The language

- **Bare names read the current row** — `price * 2`, `[Sale Price] - cost` (brackets allow spaces).
- **Aggregates read a whole column** — `SUM(price)`, `AVERAGE(qty)`, `COUNTIF(category, "Foods")`, `LOOKUP(id, sku, name)`.
- Operators: `+ - * / ^ &` (text join), comparisons `= <> < <= > >=`, unary `-`, postfix `%` (`10%` → 0.1).
- Literals: numbers (`1e3`, `.5`), `"text"` (`""` escapes a quote), `TRUE` / `FALSE`.
- A leading `=` is optional. Division by zero yields empty (`null`), never `Infinity`.

## Functions (110+)

| Category | Functions |
|---|---|
| Maths | SUM · PRODUCT · SUMPRODUCT · ROUND · ROUNDUP · ROUNDDOWN · FLOOR · CEILING · INT · TRUNC · ABS · SIGN · EVEN · ODD · POWER · SQRT · EXP · LN · LOG · LOG10 · PI · MOD |
| Statistics | AVERAGE · MIN · MAX · COUNT · COUNTA · COUNTBLANK · MEDIAN · STDEV · VAR · LARGE · SMALL · RANK · SUMIF · COUNTIF · AVERAGEIF · SUMIFS · COUNTIFS · AVERAGEIFS · MAXIFS · MINIFS |
| Logic | IF · IFS · IFERROR · SWITCH · CHOOSE · AND · OR · XOR · NOT · TRUE · FALSE |
| Info | ISBLANK · ISNUMBER · ISTEXT · ISLOGICAL · ISEVEN · ISODD |
| Text | CONCAT · CONCATENATE · TEXTJOIN · UPPER · LOWER · PROPER · TRIM · CLEAN · LEN · LEFT · RIGHT · MID · SUBSTITUTE · REPLACE · REPT · FIND · SEARCH · EXACT · CHAR · CODE · TEXT · VALUE · NUMBERVALUE · STARTSWITH · ENDSWITH · CONTAINS |
| Dates | TODAY · NOW · DATE · DATEVALUE · YEAR · MONTH · DAY · WEEKDAY · DAYS · EDATE · EOMONTH · DATEDIF · NETWORKDAYS |
| Lookup | LOOKUP · XLOOKUP · MATCH · INDEX |

Criteria accept `">10"`, `"<>x"`, `"Foods"` and wildcards (`"F*"`, `"?airy"`). `TEXT` understands `"0.00"`, `"#,##0"`, `"0%"`, `"yyyy-mm-dd"`, `"dd/mm/yyyy"`, `"mmm yyyy"`.

## Reference metadata — build your own docs and autocomplete

```ts
import { FUNCTION_DOCS, describeFunction, FUNCTION_NAMES } from "@lacspace/formula";

describeFunction("sumif");
// { name: "SUMIF", category: "math", signature: "SUMIF(column, criterion, [sumColumn])",
//   description: "Sum the rows whose value matches…", example: '=SUMIF(category, "Foods", price)', result: "310" }
```

## Validate as the user types

```ts
import { check, references } from "@lacspace/formula";

check("=1+2 3");        // { ok: false, error: 'Unexpected "3"', position: 4 }
references("=qty*rate"); // ["qty", "rate"] — great for dependency tracking
```

## Extend it

```ts
import { registerFunction } from "@lacspace/formula";

registerFunction("VAT", ([amount, rate]) => Number(amount) * (Number(rate ?? 13) / 100), {
  category: "math", signature: "VAT(amount, [rate])", description: "VAT on an amount.", example: "=VAT(1000)", result: "130",
});
// columnArgs: [0] marks argument positions that should read a whole column
```

## Security

A formula resolves names **only** through the scope you provide — `=constructor`, `=__proto__`, `=window` are just unknown fields. Functions come from a whitelist; `=alert(1)` is an unknown function, not a call. The test suite scans this package's source and fails if dynamic code execution ever appears. Combine with injection-safe CSV/XLSX export from `@lacspace/convert` for a fully safe pipeline.

## API

| Export | What |
|---|---|
| `compile(source)` | Parse once → `(scope) => value`, with `.references` and `.source`. Throws `FormulaError`. |
| `run(source, scope)` | One-off evaluate; `null` on any error. |
| `check(source)` | `{ ok: true }` or `{ ok: false, error, position }`. |
| `references(source)` | Column names the formula reads. |
| `computeColumn(source, rows)` | One value per row of a table. |
| `tableScope(rows, index, cache?)` | Build a `Scope` over a row of a table. |
| `registerFunction(name, fn, doc?)` | Add or override a function (+ docs, column-scoped args). |
| `FUNCTIONS` · `FUNCTION_NAMES` · `FUNCTION_DOCS` · `describeFunction(name)` · `AGGREGATES` | The registry and its reference. |
| `toNumber` · `toText` · `toBoolean` · `matches` | The coercion rules the engine uses, exposed. |

Roadmap: A1 cell references and ranges (`A1:B5`) with a dependency graph, for true spreadsheet mode.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Part of the [@lacspace](https://developer.lacspace.com) developer platform · Sheets Kit.

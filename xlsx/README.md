<div align="center">

# @lacspace/xlsx

**Read and write real Excel (.xlsx) files with zero dependencies — no SheetJS, no exceljs, no headless browser.**

[![npm version](https://img.shields.io/npm/v/@lacspace/xlsx?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/xlsx)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/xlsx?label=minzip)](https://bundlephobia.com/package/@lacspace/xlsx)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/xlsx)
[![license](https://img.shields.io/npm/l/@lacspace/xlsx?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> "Export to Excel" for any dashboard — without the weight. A `.xlsx` file is just a ZIP of a few XML parts, so this builds the bytes directly (the same trick as [`@lacspace/pdf`](https://www.npmjs.com/package/@lacspace/pdf)). The incumbents are large and Node-centric; this is tiny and runs on Node, edge and the browser.

> **New in 1.2.0** — built-in **CSV ↔ XLSX** conversion (`csvToXlsx` / `xlsxToCsv`, plus `parseCsv` / `csvToAoa` / `aoaToCsv`) and **per-column number formats** (`numFmt` on a `Column`, e.g. `"$#,##0.00"` or `"yyyy-mm-dd"`). Fully additive — every existing export is unchanged.

- 📊 **Write** — objects → a sheet (headers from keys or explicit columns), or array-of-arrays
- 📥 **Read** — parse real Excel exports back to JSON / grids, DEFLATE-compressed files included
- 🔢 Correct types — string, number, boolean and **real Excel dates** — both directions
- 🅱️ Bold headers, column widths, multiple sheets
- 📦 Output `Uint8Array` — stream it, download it, save it · zero deps · isomorphic

## Install

```bash
npm install @lacspace/xlsx      # or pnpm add / yarn add / bun add
```

## Objects → spreadsheet

```ts
import { jsonToXlsx } from "@lacspace/xlsx";
import { writeFileSync } from "node:fs";

const bytes = jsonToXlsx([
  { name: "Ada Lovelace", signups: 12, active: true, joined: new Date("2026-01-15") },
  { name: "Alan Turing",  signups: 7,  active: false, joined: new Date("2026-02-01") },
]);

writeFileSync("users.xlsx", bytes);                 // Node
// or serve a download:
return new Response(bytes, {
  headers: {
    "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": 'attachment; filename="users.xlsx"',
  },
});
```

## Multiple sheets, columns & widths

```ts
import { Workbook } from "@lacspace/xlsx";

const bytes = new Workbook()
  .sheet("Users", rows, {
    columns: [
      { header: "Name", key: "name", width: 28 },
      { header: "Sign-ups", key: "signups", width: 12 },
    ],
  })
  .sheet("Totals", [["Metric", "Value"], ["Users", 2], ["Revenue", 4500]], { header: true })
  .toBytes();
```

## Number formats

Give a column an explicit Excel format code with `numFmt` — currency, percent, a
custom date pattern, anything Excel understands. It applies to that column's data
cells (the header stays bold), and the format is written into the workbook's
styles part so Excel/Numbers/LibreOffice render it correctly.

```ts
import { jsonToXlsx } from "@lacspace/xlsx";

const bytes = jsonToXlsx(
  [{ item: "Widget", price: 9.5, sold: new Date("2026-06-01") }],
  {
    columns: [
      { header: "Item", key: "item", width: 24 },
      { header: "Price", key: "price", numFmt: "$#,##0.00" },
      { header: "Sold", key: "sold", numFmt: "yyyy-mm-dd" },
    ],
  },
);
```

## CSV ↔ XLSX

```ts
import { csvToXlsx, xlsxToCsv, parseCsv, csvToAoa, aoaToCsv } from "@lacspace/xlsx";

// CSV string → real .xlsx bytes (values typed: 12 → number, true → boolean)
const bytes = csvToXlsx("name,age,active\nAda,36,true\nBob,41,false", { header: true });

// Any .xlsx → CSV text (async; picks a sheet by name or index)
const csv = await xlsxToCsv(bytes, { sheet: "Sheet1" });

// Low-level, no workbook involved:
parseCsv('a,"x,y"\n1,2');                    // string[][] — RFC-4180-ish, quotes & newlines
csvToAoa("qty\n12\ntrue");                   // typed grid: [["qty"], [12], [true]]
aoaToCsv([["n", "d"], ["Ada", new Date()]]); // grid → CSV text (Dates → ISO)
```

## Read a spreadsheet back

Parse a `.xlsx` a user uploaded — including DEFLATE-compressed exports from Excel and Google Sheets — into row objects or a raw grid. `readWorkbook` / `xlsxToJson` are async (they may need to inflate); `sheetToJson` / `sheetToAoa` are sync.

```ts
import { xlsxToJson, readWorkbook, sheetToJson, sheetToAoa } from "@lacspace/xlsx";
import { readFileSync } from "node:fs";

const bytes = readFileSync("users.xlsx"); // Uint8Array / Buffer / ArrayBuffer all accepted

// One shot: first sheet → array of objects (first row = keys)
const rows = await xlsxToJson(bytes);
// [{ name: "Ada Lovelace", signups: 12, active: true, joined: Date(2026-01-15) }, …]

// Pick a sheet, or supply your own header keys
await xlsxToJson(bytes, { sheet: "Totals" });
await xlsxToJson(bytes, { header: ["metric", "value"] });

// Full workbook for multi-sheet control
const wb = await readWorkbook(bytes);
wb.sheetNames;                       // ["Users", "Totals"]
const sheet = wb.sheet("Users")!;    // or wb.sheets[0]
sheetToJson(sheet);                  // Record<string, ReadCell>[]
sheetToAoa(sheet);                   // ReadCell[][] — dense grid incl. header row
```

Cells come back correctly typed: numbers, booleans, real `Date` objects and `null` for blanks.

## API

| Export | Description |
| --- | --- |
| **Write** | |
| `jsonToXlsx(rows, opts?)` | array of objects → .xlsx bytes |
| `aoaToXlsx(rows, opts?)` | array of arrays → .xlsx bytes |
| `new Workbook().sheet(name, rows, opts?)` | multi-sheet builder (`Column.numFmt` for number formats) |
| `.toBytes()` · `.toBase64()` | output |
| `columnLetter(i)` | `0 → "A"`, `26 → "AA"` |
| **Read** | |
| `xlsxToJson(bytes, opts?)` | *async* — one sheet → array of row objects |
| `readWorkbook(bytes)` | *async* — full `ParsedWorkbook` (`.sheetNames`, `.sheets`, `.sheet(name?)`) |
| `sheetToJson(sheet, opts?)` | a `ReadSheet` → row objects (header / keys / column letters) |
| `sheetToAoa(sheet)` | a `ReadSheet` → `ReadCell[][]` grid |
| **CSV** | |
| `csvToXlsx(csv, opts?)` | CSV string → .xlsx bytes (values typed by default) |
| `xlsxToCsv(bytes, opts?)` | *async* — a sheet → CSV text |
| `parseCsv(text, opts?)` | CSV string → `string[][]` (quotes, newlines, custom delimiter) |
| `csvToAoa(text, opts?)` · `aoaToCsv(rows, opts?)` | typed grid ↔ CSV text |

Values map to Excel types automatically (`Date` → a real date cell, and back). Reads accept `Uint8Array`, `ArrayBuffer` or Node `Buffer`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/xlsx` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/xlsx
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.


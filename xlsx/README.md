<div align="center">

# @lacspace/xlsx

**Write real Excel (.xlsx) files with zero dependencies — no SheetJS, no exceljs, no headless browser.**

[![npm version](https://img.shields.io/npm/v/@lacspace/xlsx?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/xlsx)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/xlsx?label=minzip)](https://bundlephobia.com/package/@lacspace/xlsx)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/xlsx)
[![license](https://img.shields.io/npm/l/@lacspace/xlsx?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> "Export to Excel" for any dashboard — without the weight. A `.xlsx` file is just a ZIP of a few XML parts, so this builds the bytes directly (the same trick as [`@lacspace/pdf`](https://www.npmjs.com/package/@lacspace/pdf)). The incumbents are large and Node-centric; this is tiny and runs on Node, edge and the browser.

- 📊 Objects → a sheet (headers from keys or explicit columns), or array-of-arrays
- 🔢 Correct types — string, number, boolean and **real Excel dates**
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

## API

| Export | Description |
| --- | --- |
| `jsonToXlsx(rows, opts?)` | array of objects → .xlsx bytes |
| `aoaToXlsx(rows, opts?)` | array of arrays → .xlsx bytes |
| `new Workbook().sheet(name, rows, opts?)` | multi-sheet builder |
| `.toBytes()` · `.toBase64()` | output |
| `columnLetter(i)` | `0 → "A"`, `26 → "AA"` |

Values map to Excel types automatically (`Date` → a real date cell). Free under the Lacspace Free Licence.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/xlsx` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/xlsx
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.


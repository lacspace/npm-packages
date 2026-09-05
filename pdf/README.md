<div align="center">

# @lacspace/pdf

**Generate real PDFs — invoices, receipts & documents — with zero dependencies and no headless browser.**

[![npm version](https://img.shields.io/npm/v/@lacspace/pdf?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/pdf)
[![install size](https://packagephobia.com/badge?p=@lacspace/pdf)](https://packagephobia.com/result?p=@lacspace/pdf)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/pdf?label=minzip)](https://bundlephobia.com/package/@lacspace/pdf)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/pdf)
[![license](https://img.shields.io/npm/l/@lacspace/pdf?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Every other PDF option is heavy: `pdfkit` drags in a pile of deps, `puppeteer` spins up Chromium. This builds the raw PDF bytes directly — **no dependencies, no browser** — and runs anywhere: Node, edge functions and the browser. Real Helvetica metrics mean text actually wraps and aligns correctly.

- 🧾 **Batteries included** — `invoice()` and `receipt()` generate professional docs from plain data
- 📄 Flowing document builder — headings, paragraphs, tables, key/value rows, dividers, **auto page-breaks**
- 🎯 Accurate layout — real font metrics → correct wrapping, right-aligned money columns
- 📦 Output as `Uint8Array`, base64 or a `data:` URI · ⚡ isomorphic · zero dependencies

## Install

```bash
npm install @lacspace/pdf      # or pnpm add / yarn add / bun add
```

## Invoice in one call

```ts
import { invoice } from "@lacspace/pdf";
import { writeFileSync } from "node:fs";

const bytes = invoice({
  brand: "Lacspace",
  number: "INV-1024",
  date: "2026-08-23",
  dueDate: "2026-09-06",
  from: { name: "Lacspace Corporation", lines: ["Global HQ"], email: "billing@lacspace.com" },
  to:   { name: "Acme Pvt. Ltd.", lines: ["Kathmandu, Nepal"], email: "accounts@acme.com" },
  items: [
    { description: "Custom software development", quantity: 1, rate: 4500 },
    { description: "AI chatbot integration",      quantity: 2, rate: 750 },
  ],
  currency: "$", taxRate: 13, discount: 200,
  notes: "Payment due within 14 days.",
});

writeFileSync("invoice.pdf", bytes);           // Node
// or in a route handler:
return new Response(bytes, { headers: { "content-type": "application/pdf" } });
```

Totals (subtotal → discount → tax → **total**) are computed for you. Long item lists **auto-paginate**, repeating the table header on each page.

## Receipt

Rendered on a standard **A4 page** (not a narrow 80mm thermal roll) with a compact, centered receipt-style layout — prints cleanly on any office printer.

```ts
import { receipt } from "@lacspace/pdf";

const bytes = receipt({
  brand: "KhajaGo", number: "R-88", date: "2026-08-23",
  items: [{ name: "Momo", quantity: 2, amount: 360 }, { name: "Chiya", amount: 40 }],
  currency: "Rs", taxRate: 13, paymentMethod: "eSewa", footer: "Dhanyabad! Visit again.",
});
```

## Build any document

```ts
import { PdfDocument } from "@lacspace/pdf";

const doc = new PdfDocument({ title: "Quarterly Report", accent: [0.13, 0.43, 0.95] });

doc.heading("Quarterly Report")
   .paragraph("A long body paragraph that wraps automatically to the content width…")
   .divider()
   .keyValue("Revenue", "$1.2M")
   .keyValue("Growth", "+24%")
   .table({
     columns: [
       { header: "Region", width: 0.5 },
       { header: "Users", width: 0.25, align: "right" },
       { header: "MRR", width: 0.25, align: "right" },
     ],
     rows: [["Asia", "12,400", "$48k"], ["Worldwide", "3,900", "$21k"]],
     zebra: true,
   });

const bytes = doc.toBytes();       // Uint8Array
const uri   = doc.toDataUri();     // data:application/pdf;base64,…  (great for <a href> / <iframe>)
```

## API

| Export | Description |
| --- | --- |
| `invoice(data)` | professional invoice → `Uint8Array` |
| `receipt(data)` | compact A4 receipt → `Uint8Array` |
| `new PdfDocument(opts)` | document builder |
| `.text` `.heading` `.paragraph` `.bullet` `.keyValue` `.table` `.divider` `.spacer` `.addPage` | content methods (chainable) |
| `.toBytes()` `.toBase64()` `.toDataUri()` | output |
| `formatMoney(n, currency?)` | `1234.5, "$"` → `"$1,234.50"` |
| `textWidth(str, size, bold?)` | measure text (points) |

Pages: `A4` (default) or `Letter`. Fonts: Helvetica / Helvetica-Bold (WinAnsi). Currency accepts a symbol (`"$"`, `"£"`, `"Rs"`) or a 3-letter code (`"USD"`).

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/pdf` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/pdf
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.


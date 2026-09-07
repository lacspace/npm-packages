<div align="center">

# @lacspace/invoice

**An invoice model, numbering & tax-rollup engine — pure, immutable & serializable.**

[![npm version](https://img.shields.io/npm/v/@lacspace/invoice?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/invoice)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/invoice?label=minzip)](https://bundlephobia.com/package/@lacspace/invoice)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/invoice)
[![license](https://img.shields.io/npm/l/@lacspace/invoice?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The invoicing math every billing system re-implements badly. A tiny set of **pure functions** over a plain `Invoice` object — compute per-line and total amounts, roll tax up by rate, generate sequential invoice numbers, track payments, and emit a render-ready row table. No PDF library, no floats.

> **New in 1.1.0** — a pure **status lifecycle** state machine (`transition` / `canTransition` / `deriveStatus`), a **payment ledger** (`recordPayments`, `settlement`, `amountDue`), and **credit notes** (`createCreditNote` / `applyCreditNote`) that reduce the amount due. Fully additive — every 1.0 export is unchanged.

- 🧊 **Immutable** — payments and status transitions return a brand-new invoice; your input is never mutated
- 💾 **Serializable** — `Invoice` is plain data, safe to `JSON.stringify` and persist
- 🪙 **Exact money** — integer **minor units** everywhere, so tax never loses a penny
- 🧾 **Tax rollup** — lines grouped by rate into a summary, consistent with the totals
- 🖨️ **Render-ready** — `renderRows` hands a normalized table to `@lacspace/pdf` or `@lacspace/xlsx` — with **zero dependency** on them
- ⚡ Isomorphic — Node, edge runtimes & browsers · 📦 ESM + CJS · fully typed · zero deps

## Install

```bash
npm i @lacspace/invoice      # or pnpm add / yarn add / bun add
```

## Build an invoice

```ts
import { createInvoice, invoiceNumber } from "@lacspace/invoice";

const inv = createInvoice({
  number: invoiceNumber(1, { year: 2026 }), // "INV-2026-000001"
  currency: "USD",
  seller: { name: "Lacspace", taxId: "T-1" },
  buyer: { name: "Acme Co", email: "ap@acme.test" },
  lines: [
    { description: "Widget", qty: 2, unitPrice: 1000, taxRate: 0.13, discount: 200 },
    { description: "Sticker", qty: 1, unitPrice: 500, taxRate: 0 },
  ],
});

inv.lines[0]; // { ..., net: 1800, tax: 234, total: 2034 }
inv.totals;   // { subtotal: 2300, discount: 200, taxTotal: 234, total: 2534, amountPaid: 0, balanceDue: 2534 }
```

## Tax grouped by rate

```ts
inv.taxSummary;
// [{ rate: 0, net: 500, tax: 0 }, { rate: 0.13, net: 1800, tax: 234 }]
```

**Rounding order:** each line's tax is rounded first (`round(net * taxRate)`), then the already-rounded per-line taxes are summed into both `taxSummary` and `totals.taxTotal` — so the summary always reconciles with the total.

## Track payments — immutably

```ts
import { recordPayment } from "@lacspace/invoice";

let cur = recordPayment(inv, 2000); // cur.status === "partial", balanceDue 534
cur = recordPayment(cur, 534);      // cur.status === "paid",    balanceDue 0

recordPayment(inv, 3000); // throws InvoiceError { code: "overpayment" }
```

## Status transitions & overdue

```ts
import { markIssued, markVoid, isOverdue } from "@lacspace/invoice";

const issued = markIssued(inv, Date.now());
const voided = markVoid(inv);
isOverdue({ ...issued, dueAt: Date.now() - 1 }); // true — past due with a balance
```

## Batch payments & settlement

```ts
import { recordPayments, settlement, amountDue } from "@lacspace/invoice";

const cur = recordPayments(inv, [
  { amount: 2000, method: "card" },
  { amount: 534, method: "bank", reference: "TX-9" },
]); // cur.status === "paid"

amountDue(inv);                 // 2534
settlement(cur, Date.now());    // { amountPaid: 2534, amountDue: 0, status: "paid" }
```

`settlement(inv, now?)` resolves `paid` / `partial` / `overdue` against an injectable clock; `recordPayments` reuses the same integer math and overpayment guard as `recordPayment`, immutably.

## Status lifecycle

```ts
import { transition, canTransition, deriveStatus, withDerivedStatus } from "@lacspace/invoice";

canTransition("draft", "issued");   // true
canTransition("paid", "issued");    // false
const issued = transition(inv, "issued"); // throws InvoiceError { code: "invalid_transition" } on an illegal move

// Derive the *effective* status from money + due date, with an injectable clock:
deriveStatus({ ...issued, dueAt: 1000 }, 2000);       // "overdue"
withDerivedStatus({ ...issued, dueAt: 1000 }, 2000);  // invoice with status stamped
```

Legal moves are declared in `INVOICE_TRANSITIONS`; `paid` and `void` are terminal. (`issued` is the "sent" state, `partial` is "partially paid".)

## Credit notes

```ts
import { createCreditNote, applyCreditNote, creditNoteRows } from "@lacspace/invoice";

// Partial credit (e.g. a returned unit); omit `amount` for a full credit of the balance:
const note = createCreditNote({
  number: "CN-2026-000004",
  invoice: inv,
  lines: [{ description: "Returned Widget", qty: 1, unitPrice: 1000, taxRate: 0.13 }],
  reason: "1 unit returned",
}); // { amount: 1130, invoiceNumber: "INV-2026-000001", ... } — plain, JSON-safe

const credited = applyCreditNote(inv, note);
credited.totals.credited;   // 1130
credited.totals.balanceDue; // total - amountPaid - credited

creditNoteRows(note);       // { columns, rows } — render-ready, like renderRows
```

A `CreditNote` is plain serializable data (no PDF dependency); `applyCreditNote` is immutable and integer-safe, and refuses to credit more than is owed (`credit_exceeds_due`).

## Hand it to a renderer

```ts
import { renderRows } from "@lacspace/invoice";

const { columns, rows } = renderRows(inv);
// columns: ["Description", "Qty", "Unit", "Tax %", "Line total"]
// rows:    [["Widget", 2, 1000, 13, 2034], ["Sticker", 1, 500, 0, 500]]
// → feed straight into @lacspace/xlsx or a PDF table builder
```

## API

| Function | Description |
| --- | --- |
| `createInvoice(input)` | build a computed, serializable `Invoice` (lines, totals, tax summary) |
| `recordPayment(inv, amount, opts?)` | immutable; add a payment, recompute balance, set `paid`/`partial` |
| `markIssued(inv, at?)` | immutable transition to `issued` (throws on paid/void) |
| `markVoid(inv)` | immutable transition to `void` (throws on paid) |
| `isOverdue(inv, now?)` | `dueAt` in the past **and** a positive balance |
| `invoiceNumber(seq, opts?)` | deterministic number, default `"INV-2026-000123"` |
| `renderRows(inv)` | `{ columns, rows }` — a normalized table for PDF / XLSX |
| `recordPayments(inv, payments)` | immutable; apply a list of `Payment`s (reuses `recordPayment`) |
| `settlement(inv, now?)` | `{ amountPaid, amountDue, status }` with derived `paid`/`partial`/`overdue` |
| `amountDue(inv)` / `amountPaid(inv)` / `isSettled(inv)` | balance helpers |
| `canTransition(from, to)` / `transition(inv, to)` | pure status state machine (`INVOICE_TRANSITIONS`) |
| `deriveStatus(inv, now?)` / `withDerivedStatus(inv, now?)` | effective status from money + due date, injectable clock |
| `createCreditNote(input)` | build a full/partial `CreditNote` against an invoice |
| `applyCreditNote(inv, note)` | immutable; reduce `balanceDue` by the credited amount |
| `creditNoteRows(note)` | `{ columns, rows }` — render-ready credit-note table |

Types exported: `Party`, `InvoiceLineInput`, `InvoiceLine`, `TaxSummaryRow`, `InvoiceTotals`, `InvoiceStatus`, `Invoice`, `Payment`, `Settlement`, `CreditNote`, and the `InvoiceError` class.

All amounts are integer minor units; `taxRate` is a fraction (`0.13` = 13%). `net = qty * unitPrice - discount`, `tax = round(net * taxRate)`, `total = net + tax`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://developer.lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/invoice` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

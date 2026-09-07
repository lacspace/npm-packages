<div align="center">

# @lacspace/tax

**VAT & sales-tax calculation done right — exact integer minor units, add/extract tax, compound taxes, half-up & bankers rounding.**

[![npm version](https://img.shields.io/npm/v/@lacspace/tax?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/tax)
[![install size](https://packagephobia.com/badge?p=@lacspace/tax)](https://packagephobia.com/result?p=@lacspace/tax)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/tax?label=minzip)](https://bundlephobia.com/package/@lacspace/tax)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/tax)
[![license](https://img.shields.io/npm/l/@lacspace/tax?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Every checkout re-implements VAT/GST and gets the cents wrong. This does it in **integer minor units** (no floating-point drift), splits a price into `{ net, tax, gross }` with `net + tax === gross` **exactly**, and lets you pick the rounding rule.

- 💯 **Exact** — integer minor units (cents, paisa), never floats
- ➕➖ **Both directions** — add tax to a net, or extract tax from a gross (inclusive price)
- 🧾 **Compound** taxes — cascading tax-on-tax
- 🎯 **Rounding you control** — `half-up` (default), `bankers`, or `none`
- ⚡ Isomorphic · zero dependencies · fully typed

> **New in 1.1.0** — all additive & backward compatible: `applyTaxes()` for **multiple + compound taxes with a labelled breakdown** (state + city, tax-on-tax), `taxInvoice()` with explicit **line-level vs invoice-level rounding**, **category rate tables** (`lookupRate`/`resolveRate`), `vat()`/`gst()` conveniences with a **reverse-charge** flag, `formatRate(0.13)` → `"13%"`, and an extended `roundMinor()` (`half-down`/`ceil`/`floor`/`trunc`). Nothing existing changed.

## Install

```bash
npm install @lacspace/tax      # or pnpm add / yarn add / bun add
```

## Usage

```ts
import { addTax, extractTax, tax, compound, RATES } from "@lacspace/tax";

// Add 13% VAT to a NPR 100.00 net price (10000 paisa)
addTax(10000, RATES.NP_VAT);      // { net: 10000, tax: 1300, gross: 11300 }

// Extract the tax already baked into a gross price
extractTax(11300, RATES.NP_VAT);  // { net: 10000, tax: 1300, gross: 11300 }

// The general form
tax(10000, { rate: 0.2, inclusive: false });          // add
tax(12000, { rate: 0.2, inclusive: true });           // extract
tax(100, { rate: 0.025, round: "bankers" });          // choose rounding

// Cascading taxes, each charged on the running gross
compound(10000, [0.1, 0.05]);
// { net: 10000, taxes: [{ rate: 0.1, tax: 1000 }, { rate: 0.05, tax: 550 }], gross: 11550 }
```

### New in 1.1.0

```ts
import { applyTaxes, taxInvoice, vat, gst, formatRate, lookupRate, resolveRate } from "@lacspace/tax";

// Multiple + compound taxes, with a labelled breakdown (state flat, city on top)
applyTaxes(10000, [
  { name: "State", rate: 0.06 },
  { name: "City",  rate: 0.02, compound: true }, // charged on base + preceding tax
]);
// { net: 10000, taxes: [...], totalTax: 812, gross: 10812 }

// Reverse charge — recorded, but tax = 0
applyTaxes(10000, [{ name: "VAT", rate: 0.2, reverseCharge: true }]);

// VAT/GST convenience with inclusive extract + reverse charge
vat(10000, 0.13);                              // { net: 10000, tax: 1300, gross: 11300 }
vat(11300, 0.13, { inclusive: true });         // extract from a gross
gst(10000, 0.18, { reverseCharge: true });     // { net: 10000, tax: 0, gross: 10000 }

// Format a rate for receipts
formatRate(0.13);                              // "13%"   (0.075 → "7.5%")

// Category rate tables (you own the numbers)
const table = { default: 0.2, categories: { reduced: 0.05, food: { CA: 0.0725, default: 0 } } };
resolveRate(table, "food", "CA");              // 0.0725

// Line-level vs invoice-level rounding
taxInvoice([{ net: 105, rate: 0.1 }, { net: 105, rate: 0.1 }], { strategy: "line" }).tax;    // 22
taxInvoice([{ net: 105, rate: 0.1 }, { net: 105, rate: 0.1 }], { strategy: "invoice" }).tax; // 21
```

## API

| Function | Description |
| --- | --- |
| `tax(amount, { rate, inclusive?, round? })` | split into `{ net, tax, gross }`; `inclusive` treats `amount` as the gross |
| `addTax(net, rate, round?)` | add tax to a net amount |
| `extractTax(gross, rate, round?)` | pull net + tax out of a gross amount |
| `compound(net, rates[], round?)` | apply each rate on the running gross → `{ net, taxes, gross }` |
| `applyTaxes(net, specs[], round?)` | multiple & compound taxes with a labelled `{ net, taxes, totalTax, gross }` breakdown; each `spec` = `{ rate, name?, compound?, reverseCharge? }` |
| `taxInvoice(lines[], { strategy?, round? })` | tax over many line items with `"line"` (round each line) or `"invoice"` (round the grand total once) rounding |
| `vat(amount, rate, { inclusive?, round?, reverseCharge? })` / `gst(...)` | VAT/GST convenience split; alias-pair |
| `formatRate(rate, { decimals?, symbol? })` | `0.13` → `"13%"` |
| `lookupRate(table, category, region?)` / `resolveRate(...)` | look up a rate in a caller-supplied `RateTable`; `resolveRate` throws instead of returning `undefined` |
| `roundMinor(n, mode?)` | shared rounder for the above modes |
| `RATES` | common rates as fractions (`NP_VAT`, `IN_GST`, `EU_VAT`, `UK_VAT`) |

`round` for the classic helpers is `"half-up"` (default), `"bankers"`, or `"none"`. The 1.1.0 helpers accept an extended `RoundingMode`: `"half-up" | "half-down" | "half-even" | "bankers" | "ceil" | "floor" | "trunc" | "none"`. In every result `net + tax === gross` exactly. Amounts are **integer minor units** — non-integers throw.

**Line-level vs invoice-level rounding.** `"line"` rounds each line's tax and sums them, so the per-line taxes always re-sum to the invoice tax (best when lines are settled independently). `"invoice"` sums the *exact* per-line tax and rounds once at the end, so the total matches a from-scratch calculation but the displayed per-line taxes may differ from it by a minor unit (best when only the grand total is remitted). The two can differ by a minor unit — pick deliberately.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://developer.lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/tax` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

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

## API

| Function | Description |
| --- | --- |
| `tax(amount, { rate, inclusive?, round? })` | split into `{ net, tax, gross }`; `inclusive` treats `amount` as the gross |
| `addTax(net, rate, round?)` | add tax to a net amount |
| `extractTax(gross, rate, round?)` | pull net + tax out of a gross amount |
| `compound(net, rates[], round?)` | apply each rate on the running gross → `{ net, taxes, gross }` |
| `RATES` | common rates as fractions (`NP_VAT`, `IN_GST`, `EU_VAT`, `UK_VAT`) |

`round` is `"half-up"` (default), `"bankers"` (round half to even), or `"none"` (exact, may be fractional). In every result `net + tax === gross` exactly. Amounts are **integer minor units** — non-integers throw.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/tax` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

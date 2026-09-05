<div align="center">

# @lacspace/nepali-utils

**Everyday helpers for Nepal-facing apps — rupees, numerals, amount-in-words, validators, provinces.**

[![npm version](https://img.shields.io/npm/v/@lacspace/nepali-utils?color=%23f59e0b&label=npm)](https://www.npmjs.com/package/@lacspace/nepali-utils)
[![install size](https://packagephobia.com/badge?p=@lacspace/nepali-utils)](https://packagephobia.com/result?p=@lacspace/nepali-utils)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/nepali-utils?label=minzip)](https://bundlephobia.com/package/@lacspace/nepali-utils)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/nepali-utils)
[![license](https://img.shields.io/npm/l/@lacspace/nepali-utils?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The little things every Nepali app re-implements — done once, done right.

- 💰 NPR formatting with **lakh/crore** grouping
- 🔢 Devanagari ↔ Arabic numerals
- 🧾 Amount-in-words for invoices
- ✅ Phone / PAN validators
- 🗺️ The 7 federal provinces
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/nepali-utils      # or pnpm add / yarn add / bun add
```

## Currency & numbers

```ts
import { formatNPR, groupNepali, toDevanagari, fromDevanagari } from "@lacspace/nepali-utils";

formatNPR(1234567.5);                                    // "Rs. 12,34,567.50"
formatNPR(1234567.5, { symbol: "रू ", devanagari: true }); // "रू १२,३४,५६७.५०"
formatNPR(50000, { decimals: 0, symbol: "" });           // "50,000"

groupNepali(1234567);   // "12,34,567"  (South-Asian grouping)
toDevanagari("2081");   // "२०८१"
fromDevanagari("२०८१"); // "2081"
```

## Amount in words (for invoices)

```ts
import { numberToWords, amountInWords } from "@lacspace/nepali-utils";

numberToWords(1234567);
// "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven"

amountInWords(1234567.75);
// "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Seventy Five Paisa Only"
```

## Validators

```ts
import { isValidNepaliMobile, isValidPAN } from "@lacspace/nepali-utils";

isValidNepaliMobile("9812345678");     // true
isValidNepaliMobile("+9779812345678"); // true
isValidNepaliMobile("1234567890");     // false
isValidPAN("123456789");               // true (9 digits)
```

## Provinces

```ts
import { PROVINCES } from "@lacspace/nepali-utils";

PROVINCES[2];
// { number: 3, name: "Bagmati", nameNp: "बागमती", capital: "Hetauda" }
```

## API

| Function | Description |
| --- | --- |
| `formatNPR(amount, opts?)` | NPR string · opts: `symbol`, `decimals`, `devanagari` |
| `groupNepali(value)` | South-Asian digit grouping |
| `toDevanagari` / `fromDevanagari` | numeral conversion |
| `numberToWords(n)` | words with Lakh / Crore / Arab |
| `amountInWords(n)` | "Rupees … Only" wrapper |
| `isValidNepaliMobile` / `isValidPAN` | validators |
| `PROVINCES` | the 7 federal provinces |

## The Lacspace family

| Package | For |
| --- | --- |
| [`@lacspace/nepali-date`](https://www.npmjs.com/package/@lacspace/nepali-date) | Bikram Sambat dates |
| **`@lacspace/nepali-utils`** | Nepal helpers (this package) |
| [`@lacspace/sdk`](https://www.npmjs.com/package/@lacspace/sdk) | Full Lacspace platform SDK |
| [`@lacspace/react`](https://www.npmjs.com/package/@lacspace/react) | React hooks |

## New in 1.1 — land units, carriers, districts & Nepali words

```ts
import {
  landToSqMeters, sqMetersToRopani, convertLand, formatRopani,
  normalizeMobile, getCarrier, ungroupNepali, formatCompactNPR,
  DISTRICTS, districtsByProvince, findDistrict,
  numberToWordsNepali, amountInWordsNepali,
} from "@lacspace/nepali-utils";

// Land area — the thing nobody else packages (hilly ↔ terai ↔ metric)
const m2 = landToSqMeters({ ropani: 2, aana: 3 });   // → 1078.9 m²
sqMetersToRopani(m2);                                  // { ropani: 2, aana: 3, paisa: 0, daam: 0 }
convertLand(1, "bigha", "kattha");                    // 20
formatRopani(m2);                                      // "2-3-0-0"

// Phones
normalizeMobile("984-123 4567");                       // "+9779841234567"
getCarrier("9801234567");                              // "Ncell"

// Money & geography
ungroupNepali("Rs. 12,34,567.50");                     // 1234567.5
formatCompactNPR(1234567, { nepali: true });           // "Rs. 12.35 लाख"
districtsByProvince(3);                                 // 13 Bagmati districts
findDistrict("काठमाडौं")?.province;                    // 3

// Invoices in Nepali
amountInWordsNepali(1500.5);  // "रुपैयाँ एक हजार पाँच सय पचास पैसा मात्र"
```

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/nepali-utils` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/nepali-utils
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.


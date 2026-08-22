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

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>

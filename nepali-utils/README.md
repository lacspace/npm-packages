# @lacspace/nepali-utils

[![npm](https://img.shields.io/npm/v/@lacspace/nepali-utils.svg)](https://www.npmjs.com/package/@lacspace/nepali-utils) [![license](https://img.shields.io/npm/l/@lacspace/nepali-utils.svg)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

Everyday helpers for building Nepal-facing apps: NPR currency formatting with the South-Asian (lakh/crore) grouping, Devanagari numerals, amount-in-words for invoices, common validators, and province data. Zero dependencies, isomorphic, fully typed.

## Install

```bash
npm install @lacspace/nepali-utils
```

## Currency & numbers

```ts
import { formatNPR, groupNepali, toDevanagari, fromDevanagari } from "@lacspace/nepali-utils";

formatNPR(1234567.5);                       // "Rs. 12,34,567.50"
formatNPR(1234567.5, { symbol: "रू " , devanagari: true }); // "रू १२,३४,५६७.५०"
formatNPR(50000, { decimals: 0, symbol: "" });             // "50,000"

groupNepali(1234567);      // "12,34,567"  (South-Asian grouping)
toDevanagari("2081");      // "२०८१"
fromDevanagari("२०८१");    // "2081"
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
| `formatNPR(amount, opts?)` | NPR currency string; opts: `symbol`, `decimals`, `devanagari` |
| `groupNepali(value)` | South-Asian digit grouping |
| `toDevanagari(x)` / `fromDevanagari(x)` | numeral conversion |
| `numberToWords(n)` | South-Asian words (Lakh/Crore/Arab) |
| `amountInWords(n)` | "Rupees … only" wrapper |
| `isValidNepaliMobile(s)` / `isValidPAN(s)` | validators |
| `PROVINCES` | the 7 federal provinces |

## License

MIT © [Lacspace](https://lacspace.com)

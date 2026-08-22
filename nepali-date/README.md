# @lacspace/nepali-date

[![npm](https://img.shields.io/npm/v/@lacspace/nepali-date.svg)](https://www.npmjs.com/package/@lacspace/nepali-date) [![license](https://img.shields.io/npm/l/@lacspace/nepali-date.svg)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

Convert between **Bikram Sambat (BS)** and **Gregorian (AD)** dates, with Nepali (Devanagari) formatting. Zero dependencies, isomorphic (Node, browser, edge), dual ESM + CJS, fully typed.

**Supported range:** BS **1970–2086** (AD **1913–2030**). The calendar table is generated and cross-checked against established Bikram Sambat datasets — every year is validated (365/366 days).

## Install

```bash
npm install @lacspace/nepali-date
```

## Quick start

```ts
import { NepaliDate } from "@lacspace/nepali-date";

// Today, in BS
const today = new NepaliDate();
today.toString();          // e.g. "2083-05-06"
today.format("D MMMM, YYYY"); // e.g. "6 Bhadra, 2083"

// A specific AD date → BS
// Build AD dates with local parts: new Date(year, monthIndex /* 0-based */, day)
const bs = new NepaliDate(new Date(2024, 3, 13));
bs.toString();             // "2081-01-01"

// A BS date → AD
const ad = new NepaliDate(2081, 1, 1).toAD();
`${ad.getFullYear()}-${ad.getMonth() + 1}-${ad.getDate()}`; // "2024-4-13"
```

> **Timezones:** dates are handled by their **local** calendar parts. Construct AD dates with `new Date(year, monthIndex, day)` and read them with `getFullYear()/getMonth()/getDate()`. Avoid `new Date("2024-04-13")` and `.toISOString()` for date-only values — those use UTC and can shift the day by one depending on the runtime timezone.

## Plain functions

Prefer functions over the class? Both directions are exported:

```ts
import { adToBs, bsToAd } from "@lacspace/nepali-date";

adToBs(new Date(2024, 3, 13)); // { year: 2081, month: 1, day: 1 }
bsToAd(2081, 1, 1);            // Date at local midnight of 2024-04-13
```

## Formatting

```ts
const d = new NepaliDate(2081, 1, 15);

d.format();                       // "2081-01-15"  (default YYYY-MM-DD)
d.format("D MMMM YYYY, dddd");    // "15 Baisakh 2081, Monday"

// Nepali (Devanagari digits + Nepali names)
d.formatNepali();                 // "२०८१ बैशाख १५, सोमबार"
d.formatNepali("YYYY/MM/DD");     // "२०८१/०१/१५"
```

**Tokens:** `YYYY` `YY` `MM` `M` `DD` `D` `MMMM` (month name) `dddd` (weekday) `ddd` (short weekday).

## Getters

```ts
const d = new NepaliDate(2081, 1, 15);
d.getYear();   // 2081
d.getMonth();  // 1   (Baisakh = 1 … Chaitra = 12)
d.getDate();   // 15
d.getDay();    // 0–6 (Sunday–Saturday)
d.toAD();      // Gregorian Date
d.toBS();      // { year, month, day }
```

## Helpers & constants

```ts
import {
  toDevanagari, fromDevanagari,
  NEPALI_MONTHS, NEPALI_MONTHS_NP,
  NEPALI_WEEKDAYS, NEPALI_WEEKDAYS_NP,
  BS_MIN_YEAR, BS_MAX_YEAR,
} from "@lacspace/nepali-date";

toDevanagari("2081");     // "२०८१"
fromDevanagari("२०८१");   // "2081"
NEPALI_MONTHS_NP[0];      // "बैशाख"
```

## Notes

- Dates outside BS 1970–2086 throw a `RangeError` rather than returning wrong values.
- Conversions use whole calendar days (no time-of-day / timezone drift).

## License

MIT © [Lacspace](https://lacspace.com)

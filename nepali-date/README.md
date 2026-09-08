<div align="center">

# @lacspace/nepali-date

**Bikram Sambat ↔ Gregorian date conversion, with Nepali formatting. Accurate, tiny, zero-dependency.**

[![npm version](https://img.shields.io/npm/v/@lacspace/nepali-date?color=%237c5cff&label=npm)](https://www.npmjs.com/package/@lacspace/nepali-date)
[![install size](https://packagephobia.com/badge?p=@lacspace/nepali-date)](https://packagephobia.com/result?p=@lacspace/nepali-date)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/nepali-date?label=minzip)](https://bundlephobia.com/package/@lacspace/nepali-date)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/nepali-date)
[![license](https://img.shields.io/npm/l/@lacspace/nepali-date?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Convert between **Bikram Sambat (BS)** and **Gregorian (AD)** dates and print them in English or Nepali (Devanagari).

- 🗓️ BS ↔ AD, both directions
- 🇳🇵 Nepali month/weekday names + Devanagari digits
- ✅ **Verified** across 42,000+ conversions against established datasets
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

**Supported range:** BS **1970–2086** (AD **1913–2030**). Anchor: BS 1970-01-01 = AD 1913-04-13.

> **New in 1.2.0** — plain-function helpers alongside the class: a richer token
> formatter with an ordinal token and a Nepali-digit toggle (`formatBs`),
> `diffDays`/`startOfBsMonth`/`endOfBsMonth` BS arithmetic, a validating
> `parseBs`/`tryParseBs`, calendar helpers (`daysInBsMonth`, `bsYearLength`,
> `bsMonthName`, `bsWeekdayName`, `bsWeekday`, `bsWeekOfMonth`), fiscal-year
> functions (`bsFiscalYear`, `bsFiscalYearLabel`), plus `startOf`/`endOf`/
> `weekOfMonth`/`ordinal` methods on `NepaliDate`. All additive — nothing
> existing changed, and every BS↔AD conversion output is identical.

## Install

```bash
npm install @lacspace/nepali-date      # or pnpm add / yarn add / bun add
```

## Quick start

```ts
import { NepaliDate } from "@lacspace/nepali-date";

const today = new NepaliDate();
today.toString();               // "2083-05-06"
today.format("D MMMM, YYYY");   // "6 Bhadra, 2083"
today.formatNepali();           // "२०८३ भदौ ६, शनिबार"

// AD → BS   (build AD dates with local parts)
new NepaliDate(new Date(2024, 3, 13)).toString(); // "2081-01-01"

// BS → AD
const d = new NepaliDate(2081, 1, 1).toAD();
`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; // "2024-4-13"
```

## Prefer plain functions?

```ts
import { adToBs, bsToAd } from "@lacspace/nepali-date";

adToBs(new Date(2024, 3, 13)); // { year: 2081, month: 1, day: 1 }
bsToAd(2081, 1, 1);            // Date at local midnight of 2024-04-13
```

## Formatting

```ts
const d = new NepaliDate(2081, 1, 15);

d.format("D MMMM YYYY, dddd");  // "15 Baisakh 2081, Monday"
d.formatNepali();               // "२०८१ बैशाख १५, सोमबार"
d.formatNepali("YYYY/MM/DD");   // "२०८१/०१/१५"
```

**Tokens:** `YYYY` `YY` `MM` `M` `DD` `D` `MMMM` (month) `dddd` / `ddd` (weekday).

## Getters & helpers

```ts
d.getYear();   // 2081
d.getMonth();  // 1  (Baisakh = 1 … Chaitra = 12)
d.getDate();   // 15
d.getDay();    // 0–6 (Sunday–Saturday)
d.toAD();      // Gregorian Date
d.toBS();      // { year, month, day }

import { toDevanagari, fromDevanagari, NEPALI_MONTHS_NP } from "@lacspace/nepali-date";
toDevanagari("2081");   // "२०८१"
fromDevanagari("२०८१"); // "2081"
NEPALI_MONTHS_NP[0];    // "बैशाख"
```

## ⏱️ A note on timezones

Dates are handled by their **local** calendar parts. Build AD dates with `new Date(year, monthIndex, day)` and read them with `getFullYear()/getMonth()/getDate()`. Avoid `new Date("2024-04-13")` and `.toISOString()` for date-only values — those use UTC and can shift the day by one. Out-of-range dates throw a `RangeError` rather than returning wrong values.

## The Lacspace family

| Package | For |
| --- | --- |
| **`@lacspace/nepali-date`** | Bikram Sambat dates (this package) |
| [`@lacspace/nepali-utils`](https://www.npmjs.com/package/@lacspace/nepali-utils) | NPR, amount-in-words, validators |
| [`@lacspace/sdk`](https://www.npmjs.com/package/@lacspace/sdk) | Full Lacspace platform SDK |
| [`@lacspace/react`](https://www.npmjs.com/package/@lacspace/react) | React hooks |

## New in 1.1 — a full date toolkit

```ts
import { NepaliDate } from "@lacspace/nepali-date";

const d = NepaliDate.fromBS(2081, 3, 15);

// arithmetic & comparison
d.addDays(10); d.addMonths(1); d.addYears(-1);
d.diff(other, "months");
d.isBefore(other); d.isSame(other, "month"); d.isToday();

// calendar grid for a month view (weeks of Sun–Sat, null padding)
for (const week of d.getMonthMatrix())
  for (const cell of week) if (cell) render(cell.day, cell.isToday);

// parse, relative time, ranges, fiscal year
NepaliDate.parse("2081-03-15");        // also accepts २०८१/०३/१५
d.fromNow({ nepali: true });           // "३ दिन अघि"
d.fiscalYearLabel();                    // "2080/81" (Shrawan→Ashadh)
for (const day of NepaliDate.eachDay(start, end)) { /* … */ }
NepaliDate.daysInMonth(2081, 3);       // 32
```

## Plain-function toolkit (new in 1.2.0)

Prefer functions over the class? These operate on plain `{ year, month, day }` BS
objects and reuse the same conversion tables — so results are identical.

```ts
import {
  formatBs, parseBs, tryParseBs, diffDays,
  startOfBsMonth, endOfBsMonth, daysInBsMonth, bsYearLength,
  bsMonthName, bsWeekdayName, bsWeekday, bsWeekOfMonth,
  bsFiscalYear, bsFiscalYearLabel, ordinal,
} from "@lacspace/nepali-date";

// Rich formatting — extra `Do` (ordinal) token + Nepali-digit toggle
formatBs({ year: 2081, month: 1, day: 15 }, "Do MMMM YYYY, dddd");
// "15th Baisakh 2081, Saturday"
formatBs({ year: 2081, month: 1, day: 15 }, "YYYY MMMM D, dddd", { nepali: true });
// "२०८१ बैशाख १५, शनिबार"

// Parsing (validates against the month-length tables; Arabic or Devanagari)
parseBs("2081-03-15");      // { year: 2081, month: 3, day: 15 }
parseBs("२०८१/०३/१५");      // { year: 2081, month: 3, day: 15 }
tryParseBs("2081-01-40");   // null  (no BS month has 40 days)

// Arithmetic & boundaries
diffDays({ year: 2081, month: 1, day: 15 }, { year: 2081, month: 1, day: 1 }); // 14
startOfBsMonth({ year: 2081, month: 3, day: 15 }); // { year: 2081, month: 3, day: 1 }
endOfBsMonth({ year: 2081, month: 3, day: 15 });   // { year: 2081, month: 3, day: 31 }

// Calendar helpers
daysInBsMonth(2081, 2);     // 32
bsYearLength(2081);         // 365 (BS has NO simple leap rule — read the tables)
bsMonthName(1);             // "Baisakh"   ·  bsMonthName(1, { nepali: true }) → "बैशाख"
bsWeekdayName(6, { nepali: true }); // "शनिबार"
bsWeekday({ year: 2081, month: 1, day: 15 });      // 6 (Saturday)
bsWeekOfMonth({ year: 2081, month: 1, day: 15 });  // 3

// Fiscal year (Shrawan → Ashadh)
bsFiscalYear({ year: 2081, month: 1, day: 1 });    // { start: 2080, end: 2081 }
bsFiscalYearLabel({ year: 2081, month: 4, day: 1 }); // "2081/82"

ordinal(21); // "21st"
```

New `NepaliDate` methods: `startOf("month"|"year")`, `endOf("month"|"year")`,
`weekOfMonth()`, `ordinal()`.

| API | Purpose |
| --- | --- |
| `formatBs(bs, pattern?, { nepali? })` | Token formatter; adds `Do` ordinal + Devanagari-digit toggle |
| `parseBs(str)` / `tryParseBs(str)` | Parse & table-validate a BS string (throws / returns `null`) |
| `diffDays(a, b)` | Whole days between two BS dates (`a − b`) |
| `startOfBsMonth(bs)` / `endOfBsMonth(bs)` | First / last day of the BS month |
| `daysInBsMonth(y, m)` / `bsYearLength(y)` | Month / year length from the tables |
| `bsMonthName(m, o?)` / `bsWeekdayName(w, o?)` | Localised names (English + Nepali) |
| `bsWeekday(bs)` / `bsWeekOfMonth(bs)` | Weekday (0–6) / 1-based week-of-month |
| `bsFiscalYear(bs)` / `bsFiscalYearLabel(bs)` | Nepali fiscal year (Shrawan–Ashadh) |
| `ordinal(n)` | English ordinal, e.g. `15 → "15th"` |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/nepali-date` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/nepali-date
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.


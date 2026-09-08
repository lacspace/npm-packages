<div align="center">

# @lacspace/datetime

**Immutable date-time toolkit — arithmetic, start/end of unit, diff & breakdown, comparison, token format/parse and ISO. A tiny date-fns/dayjs.**

[![npm version](https://img.shields.io/npm/v/@lacspace/datetime?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/datetime)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/datetime?label=minzip)](https://bundlephobia.com/package/@lacspace/datetime)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/datetime)
[![license](https://img.shields.io/npm/l/@lacspace/datetime?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Pure functions over the native `Date` — every one is **immutable** (your input is never mutated) and works the same in the browser and on the server. No `moment` bloat, no `date-fns` install list; date **math**, token **format/parse** and **comparison** in one tiny, typed, dependency-free package.

> **New in 1.1.0** — `formatRelative` (`"3 hours ago"`, `"in 2 days"`, via native `Intl.RelativeTimeFormat`); **business-day math** with injectable weekends + holidays (`addBusinessDays`, `businessDaysBetween`, …); and **calendar helpers** — a month-grid builder (`calendarGrid`), now-relative predicates (`isToday`/`isPast`/…), weekday navigation and localized name getters. All strictly additive — nothing existing changed.

- ➕ `add` / `subtract` — object durations, **month-overflow-safe** (`Jan 31 + 1 month → Feb 28/29`)
- 📐 `startOf` / `endOf` — `year|quarter|month|week|day|hour|minute|second` (configurable week start)
- 📏 `diff` / `difference` — signed truncated diffs **and** a full `{years,months,days,…}` breakdown
- 🔎 `isBefore` `isAfter` `isSame` `isBetween` `clamp` `min` `max` `closestTo`
- 🧮 `isLeapYear` `daysInMonth` `isWeekend` `getDayOfYear` `getWeekOfYear` `getQuarter` `isValid`
- 🎯 `format` / `parse` — dayjs-style tokens (`YYYY-MM-DD HH:mm:ss`), `parse` is the strict inverse
- 🌐 `parseISO` / `toISO` (RFC-3339), `unix` / `fromUnix`
- 🕐 **`formatRelative`** — human distances via native `Intl.RelativeTimeFormat`, injectable `now`
- 💼 **business days** — `isBusinessDay` `addBusinessDays` `subBusinessDays` `businessDaysBetween` `nextBusinessDay` `previousBusinessDay` (injectable weekends + holidays)
- 📅 **calendar** — `calendarGrid` (month view) + `isToday`/`isYesterday`/`isTomorrow`/`isPast`/`isFuture`, `nextWeekday`/`previousWeekday`, `getMonthName`/`getWeekdayName`/`getDaysInYear`

## Install

```bash
npm install @lacspace/datetime      # or pnpm add / yarn add / bun add
```

## Use

```ts
import {
  add, startOf, diff, difference, format, parse, isBetween, parseISO,
} from "@lacspace/datetime";

add(new Date(2021, 0, 31), { months: 1 });     // Feb 28, 2021 (overflow-safe)
startOf("2021-06-15T13:45:00", "month");        // 2021-06-01 00:00:00 (local)

diff("2021-04-15", "2021-01-15", "month");      // 3
difference("2020-01-01", "2021-03-10");          // { years:-1, months:-2, days:-9, ... }

format(new Date(2021, 0, 5, 9, 7), "dddd, D MMM YYYY [at] hh:mm A");
// "Tuesday, 5 Jan 2021 at 09:07 AM"

parse("15/06/2021 13:45", "DD/MM/YYYY HH:mm");   // Date — strict inverse of format

isBetween("2021-06-15", "2021-01-01", "2021-12-31");   // true
parseISO("2021-06-15T13:45:30Z");                       // Date (UTC instant)
```

### New in 1.1.0

```ts
import {
  formatRelative, addBusinessDays, businessDaysBetween, isBusinessDay,
  calendarGrid, isToday, nextWeekday, getMonthName,
} from "@lacspace/datetime";

// Relative time — largest natural unit, or force one; `now` is injectable for tests
formatRelative("2021-06-15T09:00", { now: "2021-06-15T12:00" }); // "3 hours ago"
formatRelative(tomorrow);                                         // "tomorrow"
formatRelative(deadline, { unit: "day", numeric: "always" });     // "in 5 days"

// Business days — Sat/Sun off by default; inject your own weekends + holidays
const holidays = ["2021-06-21"];
addBusinessDays("2021-06-18", 1, { holidays });   // Tue 2021-06-22 (skips weekend + holiday)
businessDaysBetween("2021-06-14", "2021-06-21");  // 5
isBusinessDay("2021-06-19");                       // false (Saturday)

// Calendar — a month grid (rows of 7 cells) for a date picker
const weeks = calendarGrid("2021-06-10", { now: new Date() });
weeks[0][0];        // { date, day, month, year, inMonth:false, isToday, isWeekend }

isToday(someDate);                     // now-relative (also isYesterday/isTomorrow/isPast/isFuture)
nextWeekday("2021-06-15", 1);          // next Monday after the 15th
getMonthName("2021-01-05");            // "January"  (localized, { short:true } → "Jan")
```

## API

| Group | Functions |
| --- | --- |
| Arithmetic | `add`, `subtract`, `addDays`/`addMonths`/`addYears`/`addHours`/… , `subDays`/… |
| Boundaries | `startOf`, `endOf` (`year\|quarter\|month\|week\|day\|hour\|minute\|second`) |
| Diff | `diff`, `diffInDays`/`diffInMonths`/… , `difference` (breakdown) |
| Compare | `isBefore`, `isAfter`, `isEqual`, `isSameDay`, `isSame`, `min`, `max`, `clamp`, `isBetween`, `closestTo` |
| Query | `isLeapYear`, `daysInMonth`, `isWeekend`, `getDayOfYear`, `getWeekOfYear`, `getQuarter`, `isValid` |
| Relative | `formatRelative(date, { now?, locale?, numeric?, style?, unit? })` — `"3 hours ago"` / `"in 2 days"` |
| Business days | `isBusinessDay`, `addBusinessDays`, `subBusinessDays`, `nextBusinessDay`, `previousBusinessDay`, `businessDaysBetween` — all take `{ weekends?, holidays? }` |
| Calendar | `calendarGrid(date, { weekStartsOn?, now?, fixedWeeks? })`, `isToday`/`isYesterday`/`isTomorrow`/`isPast`/`isFuture`, `isFirstDayOfMonth`/`isLastDayOfMonth`, `nextWeekday`/`previousWeekday`, `getMonthName`/`getWeekdayName`/`getDaysInYear` |
| Format / parse | `format`, `parse` (tokens: `YYYY YY MMMM MMM MM M DD D dddd ddd HH H hh h mm m ss s SSS A a Z`, `[escape]`) |
| ISO / unix | `parseISO`, `toISO`, `unix`, `fromUnix`, `toDate` |

Arithmetic and formatting operate on the **local** wall-clock (like dayjs/moment); pass `{ utc: true }` to `format`/`toISO` for the UTC instant. Week helpers default to a **Monday** start (`{ weekStartsOn: 0 }` for Sunday). `parse` is strict by default — a mismatch returns an Invalid Date, or throws with `{ throwOnInvalid: true }`.

`formatRelative` delegates to the platform `Intl.RelativeTimeFormat` (Node 18+ / modern browsers) and picks the largest natural unit using calendar-*approximate* thresholds (30.44-day months, 365.25-day years), so a forced `unit` gives exact control when you need it. Business-day and now-relative helpers take an injectable `now`/`holidays`, so they stay deterministic in tests and never touch the network. `holidays` are matched by local calendar day (time-of-day ignored); weekends default to Sat + Sun and are fully configurable.

### Works well with

- **Humanized / relative-time display** (`"3 hours ago"`, `"1h 30m"`) → **[@lacspace/humanize](https://developer.lacspace.com/packages/humanize)**
- **Timezone-aware conversion** (across IANA zones) → **[@lacspace/timezone](https://developer.lacspace.com/packages/timezone)**
- **Bikram Sambat (BS ↔ AD)** → **[@lacspace/nepali-date](https://developer.lacspace.com/packages/nepali-date)**

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/datetime` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/datetime
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

<div align="center">

# @lacspace/duration

**An immutable, zero-dependency Duration type — parse, build, normalize & do arithmetic on ISO-8601 time spans.**

[![npm version](https://img.shields.io/npm/v/@lacspace/duration?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/duration)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/duration?label=minzip)](https://bundlephobia.com/package/@lacspace/duration)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/duration)
[![license](https://img.shields.io/npm/l/@lacspace/duration?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The **data / arithmetic** side of time spans. Parse `P3Y6M4DT12H30M5S`, add and scale spans, normalize the carry, convert to milliseconds — all on one small, typed, immutable value. Zero dependencies, works in Node, the browser, Deno, Bun and edge runtimes (no `node:` imports).

> **New in 1.1.0** — additive, fully backward-compatible: an optional calendar-safe `humanizeDuration()` (`"1h 30m"` / `"1 hour 30 minutes"`), digital-clock `toClock()` + `parseClock()` (`"01:30:00"` round-trips), and helpers `clampDuration()`, `sumDurations()`, `rebalance()`, `durationSign()` / `isNegativeDuration()`. Nothing existing changed.

- ⏳ **ISO-8601 parser** — `P3Y6M4DT12H30M5S`, `PT1H30M`, `P1W`, fractional last component (`PT0.5H`), negative (`-PT30M`)
- 🧱 **Immutable value** — `.add` / `.subtract` / `.negate` / `.abs` / `.scale` / `.normalize` all return a new `Duration`
- 🔢 **Honest conversions** — `.toMillis()`, `.toSeconds()`, `.as(unit)` using fixed 24h/60m/60s math
- 📆 **Calendar-honest** — months & years have **no fixed length**; conversions that need one **throw** unless you opt in explicitly
- 🔁 **Round-trips** — `.toISO()` / `.toJSON()` re-parse cleanly
- 🧮 `Duration.between(a, b)`, `fromMillis`, `zero`, `compare`, `equals`, `maxDuration`, `minDuration`

## Not a display library

This package is intentionally **not** about humanized output. For `"1h 30m"` / `"in 2 days"`, pair it with **[`@lacspace/humanize`](https://www.npmjs.com/package/@lacspace/humanize)** — a separate, optional package (not a dependency here):

```ts
import { duration } from "@lacspace/duration";
import { duration as humanize } from "@lacspace/humanize";

humanize(duration({ hours: 1, minutes: 30 }).toMillis()); // "1h 30m"
```

`@lacspace/duration` owns the *data & math*; `@lacspace/humanize` owns the *words*.

## Install

```bash
npm install @lacspace/duration      # or pnpm add / yarn add / bun add
```

## Use

```ts
import { parseDuration, duration, Duration } from "@lacspace/duration";

// Parse ISO-8601
const d = parseDuration("PT1H30M");
d.toMillis();                        // 5400000

// Build from parts or from milliseconds
duration({ hours: 1, minutes: 30 }).toMillis();  // 5400000
duration(5_400_000).toISO();                     // "PT1H30M"

// Arithmetic (immutable — every call returns a new Duration)
duration({ hours: 1, minutes: 30 })
  .add({ minutes: 45 })
  .normalize()
  .toISO();                          // "PT2H15M"

duration({ minutes: 90 }).scale(2).normalize().toISO();  // "PT3H"

// Exact span between two Dates (calendar-free)
Duration.between(new Date("2026-01-01T00:00Z"), new Date("2026-01-02T06:00Z"))
  .toISO();                          // "P1DT6H"

// Convert to a unit
duration({ hours: 36 }).as("days");  // 1.5
```

## New in 1.1.0 — display & convenience helpers

All additive; the core parse/build/math API is unchanged.

```ts
import {
  humanizeDuration, toClock, parseClock,
  clampDuration, sumDurations, rebalance,
  durationSign, isNegativeDuration, duration, parseDuration,
} from "@lacspace/duration";

// Calendar-safe humanizer (reads the fields, never converts months/years)
humanizeDuration(duration({ hours: 1, minutes: 30 }));                  // "1h 30m"
humanizeDuration(duration({ hours: 1, minutes: 30 }), { short: false });// "1 hour 30 minutes"
humanizeDuration(duration({ minutes: 90 }), { normalize: true });       // "1h 30m"
humanizeDuration(parseDuration("P1Y6M"));                               // "1y 6mo"
humanizeDuration(d, { short: false, conjunction: " and ", largest: 2 });// "1 hour and 30 minutes"

// Digital clock (fixed part only — throws on months/years, like toMillis)
toClock(duration({ hours: 1, minutes: 30 }));                           // "01:30:00"
toClock(duration({ hours: 36 }));                                       // "36:00:00"
toClock(duration({ days: 1, hours: 12 }), { showDays: true });          // "01:12:00:00"
parseClock("01:30:00").toISO();                                         // "PT1H30M"  (round-trips)

// Sign, clamp, sum, calendar-aware rebalance
durationSign(parseDuration("-PT30M"));                                  // -1
isNegativeDuration(duration({ minutes: -5 }));                          // true
clampDuration(duration({ hours: 5 }), duration({ minutes: 30 }), duration({ hours: 2 })); // = 2h
sumDurations(duration({ hours: 1 }), duration({ minutes: 30 })).normalize().toISO();      // "PT1H30M"
rebalance(duration({ months: 1 }), { assumeMonthDays: 30 }).toMillis(); // 2592000000
```

## Calendar honesty (the important part)

A **week** and a **day** have fixed lengths here: `1 week = 7 days`, `1 day = 24 h`. This ignores DST and leap seconds — a deliberate, documented simplification.

A **month** and a **year** do **not** have a fixed number of milliseconds. So this library **never silently pretends** a month is 30 days:

```ts
duration({ months: 1 }).toMillis();
// ❌ throws: months have no fixed millisecond length

duration({ months: 1 }).toMillis({ assumeMonthDays: 30 });
// ✅ 2592000000 — you opted in explicitly

duration({ years: 1 }).toMillis({ assumeYearDays: 365 });   // ✅
duration({ years: 1 }).toMillis({ assumeMonthDays: 30 });   // ✅ year = 12 × 30 = 360 days
```

Because of this:

- **`.normalize()`** carries `ms → s → m → h → days` and folds `weeks → days`, and carries `months → years` (12 = 1) — but it **never** turns months/years into days.
- **`.equals()`** compares normalized value, so `P1W === P7D` and `PT60M === PT1H`, but **`P1M ≠ P30D`**.
- **`.compare()` / `maxDuration` / `minDuration`** need a total order, so they use a **nominal** basis (month ≈ 30 d, year ≈ 365 d) **for ordering only** — never for value conversions.

## API

| Group | Members |
| --- | --- |
| Parse | `parseDuration(iso)`, `tryParseDuration(iso)` (→ `null`) |
| Build | `duration(parts \| ms)`, `Duration.fromMillis(ms)`, `Duration.between(a, b)`, `Duration.zero` |
| Fields | `.years .months .weeks .days .hours .minutes .seconds .milliseconds`, `.toObject()` |
| Math | `.add` `.subtract` `.negate` `.abs` `.scale` `.normalize` |
| Convert | `.toMillis(opts?)` `.toSeconds(opts?)` `.as(unit, opts?)` |
| Serialize | `.toISO()` `.toJSON()` `.toString()` |
| Compare | `.equals` `.compare` `.isZero` |
| Helpers | `isDuration(x)`, `maxDuration(...)`, `minDuration(...)`, `msPerUnit(unit, opts?)` |
| Display *(1.1.0)* | `humanizeDuration(d, opts?)`, `toClock(d, opts?)`, `parseClock(str)` |
| Ops *(1.1.0)* | `clampDuration(d, min, max)`, `sumDurations(...)`, `rebalance(d, opts?)`, `durationSign(d)`, `isNegativeDuration(d)` |
| Constants | `MS_PER_SECOND` `MS_PER_MINUTE` `MS_PER_HOUR` `MS_PER_DAY` `MS_PER_WEEK` |

`HumanizeOptions` = `{ units?, largest?, short?, separator?, conjunction?, normalize?, zero? }`. `ClockOptions` = `{ showDays?, fractionalDigits?, padLeading? }`.

`CalendarOptions` = `{ assumeMonthDays?: number; assumeYearDays?: number }`. Supplying either is your explicit opt-in to approximating months/years; with only `assumeMonthDays` a year is `assumeMonthDays × 12` days.

Every method is fully typed, the value is `Object.freeze`d, and mutating-looking methods always return a **new** `Duration`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

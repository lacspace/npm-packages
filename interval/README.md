<div align="center">

# @lacspace/interval

**Time ranges, date iteration & business-day math — overlaps, merge, free/busy, eachDay/Week/Month, working days.**

[![npm version](https://img.shields.io/npm/v/@lacspace/interval?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/interval)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/interval?label=minzip)](https://bundlephobia.com/package/@lacspace/interval)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/interval)
[![license](https://img.shields.io/npm/l/@lacspace/interval?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The time-range toolkit you keep re-implementing: does meeting A clash with B? merge a pile of busy blocks, find the free slots, list every day/week/month in a range, and add "3 business days" that skips weekends and holidays — one tiny, typed, dependency-free package.

- 📐 **Ranges** — `interval`, `overlaps`, `intersection`, `union`, `difference`, `gap`, `contains`, `abuts`, `split`, `clampDate`
- 🧩 **Merging** — `mergeIntervals` (coalesce), `intersectAll`, `invert` (the classic **free/busy** calc)
- 🔁 **Iteration** — `eachDayOfInterval`, `eachWeekOfInterval`, `eachMonthOfInterval`, `eachHourOfInterval`, generic `eachOfInterval`
- 💼 **Business days** — `isBusinessDay`, `addBusinessDays`, `businessDaysBetween`, `next/prevBusinessDay`… weekend **and** holiday aware

Zero dependencies. Isomorphic (Node, browsers, Deno, Bun, edge). Works with `Date | number` everywhere.

## Install

```bash
npm install @lacspace/interval      # or pnpm add / yarn add / bun add
```

## Use

```ts
import {
  interval, overlaps, intersection, mergeIntervals, invert,
  eachDayOfInterval, addBusinessDays, businessDaysBetween,
} from "@lacspace/interval";

const a = interval("2026-01-05T09:00Z", "2026-01-05T10:00Z");
const b = interval("2026-01-05T09:30Z", "2026-01-05T11:00Z");

overlaps(a, b);                       // true
intersection(a, b);                   // { start: 09:30, end: 10:00 }

// Merge busy blocks, then find free time inside a working day:
const busy = mergeIntervals([a, b]);  // one 09:00–11:00 block
invert(busy, interval("2026-01-05T09:00Z", "2026-01-05T17:00Z"));
// → [ { 11:00 → 17:00 } ]  (the free slot)

eachDayOfInterval(interval("2026-01-01Z", "2026-01-03Z")).length;   // 3

// Skip weekends + holidays:
addBusinessDays("2026-01-02", 1, { holidays: ["2026-01-06"] });     // Fri → Mon (or later)
businessDaysBetween("2026-01-05", "2026-01-12");                    // 5
```

## Half-open ranges `[start, end)`

Intervals are **half-open by default**: the `start` instant is included, the `end` instant is not. So two ranges that merely touch (`a.end === b.start`) do **not** overlap — they *abut*. This makes back-to-back slots compose cleanly (no double-counted boundary).

All calendar helpers (`startOfDay`, week/month boundaries, weekday detection, business days) are computed in **UTC**, so results are deterministic regardless of the host machine's timezone.

## API

| Group | Functions |
| --- | --- |
| Build | `interval`, `isValidInterval`, `durationMs`, `isSameDay` |
| Query | `contains`, `overlaps`, `abuts`, `isEqual` |
| Combine | `intersection`, `union`, `difference`, `gap`, `clampDate`, `split` |
| Lists | `mergeIntervals`, `intersectAll`, `invert` |
| Iterate | `eachDayOfInterval`, `eachWeekOfInterval`, `eachMonthOfInterval`, `eachHourOfInterval`, `eachOfInterval` |
| Business days | `isBusinessDay`, `addBusinessDays`, `subtractBusinessDays`, `businessDaysBetween`, `nextBusinessDay`, `prevBusinessDay`, `eachBusinessDayOfInterval` |

### Notes

- `intersection` / `union` return `null` when the result is empty/disjoint (touching → `null` for `intersection`; touching → merged for `union`).
- `difference(a, b)` returns 0, 1 or 2 intervals (the parts of `a` not covered by `b`).
- `mergeIntervals` sorts then coalesces anything overlapping **or** adjacent.
- Iteration helpers return start-of-unit `Date[]` and are **inclusive of the end** unit.
- Business-day config: `{ weekendDays?: number[] (default [0, 6]), holidays?: (Date | number | "YYYY-MM-DD")[] }`.
- `businessDaysBetween(a, b)` counts the half-open range `[a, b)` and is signed (negative when `b < a`).

## Where it fits

`@lacspace/interval` is the **range & iteration** piece of the Lacspace date family — it deliberately owns time-ranges and business-day math and depends on none of the others:

- **[@lacspace/datetime](https://developer.lacspace.com/packages/datetime)** — single-date arithmetic
- **[@lacspace/duration](https://developer.lacspace.com/packages/duration)** — spans of time
- **[@lacspace/timezone](https://developer.lacspace.com/packages/timezone)** — zone conversions
- **[@lacspace/humanize](https://developer.lacspace.com/packages/humanize)** — human-readable display

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

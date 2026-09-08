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
- ➕ **Algebra & analytics** *(new in 1.1.0)* — `containsInterval`, `overlapMs`, `midpoint`, `shift`, `expand`, `sortIntervals`, `totalDuration`, `coverage`, `gaps`, `differenceAll`, `maxConcurrency`

> **New in 1.1.0** — strictly additive helpers for scheduling/analytics: full-containment & overlap-length checks, shift/expand/midpoint, and list analytics — total covered time, `coverage` (utilization 0–1), inner `gaps`, many-way `differenceAll`, and peak `maxConcurrency`. No existing API changed.

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

### Analytics (new in 1.1.0)

```ts
import {
  totalDuration, coverage, gaps, differenceAll, maxConcurrency,
  containsInterval, overlapMs, shift, expand, midpoint,
} from "@lacspace/interval";

const shifts = [
  interval("2026-01-05T09:00Z", "2026-01-05T13:00Z"),
  interval("2026-01-05T12:00Z", "2026-01-05T17:00Z"),   // overlaps 12–13
];

totalDuration(shifts);                                   // 8h in ms (overlap counted once)
coverage(shifts, interval("2026-01-05T09:00Z", "2026-01-05T17:00Z")); // 1 (100% utilization)
maxConcurrency(shifts);                                  // 2 (peak simultaneous)
gaps(shifts);                                            // [] (they touch/overlap → one block)

// Set-subtract a whole list, e.g. remove breaks from a working day:
differenceAll(
  interval("2026-01-05T09:00Z", "2026-01-05T17:00Z"),
  [interval("2026-01-05T12:00Z", "2026-01-05T13:00Z")], // lunch
);                                                       // [ 09–12, 13–17 ]

containsInterval(shifts[1], interval("2026-01-05T14:00Z", "2026-01-05T15:00Z")); // true
overlapMs(shifts[0], shifts[1]);                         // 3_600_000 (1h)
midpoint(shifts[0]);                                     // 2026-01-05T11:00Z
shift(shifts[0], 3_600_000);                             // moved +1h
expand(shifts[0], 900_000);                              // 15min buffer each side
```

## Half-open ranges `[start, end)`

Intervals are **half-open by default**: the `start` instant is included, the `end` instant is not. So two ranges that merely touch (`a.end === b.start`) do **not** overlap — they *abut*. This makes back-to-back slots compose cleanly (no double-counted boundary).

All calendar helpers (`startOfDay`, week/month boundaries, weekday detection, business days) are computed in **UTC**, so results are deterministic regardless of the host machine's timezone.

## API

| Group | Functions |
| --- | --- |
| Build | `interval`, `isValidInterval`, `durationMs`, `isSameDay` |
| Query | `contains`, `overlaps`, `abuts`, `isEqual`, `containsInterval`, `overlapMs`, `isEmpty` |
| Combine | `intersection`, `union`, `difference`, `gap`, `clampDate`, `split`, `shift`, `expand`, `midpoint` |
| Lists | `mergeIntervals`, `intersectAll`, `invert`, `sortIntervals`, `totalDuration`, `coverage`, `gaps`, `differenceAll`, `maxConcurrency` |
| Iterate | `eachDayOfInterval`, `eachWeekOfInterval`, `eachMonthOfInterval`, `eachHourOfInterval`, `eachOfInterval` |
| Business days | `isBusinessDay`, `addBusinessDays`, `subtractBusinessDays`, `businessDaysBetween`, `nextBusinessDay`, `prevBusinessDay`, `eachBusinessDayOfInterval` |

### Notes

- `intersection` / `union` return `null` when the result is empty/disjoint (touching → `null` for `intersection`; touching → merged for `union`).
- `difference(a, b)` returns 0, 1 or 2 intervals (the parts of `a` not covered by `b`).
- `mergeIntervals` sorts then coalesces anything overlapping **or** adjacent.
- Iteration helpers return start-of-unit `Date[]` and are **inclusive of the end** unit.
- Business-day config: `{ weekendDays?: number[] (default [0, 6]), holidays?: (Date | number | "YYYY-MM-DD")[] }`.
- `businessDaysBetween(a, b)` counts the half-open range `[a, b)` and is signed (negative when `b < a`).
- `totalDuration` / `coverage` merge overlaps first, so shared time is **counted once**; `coverage` returns a fraction in `[0, 1]` of the given window (`0` for a zero-length window).
- `gaps(list)` returns only the spaces **between** merged blocks (no outer bound — use `invert` for a bounded free/busy calc).
- `maxConcurrency(list)` is the peak number of intervals overlapping at one instant; half-open, so back-to-back intervals aren't simultaneous.
- `differenceAll(a, subtract[])` subtracts a whole list from `a` (the many-way `difference`).
- `expand(iv, ms)` grows both ends by `ms` (negative shrinks; collapses to the centre if over-shrunk); `shift(iv, ms)` translates the whole interval.

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

<div align="center">

# @lacspace/timezone

**IANA timezones done right — DST-correct offsets, wall-clock parts, and zoned↔UTC conversion, built on the platform's own tz database.**

[![npm version](https://img.shields.io/npm/v/@lacspace/timezone?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/timezone)
[![install size](https://packagephobia.com/badge?p=@lacspace/timezone)](https://packagephobia.com/result?p=@lacspace/timezone)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/timezone?label=minzip)](https://bundlephobia.com/package/@lacspace/timezone)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/timezone)
[![license](https://img.shields.io/npm/l/@lacspace/timezone?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Built **on top of** the platform `Intl.DateTimeFormat`, which already ships the full IANA tz database in every modern runtime (Node 18+, browsers, edge). So this package bundles **no tz data** — it stays a few bytes and is always as current as the host. Given an instant and an IANA zone, get the UTC offset and the local wall-clock parts, and convert between a zone's wall time and a UTC instant, **DST-correct**.

- 🕐 `getOffset()` / `getOffsetString()` → `345` · `"+05:45"` (DST-aware)
- 🧩 `zonedParts()` → the full wall-clock breakdown in a zone (+ abbreviation)
- 🔁 `fromZoned()` → wall time back to the correct UTC `Date` (two-pass DST fixpoint)
- 🌐 `convert()` · `toZone()` — re-express one instant across zones
- 🖊️ `formatInZone()` · `getAbbreviation()` — format an instant / read `EST`·`EDT` in a zone *(new in 1.1.0)*
- ⚖️ `compareZones()` · `offsetDifference()` — how far ahead one zone is of another *(new in 1.1.0)*
- 📜 `listTimeZones()` · `isValidTimeZone()` · `getSystemTimeZone()`
- ☀️ `isDST()` · `nextTransition()` · `previousTransition()` · `listTransitions()` · `transitionsInYear()` — DST detection & scanning *(back/range scans new in 1.1.0)*
- ⚡ Zero dependencies · 🌍 isomorphic (only needs `Intl`) · 📦 ESM + CJS · fully typed · no `node:` imports

> **New in 1.1.0** — strictly additive: zoned string formatting (`formatInZone`) and abbreviation lookup (`getAbbreviation`), zone-vs-zone comparison (`compareZones` / `offsetDifference`), and backward/range DST scanning (`previousTransition` / `listTransitions` / `transitionsInYear`). Every existing export is byte-for-byte unchanged.

> **Where it fits:** trading hours live in [`@lacspace/market-clock`](https://www.npmjs.com/package/@lacspace/market-clock); calendar math in UTC/local lives in `@lacspace/datetime`. This package is the **timezone layer** underneath both.

## Install

```bash
npm install @lacspace/timezone      # or pnpm add / yarn add / bun add
```

## Quick start

```ts
import { getOffsetString, zonedParts, fromZoned, convert } from "@lacspace/timezone";

const instant = new Date("2024-07-15T12:00:00Z");

getOffsetString("Asia/Kathmandu", instant); // "+05:45"
getOffsetString("America/New_York", instant); // "-04:00" (EDT — DST-aware)

zonedParts(instant, "Asia/Kathmandu");
// { year:2024, month:7, day:15, hour:17, minute:45, second:0,
//   weekday:1, offsetMinutes:345, abbreviation:"GMT+5:45" }

// "3pm on 1 Sep 2024, New York local time" → the correct UTC instant:
fromZoned({ year: 2024, month: 9, day: 1, hour: 15 }, "America/New_York");
// 2024-09-01T19:00:00.000Z  (EDT is −04:00)

// "It's 14:00 in New York — what time in Tokyo?"
const c = convert(new Date("2024-07-15T18:00:00Z"), "America/New_York", "Asia/Tokyo");
c.from.hour; // 14   (New York, EDT)
c.to.hour;   // 3    (Tokyo, next day — JST +09:00)
```

### New in 1.1.0

```ts
import {
  formatInZone, getAbbreviation,
  compareZones, offsetDifference,
  previousTransition, listTransitions, transitionsInYear,
} from "@lacspace/timezone";

const t = new Date("2024-07-15T12:00:00Z");

formatInZone(t, "Asia/Kathmandu");                       // "Jul 15, 2024, 17:45:00"
formatInZone(t, "Asia/Tokyo", { dateStyle: "medium", timeStyle: "short" });
getAbbreviation("America/New_York", t);                  // "EDT"
getAbbreviation("America/New_York", t, "long");          // "Eastern Daylight Time"

const cmp = compareZones("Asia/Tokyo", "America/New_York", t);
cmp.differenceHours; // 13   → Tokyo is 13h ahead of New York (EDT)
cmp.ahead;           // "A"
offsetDifference("Asia/Tokyo", "America/New_York", t);   // 780 (minutes)

// Every DST switch in a window / year:
transitionsInYear("America/New_York", 2024);
// [ { at: 2024-03-10T07:00:00Z, offsetBefore:-300, offsetAfter:-240 },
//   { at: 2024-11-03T06:00:00Z, offsetBefore:-240, offsetAfter:-300 } ]
previousTransition("America/New_York", Date.UTC(2024, 5, 1)); // the 2024-03-10 spring-forward
```

## API

### Offsets

```ts
getOffset(zone: string, instant?: Date | number): number
```
UTC offset in **minutes** for `zone` at `instant` (defaults to now), DST-aware. Positive is east of UTC. `Asia/Kathmandu → 345`, `America/New_York → -300` (winter) / `-240` (summer).

```ts
getOffsetString(zone: string, instant?: Date | number): string   // "+05:45", "-04:00", "+00:00"
```

### Wall-clock breakdown

```ts
zonedParts(instant: Date | number, zone: string): {
  year: number; month: number /* 1-12 */; day: number;
  hour: number; minute: number; second: number;
  weekday: number /* 0=Sun..6=Sat */;
  offsetMinutes: number; abbreviation: string;
}
```
The local wall-clock parts of an instant, as observed in `zone`. Uses `Intl.DateTimeFormat` + `formatToParts`; the abbreviation comes from `timeZoneName: "short"`.

### Wall time → UTC instant

```ts
fromZoned(
  parts: { year; month; day; hour?; minute?; second?; ms? },
  zone: string
): Date
```
The inverse of `zonedParts`: interpret `parts` **as local wall time in `zone`** and return the correct UTC `Date`. Uses the standard **two-pass DST fixpoint** — guess, read the offset at the guess, correct, then re-read and correct once more so results that cross a DST boundary land right.

`fromZoned(zonedParts(x, zone), zone)` round-trips back to `x` for any unambiguous local time.

### Convenience conversions

```ts
toZone(instant, zone): { date: Date; parts: ZonedParts }
convert(instant, fromZone, toZone): { date: Date; from: ZonedParts; to: ZonedParts }
```
An instant is absolute, so `date` is unchanged; the zones only shape the returned wall-clock `parts`.

### Zoned formatting *(new in 1.1.0)*

```ts
formatInZone(instant, zone, options?): string
getAbbreviation(zone, instant?, style?: "short" | "long"): string
```
`formatInZone` renders an instant as a string **as observed in `zone`**, taking any `Intl.DateTimeFormatOptions` plus an optional `locale` (defaults to `"en-US"` for deterministic output; a sensible field set is used when none is given). The `zone` argument always wins over any `timeZone` you pass in `options`. `getAbbreviation` returns the zone's short (`"EST"`, `"UTC"`, or a numeric `"GMT+5:45"` fallback) or long (`"Eastern Standard Time"`) name at the instant — DST-aware.

### Zone comparison *(new in 1.1.0)*

```ts
compareZones(zoneA, zoneB, instant?): {
  zoneA; zoneB; offsetA; offsetB;
  differenceMinutes /* offsetA − offsetB */;
  differenceHours; ahead: "A" | "B" | "same";
}
offsetDifference(zoneA, zoneB, instant?): number   // minutes, = differenceMinutes
```
How far ahead one zone's clock is of another's at `instant` (defaults to now), DST-aware. Positive means `zoneA` is east of / ahead of `zoneB`.

### Zones

```ts
listTimeZones(): string[]          // Intl.supportedValuesOf('timeZone'), else a bundled fallback list
isValidTimeZone(zone): boolean     // type guard; "UTC" ok, garbage/non-strings rejected
getSystemTimeZone(): string        // the host's zone, or "UTC"
FALLBACK_TIME_ZONES: readonly string[]
```

### DST

```ts
isDST(zone, instant?): boolean
nextTransition(zone, from?): Transition | null
previousTransition(zone, from?): Transition | null                       // new in 1.1.0
listTransitions(zone, { from, to }): Transition[]                        // new in 1.1.0
transitionsInYear(zone, year): Transition[]                              // new in 1.1.0
// type Transition = { at: Date; offsetBefore: number; offsetAfter: number }
```
`isDST` compares the offset at the instant against the zone's minimum offset over that calendar year (its standard time) — works in both hemispheres; zones without DST return `false`. `nextTransition` steps forward in 6-hour increments for up to ~13 months to find the next offset change, then binary-searches down to the millisecond. `previousTransition` is its backward mirror. `listTransitions` / `transitionsInYear` enumerate **every** offset change in a window (chronological order; `[]` for no-DST zones) by chaining `nextTransition`. See the limitations below.

## DST edge cases & honest limitations

Timezone conversion has genuinely undefined moments; here is exactly what this package does at them.

- **Nonexistent wall times** (spring-forward gap — e.g. `02:30` on the US day clocks jump `02:00 → 03:00`) don't exist on the timeline. `fromZoned` still returns a *valid* instant; the two-pass lands it on the pre-gap side, so its own `zonedParts` reads one gap-length earlier (`02:30 → 01:30`). There is no universally "correct" answer here.
- **Ambiguous wall times** (fall-back hour that occurs twice) map to a **single** instant — the earlier (pre-fall-back) occurrence. You can't select the later one through `fromZoned`; supply the intended offset yourself if you need that control.
- **`isDST` / `nextTransition` scan** — they detect DST by observing offset *changes*, not from a rules table. `isDST` assumes a normal seasonal DST regime (at most one on/off per year). `nextTransition` reports only the **first** change within its ~13-month horizon and returns `null` beyond it. Best-effort, and honest about it.
- **Offset granularity** — offsets are reported in whole **minutes** (every modern IANA offset is a whole number of minutes). Sub-minute historical offsets from the deep past are rounded.
- **Zone id spelling** — `listTimeZones()` returns whatever ids the host's ICU uses; older ICU builds may list legacy aliases (`Asia/Katmandu`, `Asia/Calcutta`). Both the alias and the canonical id still resolve correctly through every function here.
- **Requires `Intl`** with IANA zone support (Node 18+, all evergreen browsers, edge runtimes). `Intl.supportedValuesOf` is feature-detected — on engines that lack it, `listTimeZones()` returns `FALLBACK_TIME_ZONES`.

## Why build on `Intl`?

The tz database changes several times a year (governments move DST rules). Libraries that *bundle* it go stale and ship hundreds of KB. Delegating to `Intl.DateTimeFormat` means the data is the runtime's, kept current by the platform, and this package stays tiny — the value it adds is the ergonomic, typed, DST-correct API on top.

## License

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).

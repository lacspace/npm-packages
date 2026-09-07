<div align="center">

# @lacspace/market-clock

**Is the market open right now? When does it next open or close? — a holiday-aware, timezone-correct trading clock.**

[![npm version](https://img.shields.io/npm/v/@lacspace/market-clock?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/market-clock)
[![install size](https://packagephobia.com/badge?p=@lacspace/market-clock)](https://packagephobia.com/result?p=@lacspace/market-clock)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/market-clock?label=minzip)](https://bundlephobia.com/package/@lacspace/market-clock)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/market-clock)
[![license](https://img.shields.io/npm/l/@lacspace/market-clock?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Every trading app needs to answer "are we open?" correctly — accounting for weekends, holidays, pre-open sessions **and** the exchange's timezone. This does it in a few bytes. Ships with presets for **NSE · BSE · NYSE · NASDAQ · LSE · TSE · HKEX · SGX** — no-DST exchanges use an exact fixed offset, US/UK use an IANA `timeZone` so open/close stay correct across daylight-saving.

- 🟢 `isOpen()` · `isPreOpen()` · `status()` → `"open" | "pre-open" | "closed"`
- 🧩 `currentSegment()` → `"pre-open" | "regular" | "post" | "closed"` · `nextSegmentChange()`
- ⏭️ `nextOpen()` · `nextClose()` · `timeUntilOpen()` · `timeUntilClose()` · `msToOpen()` · `msToClose()`
- 📅 Weekend + holiday aware · pre-open + **after-hours** sessions · **half-day / early-close** overrides
- 📆 `nextSessions(now, n)` · `sessionsBetween(a, b)` — skips weekends, holidays, half-days
- 🏦 `PRESETS` (8 exchanges), or bring your own `ExchangeSpec`
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

> **New in 1.1.0** — built-in presets for 8 exchanges (`PRESETS`), DST-correct `timeZone` support, distinct **session segments** (pre-open · regular · post · closed) with `currentSegment()` / `nextSegmentChange()`, **half-day early closes**, `timeUntilOpen()` / `timeUntilClose()` countdowns, and `nextSessions()` / `sessionsBetween()`. Fully additive — every 1.0.x export is unchanged.

## Install

```bash
npm install @lacspace/market-clock      # or pnpm add / yarn add / bun add
```

## Quick start

```ts
import { MarketClock, NSE } from "@lacspace/market-clock";

const nse = new MarketClock(NSE);

nse.isOpen();        // true / false, right now (IST-correct from any timezone)
nse.status();        // "open" | "pre-open" | "closed"
nse.isHoliday();     // is today an exchange holiday?

nse.nextOpen();      // Date — next session open
nse.nextClose();     // Date — next session close
nse.msToClose();     // ms remaining until close (0 if not open)
```

## Build a live badge

```ts
const label = {
  open: "🟢 Market open",
  "pre-open": "🟡 Pre-open",
  closed: "🔴 Closed",
}[nse.status()];

if (nse.isOpen()) {
  const mins = Math.round(nse.msToClose() / 60000);
  console.log(`${label} · closes in ${mins} min`);
} else {
  console.log(`${label} · opens ${nse.nextOpen().toLocaleString()}`);
}
```

## Built-in presets

```ts
import { PRESETS, NYSE, NSE, MarketClock } from "@lacspace/market-clock";

const nyse = new MarketClock(NYSE);   // DST-correct via IANA "America/New_York"
nyse.isOpen();                        // handles EDT ↔ EST automatically

Object.keys(PRESETS);                 // NSE, BSE, NYSE, NASDAQ, LSE, TSE, HKEX, SGX
new MarketClock(PRESETS.SGX).status();
```

No-DST exchanges (NSE/BSE/TSE/HKEX/SGX) use an exact fixed `offsetMinutes`; US/UK presets set an IANA `timeZone` (DST-correct via `Intl`). Bundled holiday lists cover 2025–2026 nationally-fixed observances only — verify and extend. Intraday lunch breaks (TSE, HKEX) are not modelled.

## Session segments

```ts
const nyse = new MarketClock(NYSE);

nyse.currentSegment();       // "pre-open" | "regular" | "post" | "closed"

const change = nyse.nextSegmentChange();
change.segment;              // the segment that begins next
change.at;                   // Date of the boundary
```

## Half-days / early close

```ts
// Presets already carry the well-known early closes; add your own:
const nyse = new MarketClock({
  ...NYSE,
  halfDays: { ...NYSE.halfDays, "2026-07-03": { close: "13:00" } },
});

nyse.isHalfDay(new Date("2026-07-03T15:00:00Z"));  // true
```

## Countdowns + next N sessions

```ts
nyse.timeUntilOpen();        // ms until the next regular open  (> 0)
nyse.timeUntilClose();       // ms until the next regular close (early on a half-day)

nyse.nextSessions(new Date(), 5);   // next 5 trading sessions (skips weekends/holidays/half-days)
// → [{ date: "2026-01-05", open: Date, close: Date, halfDay: false }, ...]

nyse.sessionsBetween(new Date("2026-01-01Z"), new Date("2026-02-01Z"));  // all sessions in January
```

Every function also exists as a standalone import — `currentSegment(spec, at)`, `nextSessions(spec, now, n)`, `isTradingDay(spec, date)`, `isHoliday(spec, date)`, etc. — for a functional style.

## Custom exchange / your own holidays

```ts
import { MarketClock, NSE, createClock } from "@lacspace/market-clock";

// extend the built-in list
const nse = new MarketClock({ ...NSE, holidays: [...NSE.holidays, "2026-11-20"] });

// or a completely different exchange
const custom = createClock({
  name: "MyExchange",
  offsetMinutes: 0,              // minutes ahead of UTC (no-DST exchanges)
  preOpen: { open: "08:00", close: "08:15" },
  regular: { open: "08:15", close: "16:30" },
  weekend: [0, 6],              // Sun, Sat
  holidays: ["2026-12-25"],
});
```

> ℹ️ Holiday lists follow the annual exchange circular and can shift year to year. The built-in NSE list covers nationally-fixed days reliably — **verify and extend** for full-year accuracy.

## API

`MarketClock` members (all accept an optional instant; DST-correct):

| Member | Returns |
| --- | --- |
| `isOpen(at?)` `isPreOpen(at?)` | boolean |
| `isHoliday(at?)` `isWeekend(at?)` `isTradingDay(at?)` `isHalfDay(at?)` | boolean |
| `status(at?)` | `"open" \| "pre-open" \| "closed"` |
| `currentSegment(at?)` | `"pre-open" \| "regular" \| "post" \| "closed"` |
| `nextSegmentChange(at?)` | `{ segment, at: Date }` |
| `nextOpen(from?)` `nextClose(from?)` | Date |
| `msToOpen(at?)` `msToClose(at?)` `timeUntilOpen(now?)` `timeUntilClose(now?)` | number (ms) |
| `nextSessions(now?, n?)` `sessionsBetween(a, b)` | `SessionWindow[]` |

Standalone functions mirror the above as `fn(spec, ...)`: `currentSegment` · `nextSegmentChange` · `timeUntilOpen` · `timeUntilClose` · `nextOpenAt` · `nextCloseAt` · `nextSessions` · `sessionsBetween` · `isTradingDay` · `isHoliday` · `isHalfDay`.

| Preset | Timezone |
| --- | --- |
| `NSE` `BSE` | IST (+5:30, no DST) |
| `NYSE` `NASDAQ` | America/New_York (DST) |
| `LSE` | Europe/London (DST) |
| `TSE` | JST (+9, no DST) |
| `HKEX` | HKT (+8, no DST) |
| `SGX` | SGT (+8, no DST) |
| `PRESETS` | all eight, keyed by name |

`SessionWindow` = `{ date: string; open: Date; close: Date; halfDay: boolean }`. New optional `ExchangeSpec` fields: `postClose?`, `timeZone?`, `halfDays?`.

## The Lacspace StockKit

| Package | For |
| --- | --- |
| [`@lacspace/indicators`](https://www.npmjs.com/package/@lacspace/indicators) | Technical indicators |
| [`@lacspace/market`](https://www.npmjs.com/package/@lacspace/market) | P&L, XIRR, brokerage & charges |
| **`@lacspace/market-clock`** | Market hours & holidays (this package) |
| [`@lacspace/paper-trade`](https://www.npmjs.com/package/@lacspace/paper-trade) | Headless paper-trading engine |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/market-clock` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/market-clock
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.


<div align="center">

# @lacspace/market-clock

**Is the market open right now? When does it next open or close? — a holiday-aware, timezone-correct trading clock.**

[![npm version](https://img.shields.io/npm/v/@lacspace/market-clock?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/market-clock)
[![install size](https://packagephobia.com/badge?p=@lacspace/market-clock)](https://packagephobia.com/result?p=@lacspace/market-clock)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/market-clock?label=minzip)](https://bundlephobia.com/package/@lacspace/market-clock)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/market-clock)
[![license](https://img.shields.io/npm/l/@lacspace/market-clock?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Every trading app needs to answer "are we open?" correctly — accounting for weekends, holidays, pre-open sessions **and** the exchange's timezone. This does it in a few bytes. Ships with **NSE / BSE** presets (IST, no DST — so the offset is exact).

- 🟢 `isOpen()` · `isPreOpen()` · `status()` → `"open" | "pre-open" | "closed"`
- ⏭️ `nextOpen()` · `nextClose()` · `msToOpen()` · `msToClose()`
- 📅 Weekend + holiday aware · pre-open session support
- 🏦 `NSE` / `BSE` presets, or bring your own `ExchangeSpec`
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

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

| Member | Returns |
| --- | --- |
| `isOpen(at?)` `isPreOpen(at?)` | boolean |
| `isHoliday(at?)` `isWeekend(at?)` `isTradingDay(at?)` | boolean |
| `status(at?)` | `"open" \| "pre-open" \| "closed"` |
| `nextOpen(from?)` `nextClose(from?)` | Date |
| `msToOpen(at?)` `msToClose(at?)` | number (ms) |
| `NSE` `BSE` | `ExchangeSpec` presets |

## The Lacspace StockKit

| Package | For |
| --- | --- |
| [`@lacspace/indicators`](https://www.npmjs.com/package/@lacspace/indicators) | Technical indicators |
| [`@lacspace/market`](https://www.npmjs.com/package/@lacspace/market) | P&L, XIRR, brokerage & charges |
| **`@lacspace/market-clock`** | Market hours & holidays (this package) |
| [`@lacspace/paper-trade`](https://www.npmjs.com/package/@lacspace/paper-trade) | Headless paper-trading engine |

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · powers <a href="https://stockyatra.com">StockYatra</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>

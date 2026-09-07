<div align="center">

# @lacspace/paper-trade

**A headless paper-trading engine — the simulator core behind [StockYatra](https://stockyatra.com).**

[![npm version](https://img.shields.io/npm/v/@lacspace/paper-trade?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/paper-trade)
[![install size](https://packagephobia.com/badge?p=@lacspace/paper-trade)](https://packagephobia.com/result?p=@lacspace/paper-trade)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/paper-trade?label=minzip)](https://bundlephobia.com/package/@lacspace/paper-trade)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/paper-trade)
[![license](https://img.shields.io/npm/l/@lacspace/paper-trade?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Build a full trading simulator in an afternoon. A virtual wallet, an order book, market / limit / stop orders that **fill against live prices**, positions, holdings and live mark-to-market P&L — all framework-agnostic and dependency-free. Drop it into React, Node, a bot, a game, anything.

- 💼 Virtual cash wallet with realised **and** unrealised P&L
- 🧾 `MARKET`, `LIMIT`, `SL`, `SL-LIMIT` and `TRAILING-SL` orders that fill as prices move
- ⏱️ Time-in-force — `DAY` / `GTC` / `IOC` / `FOK` (with optional partial fills)
- 📈 Positions, holdings, weighted average price, portfolio summary
- 💸 Pluggable commission & slippage models · 📉 equity-curve, returns & max-drawdown analytics
- 🔁 Optional short-selling · 💾 `toJSON()` / `restore()` for persistence
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

> **New in 1.2.0** — stop-limit & trailing-stop order types, time-in-force (`DAY`/`GTC`/`IOC`/`FOK`) with optional partial fills, a `processTick(symbol, price)` driver that reports what filled, pluggable commission (`flatCommission`/`percentCommission`/`perShareCommission`) and slippage (`fixedSlippage`/`percentSlippage`) models, and equity-curve analytics (`equityCurve()`, `performance()`, `maxDrawdown`, `equityStats`). Fully additive — every 1.1 API is unchanged.

## Install

```bash
npm install @lacspace/paper-trade      # or pnpm add / yarn add / bun add
```

## 60 seconds to a working simulator

```ts
import { PaperAccount } from "@lacspace/paper-trade";

const acct = new PaperAccount({ cash: 100_000 });

// feed prices (from your ticker / websocket), then trade
acct.mark({ RELIANCE: 2900 });
acct.buy("RELIANCE", { qty: 10 });     // market buy — fills at 2900

acct.mark({ RELIANCE: 2950 });         // price moves up
acct.unrealizedPnl;                    // 500
acct.summary().equity;                 // 100500 (cash + market value)

acct.sell("RELIANCE", { qty: 10 });    // book the profit
acct.realizedPnl;                      // 500
```

## Limit & stop orders fill automatically

```ts
// resting limit buy — fills when the price trades down to 3800
acct.buy("TCS", { qty: 5, price: 3800 });

// stop-loss sell — triggers when price falls to 2850
acct.sell("RELIANCE", { qty: 10, triggerPrice: 2850 });

// every mark() checks open orders and fills the ones that now qualify
acct.mark({ TCS: 3795, RELIANCE: 2840 });

acct.openOrders;   // still-resting orders
acct.trades;       // every execution
```

## Portfolio & holdings

```ts
acct.getHoldings();
// [{ symbol, qty, avgPrice, ltp, invested, current, pnl, pnlPercent }]

acct.summary();
// { cash, invested, marketValue, equity, unrealizedPnl, realizedPnl, charges, totalPnl, holdings }
```

## Persist & restore

```ts
localStorage.setItem("acct", JSON.stringify(acct.toJSON()));

const acct = PaperAccount.restore(JSON.parse(localStorage.getItem("acct")!));
```

## Tip: real-world net P&L

Pair it with [`@lacspace/market`](https://www.npmjs.com/package/@lacspace/market) to subtract brokerage & taxes from each round-trip, and [`@lacspace/market-clock`](https://www.npmjs.com/package/@lacspace/market-clock) to only accept orders while the market is open.

## API

| Member | Description |
| --- | --- |
| `new PaperAccount({ cash, allowShort?, now?, charges?, slippage?, trackEquity? })` | create an account |
| `mark(prices)` | feed price(s); triggers pending orders + MTM |
| `buy(sym, { qty, price?, triggerPrice?, limitPrice?, trail?, tif? })` | buy (market / limit / SL / SL-limit / trailing) |
| `sell(sym, { qty, price?, triggerPrice?, limitPrice?, trail?, tif? })` | sell (market / limit / SL / SL-limit / trailing) |
| `place(req)` / `cancel(id)` | low-level order control |
| `processTick(sym, price)` | feed one tick; returns the orders that filled |
| `endSession(reason?)` | cancel all resting `DAY` orders |
| `getPositions()` / `getHoldings()` / `summary()` | portfolio state |
| `cash` `realizedPnl` `unrealizedPnl` `pnl` | live figures |
| `orders` `openOrders` `trades` | order & trade history |
| `equityCurve()` / `recordEquity()` / `performance()` | analytics (needs `trackEquity`) |
| `toJSON()` / `PaperAccount.restore(snap)` | persistence |

## The Lacspace StockKit

| Package | For |
| --- | --- |
| [`@lacspace/indicators`](https://www.npmjs.com/package/@lacspace/indicators) | Technical indicators |
| [`@lacspace/market`](https://www.npmjs.com/package/@lacspace/market) | P&L, XIRR, brokerage & charges |
| [`@lacspace/market-clock`](https://www.npmjs.com/package/@lacspace/market-clock) | Is the market open? holidays |
| **`@lacspace/paper-trade`** | Paper-trading engine (this package) |

## New in 1.1 — real charges & trade stats

```ts
import { PaperAccount } from "@lacspace/paper-trade";
import { charges } from "@lacspace/market";

// Deduct real Indian brokerage/STT/GST on every fill — net P&L, not optimistic
const acct = new PaperAccount({
  cash: 100_000,
  charges: ({ side, qty, price }) =>
    charges({
      segment: "intraday",
      qty,
      buy: side === "BUY" ? price : 0,
      sell: side === "SELL" ? price : 0,
    }).totalCharges,
});

// Backtest-style performance summary
acct.stats();
// → { trades, closedTrades, wins, losses, winRate, grossProfit, grossLoss, profitFactor,
//     avgWin, avgLoss, largestWin, largestLoss, realizedPnl, totalCharges }
acct.totalCharges; // total costs paid
```

## New in 1.2 — advanced orders, costs & analytics

### Stop-limit, trailing-stop & time-in-force

```ts
// stop-limit: once 95 trades, rest as a LIMIT that won't fill below 94
acct.sell("RELIANCE", { qty: 10, triggerPrice: 95, limitPrice: 94 });

// trailing-stop: exits 5 below the highest price seen since it was placed
acct.sell("RELIANCE", { qty: 10, trail: 5 });

// time-in-force: IOC fills what it can now (partial ok) and cancels the rest
acct.buy("TCS", { qty: 100, price: 3800, tif: "IOC" });
acct.endSession(); // clears any resting `tif: "DAY"` orders

// drive it tick-by-tick — processTick returns the orders that filled
const filled = acct.processTick("RELIANCE", 94);
```

### Commission & slippage models

```ts
import { PaperAccount, percentCommission, percentSlippage, composeCosts, flatCommission } from "@lacspace/paper-trade";

const acct = new PaperAccount({
  cash: 100_000,
  charges: composeCosts(flatCommission(20), percentCommission(0.03, { min: 1 })),
  slippage: percentSlippage(0.05), // buys fill 0.05% higher, sells 0.05% lower
});
```

| Cost helper | Builds |
| --- | --- |
| `flatCommission(amount)` | fixed fee per fill |
| `percentCommission(pct, { min?, max? })` | percent of turnover, clamped |
| `perShareCommission(perShare, { min?, max? })` | per-unit fee |
| `composeCosts(...fns)` | sum several models |
| `fixedSlippage(amount)` / `percentSlippage(pct)` | adverse fill-price move |

### Equity curve, returns & drawdown

```ts
const acct = new PaperAccount({ cash: 100_000, trackEquity: true });
// ... run your ticks/trades ...

acct.equityCurve();   // [{ t, equity }, …] — one point per mark()/processTick()
acct.performance();   // stats() + { totalReturnPct, maxDrawdown, maxDrawdownPct, start, end, … }

// or use the pure functions on any series
import { totalReturnPct, maxDrawdown, equityStats } from "@lacspace/paper-trade";
maxDrawdown([100, 120, 90, 110, 80]); // { maxDrawdown: 40, maxDrawdownPct: 33.33, … }
```

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/paper-trade` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/paper-trade
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.


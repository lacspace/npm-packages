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
- 🧾 `MARKET`, `LIMIT` and `SL` (stop) orders that fill as prices move
- 📈 Positions, holdings, weighted average price, portfolio summary
- 🔁 Optional short-selling · 💾 `toJSON()` / `restore()` for persistence
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

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
// { cash, invested, marketValue, equity, unrealizedPnl, realizedPnl, totalPnl, holdings }
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
| `new PaperAccount({ cash, allowShort?, now? })` | create an account |
| `mark(prices)` | feed price(s); triggers pending orders + MTM |
| `buy(sym, { qty, price?, triggerPrice? })` | buy (market / limit / SL) |
| `sell(sym, { qty, price?, triggerPrice? })` | sell (market / limit / SL) |
| `place(req)` / `cancel(id)` | low-level order control |
| `getPositions()` / `getHoldings()` / `summary()` | portfolio state |
| `cash` `realizedPnl` `unrealizedPnl` `pnl` | live figures |
| `orders` `openOrders` `trades` | order & trade history |
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
    charges({ segment: "intraday", side, qty, price }).total,
});

// Backtest-style performance summary
acct.stats();
// → { trades, closedTrades, wins, losses, winRate, profitFactor, avgWin, avgLoss,
//     largestWin, largestLoss, realizedPnl, totalCharges }
acct.totalCharges; // total costs paid
```

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · powers <a href="https://stockyatra.com">StockYatra</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>

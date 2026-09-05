<div align="center">

# @lacspace/market

**The money & mechanics toolkit every stock-market app re-implements — including a real Indian brokerage & charges calculator.**

[![npm version](https://img.shields.io/npm/v/@lacspace/market?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/market)
[![install size](https://packagephobia.com/badge?p=@lacspace/market)](https://packagephobia.com/result?p=@lacspace/market)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/market?label=minzip)](https://bundlephobia.com/package/@lacspace/market)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/market)
[![license](https://img.shields.io/npm/l/@lacspace/market?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> P&L, returns, CAGR, **XIRR**, tick-size rounding, circuit limits, risk-based position sizing — plus the thing nobody packages: a **full Indian brokerage & statutory charges breakdown** (STT, GST, SEBI, stamp duty, exchange txn) with discount-broker presets.

- 💸 **Charges calculator** — the exact Zerodha-style breakdown traders actually see
- 📊 P&L, `changePercent`, `pnlPercent`, `cagr`, `xirr`, `averagePrice`
- 🎯 `positionSize` (risk-based), `roundToTick`, `circuitLimits`
- 🇮🇳 `formatINR` with lakh/crore grouping
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/market      # or pnpm add / yarn add / bun add
```

## The charges calculator ✨

```ts
import { charges } from "@lacspace/market";

charges({ segment: "intraday", buy: 100, sell: 102, qty: 500 });
// {
//   turnover: 101000, brokerage: 30.3, stt: 12.75, exchangeTxn: 3,
//   sebi: 0.1, stamp: 1.5, gst: 6.01, dp: 0,
//   totalCharges: 53.66, grossPnl: 1000, netPnl: 946.34, breakeven: 0.11
// }

charges({ segment: "delivery", buy: 1000, sell: 1100, qty: 10 });
charges({ segment: "options", buy: 120, sell: 150, qty: 75 });
```

Rates default to an Indian discount broker (Zerodha-style, FY2024–25). Statutory rates change — override any field and always verify against the live rate card:

```ts
import { charges, IN_DISCOUNT_BROKER } from "@lacspace/market";

charges(input, {
  ...IN_DISCOUNT_BROKER,
  segments: {
    ...IN_DISCOUNT_BROKER.segments,
    delivery: { ...IN_DISCOUNT_BROKER.segments.delivery, brokeragePct: 0.001 },
  },
});
```

## Returns & P&L

```ts
import { pnl, pnlPercent, changePercent, cagr, xirr } from "@lacspace/market";

pnl({ buy: 100, sell: 112, qty: 50 });   // 600
pnlPercent({ buy: 100, sell: 112 });     // 12
changePercent(2950, 2900);               // 1.72  (LTP vs prev close)
cagr(100000, 200000, 3);                 // 0.2599  (25.99% a year)

xirr([
  { amount: -10000, date: "2024-01-01" },
  { amount: -5000,  date: "2024-06-01" },
  { amount: 17000,  date: "2025-01-01" },
]); // ≈ annualised return, irregular cash flows
```

## Trade mechanics

```ts
import { averagePrice, positionSize, roundToTick, circuitLimits, formatINR } from "@lacspace/market";

averagePrice([{ price: 100, qty: 10 }, { price: 110, qty: 10 }]); // 105
positionSize({ capital: 100000, riskPercent: 1, entry: 500, stop: 480 }); // 50 shares
roundToTick(101.23);            // 101.25  (nearest ₹0.05)
circuitLimits(100, 10);         // { upper: 110, lower: 90 }
formatINR(1234567.5);           // "₹12,34,567.50"
```

## API

| Function | Description |
| --- | --- |
| `charges(input, config?)` | full brokerage + statutory breakdown |
| `pnl` / `pnlPercent` / `changePercent` | profit & loss |
| `cagr(begin, end, years)` | compound annual growth rate |
| `xirr(cashflows, guess?)` | irregular-cashflow annualised return |
| `averagePrice(trades)` | volume-weighted average |
| `positionSize({...})` | risk-based whole-share sizing |
| `roundToTick(price, tick?)` | snap to exchange tick |
| `circuitLimits(prevClose, %)` | upper / lower circuit |
| `formatINR(n, opts?)` | Indian lakh/crore currency string |

## The Lacspace StockKit

| Package | For |
| --- | --- |
| [`@lacspace/indicators`](https://www.npmjs.com/package/@lacspace/indicators) | Technical indicators |
| **`@lacspace/market`** | Money & charges (this package) |
| [`@lacspace/market-clock`](https://www.npmjs.com/package/@lacspace/market-clock) | Is the market open? holidays |
| [`@lacspace/paper-trade`](https://www.npmjs.com/package/@lacspace/paper-trade) | Headless paper-trading engine |

## New in 1.1 — options greeks & portfolio analytics

```ts
import { blackScholes, impliedVolatility, sharpe, sortino, maxDrawdown, volatility, formatCompactINR } from "@lacspace/market";

// Black-Scholes price + greeks for a European option
const g = blackScholes({ type: "call", spot: 100, strike: 100, timeYears: 30/365, rate: 0.07, volatility: 0.25 });
// → { price, delta, gamma, theta, vega, rho }
impliedVolatility(marketPrice, { type: "call", spot: 100, strike: 100, timeYears: 30/365, rate: 0.07 });

// Portfolio stats from a returns / equity series
sharpe(returns);            // annualized
sortino(returns);           // downside-only
maxDrawdown(equityCurve);   // { maxDrawdown: 0.25, peakIndex, troughIndex }

formatCompactINR(12345678); // "₹1.23 Cr"
```

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/market` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/market
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.


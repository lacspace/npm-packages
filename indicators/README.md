<div align="center">

# @lacspace/indicators

**Streaming technical indicators for live price feeds — push one tick, get the new value in O(1).**

[![npm version](https://img.shields.io/npm/v/@lacspace/indicators?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/indicators)
[![install size](https://packagephobia.com/badge?p=@lacspace/indicators)](https://packagephobia.com/result?p=@lacspace/indicators)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/indicators?label=minzip)](https://bundlephobia.com/package/@lacspace/indicators)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/indicators)
[![license](https://img.shields.io/npm/l/@lacspace/indicators?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Most JS indicator libs recompute the entire array on every new candle. This one updates **incrementally** — feed a single live LTP tick and the indicator advances in O(1). Built for real-time charts, screeners and algo bots.

- 📈 **RSI, MACD, SMA, EMA, WMA, Bollinger, ATR, VWAP, Stochastic, Supertrend, ADX**
- ⚡ Incremental `next(tick)` API — perfect for websocket / LTP streams
- 🧮 Batch helpers too — run over a historical array in one call
- ✂️ `crossedAbove` / `crossedBelow` for signal logic
- 🌍 Isomorphic (browser + Node) · 📦 ESM + CJS · 🧩 zero dependencies · fully typed

## Install

```bash
npm install @lacspace/indicators      # or pnpm add / yarn add / bun add
```

## Streaming — the whole point

```ts
import { RSI, MACD } from "@lacspace/indicators";

const rsi = new RSI(14);
const macd = new MACD(12, 26, 9);

// wire straight into your tick feed
socket.on("ltp", (price) => {
  const r = rsi.next(price);       // O(1) — no array recompute
  const m = macd.next(price);
  if (r !== null && r > 70) console.log("overbought", r.toFixed(1));
  if (m) console.log("histogram", m.histogram.toFixed(2));
});
```

Every indicator returns `null` during its warm-up window, then a number (or a struct), and also exposes `.value`.

## Batch over history

```ts
import { rsi, ema, bollinger, supertrend } from "@lacspace/indicators";

const closes = candles.map((c) => c.close);

rsi(closes, 14);          // (number | null)[]
ema(closes, 20);          // (number | null)[]
bollinger(closes, 20, 2); // ({ middle, upper, lower, bandwidth } | null)[]

// range-based indicators take OHLC bars
supertrend(candles, 10, 3); // ({ value, direction: 1 | -1 } | null)[]
```

## Signals with crossovers

```ts
import { ema, crossedAbove } from "@lacspace/indicators";

const fast = ema(closes, 9);
const slow = ema(closes, 21);

for (let i = 1; i < closes.length; i++) {
  if (fast[i - 1] == null || slow[i - 1] == null) continue;
  const golden = crossedAbove(
    { a: fast[i - 1]!, b: slow[i - 1]! },
    { a: fast[i]!, b: slow[i]! },
  );
  if (golden) console.log("EMA golden cross at bar", i);
}
```

## Indicators

| Class / fn | Input | Output |
| --- | --- | --- |
| `SMA` `EMA` `WMA` | price | number |
| `RSI` | price | 0–100 |
| `MACD` | price | `{ macd, signal, histogram }` |
| `BollingerBands` | price | `{ middle, upper, lower, bandwidth }` |
| `ATR` | HLC bar | number |
| `VWAP` | H/L/C/volume bar | number |
| `Stochastic` | HLC bar | `{ k, d }` |
| `Supertrend` | HLC bar | `{ value, direction }` |
| `ADX` | HLC bar | `{ adx, plusDI, minusDI }` |

Batch equivalents: `sma` `ema` `wma` `rsi` `macd` `bollinger` `atr` `supertrend` `adx`.

## The Lacspace StockKit

| Package | For |
| --- | --- |
| **`@lacspace/indicators`** | Technical indicators (this package) |
| [`@lacspace/market`](https://www.npmjs.com/package/@lacspace/market) | P&L, XIRR, brokerage & charges |
| [`@lacspace/market-clock`](https://www.npmjs.com/package/@lacspace/market-clock) | Is the market open? holidays |
| [`@lacspace/paper-trade`](https://www.npmjs.com/package/@lacspace/paper-trade) | Headless paper-trading engine |

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · powers <a href="https://stockyatra.com">StockYatra</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>

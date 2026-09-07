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

- 📈 **30+ indicators** — RSI, MACD, SMA, EMA, WMA, DEMA/TEMA, Bollinger, ATR, VWAP, Stochastic, StochRSI, Supertrend, ADX, Parabolic SAR, Ichimoku, CCI, Williams %R, ROC, MFI, Keltner, Donchian, OBV, A/D, CMF
- ⚡ Incremental `next(tick)` API — perfect for websocket / LTP streams
- 🧮 Batch helpers too — run over a historical array in one call
- ✂️ `crossedAbove` / `crossedBelow` for signal logic
- 🌍 Isomorphic (browser + Node) · 📦 ESM + CJS · 🧩 zero dependencies · fully typed

> **New in 1.2.0** — a big additive indicator wave (all backward-compatible, zero new deps): **DEMA/TEMA**, **Parabolic SAR**, **Ichimoku Cloud**, **StochRSI**, **CCI**, **Williams %R**, **ROC**, **MFI**, **standard deviation**, **Keltner Channels**, **Donchian Channels**, **OBV**, **Accumulation/Distribution** and **Chaikin Money Flow** — each with the same streaming `next()` class + batch helper. Existing outputs are unchanged.

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
| `SMA` `EMA` `WMA` `DEMA` `TEMA` | price | number |
| `StdDev` | price | number |
| `ROC` | price | number (percent) |
| `RSI` | price | 0–100 |
| `StochRSI` | price | `{ stochRSI, k, d }` |
| `MACD` | price | `{ macd, signal, histogram }` |
| `BollingerBands` | price | `{ middle, upper, lower, bandwidth }` |
| `ATR` | HLC bar | number |
| `KeltnerChannels` | HLC bar | `{ middle, upper, lower }` |
| `DonchianChannels` | H/L bar | `{ upper, lower, middle }` |
| `VWAP` | H/L/C/volume bar | number |
| `Stochastic` | HLC bar | `{ k, d }` |
| `CCI` | HLC bar | number |
| `WilliamsR` | HLC bar | -100–0 |
| `Supertrend` | HLC bar | `{ value, direction }` |
| `ParabolicSAR` | HLC bar | `{ value, direction }` |
| `ADX` | HLC bar | `{ adx, plusDI, minusDI }` |
| `Ichimoku` | HLC bar | `{ conversion, base, spanA, spanB }` |
| `MFI` | H/L/C/volume bar | 0–100 |
| `OBV` | close/volume bar | number |
| `AccumulationDistribution` | H/L/C/volume bar | number |
| `ChaikinMoneyFlow` | H/L/C/volume bar | -1–1 |

Batch equivalents (same name, lower-cased): `sma` `ema` `wma` `dema` `tema` `stddev` `roc` `rsi` `stochRSI` `macd` `bollinger` `atr` `keltner` `donchian` `cci` `williamsR` `supertrend` `parabolicSAR` `adx` `ichimoku` `mfi` `obv` `adl` `cmf`.

```ts
import { ichimoku, parabolicSAR, cci, obv, keltner } from "@lacspace/indicators";

parabolicSAR(candles);      // ({ value, direction: 1 | -1 } | null)[]
ichimoku(candles);          // ({ conversion, base, spanA, spanB } | null)[]
cci(candles, 20);           // (number | null)[]
keltner(candles, 20, 2);    // ({ middle, upper, lower } | null)[]
obv(candles);               // number[]  (cumulative, no warm-up)
```

## The Lacspace StockKit

| Package | For |
| --- | --- |
| **`@lacspace/indicators`** | Technical indicators (this package) |
| [`@lacspace/market`](https://www.npmjs.com/package/@lacspace/market) | P&L, XIRR, brokerage & charges |
| [`@lacspace/market-clock`](https://www.npmjs.com/package/@lacspace/market-clock) | Is the market open? holidays |
| [`@lacspace/paper-trade`](https://www.npmjs.com/package/@lacspace/paper-trade) | Headless paper-trading engine |

## New in 1.1 — candle aggregation & pattern detection

```ts
import { CandleAggregator, detectPatterns } from "@lacspace/indicators";

// Turn a live LTP/tick feed into fixed-interval OHLC candles
const agg = new CandleAggregator(60_000); // 1-minute
onTick(({ time, price, volume }) => {
  const candle = agg.add({ time, price, volume });
  if (candle) store.push(candle); // completed candle on each rollover
});

// Spot candlestick patterns across a series
detectPatterns(candles);
// → [{ index: 42, pattern: "bullishEngulfing", bullish: true }, …]
// doji · hammer · shootingStar · marubozu · bullish/bearish engulfing · harami
```

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/indicators` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/indicators
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.


# @lacspace/rules

Trading rules as **data**, not code. A strategy is JSON made of operands, comparisons and all/any groups, so it can be built by clicking, written by an AI, saved, backtested and evaluated server-side for alerts, always with the same result. AI only translates words into the JSON. `cleanRules` coerces or drops anything unknown, so nothing it writes can execute.

```ts
import { cleanRules, evaluate, backtestRules, screen, describeRules } from "@lacspace/rules";

const rules = cleanRules({
  name: "EMA cross with RSI filter",
  entry: { mode: "all", conds: [
    { a: { k: "ema", n: 20 }, op: "crossAbove", b: { k: "ema", n: 50 } },
    { a: { k: "rsi", n: 14 }, op: ">", b: { k: "num", v: 50 } },
  ] },
  exit: { mode: "any", conds: [{ a: { k: "ema", n: 20 }, op: "crossBelow", b: { k: "ema", n: 50 } }] },
  stopAtr: 2,
}); // → Rules | null (null when there's no valid entry condition)

describeRules(rules!); // "Buy when EMA 20 crosses above EMA 50 and RSI 14 is above 50; sell when …; stop 2 × ATR below entry."
evaluate(rules!, bars); // { entry: boolean[], exit: boolean[], atr, need }, read on each candle's close
```

**Operands:** `num(v)`, `price(src)`, `sma`/`ema(n, src?)`, `rsi(n)`, `macd`/`macdSignal`/`macdHist(f, s, g)`, `atr(n)`, `bbUpper`/`bbMid`/`bbLower(n, m)`, `stDir(n, m)` (Supertrend direction, +1/−1), `highest`/`lowest(n)` (the N candles *before* this one, so a crossAbove is a real breakout), `volAvg(n)`, `change(n)` (%).
**Ops:** `>`, `<`, `crossAbove`, `crossBelow`. `mul` scales the right-hand side (`volume > 1.5 × volAvg(20)`).
`STRATEGY_TEMPLATES` holds five starting points; `OPERAND_KINDS` / `OPS` / `defaultOperand` power a builder UI.

## Backtest

```ts
const r = backtestRules(bars, rules, { capital: 100000, costPct: 0.4 });
r.trades;  // [{ entryI, entry, exitI, exit, qty, pnl, pnlPct, reason: "signal" | "stop" | "target" | "end" }]
r.netPct; r.winRate; r.profitFactor; r.maxDdPct; r.buyHoldPct; r.exposurePct; r.equity;
```

How the backtest behaves:
- **Fills:** a signal is read on candle *i*'s close and filled at candle *i+1*'s open.
- **Stops and targets:** they're checked against each later candle's high and low. If both could hit in the same candle, the stop is assumed first. The fill is at the level, or at the open on a gap through it.
- **ATR levels:** ATR stop and target use ATR(14) of the signal candle, measured from the fill.
- **Costs:** charged per side.
- **Direction:** long only by default (`direction: "both"` also shorts on exit signals).
- **End of data:** any open position closes at the last close.

`runBacktest(bars, strategyDef, params, options)` accepts any signal source.

## Screen

```ts
screen(
  [{ symbol: "NABIL", sector: "Banking", bars }, …],  // closed candles, oldest first
  {
    sectors: ["Banking"],
    rules: { mode: "all", conds: [
      { a: { k: "price", src: "close" }, op: ">", b: { k: "ema", n: 50 } },
      { a: { k: "rsi", n: 14 }, op: "<", b: { k: "num", v: 40 } },
    ] },
    minTurnover: 1e7,
    rankBy: { k: "rsi", n: 14 }, order: "asc", limit: 20,
  },
); // → { hits: [{ symbol, sector, close, changePct, turnover, rank }], skipped: [{ symbol, reason }] }
```

The screener evaluates each symbol's **last candle**, using the same engine as backtests and alerts. Ranking can use any operand, or `"change"`, `"turnover"` or `"volume"`.

`operandSeries(operand, bars)` returns the full series for any operand.

Built by the ShareRocketPro team, where it runs their strategy builder, backtests and alerts. The tests pin their production backtester's trades on a real NABIL 15-minute snapshot.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.

# @lacspace/portfolio

Portfolio analytics from holdings and daily closes. Deterministic, with no AI.

```ts
import { analyzePortfolio } from "@lacspace/portfolio";

const r = analyzePortfolio(
  {
    holdings: [{ symbol: "NABIL", qty: 100, wacc: 540 }, { symbol: "UPPER", qty: 200, wacc: 180 }],
    prices: { NABIL: [{ date: "2026-10-01", close: 532 }, …], UPPER: [...] }, // daily closes
    index: [{ date: "2026-10-01", close: 2587.25 }, …],                        // NEPSE, for beta
    sectors: { NABIL: "Banking", UPPER: "Hydropower" },
  },
  { periodsPerYear: 240, riskFree: 0 },
);

r.holdings;      // [{ symbol, sector, qty, wacc, last, cost, value, weight, pnl, pnlPct }] by value
r.totals;        // { cost, value, pnl, pnlPct }: unrealised P/L vs WACC
r.hhi;           // concentration on market-value weights, 0–10,000 (10,000 = one stock)
r.effectiveHoldings; // 10,000 / HHI
r.sectorWeights; // [{ sector, value, weight }]
r.history;       // [{ date, value }]: current holdings valued on past closes
r.risk;          // { volatility, maxDrawdown, drawdownPeak, drawdownTrough, sharpe, sortino,
                 //   beta, correlation, periodReturn, indexReturn, days, betaDays }
```

## Definitions

| Metric | How |
|---|---|
| Volatility | Sample stdev of daily **log** returns × √`periodsPerYear` (default **240**: NEPSE trades Sun–Thu minus holidays). |
| Beta / correlation | Daily **simple** returns of the portfolio vs the index, only on dates where both have a value. Each return runs from the previous shared date. |
| HHI | Σ (weight × 100)² on market value (qty × last close), 0–10,000. |
| Max drawdown | The largest peak-to-trough fall of the daily portfolio value, with the peak and trough dates. |
| Sharpe | (mean daily simple return − rf / periods) / stdev × √periods. |
| Sortino | The same numerator over the downside deviation (√ mean of min(0, r − rf/periods)²). |
| P/L | qty × (last − WACC) per holding and in total. Duplicate lots merge into a qty-weighted WACC. |

`history` values your **current** holdings on past closes. It shows how today's portfolio behaved, not a replay of past trades. Each symbol's missing closes are forward-filled, and the series starts once every holding has a price.

### Purchase-date history <sup>1.1.0</sup>

Give lots a `date` and pass `{ history: "purchases" }`:
- **When a lot starts counting:** each lot counts from its purchase date, or the next trading day if it was bought off-session. Lots without a date count from the start.
- **Purchases are flows, not gains:** the value a lot adds on its first day is recorded as a `flow`. Returns are **time-weighted**, (Vₜ − flowₜ) / Vₜ₋₁ − 1, so buying more never shows up as a gain.
- **Which metrics follow it:** volatility, Sharpe, Sortino, beta, drawdown and `periodReturn` all use these returns.
- **What doesn't change:** P/L, weights and HHI are the same in both modes.

```ts
analyzePortfolio({ holdings: [{ symbol: "NABIL", qty: 100, wacc: 540, date: "2026-03-12" }, …], prices, index }, { history: "purchases" });
```

The volatility convention is sample stdev (n − 1). Sortino uses the downside deviation over all days (the Sortino & Price form).

Helpers `hhi(weights)`, `maxDrawdown(values)` and `beta(a, b)` are exported too.

Specs from the ShareRocketPro team. See also [`@lacspace/rules`](https://www.npmjs.com/package/@lacspace/rules) (strategies, backtests, screener) and [`@lacspace/market`](https://www.npmjs.com/package/@lacspace/market) (returns, XIRR, corporate actions).

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.

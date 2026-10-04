import { describe, expect, it } from "vitest";
import { analyzePortfolio, beta, describe as describeApi, hhi, maxDrawdown } from "./index.js";

const D = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"];
const closes = (xs: number[]) => xs.map((close, i) => ({ date: D[i]!, close }));

const input = {
  holdings: [{ symbol: "AAA", qty: 10, wacc: 100 }, { symbol: "BBB", qty: 20, wacc: 50 }],
  prices: { AAA: closes([100, 110, 99, 120]), BBB: closes([50, 50, 55, 50]) },
  index: closes([1000, 1050, 1029, 1100]),
  sectors: { AAA: "Banking", BBB: "Hydropower" },
};

describe("analyzePortfolio", () => {
  const r = analyzePortfolio(input);

  it("P/L vs WACC, weights, totals", () => {
    expect(r.holdings.map((h) => [h.symbol, h.last, h.value, h.pnl, h.pnlPct])).toEqual([["AAA", 120, 1200, 200, 20], ["BBB", 50, 1000, 0, 0]]);
    expect(r.totals).toEqual({ cost: 2000, value: 2200, pnl: 200, pnlPct: 10 });
    expect(r.holdings[0]!.weight).toBeCloseTo(12 / 22, 12);
  });

  it("HHI on market-value weights (0–10,000) and sector weights", () => {
    expect(r.hhi).toBeCloseTo(((144 + 100) / 484) * 10000, 9);
    expect(r.effectiveHoldings).toBeCloseTo(10000 / r.hhi, 12);
    expect(r.sectorWeights.map((s) => [s.sector, s.value])).toEqual([["Banking", 1200], ["Hydropower", 1000]]);
  });

  it("history, volatility (log × √240), drawdown, Sharpe/Sortino", () => {
    expect(r.history.map((h) => h.value)).toEqual([2000, 2100, 2090, 2200]);
    const lr = [Math.log(2100 / 2000), Math.log(2090 / 2100), Math.log(2200 / 2090)];
    const m = lr.reduce((a, b) => a + b) / 3;
    const sd = Math.sqrt(lr.reduce((s, v) => s + (v - m) ** 2, 0) / 2);
    expect(r.risk.volatility).toBeCloseTo(sd * Math.sqrt(240), 12);
    expect(r.risk.maxDrawdown).toBeCloseTo(10 / 2100, 12);
    expect([r.risk.drawdownPeak, r.risk.drawdownTrough]).toEqual(["2026-09-29", "2026-09-30"]);
    expect(r.risk.periodReturn).toBeCloseTo(0.1, 12);
    const sr = [2100 / 2000 - 1, 2090 / 2100 - 1, 2200 / 2090 - 1];
    const ms = sr.reduce((a, b) => a + b) / 3;
    const sds = Math.sqrt(sr.reduce((s, v) => s + (v - ms) ** 2, 0) / 2);
    expect(r.risk.sharpe).toBeCloseTo((ms / sds) * Math.sqrt(240), 10);
    const dd = Math.sqrt(sr.reduce((s, v) => s + Math.min(0, v) ** 2, 0) / 3);
    expect(r.risk.sortino).toBeCloseTo((ms / dd) * Math.sqrt(240), 10);
  });

  it("beta vs index on shared dates only", () => {
    expect(r.risk.betaDays).toBe(3);
    const same = analyzePortfolio({ holdings: [{ symbol: "X", qty: 1, wacc: 1 }], prices: { X: input.index }, index: input.index });
    expect(same.risk.beta).toBeCloseTo(1, 12);
    expect(same.risk.correlation).toBeCloseTo(1, 12);
    // Index missing 30 Sep → returns measured 29 Sep → 1 Oct.
    const gap = analyzePortfolio({ ...input, index: input.index.filter((c) => c.date !== "2026-09-30") });
    expect(gap.risk.betaDays).toBe(2);
    expect(gap.risk.indexReturn).toBeCloseTo(0.1, 12);
  });

  it("risk-free rate and periodsPerYear options", () => {
    const x = analyzePortfolio(input, { riskFree: 0.06, periodsPerYear: 250 });
    const base250 = analyzePortfolio(input, { periodsPerYear: 250 });
    expect(x.risk.sharpe!).toBeLessThan(base250.risk.sharpe!);
    expect(x.risk.volatility).toBeCloseTo((r.risk.volatility! / Math.sqrt(240)) * Math.sqrt(250), 12);
  });

  it("merges duplicate lots and forward-fills a missing close", () => {
    const x = analyzePortfolio({
      holdings: [{ symbol: "AAA", qty: 10, wacc: 100 }, { symbol: "AAA", qty: 30, wacc: 120 }, { symbol: "BBB", qty: 20, wacc: 50 }],
      prices: { AAA: closes([100, 110, 99, 120]), BBB: [{ date: D[0]!, close: 50 }, { date: D[3]!, close: 50 }] },
    });
    expect(x.holdings.find((h) => h.symbol === "AAA")).toMatchObject({ qty: 40, wacc: 115 });
    expect(x.history.map((h) => h.value)).toEqual([5000, 5400, 4960, 5800]);
  });
});

describe("helpers", () => {
  it("hhi / maxDrawdown / beta", () => {
    expect(hhi([1])).toBe(10000);
    expect(hhi([1, 1, 1, 1])).toBe(2500);
    expect(maxDrawdown([100, 120, 90, 130, 104])).toEqual({ dd: 0.25, peak: 1, trough: 2 });
    expect(beta([0.02, -0.04, 0.06], [0.01, -0.02, 0.03]).beta).toBeCloseTo(2, 12);
  });
  it("describe()", () => expect(describeApi().commands[0]!.name).toBe("analyzePortfolio"));
});

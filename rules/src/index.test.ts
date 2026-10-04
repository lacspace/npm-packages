import { describe, expect, it } from "vitest";
import nabil from "./fixtures/nabil-15m-2026-10-02.json";
import { backtestRules, cleanRules, describe as describeApi, describeRules, evaluate, operandSeries, screen, STRATEGY_TEMPLATES, type RBar, type Rules } from "./index.js";

// Public NEPSE prices: NABIL 15m, 22 Sep 05:15Z → 2 Oct 09:00Z (125 bars). Expected trades were
// reported by the ShareRocketPro team from their production backtester (capital 100000, cost 0.4%).
const bars = nabil as RBar[];
const T = (name: string) => STRATEGY_TEMPLATES.find((t) => t.name === name)!;
const trades = (r: Rules) => backtestRules(bars, r, { capital: 100000, costPct: 0.4 });

describe("backtest fixtures (match ShareRocketPro's runBacktest)", () => {
  it.each(["Trend pullback", "EMA cross with RSI filter", "Breakout on volume"])("%s → no trades", (n) => {
    expect(trades(T(n)).trades).toEqual([]);
  });

  it("Bollinger bounce (stopAtr 1.5) → 4 trades, net −9.64%", () => {
    const r = trades(T("Bollinger bounce"));
    expect(r.trades.map((t) => [t.entryI, t.entry, t.exitI, t.exit, t.reason])).toEqual([
      [61, 567.4, 69, 565.97, "stop"],
      [72, 565, 76, 531, "stop"],
      [81, 532.5, 95, 527.78, "stop"],
      [97, 528, 102, 530, "signal"],
    ]);
    expect(r.netPct).toBe(-9.64);
  });

  it("Supertrend + MACD → in 38 @567, out 70 @565 signal, net −1.14%", () => {
    const r = trades(T("Supertrend + MACD"));
    expect(r.trades.map((t) => [t.entryI, t.entry, t.exitI, t.exit, t.reason])).toEqual([[38, 567, 70, 565, "signal"]]);
    expect(r.netPct).toBe(-1.14);
  });
});

describe("evaluate", () => {
  it("unit fixture: close crossAbove sma(3) fires only at index 7", () => {
    const closes = [10, 10, 10, 10, 10, 9, 8, 9, 11, 13, 14, 13];
    const b: RBar[] = closes.map((c, i) => ({ time: i * 60, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 100 }));
    const r = cleanRules({ name: "x", entry: { mode: "all", conds: [{ a: { k: "price", src: "close" }, op: "crossAbove", b: { k: "sma", n: 3 } }] } })!;
    const ev = evaluate(r, b);
    expect(ev.entry.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([7]);
    expect(operandSeries({ k: "sma", n: 3 }, b)[7]).toBeCloseTo(8.6667, 3);
  });

  it("cleanRules coerces AI output and rejects junk", () => {
    expect(cleanRules({ entry: { conds: [{ a: { k: "eval", code: "x" }, op: ">", b: { k: "num", v: 1 } }] } })).toBeNull();
    const r = cleanRules({ entry: { mode: "weird", conds: [{ a: { k: "rsi", n: "9999" }, op: ">", b: { k: "num", v: "50" } }] }, stopAtr: 99 })!;
    expect(r.entry.mode).toBe("all");
    expect(r.entry.conds[0]!.a).toEqual({ k: "rsi", n: 500 });
    expect(r.stopAtr).toBe(20);
    expect(describeRules(T("EMA cross with RSI filter"))).toBe("Buy when EMA 20 crosses above EMA 50 and RSI 14 is above 50; sell when EMA 20 crosses below EMA 50; stop 2 × ATR below entry.");
  });
});

describe("screen", () => {
  const mk = (closes: number[], vol = 1000): RBar[] => closes.map((c, i) => ({ time: i * 86400, open: c, high: c + 1, low: c - 1, close: c, volume: vol }));
  const up = mk(Array.from({ length: 120 }, (_, i) => 100 + i));
  const down = mk(Array.from({ length: 120 }, (_, i) => 300 - i));
  const universe = [
    { symbol: "UPBANK", sector: "Banking", bars: up },
    { symbol: "DNBANK", sector: "Banking", bars: down },
    { symbol: "UPHYDRO", sector: "Hydropower", bars: up },
    { symbol: "NEW", sector: "Banking", bars: up.slice(0, 10) },
  ];
  it("banks above EMA 50, ranked by RSI", () => {
    const r = screen(universe, {
      sectors: ["banking"],
      rules: { mode: "all", conds: [{ a: { k: "price", src: "close" }, op: ">", b: { k: "ema", n: 50 } }] },
      rankBy: { k: "rsi", n: 14 },
    });
    expect(r.hits.map((h) => h.symbol)).toEqual(["UPBANK"]);
    expect(r.hits[0]!.rank).toBe(100);
    expect(r.skipped).toEqual([
      { symbol: "DNBANK", reason: "rules" },
      { symbol: "UPHYDRO", reason: "filtered" },
      { symbol: "NEW", reason: "warming-up" },
    ]);
  });
  it("filters on price and turnover, ranks by change", () => {
    const r = screen(universe, { maxPrice: 200, minTurnover: 1, rankBy: "change", order: "asc" });
    expect(r.hits.map((h) => h.symbol)).toEqual(["DNBANK", "NEW"]); // DNBANK 181 (falling), NEW 109 (rising)
    expect(r.skipped.map((x) => x.symbol)).toEqual(["UPBANK", "UPHYDRO"]); // 219 > maxPrice
  });
});

it("describe()", () => {
  expect(describeApi().commands.map((c) => c.name)).toContain("screen");
});

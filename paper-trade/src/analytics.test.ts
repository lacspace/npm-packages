import { test, expect } from "vitest";
import { PaperAccount, simpleReturns, totalReturnPct, maxDrawdown, equityStats } from "./index";

test("simpleReturns computes period-over-period fractions", () => {
  const r = simpleReturns([100, 110, 121]);
  expect(r.length).toBe(2);
  expect(r[0]).toBeCloseTo(0.1, 10);
  expect(r[1]).toBeCloseTo(0.1, 10);
});

test("totalReturnPct measures first→last", () => {
  expect(totalReturnPct([100, 110, 121])).toBe(21);
  expect(totalReturnPct([100])).toBe(0);
});

test("maxDrawdown finds the largest peak-to-trough drop", () => {
  // peak 120 at idx1, trough 80 at idx4 → 40 abs, 33.33%
  const dd = maxDrawdown([100, 120, 90, 110, 80]);
  expect(dd.maxDrawdown).toBe(40);
  expect(dd.maxDrawdownPct).toBe(33.33);
  expect(dd.peakIndex).toBe(1);
  expect(dd.troughIndex).toBe(4);
});

test("equityStats summarises a known curve", () => {
  const s = equityStats([1000, 1100, 900]);
  expect(s.start).toBe(1000);
  expect(s.end).toBe(900);
  expect(s.high).toBe(1100);
  expect(s.low).toBe(900);
  expect(s.totalReturnPct).toBe(-10);
  expect(s.maxDrawdown).toBe(200); // 1100 → 900
});

test("account tracks an equity curve and reports performance()", () => {
  let t = 0;
  const acct = new PaperAccount({ cash: 1000, trackEquity: true, now: () => ++t });
  acct.mark("ABC", 100); // equity 1000 (flat, no position yet)
  acct.buy("ABC", { qty: 5 }); // cash 500, 5 @ 100
  acct.mark("ABC", 120); // equity 500 + 600 = 1100
  acct.mark("ABC", 80); // equity 500 + 400 = 900

  const curve = acct.equityCurve().map((p) => p.equity);
  expect(curve).toEqual([1000, 1000, 1100, 900]);

  const perf = acct.performance();
  expect(perf.totalReturnPct).toBe(-10); // 1000 → 900
  expect(perf.maxDrawdown).toBe(200); // 1100 → 900
  expect(perf.trades).toBe(1);
});

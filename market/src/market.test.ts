import { test, expect } from "vitest";
import { charges, blackScholes, xirr, formatINR } from "./index";

test("intraday charges match the known breakdown", () => {
  const c = charges({ segment: "intraday", buy: 100, sell: 102, qty: 500 });
  expect(c.brokerage).toBeCloseTo(30.3, 2);
  expect(c.stt).toBeCloseTo(12.75, 2);
  expect(c.totalCharges).toBeCloseTo(53.66, 2);
  expect(c.grossPnl).toBe(1000); // (102 - 100) * 500
});

test("blackScholes at timeYears:0 returns intrinsic value", () => {
  const call = blackScholes({
    type: "call",
    spot: 120,
    strike: 100,
    timeYears: 0,
    rate: 0.07,
    volatility: 0.25,
  });
  expect(call.price).toBe(Math.max(0, 120 - 100)); // 20

  const otm = blackScholes({
    type: "call",
    spot: 90,
    strike: 100,
    timeYears: 0,
    rate: 0.07,
    volatility: 0.25,
  });
  expect(otm.price).toBe(0); // max(0, 90 - 100)
});

test("xirr returns a finite rate for normal cashflows", () => {
  const rate = xirr([
    { amount: -10000, date: "2024-01-01" },
    { amount: 12000, date: "2025-01-01" },
  ]);
  expect(Number.isFinite(rate)).toBe(true);
  expect(rate).toBeCloseTo(0.2, 1); // ~20%
});

test("xirr returns NaN on a degenerate/non-converging input", () => {
  // All outflows, no sign change → no root to converge to.
  const rate = xirr([
    { amount: -1000, date: "2024-01-01" },
    { amount: -1000, date: "2025-01-01" },
  ]);
  expect(Number.isNaN(rate)).toBe(true);
  // Fewer than two flows is also degenerate.
  expect(Number.isNaN(xirr([{ amount: -1000, date: "2024-01-01" }]))).toBe(true);
});

test("formatINR groups in lakh/crore", () => {
  expect(formatINR(1234567.5)).toBe("₹12,34,567.50");
  expect(formatINR(-1234567.5)).toBe("-₹12,34,567.50");
  expect(formatINR(500)).toBe("₹500.00");
});

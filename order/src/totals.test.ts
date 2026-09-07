import { test, expect } from "vitest";
import { createOrder, orderTotals, allocate, canTransition } from "./index";

const T0 = 1_700_000_000_000;

test("orderTotals re-derives the same totals createOrder produced", () => {
  const o = createOrder({
    currency: "USD",
    now: T0,
    lines: [
      { sku: "tee", unitPrice: 1000, qty: 2, taxRate: 0.2 }, // 2000, tax 400
      { sku: "cap", unitPrice: 500, qty: 1, taxRate: 0.1 }, // 500, tax 50
    ],
    discount: 300,
    shipping: 200,
  });
  expect(orderTotals(o)).toEqual(o.totals);
  expect(orderTotals(o)).toEqual({
    subtotal: 2500,
    discount: 300,
    tax: 450,
    shipping: 200,
    total: 2850,
  });
});

test("orderTotals is remainder-safe on odd tax rates", () => {
  const o = createOrder({
    currency: "USD",
    now: T0,
    lines: [{ sku: "x", unitPrice: 333, qty: 1, taxRate: 0.075 }], // round(333*0.075)=25
  });
  const t = orderTotals(o);
  expect(t.tax).toBe(25);
  expect(t.total).toBe(358);
  expect(Number.isInteger(t.total)).toBe(true);
});

test("orderTotals clamps total at zero when discount exceeds subtotal", () => {
  const o = createOrder({
    currency: "USD",
    now: T0,
    lines: [{ sku: "x", unitPrice: 100, qty: 1 }],
    discount: 500,
  });
  expect(orderTotals(o).total).toBe(0);
});

test("allocate distributes with no drift (largest-remainder)", () => {
  expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
  const parts = allocate(1000, [2000, 500, 500]);
  expect(parts.reduce((s, p) => s + p, 0)).toBe(1000); // exact, no drift
  // each part is the floor or ceil of its ideal share (666.6, 166.6, 166.6)
  expect(parts[0]).toBeGreaterThanOrEqual(666);
  expect(parts[0]).toBeLessThanOrEqual(667);
  expect(parts[1]).toBeGreaterThanOrEqual(166);
  expect(parts[1]).toBeLessThanOrEqual(167);
});

test("allocate splits evenly when all weights are zero and handles empty", () => {
  expect(allocate(10, [0, 0, 0])).toEqual([4, 3, 3]);
  expect(allocate(10, [])).toEqual([]);
});

test("canTransition remains the canonical machine (unchanged)", () => {
  expect(canTransition("pending", "placed")).toBe(true);
  expect(canTransition("pending", "shipped")).toBe(false);
});

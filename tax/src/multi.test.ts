import { test, expect } from "vitest";
import { applyTaxes, taxInvoice } from "./index";

test("applyTaxes: flat state + city taxes both charge the same base", () => {
  const r = applyTaxes(10000, [
    { name: "State", rate: 0.06 },
    { name: "City", rate: 0.02 },
  ]);
  expect(r.taxes).toEqual([
    { name: "State", rate: 0.06, compound: false, reverseCharge: false, base: 10000, tax: 600 },
    { name: "City", rate: 0.02, compound: false, reverseCharge: false, base: 10000, tax: 200 },
  ]);
  expect(r.totalTax).toBe(800);
  expect(r.gross).toBe(10800);
  expect(r.net + r.totalTax).toBe(r.gross);
});

test("applyTaxes: a compound line charges on base + preceding taxes", () => {
  const r = applyTaxes(10000, [
    { name: "GST", rate: 0.1 },
    { name: "Levy", rate: 0.05, compound: true },
  ]);
  // GST: 10000*0.1 = 1000; Levy base = 11000 → 550
  expect(r.taxes[1]).toEqual({
    name: "Levy",
    rate: 0.05,
    compound: true,
    reverseCharge: false,
    base: 11000,
    tax: 550,
  });
  expect(r.gross).toBe(11550);
});

test("applyTaxes: reverse-charge line is recorded but contributes zero", () => {
  const r = applyTaxes(10000, [
    { name: "VAT", rate: 0.2, reverseCharge: true },
    { name: "City", rate: 0.03 },
  ]);
  expect(r.taxes[0]).toEqual({
    name: "VAT",
    rate: 0.2,
    compound: false,
    reverseCharge: true,
    base: 10000,
    tax: 0,
  });
  // Only the city tax counts toward the total.
  expect(r.totalTax).toBe(300);
  expect(r.gross).toBe(10300);
});

test("applyTaxes: line-level rounding conserves the total exactly", () => {
  const r = applyTaxes(100, [
    { rate: 0.025 },
    { rate: 0.025 },
  ], "bankers");
  const sum = r.taxes.reduce((s, l) => s + l.tax, 0);
  expect(sum).toBe(r.totalTax);
  expect(r.net + r.totalTax).toBe(r.gross);
});

test("applyTaxes: rejects non-integer base and bad rates", () => {
  expect(() => applyTaxes(100.5, [{ rate: 0.1 }])).toThrow(TypeError);
  expect(() => applyTaxes(100, [{ rate: -0.1 }])).toThrow(RangeError);
  expect(() => applyTaxes(100, [{ rate: Number.NaN }])).toThrow(RangeError);
});

test("applyTaxes: empty list is a no-op", () => {
  expect(applyTaxes(10000, [])).toEqual({ net: 10000, taxes: [], totalTax: 0, gross: 10000 });
});

test("taxInvoice: line strategy rounds each line then sums (lines re-sum to total)", () => {
  const r = taxInvoice([
    { net: 105, rate: 0.1 }, // 10.5 → 11 (half-up)
    { net: 105, rate: 0.1 }, // 10.5 → 11
  ], { strategy: "line" });
  expect(r.lines.map((l) => l.tax)).toEqual([11, 11]);
  expect(r.tax).toBe(22);
  expect(r.net + r.tax).toBe(r.gross);
});

test("taxInvoice: invoice strategy rounds the exact grand total once", () => {
  const r = taxInvoice([
    { net: 105, rate: 0.1 }, // exact 10.5
    { net: 105, rate: 0.1 }, // exact 10.5
  ], { strategy: "invoice" });
  // exact total = 21.0 → 21, which differs from line-level's 22 by 1 minor unit
  expect(r.tax).toBe(21);
  expect(r.net + r.tax).toBe(r.gross);
});

test("taxInvoice: line vs invoice strategies can differ by a minor unit", () => {
  const lines = [
    { net: 105, rate: 0.1 },
    { net: 105, rate: 0.1 },
  ];
  const line = taxInvoice(lines, { strategy: "line" }).tax;
  const invoice = taxInvoice(lines, { strategy: "invoice" }).tax;
  expect(line - invoice).toBe(1);
});

test("taxInvoice: defaults to line strategy and half-up rounding", () => {
  const r = taxInvoice([{ net: 100, rate: 0.025 }]);
  expect(r.strategy).toBe("line");
  expect(r.tax).toBe(3);
});

test("taxInvoice: echoes optional line names and gross per line", () => {
  const r = taxInvoice([{ name: "Widget", net: 10000, rate: 0.13 }]);
  expect(r.lines[0]).toEqual({ name: "Widget", net: 10000, rate: 0.13, tax: 1300, gross: 11300 });
});

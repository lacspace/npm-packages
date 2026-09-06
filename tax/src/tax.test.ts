import { test, expect } from "vitest";
import { tax, addTax, extractTax, compound, RATES } from "./index";

test("exclusive: adds tax to a net amount", () => {
  const r = addTax(10000, 0.13); // NPR 100.00 net @ 13%
  expect(r).toEqual({ net: 10000, tax: 1300, gross: 11300 });
});

test("inclusive: extracts net + tax from a gross amount", () => {
  const r = extractTax(11300, 0.13);
  expect(r).toEqual({ net: 10000, tax: 1300, gross: 11300 });
});

test("tax() honours the inclusive flag", () => {
  expect(tax(10000, { rate: 0.13, inclusive: false })).toEqual({ net: 10000, tax: 1300, gross: 11300 });
  expect(tax(11300, { rate: 0.13, inclusive: true })).toEqual({ net: 10000, tax: 1300, gross: 11300 });
});

test("half-up vs bankers rounding differ on exact .5 tax", () => {
  // 100 minor units @ 2.5% → tax = 2.5 exactly
  expect(addTax(100, 0.025, "half-up").tax).toBe(3);
  expect(addTax(100, 0.025, "bankers").tax).toBe(2);
  // 300 @ 2.5% → 7.5 → half-up 8, bankers 8 (round to even)
  expect(addTax(300, 0.025, "half-up").tax).toBe(8);
  expect(addTax(300, 0.025, "bankers").tax).toBe(8);
  // 100 @ 3.5% → 3.5 → half-up 4, bankers 4 (even)
  expect(addTax(100, 0.035, "bankers").tax).toBe(4);
});

test("half-up is the default rounding", () => {
  expect(addTax(100, 0.025).tax).toBe(3);
});

test('round: "none" keeps the exact (possibly fractional) tax', () => {
  expect(addTax(100, 0.025, "none").tax).toBe(2.5);
});

test("compound applies each rate on the running gross", () => {
  const r = compound(10000, [0.1, 0.05]);
  // 10000 → +1000 = 11000 → +550 = 11550
  expect(r.taxes).toEqual([
    { rate: 0.1, tax: 1000 },
    { rate: 0.05, tax: 550 },
  ]);
  expect(r.gross).toBe(11550);
  expect(r.net).toBe(10000);
});

test("RATES exposes NP_VAT at 13%", () => {
  expect(RATES.NP_VAT).toBe(0.13);
  expect(addTax(10000, RATES.NP_VAT).gross).toBe(11300);
});

test("invariant: net + tax === gross everywhere", () => {
  for (const amount of [1, 7, 99, 100, 12345, 999999]) {
    for (const rate of [0, 0.05, 0.13, 0.18, 0.2, 0.075]) {
      const add = addTax(amount, rate);
      expect(add.net + add.tax).toBe(add.gross);
      const ext = extractTax(amount, rate);
      expect(ext.net + ext.tax).toBe(ext.gross);
      for (const mode of ["half-up", "bankers"] as const) {
        const c = compound(amount, [rate, 0.02], mode);
        const sum = c.taxes.reduce((s, l) => s + l.tax, 0);
        expect(c.net + sum).toBe(c.gross); // integer modes → exact
      }
    }
  }
});

test("integer minor units are enforced", () => {
  expect(() => addTax(10.5, 0.13)).toThrow(TypeError);
  expect(() => addTax(100, -0.1)).toThrow(RangeError);
});

test("inclusive: non-integer gross is rejected too", () => {
  expect(() => extractTax(11300.5, 0.13)).toThrow(TypeError);
});

test("rejects non-finite rates (NaN / Infinity)", () => {
  expect(() => addTax(100, Number.NaN)).toThrow(RangeError);
  expect(() => addTax(100, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  // @ts-expect-error — a non-number rate must still be rejected at runtime
  expect(() => addTax(100, "0.13")).toThrow(RangeError);
});

test("rate of 0 is a pass-through in both directions", () => {
  expect(addTax(10000, 0)).toEqual({ net: 10000, tax: 0, gross: 10000 });
  expect(extractTax(10000, 0)).toEqual({ net: 10000, tax: 0, gross: 10000 });
});

test("zero amount stays zero", () => {
  expect(addTax(0, 0.13)).toEqual({ net: 0, tax: 0, gross: 0 });
  expect(extractTax(0, 0.13)).toEqual({ net: 0, tax: 0, gross: 0 });
});

test('round: "none" preserves the exact fraction in both directions', () => {
  // exclusive: fractional tax kept
  expect(addTax(100, 0.025, "none").tax).toBe(2.5);
  // inclusive: fractional net kept, invariant still holds
  const ext = extractTax(113, 0.13, "none");
  expect(ext.net + ext.tax).toBe(113);
  expect(ext.gross).toBe(113);
});

test("inclusive invariant holds across amounts, rates and rounding modes (no lost paisa)", () => {
  const amounts = [1, 2, 3, 7, 33, 99, 100, 101, 12345, 99999, 1000000];
  const rates = [0, 0.05, 0.075, 0.1, 0.13, 0.15, 0.18, 0.2, 0.33];
  for (const gross of amounts) {
    for (const rate of rates) {
      for (const mode of ["half-up", "bankers"] as const) {
        const r = extractTax(gross, rate, mode);
        // exact split — never lose or invent a minor unit
        expect(r.net + r.tax).toBe(r.gross);
        expect(r.gross).toBe(gross);
        // for non-negative inputs the tax portion is non-negative and net <= gross
        expect(r.tax).toBeGreaterThanOrEqual(0);
        expect(r.net).toBeLessThanOrEqual(r.gross);
      }
    }
  }
});

test("exclusive invariant holds across amounts, rates and rounding modes", () => {
  const amounts = [1, 2, 3, 7, 33, 99, 100, 101, 12345, 99999];
  const rates = [0, 0.05, 0.075, 0.13, 0.18, 0.2];
  for (const net of amounts) {
    for (const rate of rates) {
      for (const mode of ["half-up", "bankers"] as const) {
        const r = addTax(net, rate, mode);
        expect(r.net + r.tax).toBe(r.gross);
        expect(r.net).toBe(net);
        expect(Number.isInteger(r.tax)).toBe(true);
      }
    }
  }
});

test("compound: empty rate list is a no-op", () => {
  expect(compound(10000, [])).toEqual({ net: 10000, taxes: [], gross: 10000 });
});

test("compound: enforces integer net and finite rates", () => {
  expect(() => compound(100.5, [0.1])).toThrow(TypeError);
  expect(() => compound(100, [0.1, -0.2])).toThrow(RangeError);
  expect(() => compound(100, [0.1, Number.NaN])).toThrow(RangeError);
});

test("compound: each line is charged on the running gross, in order", () => {
  const r = compound(10000, [0.1, 0.1]);
  // 10000 → +1000 = 11000 → +1100 = 12100
  expect(r.taxes).toEqual([
    { rate: 0.1, tax: 1000 },
    { rate: 0.1, tax: 1100 },
  ]);
  expect(r.gross).toBe(12100);
});

test("does not mutate a frozen options object", () => {
  const opts = Object.freeze({ rate: 0.13, inclusive: false as const, round: "half-up" as const });
  expect(() => tax(10000, opts)).not.toThrow();
  expect(tax(10000, opts).gross).toBe(11300);
  expect(opts.rate).toBe(0.13);
});

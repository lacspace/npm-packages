import { test, expect } from "vitest";
import { vat, gst, formatRate, RATES } from "./index";

test("vat: exclusive add matches the core addTax", () => {
  expect(vat(10000, RATES.NP_VAT)).toEqual({ net: 10000, tax: 1300, gross: 11300 });
});

test("vat: inclusive extract round-trips with the exclusive add", () => {
  const added = vat(10000, 0.13);
  const extracted = vat(added.gross, 0.13, { inclusive: true });
  expect(extracted).toEqual({ net: 10000, tax: 1300, gross: 11300 });
  expect(extracted.net + extracted.tax).toBe(extracted.gross);
});

test("vat: reverse charge records zero tax but keeps the amount", () => {
  expect(vat(10000, 0.2, { reverseCharge: true })).toEqual({ net: 10000, tax: 0, gross: 10000 });
  // reverse charge also applies to an inclusive call (nothing to extract)
  expect(vat(10000, 0.2, { reverseCharge: true, inclusive: true })).toEqual({
    net: 10000,
    tax: 0,
    gross: 10000,
  });
});

test("vat: honours extended rounding modes", () => {
  expect(vat(100, 0.025, { round: "half-down" }).tax).toBe(2);
  expect(vat(100, 0.025, { round: "ceil" }).tax).toBe(3);
  expect(vat(100, 0.025, { round: "floor" }).tax).toBe(2);
});

test("gst is an alias of vat", () => {
  expect(gst(10000, RATES.IN_GST)).toEqual(vat(10000, RATES.IN_GST));
});

test("formatRate: fractions to percent strings, trimming trailing zeros", () => {
  expect(formatRate(0.13)).toBe("13%");
  expect(formatRate(0.075)).toBe("7.5%");
  expect(formatRate(0.2)).toBe("20%");
  expect(formatRate(0.07)).toBe("7%"); // no float noise (7.000000000000001)
  expect(formatRate(0)).toBe("0%");
});

test("formatRate: fixed decimals and custom symbol", () => {
  expect(formatRate(0.13, { decimals: 2 })).toBe("13.00%");
  expect(formatRate(0.13, { symbol: " percent" })).toBe("13 percent");
});

test("formatRate / vat validate their inputs", () => {
  expect(() => formatRate(-0.1)).toThrow(RangeError);
  expect(() => formatRate(0.1, { decimals: -1 })).toThrow(RangeError);
  expect(() => vat(10.5, 0.13)).toThrow(TypeError);
  expect(() => vat(100, -0.1)).toThrow(RangeError);
});

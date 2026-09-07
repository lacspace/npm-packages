import { test, expect } from "vitest";
import { money, Money, convert } from "./index";

test("convert applies an injected rate and preserves currency", () => {
  const eur = convert(money(100, "USD"), "EUR", 0.92);
  expect(eur.currency).toBe("EUR");
  expect(eur.toMinor()).toBe(9200); // €92.00
});

test("convert honours differing exponents (2 -> 0 decimals)", () => {
  const jpy = convert(money(100, "USD"), "JPY", 150);
  expect(jpy.toMinor()).toBe(15000); // ¥15,000, 0-decimal target
  expect(jpy.currency).toBe("JPY");
});

test("convert honours differing exponents (0 -> 2 decimals)", () => {
  const usd = convert(money(1000, "JPY"), "USD", 0.0067);
  // 1000 JPY major * 0.0067 = 6.70 USD -> 670 minor
  expect(usd.toMinor()).toBe(670);
});

test("convert respects the rounding mode at boundaries", () => {
  // 5 USD minor, rate 0.5, same exponent -> 2.5 target minor units
  const half = Money.fromMinor(5, "USD");
  expect(convert(half, "USD", 0.5, "half-up").toMinor()).toBe(3);
  expect(convert(half, "USD", 0.5, "half-even").toMinor()).toBe(2);
  expect(convert(half, "USD", 0.5, "floor").toMinor()).toBe(2);
});

test("convert rejects a negative or non-finite rate", () => {
  expect(() => convert(money(1, "USD"), "EUR", -1)).toThrow(/rate/i);
  expect(() => convert(money(1, "USD"), "EUR", Infinity)).toThrow(/rate/i);
});

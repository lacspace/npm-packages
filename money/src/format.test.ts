import { test, expect } from "vitest";
import { money, Money, formatBasic, parseMoney, currencyExponent, currencySymbol } from "./index";

test("currencyExponent reflects each currency's decimal places", () => {
  expect(currencyExponent("USD")).toBe(2);
  expect(currencyExponent("JPY")).toBe(0);
  expect(currencyExponent("NPR")).toBe(2);
  expect(currencyExponent("BHD")).toBe(3);
});

test("formatBasic groups and uses the right decimal places (no Intl)", () => {
  expect(formatBasic(money(1234.56, "USD"))).toBe("$1,234.56");
  expect(formatBasic(money(1000, "JPY"))).toBe("¥1,000"); // 0 decimals
  expect(formatBasic(money(1.5, "BHD"))).toBe("ب.د1.500"); // 3 decimals
  expect(formatBasic(money(0, "USD"))).toBe("$0.00");
});

test("formatBasic handles negatives and custom separators/position", () => {
  expect(formatBasic(money(-9.5, "USD"))).toBe("-$9.50");
  expect(
    formatBasic(money(1234.5, "EUR"), {
      groupSeparator: ".",
      decimalSeparator: ",",
      symbolPosition: "suffix",
    }),
  ).toBe("1.234,50 €");
});

test("currencySymbol falls back to the code when unknown", () => {
  expect(currencySymbol("USD")).toBe("$");
  expect(currencySymbol("NPR")).toBe("रू");
  expect(currencySymbol("XYZ")).toBe("XYZ");
});

test("parseMoney returns integer minor units and round-trips", () => {
  expect(parseMoney("$1,234.56", "USD")).toBe(123456);
  expect(parseMoney("¥1000", "JPY")).toBe(1000);
  expect(parseMoney("1.5", "BHD")).toBe(1500);
  // round-trip: minor -> format -> parse -> minor
  const m = Money.fromMinor(98765, "USD");
  expect(parseMoney(formatBasic(m), "USD")).toBe(98765);
});

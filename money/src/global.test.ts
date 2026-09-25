import { test, expect } from "vitest";
import { money, Money, parseMoney, currencyExponent, roundMinor, multiply } from "./index";

// A lone separator followed by three digits is a thousands group: a two-decimal
// currency cannot carry a third decimal, so "1,234" can only mean one thousand.
test("parseMoney reads a lone thousands separator as grouping", () => {
  expect(parseMoney("$1,234", "USD")).toBe(123400);
  expect(parseMoney("1.234 €", "EUR")).toBe(123400);
  expect(parseMoney("¥1,234", "JPY")).toBe(1234);
  expect(parseMoney("₩1,234", "KRW")).toBe(1234);
});

test("parseMoney keeps real decimals", () => {
  expect(parseMoney("$1,234.56", "USD")).toBe(123456);
  expect(parseMoney("1.234,56 €", "EUR")).toBe(123456);
  expect(parseMoney("12,34", "EUR")).toBe(1234);
  expect(parseMoney("0.5", "USD")).toBe(50);
  expect(parseMoney(".99", "USD")).toBe(99);
  // Three-decimal currencies: three digits after the separator ARE decimals.
  expect(parseMoney("1.234", "BHD")).toBe(1234);
  expect(parseMoney("KD 1,234.500", "KWD")).toBe(1234500);
});

test("parseMoney handles repeated grouping, Western and Indian", () => {
  expect(parseMoney("¥1,234,567", "JPY")).toBe(1234567);
  expect(parseMoney("1.234.567 €", "EUR")).toBe(123456700);
  expect(parseMoney("₹1,23,456", "INR")).toBe(12345600);
  expect(parseMoney("₹12,34,567.89", "INR")).toBe(123456789);
  expect(parseMoney("CHF 1'234.50", "CHF")).toBe(123450);
  expect(parseMoney("1 234 567,89 €", "EUR")).toBe(123456789);
});

test("parseMoney rejects malformed grouping instead of guessing", () => {
  expect(() => parseMoney("1,2,3", "USD")).toThrow(/grouping/);
  expect(() => parseMoney("12,3456,789", "USD")).toThrow(/grouping/);
  expect(() => parseMoney("1.23.45", "USD")).toThrow();
  expect(() => parseMoney("abc", "USD")).toThrow(/no digits/);
});

test("parseMoney honours an explicit decimal separator", () => {
  expect(parseMoney("1,234", "USD", { decimalSeparator: "," })).toBe(123);
  expect(parseMoney("1.234", "EUR", { decimalSeparator: "." })).toBe(123);
});

test("parseMoney reads negatives in every common notation", () => {
  expect(parseMoney("-$5.00", "USD")).toBe(-500);
  expect(parseMoney("($5.00)", "USD")).toBe(-500);
  expect(parseMoney("−5.00", "USD")).toBe(-500);
  expect(parseMoney("5.00-", "USD")).toBe(-500);
});

test("parseMoney accepts non-ASCII digits", () => {
  expect(parseMoney("١٬٢٣٤٫٥٦", "SAR")).toBe(123456); // Arabic-Indic
  expect(parseMoney("रू १,२३४", "NPR")).toBe(123400); // Devanagari
  expect(parseMoney("１０００", "JPY")).toBe(1000); // full-width
});

test("parseMoney never goes through a float", () => {
  expect(parseMoney("0.29", "USD")).toBe(29);
  expect(parseMoney("1.005", "USD", { decimalSeparator: "." })).toBe(101);
  expect(parseMoney("90071992547409.91", "USD")).toBe(9007199254740991);
  expect(() => parseMoney("90071992547409.92", "USD")).toThrow(/too large/);
});

// 1.005 * 100 === 100.49999999999999 in binary floating point.
test("money() rounds the decimal the caller wrote, not its float image", () => {
  expect(money(1.005, "USD").amount).toBe(101);
  expect(money(8.325, "USD").amount).toBe(833);
  expect(money(2.675, "USD").amount).toBe(268);
  expect(money(19.99, "USD").amount).toBe(1999);
  expect(roundMinor(100.49999999999999)).toBe(101);
  expect(roundMinor(100.49999999999999, "floor")).toBe(100);
  expect(multiply(Money.fromMinor(1, "USD"), 0.285 * 10).amount).toBe(3);
});

test("currency exponents follow ISO 4217", () => {
  for (const c of ["BIF", "DJF", "KMF", "PYG", "UYI", "VUV", "JPY", "KRW", "CLP"]) expect(currencyExponent(c)).toBe(0);
  for (const c of ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]) expect(currencyExponent(c)).toBe(3);
  expect(currencyExponent("CLF")).toBe(4);
  expect(currencyExponent("UYW")).toBe(4);
  expect(money(5000, "PYG").amount).toBe(5000);
});

import { test, expect } from "vitest";
import { numberToWords, numberToOrdinalWords } from "./index";

test("numberToWords small + teens + tens", () => {
  expect(numberToWords(0)).toBe("zero");
  expect(numberToWords(7)).toBe("seven");
  expect(numberToWords(13)).toBe("thirteen");
  expect(numberToWords(42)).toBe("forty-two");
  expect(numberToWords(100)).toBe("one hundred");
});

test("numberToWords thousands", () => {
  expect(numberToWords(1234)).toBe("one thousand two hundred thirty-four");
  expect(numberToWords(1000000)).toBe("one million");
  expect(numberToWords(1005)).toBe("one thousand five");
});

test("numberToWords negatives", () => {
  expect(numberToWords(-5)).toBe("negative five");
  expect(numberToWords(-1234)).toBe("negative one thousand two hundred thirty-four");
});

test("numberToWords large number", () => {
  expect(numberToWords(1234567890)).toBe(
    "one billion two hundred thirty-four million five hundred sixty-seven thousand eight hundred ninety",
  );
});

test("numberToWords decimals read digit by digit", () => {
  expect(numberToWords(0.25)).toBe("zero point two five");
  expect(numberToWords(3.05)).toBe("three point zero five");
});

test("numberToWords non-finite passthrough", () => {
  expect(numberToWords(NaN)).toBe("NaN");
  expect(numberToWords(Infinity)).toBe("Infinity");
});

test("numberToOrdinalWords", () => {
  expect(numberToOrdinalWords(1)).toBe("first");
  expect(numberToOrdinalWords(2)).toBe("second");
  expect(numberToOrdinalWords(3)).toBe("third");
  expect(numberToOrdinalWords(5)).toBe("fifth");
  expect(numberToOrdinalWords(12)).toBe("twelfth");
  expect(numberToOrdinalWords(20)).toBe("twentieth");
  expect(numberToOrdinalWords(21)).toBe("twenty-first");
  expect(numberToOrdinalWords(100)).toBe("one hundredth");
});

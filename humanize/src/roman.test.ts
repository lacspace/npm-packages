import { test, expect } from "vitest";
import { toRoman, fromRoman } from "./index";

test("toRoman basics + subtractive", () => {
  expect(toRoman(4)).toBe("IV");
  expect(toRoman(9)).toBe("IX");
  expect(toRoman(40)).toBe("XL");
  expect(toRoman(3888)).toBe("MMMDCCCLXXXVIII");
  expect(toRoman(2024)).toBe("MMXXIV");
});

test("fromRoman round-trips every value 1..3999", () => {
  for (const n of [1, 4, 9, 40, 90, 444, 3888, 3999]) {
    expect(fromRoman(toRoman(n))).toBe(n);
  }
});

test("fromRoman is case-insensitive and trims", () => {
  expect(fromRoman("  mmxxiv ")).toBe(2024);
});

test("toRoman rejects out-of-range", () => {
  expect(() => toRoman(0)).toThrow();
  expect(() => toRoman(4000)).toThrow();
  expect(() => toRoman(1.5)).toThrow();
});

test("fromRoman rejects malformed", () => {
  expect(() => fromRoman("IIII")).toThrow();
  expect(() => fromRoman("VX")).toThrow();
  expect(() => fromRoman("ABC")).toThrow();
  expect(() => fromRoman("")).toThrow();
});

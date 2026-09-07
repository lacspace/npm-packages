import { test, expect } from "vitest";
import { roundToLot, spread } from "./pricing";

test("roundToLot floors quantity to whole lots", () => {
  expect(roundToLot(147, 25)).toBe(125);
  expect(roundToLot(150, 25)).toBe(150);
  expect(roundToLot(10, 25)).toBe(0);
});

test("roundToLot with non-positive lot size is a no-op", () => {
  expect(roundToLot(147, 0)).toBe(147);
  expect(roundToLot(147)).toBe(147); // default lot size 1
});

test("spread decomposes bid/ask", () => {
  expect(spread(99, 101)).toEqual({ absolute: 2, mid: 100, percent: 2 });
});

test("spread handles a zero mid without dividing by zero", () => {
  const s = spread(0, 0);
  expect(s.absolute).toBe(0);
  expect(s.mid).toBe(0);
  expect(s.percent).toBe(0);
});

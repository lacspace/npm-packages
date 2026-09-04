import { test, expect } from "vitest";
import { Money, money } from "./index";

test("Money.of and fromMinor build integer minor units", () => {
  expect(Money.of(19.99, "USD").amount).toBe(1999);
  expect(Money.fromMinor(1999, "USD").amount).toBe(1999);
  expect(Money.of(1000, "JPY").amount).toBe(1000); // 0-decimal currency
});

test("add / subtract / multiply are exact in minor units", () => {
  const a = Money.of(19.99, "USD");
  expect(a.multiply(3).amount).toBe(5997); // $59.97, exact
  expect(a.add(Money.of(0.01, "USD")).amount).toBe(2000);
  expect(a.subtract(Money.of(9.99, "USD")).amount).toBe(1000);
});

test("allocate distributes remainder so parts sum exactly (positive)", () => {
  const parts = money(10, "USD").allocate([1, 1, 1]);
  expect(parts.map((p) => p.amount)).toEqual([334, 333, 333]);
  const total = parts.reduce((s, p) => s + p.amount, 0);
  expect(total).toBe(1000);
});

test("allocate on a negative total still sums exactly", () => {
  const neg = Money.fromMinor(-1000, "USD");
  const parts = neg.allocate([1, 1, 1]);
  const total = parts.reduce((s, p) => s + p.amount, 0);
  expect(total).toBe(-1000);
});

test("allocate with uneven ratios sums exactly and weights big ratios first", () => {
  const parts = money(10, "USD").allocate([7, 3]);
  const total = parts.reduce((s, p) => s + p.amount, 0);
  expect(total).toBe(1000);
  expect(parts[0]!.amount).toBeGreaterThan(parts[1]!.amount);
});

test("rounding is half-up and symmetric for negatives", () => {
  // multiply rounds to whole minor units, half away from zero.
  expect(Money.fromMinor(1, "USD").multiply(2.5).amount).toBe(3);
  expect(Money.fromMinor(1, "USD").multiply(-2.5).amount).toBe(-3);
});

test("operations across currencies throw", () => {
  expect(() => money(1, "USD").add(money(1, "EUR"))).toThrow(/mismatch/i);
});

import { test, expect } from "vitest";
import {
  money,
  Money,
  add,
  subtract,
  multiply,
  divide,
  percentage,
  compare,
  minMoney,
  maxMoney,
  equals,
  allocate,
  split,
  sum,
} from "./index";

test("free-function add/subtract match the methods and stay in minor units", () => {
  expect(add(money(19.99, "USD"), money(0.01, "USD")).toMinor()).toBe(2000);
  expect(subtract(money(19.99, "USD"), money(9.99, "USD")).toMinor()).toBe(1000);
});

test("multiply/divide honour explicit rounding modes at the .5 boundary", () => {
  // 5 / 2 = 2.5 minor units.
  expect(divide(Money.fromMinor(5, "USD"), 2, "half-up").toMinor()).toBe(3);
  expect(divide(Money.fromMinor(5, "USD"), 2, "half-even").toMinor()).toBe(2);
  expect(divide(Money.fromMinor(5, "USD"), 2, "floor").toMinor()).toBe(2);
  // 1 * 2.5 = 2.5
  expect(multiply(Money.fromMinor(1, "USD"), 2.5, "half-down").toMinor()).toBe(2);
  expect(multiply(Money.fromMinor(1, "USD"), 2.5, "half-up").toMinor()).toBe(3);
});

test("divide by zero throws", () => {
  expect(() => divide(money(1, "USD"), 0)).toThrow(/zero/i);
});

test("percentage computes a share and rounds by mode", () => {
  expect(percentage(money(100, "USD"), 8.5).toMinor()).toBe(850); // $8.50
  // 7 minor * 5% = 0.35 -> 0
  expect(percentage(Money.fromMinor(7, "USD"), 5, "half-up").toMinor()).toBe(0);
});

test("compare / min / max order by value", () => {
  const a = money(5, "USD");
  const b = money(9, "USD");
  expect(compare(a, b)).toBe(-1);
  expect(compare(b, a)).toBe(1);
  expect(compare(a, money(5, "USD"))).toBe(0);
  expect(minMoney(b, a, money(7, "USD")).toMinor()).toBe(500);
  expect(maxMoney(a, b, money(7, "USD")).toMinor()).toBe(900);
});

test("equals and sum free functions", () => {
  expect(equals(money(1.5, "USD"), Money.fromMinor(150, "USD"))).toBe(true);
  expect(sum([money(1, "USD"), money(2, "USD"), money(3, "USD")]).toMinor()).toBe(600);
});

test("free-function allocate/split conserve the total exactly", () => {
  const parts = allocate(money(10, "USD"), [1, 1, 1]);
  expect(parts.reduce((s, p) => s + p.toMinor(), 0)).toBe(1000);
  const even = split(money(1, "USD"), 3);
  expect(even.reduce((s, p) => s + p.toMinor(), 0)).toBe(100); // 34+33+33
});

import { test, expect } from "vitest";
import {
  createStock,
  available,
  reserve,
  release,
  commit,
  restock,
  adjust,
  isLow,
  isOutOfStock,
  InventoryError,
} from "./index";

test("createStock and available", () => {
  const s = createStock(10);
  expect(s.onHand).toBe(10);
  expect(s.reserved).toBe(0);
  expect(available(s)).toBe(10);
  expect(createStock().onHand).toBe(0);
});

test("reserve within available decrements availability", () => {
  const s = reserve(createStock(10), 4);
  expect(s.reserved).toBe(4);
  expect(s.onHand).toBe(10);
  expect(available(s)).toBe(6);
});

test("reserve over available throws InventoryError (no oversell)", () => {
  const s = createStock(3);
  expect(() => reserve(s, 5)).toThrow(InventoryError);
  const s2 = reserve(s, 3);
  expect(() => reserve(s2, 1)).toThrow(InventoryError);
});

test("commit fulfils reserved units", () => {
  let s = createStock(10);
  s = reserve(s, 4);
  s = commit(s, 3);
  expect(s.onHand).toBe(7);
  expect(s.reserved).toBe(1);
  expect(available(s)).toBe(6);
});

test("commit beyond reserved throws", () => {
  let s = reserve(createStock(10), 2);
  expect(() => commit(s, 5)).toThrow(InventoryError);
});

test("release never drops reserved below zero", () => {
  let s = reserve(createStock(10), 2);
  s = release(s, 5); // only 2 reserved
  expect(s.reserved).toBe(0);
  expect(s.onHand).toBe(10);
  expect(available(s)).toBe(10);
});

test("restock and adjust", () => {
  let s = createStock(5);
  s = restock(s, 10);
  expect(s.onHand).toBe(15);
  s = adjust(s, -3);
  expect(s.onHand).toBe(12);
  // clamps at zero
  s = adjust(s, -1000);
  expect(s.onHand).toBe(0);
});

test("isLow and isOutOfStock", () => {
  const s = createStock(5);
  expect(isLow(s, 5)).toBe(true);
  expect(isLow(s, 4)).toBe(false);
  expect(isOutOfStock(s)).toBe(false);

  const reserved = reserve(s, 5);
  expect(available(reserved)).toBe(0);
  expect(isOutOfStock(reserved)).toBe(true);
  expect(isOutOfStock(createStock(0))).toBe(true);
});

test("operations are immutable", () => {
  const s = createStock(10);
  reserve(s, 3);
  restock(s, 5);
  expect(s.onHand).toBe(10);
  expect(s.reserved).toBe(0);
});

test("negative quantities are rejected", () => {
  expect(() => reserve(createStock(5), -1)).toThrow(InventoryError);
  expect(() => createStock(-2)).toThrow(InventoryError);
});

test("commit cannot drive onHand negative after a stock-take shrinks it", () => {
  // Reserve first, then a shrinkage adjustment drops onHand below the reserved count.
  let s = reserve(createStock(10), 8); // onHand 10, reserved 8
  s = adjust(s, -9); // onHand clamps to 1, reserved still 8 → oversold on paper
  expect(s.onHand).toBe(1);
  expect(s.reserved).toBe(8);
  // Committing all 8 would make onHand -7; it must fail loudly instead.
  expect(() => commit(s, 8)).toThrow(InventoryError);
  // Committing only what is physically present still works and stays non-negative.
  const shipped = commit(s, 1);
  expect(shipped.onHand).toBe(0);
  expect(shipped.reserved).toBe(7);
});

test("double-commit past the reservation throws", () => {
  let s = reserve(createStock(10), 4);
  s = commit(s, 4); // fully fulfilled
  expect(s.reserved).toBe(0);
  expect(s.onHand).toBe(6);
  expect(() => commit(s, 1)).toThrow(InventoryError); // nothing left reserved
});

test("committing exactly the reserved amount zeroes the reservation", () => {
  let s = reserve(createStock(5), 5);
  s = commit(s, 5);
  expect(s.reserved).toBe(0);
  expect(s.onHand).toBe(0);
  expect(available(s)).toBe(0);
});

test("release of zero and over-release are safe", () => {
  let s = reserve(createStock(10), 3);
  s = release(s, 0);
  expect(s.reserved).toBe(3); // no-op
  s = release(s, 999); // more than reserved
  expect(s.reserved).toBe(0); // clamped, never negative
});

test("fractional quantities are truncated, not rounded", () => {
  const s = reserve(createStock(10), 3.9);
  expect(s.reserved).toBe(3);
  expect(createStock(7.9).onHand).toBe(7);
});

test("non-finite quantities are rejected", () => {
  expect(() => reserve(createStock(5), Infinity)).toThrow(InventoryError);
  expect(() => reserve(createStock(5), NaN)).toThrow(InventoryError);
  expect(() => createStock(Infinity)).toThrow(InventoryError);
});

test("reserving zero is allowed even when nothing is available", () => {
  const s = reserve(createStock(2), 2); // fully reserved, available 0
  expect(available(s)).toBe(0);
  const same = reserve(s, 0);
  expect(same.reserved).toBe(2);
  expect(same.onHand).toBe(2);
});

test("every operation is immutable against a frozen stock", () => {
  const s = Object.freeze(reserve(createStock(10), 4));
  expect(() => reserve(s, 1)).not.toThrow();
  expect(() => release(s, 1)).not.toThrow();
  expect(() => commit(s, 2)).not.toThrow();
  expect(() => restock(s, 5)).not.toThrow();
  expect(() => adjust(s, -3)).not.toThrow();
  // Frozen input is unchanged.
  expect(s.onHand).toBe(10);
  expect(s.reserved).toBe(4);
});

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

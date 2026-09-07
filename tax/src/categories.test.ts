import { test, expect } from "vitest";
import { lookupRate, resolveRate, addTax, type RateTable } from "./index";

const table: RateTable = {
  default: 0.2,
  categories: {
    standard: 0.2,
    reduced: 0.05,
    food: { default: 0, NY: 0, CA: 0.0725 },
  },
};

test("lookupRate: flat category rate", () => {
  expect(lookupRate(table, "reduced")).toBe(0.05);
});

test("lookupRate: region entry within a category map", () => {
  expect(lookupRate(table, "food", "CA")).toBe(0.0725);
});

test("lookupRate: falls back to the category-map default region", () => {
  expect(lookupRate(table, "food", "TX")).toBe(0);
});

test("lookupRate: falls back to the table default, else undefined", () => {
  const noDefault: RateTable = { categories: { standard: 0.2 } };
  expect(lookupRate(table, "unknown")).toBe(0.2);
  expect(lookupRate(noDefault, "unknown")).toBeUndefined();
});

test("resolveRate: returns a usable rate and feeds addTax", () => {
  const rate = resolveRate(table, "food", "CA");
  expect(addTax(10000, rate).tax).toBe(725);
});

test("resolveRate: throws when nothing matches and no default", () => {
  const noDefault: RateTable = { categories: { standard: 0.2 } };
  expect(() => resolveRate(noDefault, "missing")).toThrow(RangeError);
});

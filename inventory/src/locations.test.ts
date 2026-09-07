import { test, expect } from "vitest";
import { InventoryError } from "./index";
import {
  createLocations,
  atLocation,
  setLocation,
  totalOnHand,
  totalReserved,
  totalAvailable,
  aggregate,
  transfer,
} from "./locations";
import { reserve } from "./index";

test("createLocations and aggregate views", () => {
  const ls = createLocations({ nyc: 10, sfo: 5 });
  expect(totalOnHand(ls)).toBe(15);
  expect(totalReserved(ls)).toBe(0);
  expect(totalAvailable(ls)).toBe(15);
  expect(aggregate(ls)).toEqual({ onHand: 15, reserved: 0 });
  expect(atLocation(ls, "missing")).toEqual({ onHand: 0, reserved: 0 });
});

test("transfer conserves total units", () => {
  const ls = createLocations({ nyc: 10, sfo: 5 });
  const before = totalOnHand(ls);
  const moved = transfer(ls, "nyc", "sfo", 4);
  expect(atLocation(moved, "nyc").onHand).toBe(6);
  expect(atLocation(moved, "sfo").onHand).toBe(9);
  expect(totalOnHand(moved)).toBe(before); // conserved
});

test("transfer draws only from available (respects reservations)", () => {
  let ls = createLocations({ nyc: 10 });
  ls = setLocation(ls, "nyc", reserve(atLocation(ls, "nyc"), 8)); // 2 available
  expect(() => transfer(ls, "nyc", "sfo", 5)).toThrow(InventoryError);
  const ok = transfer(ls, "nyc", "sfo", 2);
  expect(atLocation(ok, "nyc").onHand).toBe(8);
  expect(atLocation(ok, "nyc").reserved).toBe(8);
  expect(atLocation(ok, "sfo").onHand).toBe(2);
});

test("transfer to a brand-new location and same-location guard", () => {
  const ls = createLocations({ nyc: 3 });
  const moved = transfer(ls, "nyc", "new-shelf", 3);
  expect(atLocation(moved, "new-shelf").onHand).toBe(3);
  expect(totalOnHand(moved)).toBe(3);
  expect(() => transfer(ls, "nyc", "nyc", 1)).toThrow(InventoryError);
});

test("createLocations rejects negatives and is immutable", () => {
  expect(() => createLocations({ nyc: -1 })).toThrow(InventoryError);
  const ls = createLocations({ nyc: 5 });
  transfer(ls, "nyc", "sfo", 2);
  expect(ls.nyc!.onHand).toBe(5); // input untouched
  expect(ls.sfo).toBeUndefined();
});

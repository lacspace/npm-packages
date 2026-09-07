import { test, expect } from "vitest";
import { createStock, reserve } from "./index";
import { lowStockReport, expiringSoonReport } from "./reports";
import type { Lot } from "./lots";

const DAY = 86_400_000;
const now = 2_000_000_000_000;

test("lowStockReport flags SKUs at or below their threshold", () => {
  const items = [
    { sku: "A", stock: createStock(10), threshold: 5 }, // ok
    { sku: "B", stock: createStock(5), threshold: 5 }, // low (==)
    { sku: "C", stock: reserve(createStock(10), 8), threshold: 5 }, // available 2 → low
  ];
  const alerts = lowStockReport(items);
  expect(alerts.map((a) => a.sku)).toEqual(["B", "C"]);
  expect(alerts.find((a) => a.sku === "C")?.available).toBe(2);
});

test("expiringSoonReport uses the injected clock and sorts by soonest", () => {
  const items = [
    {
      sku: "MILK",
      lots: [
        { id: "m1", qty: 2, expiresAt: now + 1 * DAY },
        { id: "m2", qty: 2, expiresAt: now + 20 * DAY }, // outside window
      ] as Lot[],
    },
    {
      sku: "EGGS",
      lots: [
        { id: "e1", qty: 6, expiresAt: now - DAY }, // already expired → excluded
        { id: "e2", qty: 6, expiresAt: now + 3 * DAY },
      ] as Lot[],
    },
  ];
  const alerts = expiringSoonReport(items, 7 * DAY, now);
  expect(alerts.map((a) => `${a.sku}:${a.lot.id}`)).toEqual(["MILK:m1", "EGGS:e2"]);
});

test("expiringSoonReport is empty when nothing is in-window", () => {
  const items = [{ sku: "X", lots: [{ id: "x1", qty: 1, expiresAt: now + 100 * DAY }] as Lot[] }];
  expect(expiringSoonReport(items, DAY, now)).toEqual([]);
});

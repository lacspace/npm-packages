import { test, expect } from "vitest";
import { InventoryError } from "./index";
import {
  lotQuantity,
  sortLots,
  allocate,
  expiredLots,
  expiringLots,
  type Lot,
} from "./lots";

const DAY = 86_400_000;
const now = 1_000_000_000_000;

const lots: Lot[] = [
  { id: "A", qty: 5, receivedAt: now - 3 * DAY, expiresAt: now + 10 * DAY },
  { id: "B", qty: 3, receivedAt: now - 1 * DAY, expiresAt: now + 2 * DAY },
  { id: "C", qty: 4, receivedAt: now - 2 * DAY, expiresAt: now + 30 * DAY },
];

test("lotQuantity sums units", () => {
  expect(lotQuantity(lots)).toBe(12);
});

test("FEFO orders by soonest expiry", () => {
  expect(sortLots(lots, "fefo").map((l) => l.id)).toEqual(["B", "A", "C"]);
});

test("FIFO orders by earliest received", () => {
  expect(sortLots(lots, "fifo").map((l) => l.id)).toEqual(["A", "C", "B"]);
});

test("FEFO allocation consumes soonest-expiring first and conserves units", () => {
  const r = allocate(lots, 6, { strategy: "fefo" });
  // B(3) fully, then A(3 of 5)
  expect(r.allocations).toEqual([
    { id: "B", qty: 3 },
    { id: "A", qty: 3 },
  ]);
  expect(r.remaining).toBe(0);
  // conservation: input == remaining-lots + consumed
  expect(lotQuantity(lots)).toBe(lotQuantity(r.lots) + (6 - r.remaining));
});

test("FIFO allocation consumes oldest received first", () => {
  const r = allocate(lots, 6, { strategy: "fifo" });
  expect(r.allocations).toEqual([
    { id: "A", qty: 5 },
    { id: "C", qty: 1 },
  ]);
  expect(r.remaining).toBe(0);
});

test("allocation short-fills and reports remaining", () => {
  const r = allocate(lots, 100);
  expect(lotQuantity(lots)).toBe(r.allocations.reduce((s, a) => s + a.qty, 0));
  expect(r.remaining).toBe(88);
  expect(r.lots).toEqual([]); // everything consumed
});

test("allocate skips expired lots when now is given", () => {
  const withExpired: Lot[] = [
    { id: "OLD", qty: 5, expiresAt: now - DAY },
    { id: "GOOD", qty: 4, expiresAt: now + DAY },
  ];
  const r = allocate(withExpired, 4, { now });
  expect(r.allocations).toEqual([{ id: "GOOD", qty: 4 }]);
  expect(r.remaining).toBe(0);
  // expired lot is retained, untouched
  expect(r.lots.find((l) => l.id === "OLD")?.qty).toBe(5);
});

test("expiredLots and expiringLots with injected clock", () => {
  const set: Lot[] = [
    { id: "X", qty: 1, expiresAt: now - DAY }, // expired
    { id: "Y", qty: 1, expiresAt: now + DAY }, // soon (within 3 days)
    { id: "Z", qty: 1, expiresAt: now + 10 * DAY }, // later
  ];
  expect(expiredLots(set, now).map((l) => l.id)).toEqual(["X"]);
  expect(expiringLots(set, 3 * DAY, now).map((l) => l.id)).toEqual(["Y"]);
});

test("allocate is immutable and rejects negatives", () => {
  const snapshot = JSON.parse(JSON.stringify(lots));
  allocate(lots, 5);
  expect(lots).toEqual(snapshot);
  expect(() => allocate(lots, -1)).toThrow(InventoryError);
});

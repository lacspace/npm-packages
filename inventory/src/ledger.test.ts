import { test, expect } from "vitest";
import { InventoryError } from "./index";
import {
  applyMovement,
  reduceMovements,
  runningBalances,
  recordMovement,
  type Movement,
} from "./ledger";

const log: Movement[] = [
  { type: "receipt", qty: 100, at: 1 },
  { type: "reservation", qty: 10, at: 2 },
  { type: "commit", qty: 4, at: 3 },
  { type: "release", qty: 6, at: 4 },
  { type: "sale", qty: 20, at: 5 },
  { type: "adjustment", qty: -3, at: 6 },
];

test("reduceMovements reconstructs the final balance", () => {
  // onHand: 100 -4 (commit) -20 (sale) -3 (adj) = 73; reserved: 10 -4 -6 = 0
  expect(reduceMovements(log)).toEqual({ onHand: 73, reserved: 0 });
});

test("runningBalance is correct after each entry", () => {
  const rows = runningBalances(log);
  expect(rows.map((r) => r.balance.onHand)).toEqual([100, 100, 96, 96, 76, 73]);
  expect(rows.map((r) => r.balance.reserved)).toEqual([0, 10, 6, 0, 0, 0]);
});

test("applyMovement handles signed transfer and adjustment", () => {
  expect(applyMovement({ onHand: 10, reserved: 0 }, { type: "transfer", qty: -4, at: 0 })).toEqual({
    onHand: 6,
    reserved: 0,
  });
  expect(applyMovement({ onHand: 10, reserved: 0 }, { type: "transfer", qty: 4, at: 0 })).toEqual({
    onHand: 14,
    reserved: 0,
  });
});

test("balances clamp at zero and never go negative on replay", () => {
  const bad: Movement[] = [
    { type: "receipt", qty: 5, at: 1 },
    { type: "sale", qty: 50, at: 2 },
  ];
  expect(reduceMovements(bad)).toEqual({ onHand: 0, reserved: 0 });
});

test("recordMovement appends immutably and stamps the clock", () => {
  const before: Movement[] = [];
  const after = recordMovement(before, { type: "receipt", qty: 5 }, 12345);
  expect(before).toEqual([]); // untouched
  expect(after).toEqual([{ type: "receipt", qty: 5, at: 12345 }]);
  // explicit at wins over the clock
  const withAt = recordMovement(after, { type: "sale", qty: 2, at: 999 }, 12345);
  expect(withAt[1]!.at).toBe(999);
});

test("initial balance seeds the replay", () => {
  const rows = runningBalances([{ type: "sale", qty: 2, at: 1 }], { onHand: 10, reserved: 0 });
  expect(rows[0]!.balance).toEqual({ onHand: 8, reserved: 0 });
});

test("unknown movement type throws", () => {
  expect(() =>
    applyMovement({ onHand: 1, reserved: 0 }, { type: "boom" as never, qty: 1, at: 0 }),
  ).toThrow(InventoryError);
});

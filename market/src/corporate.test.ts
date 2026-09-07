import { test, expect } from "vitest";
import {
  adjustForSplit,
  adjustForBonus,
  adjustForDividend,
  adjustClose,
} from "./corporate";

test("adjustForSplit halves pre-split prices for a 2:1 split", () => {
  expect(adjustForSplit([100, 100, 50, 50], 2, 2)).toEqual([50, 50, 50, 50]);
});

test("adjustForSplit leaves prices unchanged for a non-positive ratio", () => {
  expect(adjustForSplit([100, 50], 0, 1)).toEqual([100, 50]);
});

test("adjustForBonus applies b/(a+b) to pre-event prices (1:1)", () => {
  expect(adjustForBonus([100, 100, 50, 50], 1, 1, 2)).toEqual([50, 50, 50, 50]);
});

test("adjustForDividend scales by (close - amount)/close", () => {
  expect(adjustForDividend([110, 110, 100], 10, 2)).toEqual([99, 99, 100]);
});

test("adjustForDividend ignores non-positive amounts and bad reference", () => {
  expect(adjustForDividend([110, 110, 100], 0, 2)).toEqual([110, 110, 100]);
  expect(adjustForDividend([110, 110, 0], 10, 2)).toEqual([110, 110, 0]);
});

test("adjustClose composes multiple actions multiplicatively", () => {
  // 2:1 split at index 2 then 1:1 bonus at index 2 → pre-event factor 0.5 * 0.5
  const out = adjustClose([200, 200, 50, 50], [
    { type: "split", ratio: 2, atIndex: 2 },
    { type: "bonus", a: 1, b: 1, atIndex: 2 },
  ]);
  expect(out).toEqual([50, 50, 50, 50]);
});

test("adjustClose dividend uses the original reference close", () => {
  const out = adjustClose([110, 110, 100], [{ type: "dividend", amount: 10, atIndex: 2 }]);
  expect(out).toEqual([99, 99, 100]);
});

test("adjustClose returns a copy and does not mutate input", () => {
  const input = [100, 50];
  const out = adjustClose(input, []);
  expect(out).toEqual([100, 50]);
  expect(out).not.toBe(input);
});

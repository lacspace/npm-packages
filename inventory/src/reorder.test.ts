import { test, expect } from "vitest";
import { createStock, reserve, InventoryError } from "./index";
import { needsReorder, suggestedOrderQuantity } from "./reorder";

test("needsReorder triggers at or below the reorder point", () => {
  expect(needsReorder(createStock(10), { reorderPoint: 5 })).toBe(false);
  expect(needsReorder(createStock(5), { reorderPoint: 5 })).toBe(true);
  expect(needsReorder(createStock(3), { reorderPoint: 5 })).toBe(true);
});

test("needsReorder uses available, not onHand", () => {
  const s = reserve(createStock(10), 6); // available 4
  expect(needsReorder(s, { reorderPoint: 5 })).toBe(true);
});

test("suggested qty is zero when no reorder is needed", () => {
  expect(suggestedOrderQuantity(createStock(20), { reorderPoint: 5 })).toBe(0);
});

test("order-up-to maxStock target", () => {
  const s = createStock(2); // available 2, below point
  expect(suggestedOrderQuantity(s, { reorderPoint: 5, maxStock: 20 })).toBe(18);
});

test("default target is reorderPoint + safetyStock", () => {
  const s = createStock(2);
  expect(suggestedOrderQuantity(s, { reorderPoint: 5, safetyStock: 3 })).toBe(6); // (5+3)-2
});

test("reorderQuantity rounds up to whole batches, at least one", () => {
  const s = createStock(4); // available 4, point 5 → needs reorder
  // target 5, deficit 1, but batch size 10 → one batch
  expect(suggestedOrderQuantity(s, { reorderPoint: 5, reorderQuantity: 10 })).toBe(10);
  // deficit 18 up to max 20, batch 8 → ceil(18/8)=3 batches = 24
  const s2 = createStock(2);
  expect(suggestedOrderQuantity(s2, { reorderPoint: 5, maxStock: 20, reorderQuantity: 8 })).toBe(24);
});

test("invalid policy values throw", () => {
  expect(() => needsReorder(createStock(1), { reorderPoint: -1 })).toThrow(InventoryError);
  expect(() => suggestedOrderQuantity(createStock(1), { reorderPoint: 5, reorderQuantity: 0 })).toThrow(
    InventoryError,
  );
});

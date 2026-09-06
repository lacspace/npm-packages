import { test, expect } from "vitest";
import {
  createCart,
  addItem,
  setQty,
  removeItem,
  clear,
  findItem,
  itemCount,
  totals,
} from "./index";

test("createCart from partial init merges same-id lines", () => {
  const cart = createCart({
    currency: "USD",
    items: [
      { id: "a", unitPrice: 500, qty: 1 },
      { id: "a", unitPrice: 500, qty: 2 },
    ],
  });
  expect(cart.currency).toBe("USD");
  expect(cart.items).toHaveLength(1);
  expect(findItem(cart, "a")?.qty).toBe(3);
});

test("addItem merges quantity for same id", () => {
  let cart = createCart();
  cart = addItem(cart, { id: "sku1", unitPrice: 1000, qty: 1 });
  cart = addItem(cart, { id: "sku1", unitPrice: 1000, qty: 2 });
  cart = addItem(cart, { id: "sku2", unitPrice: 250, qty: 4 });
  expect(cart.items).toHaveLength(2);
  expect(findItem(cart, "sku1")?.qty).toBe(3);
  expect(itemCount(cart)).toBe(7);
});

test("setQty updates and removes at qty<=0", () => {
  let cart = addItem(createCart(), { id: "x", unitPrice: 100, qty: 5 });
  cart = setQty(cart, "x", 2);
  expect(findItem(cart, "x")?.qty).toBe(2);
  cart = setQty(cart, "x", 0);
  expect(findItem(cart, "x")).toBeUndefined();
  expect(cart.items).toHaveLength(0);
});

test("removeItem and clear", () => {
  let cart = createCart();
  cart = addItem(cart, { id: "a", unitPrice: 100, qty: 1 });
  cart = addItem(cart, { id: "b", unitPrice: 200, qty: 1 });
  cart = removeItem(cart, "a");
  expect(findItem(cart, "a")).toBeUndefined();
  expect(cart.items).toHaveLength(1);
  cart = clear(cart);
  expect(cart.items).toHaveLength(0);
});

test("totals with tax, discount and shipping (integer minor units)", () => {
  let cart = createCart();
  cart = addItem(cart, { id: "a", unitPrice: 1000, qty: 2 }); // 2000
  cart = addItem(cart, { id: "b", unitPrice: 500, qty: 1 }); //  500
  const t = totals(cart, { taxRate: 0.1, discount: 300, shipping: 400 });
  expect(t.subtotal).toBe(2500);
  expect(t.discount).toBe(300);
  // tax on (2500 - 300) * 0.1 = 220
  expect(t.tax).toBe(220);
  expect(t.shipping).toBe(400);
  // 2500 - 300 + 220 + 400 = 2820
  expect(t.total).toBe(2820);
  expect(t.itemCount).toBe(3);
  expect(Number.isInteger(t.total)).toBe(true);
});

test("totals never goes negative and clamps discount", () => {
  const cart = addItem(createCart(), { id: "a", unitPrice: 100, qty: 1 });
  const t = totals(cart, { discount: 9999 });
  expect(t.discount).toBe(100);
  expect(t.total).toBe(0);
});

test("operations are immutable — inputs are never mutated", () => {
  const cart = addItem(createCart(), { id: "a", unitPrice: 100, qty: 1 });
  const before = JSON.stringify(cart);

  const added = addItem(cart, { id: "a", unitPrice: 100, qty: 5 });
  const changed = setQty(cart, "a", 3);
  const removed = removeItem(cart, "a");
  const cleared = clear(cart);

  expect(JSON.stringify(cart)).toBe(before); // untouched
  expect(added).not.toBe(cart);
  expect(added.items).not.toBe(cart.items);
  expect(findItem(added, "a")?.qty).toBe(6);
  expect(findItem(changed, "a")?.qty).toBe(3);
  expect(removed.items).toHaveLength(0);
  expect(cleared.items).toHaveLength(0);
});

test("empty cart totals are all zero", () => {
  const t = totals(createCart());
  expect(t.subtotal).toBe(0);
  expect(t.total).toBe(0);
  expect(t.itemCount).toBe(0);
});

test("non-finite prices/quantities never poison the totals to NaN", () => {
  // A garbage unitPrice must not turn subtotal/total into NaN — it is coerced to 0.
  const cart = createCart({
    items: [
      { id: "bad", unitPrice: NaN, qty: 2 },
      { id: "inf", unitPrice: Infinity, qty: 1 },
      { id: "ok", unitPrice: 500, qty: 3 },
    ],
  });
  const t = totals(cart, { taxRate: 0.2, shipping: 100 });
  expect(Number.isFinite(t.subtotal)).toBe(true);
  expect(Number.isFinite(t.total)).toBe(true);
  expect(t.subtotal).toBe(1500); // only the valid line contributes
  expect(t.total).toBe(1500 + 300 + 100);
});

test("totals is exactly the sum of its parts (never loses a unit)", () => {
  let cart = createCart();
  cart = addItem(cart, { id: "a", unitPrice: 333, qty: 7 }); // 2331
  cart = addItem(cart, { id: "b", unitPrice: 199, qty: 3 }); //  597
  const t = totals(cart, { taxRate: 0.13, discount: 250, shipping: 499 });
  expect(t.subtotal).toBe(2331 + 597);
  expect(t.total).toBe(t.subtotal - t.discount + t.tax + t.shipping);
  expect(Number.isInteger(t.tax)).toBe(true);
});

test("operations work on deeply frozen carts without mutating them", () => {
  const base = addItem(createCart({ currency: "USD" }), { id: "a", unitPrice: 100, qty: 2 });
  const frozen = Object.freeze({
    ...base,
    items: Object.freeze(base.items.map((it) => Object.freeze({ ...it }))),
  }) as typeof base;

  const item = Object.freeze({ id: "b", unitPrice: 50, qty: 1 });
  expect(() => addItem(frozen, item)).not.toThrow();
  expect(() => setQty(frozen, "a", 5)).not.toThrow();
  expect(() => removeItem(frozen, "a")).not.toThrow();
  expect(() => clear(frozen)).not.toThrow();

  // Original stays intact.
  expect(frozen.items).toHaveLength(1);
  expect(findItem(frozen, "a")?.qty).toBe(2);
  // Derived carts are correct.
  expect(findItem(addItem(frozen, item), "b")?.qty).toBe(1);
  expect(findItem(setQty(frozen, "a", 5), "a")?.qty).toBe(5);
});

test("a __proto__ item id does not pollute Object.prototype", () => {
  let cart = createCart();
  cart = addItem(cart, { id: "__proto__", unitPrice: 100, qty: 1 });
  cart = addItem(cart, { id: "constructor", unitPrice: 200, qty: 1 });
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(cart.items).toHaveLength(2);
  expect(findItem(cart, "__proto__")?.unitPrice).toBe(100);
  expect(itemCount(cart)).toBe(2);
});

test("setQty on a missing id is a no-op returning a fresh, equivalent cart", () => {
  const cart = addItem(createCart(), { id: "a", unitPrice: 100, qty: 1 });
  const next = setQty(cart, "ghost", 9);
  expect(next).not.toBe(cart); // new object
  expect(next.items).toHaveLength(1);
  expect(findItem(next, "a")?.qty).toBe(1);
});

test("adding a non-positive quantity does not create a phantom line", () => {
  let cart = createCart();
  cart = addItem(cart, { id: "a", unitPrice: 100, qty: 0 });
  expect(cart.items).toHaveLength(0);
  cart = addItem(cart, { id: "a", unitPrice: 100, qty: 5 });
  cart = addItem(cart, { id: "a", unitPrice: 100, qty: -5 }); // nets to 0 → removed
  expect(findItem(cart, "a")).toBeUndefined();
  expect(cart.items).toHaveLength(0);
});

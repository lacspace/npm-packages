import { test, expect } from "vitest";
import {
  createCart,
  addItem,
  effectiveUnitPrice,
  lineTotal,
  cartTotals,
  lineDiscount,
  type TaxCalculator,
} from "./index";

test("option price deltas roll into effective unit price and line total", () => {
  const item = {
    id: "shirt",
    unitPrice: 1999,
    qty: 2,
    options: [
      { id: "size-xl", priceDelta: 200 },
      { id: "engrave", priceDelta: 150 },
    ],
  };
  expect(effectiveUnitPrice(item)).toBe(2349); // 1999 + 200 + 150
  expect(lineTotal(item)).toBe(4698); // 2349 * 2
});

test("negative option delta (rebate) lowers the unit price", () => {
  const item = { id: "bundle", unitPrice: 1000, qty: 1, options: [{ id: "combo", priceDelta: -250 }] };
  expect(effectiveUnitPrice(item)).toBe(750);
});

test("options survive addItem and roll into the cart subtotal", () => {
  let cart = createCart();
  cart = addItem(cart, {
    id: "a",
    unitPrice: 500,
    qty: 3,
    options: [{ id: "gift", priceDelta: 100 }],
  });
  const t = cartTotals(cart);
  expect(t.subtotal).toBe(1800); // (500 + 100) * 3
  expect(t.itemCount).toBe(3);
});

test("legacy totals() also reflects option deltas (backward-compatible)", async () => {
  const { totals } = await import("./index");
  const cart = addItem(createCart(), {
    id: "a",
    unitPrice: 500,
    qty: 2,
    options: [{ id: "x", priceDelta: 50 }],
  });
  expect(totals(cart).subtotal).toBe(1100); // (500+50)*2
});

test("fixed cart discount is integer-safe and clamped to subtotal", () => {
  const cart = addItem(createCart(), { id: "a", unitPrice: 100, qty: 1 });
  expect(cartTotals(cart, { discount: 30 }).discountTotal).toBe(30);
  const over = cartTotals(cart, { discount: 9999 });
  expect(over.discountTotal).toBe(100);
  expect(over.total).toBe(0);
});

test("percentage discount rounds without losing minor units", () => {
  let cart = createCart();
  cart = addItem(cart, { id: "a", unitPrice: 333, qty: 3 }); // 999
  const t = cartTotals(cart, { discount: { type: "percentage", rate: 0.1 } });
  expect(t.subtotal).toBe(999);
  expect(t.discountTotal).toBe(100); // round(999 * 0.1) = 99.9 -> 100
  expect(Number.isInteger(t.discountTotal)).toBe(true);
  expect(t.total).toBe(899);
});

test("per-line discounts each clamp to their own line total", () => {
  let cart = createCart();
  cart = addItem(cart, { id: "a", unitPrice: 1000, qty: 1 });
  cart = addItem(cart, { id: "b", unitPrice: 200, qty: 1 });
  const t = cartTotals(cart, {
    lineDiscounts: {
      a: { type: "percentage", rate: 0.5 }, // 500
      b: 9999, // clamped to 200
    },
  });
  expect(t.discountTotal).toBe(700);
  expect(t.total).toBe(500);
});

test("line + cart discounts stack, cart discount applies after line discounts", () => {
  let cart = createCart();
  cart = addItem(cart, { id: "a", unitPrice: 1000, qty: 1 });
  const t = cartTotals(cart, {
    lineDiscounts: { a: 200 }, // -> 800 remaining
    discount: { type: "percentage", rate: 0.25 }, // 25% of 800 = 200
  });
  expect(t.discountTotal).toBe(400);
  expect(t.total).toBe(600);
});

test("exclusive tax (rate) is added on top of the post-discount amount", () => {
  let cart = createCart();
  cart = addItem(cart, { id: "a", unitPrice: 1000, qty: 2 }); // 2000
  const t = cartTotals(cart, { discount: 200, tax: 0.1 });
  expect(t.subtotal).toBe(2000);
  expect(t.discountTotal).toBe(200);
  expect(t.taxTotal).toBe(180); // round((2000-200) * 0.1)
  expect(t.total).toBe(1980); // 1800 + 180
});

test("inclusive tax rule extracts tax and does NOT add it to the total", () => {
  const cart = addItem(createCart(), { id: "a", unitPrice: 1200, qty: 1 }); // 1200 incl. 20%
  const t = cartTotals(cart, { tax: { rate: 0.2, inclusive: true } });
  expect(t.subtotal).toBe(1200);
  expect(t.taxTotal).toBe(200); // round(1200 * 0.2 / 1.2) = 200
  expect(t.total).toBe(1200); // unchanged — tax already inside
});

test("exclusive vs inclusive differ by exactly the added tax", () => {
  const cart = addItem(createCart(), { id: "a", unitPrice: 5000, qty: 1 });
  const excl = cartTotals(cart, { tax: { rate: 0.13 } });
  const incl = cartTotals(cart, { tax: { rate: 0.13, inclusive: true } });
  expect(excl.total).toBe(5000 + excl.taxTotal);
  expect(incl.total).toBe(5000);
});

test("injected tax calculator receives the post-discount amount", () => {
  let seen = -1;
  const calc: TaxCalculator = ({ amount }) => {
    seen = amount;
    return Math.round(amount * 0.05);
  };
  const cart = addItem(createCart(), { id: "a", unitPrice: 2000, qty: 1 });
  const t = cartTotals(cart, { discount: 400, tax: calc });
  expect(seen).toBe(1600); // 2000 - 400
  expect(t.taxTotal).toBe(80);
  expect(t.total).toBe(1680);
});

test("full breakdown sums correctly and stays integer minor units", () => {
  let cart = createCart();
  cart = addItem(cart, { id: "a", unitPrice: 333, qty: 7, options: [{ id: "o", priceDelta: 17 }] });
  cart = addItem(cart, { id: "b", unitPrice: 199, qty: 3 });
  const t = cartTotals(cart, {
    lineDiscounts: { a: { type: "percentage", rate: 0.1 } },
    discount: 250,
    tax: { rate: 0.13 },
    shipping: 499,
  });
  const afterDiscount = t.subtotal - t.discountTotal;
  expect(t.total).toBe(afterDiscount + t.taxTotal + t.shippingTotal);
  for (const v of Object.values(t)) expect(Number.isInteger(v)).toBe(true);
});

test("shipping is clamped non-negative and folded into total", () => {
  const cart = addItem(createCart(), { id: "a", unitPrice: 100, qty: 1 });
  const t = cartTotals(cart, { shipping: 250 });
  expect(t.shippingTotal).toBe(250);
  expect(t.total).toBe(350);
  expect(cartTotals(cart, { shipping: -50 }).shippingTotal).toBe(0);
});

test("empty cart breakdown is all zeros", () => {
  const t = cartTotals(createCart());
  expect(t).toEqual({
    subtotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    shippingTotal: 0,
    total: 0,
    itemCount: 0,
  });
});

test("lineDiscount computes a single line's discount independently", () => {
  const item = { id: "a", unitPrice: 400, qty: 2 }; // line total 800
  expect(lineDiscount(item, { type: "percentage", rate: 0.25 })).toBe(200);
  expect(lineDiscount(item, 9999)).toBe(800); // clamped
  expect(lineDiscount(item, undefined)).toBe(0);
});

test("cartTotals does not mutate the input cart", () => {
  const cart = addItem(createCart({ currency: "USD" }), { id: "a", unitPrice: 100, qty: 1 });
  const before = JSON.stringify(cart);
  cartTotals(cart, { discount: 10, tax: 0.2, shipping: 5 });
  expect(JSON.stringify(cart)).toBe(before);
});

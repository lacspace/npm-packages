import { test, expect } from "vitest";
import {
  createCart,
  addItem,
  findItem,
  itemCount,
  serializeCart,
  hydrateCart,
  mergeCarts,
  clampQty,
} from "./index";

test("serialize -> hydrate round-trips a cart exactly", () => {
  let cart = createCart({ currency: "USD" });
  cart = addItem(cart, { id: "a", name: "Tee", unitPrice: 1999, qty: 2, options: [{ id: "xl", priceDelta: 200 }] });
  cart = addItem(cart, { id: "b", unitPrice: 500, qty: 1, meta: { sku: "B-1" } });

  const restored = hydrateCart(serializeCart(cart));
  expect(restored).toEqual(cart);
  expect(restored).not.toBe(cart);
});

test("serializeCart produces a versioned JSON string", () => {
  const cart = addItem(createCart({ currency: "EUR" }), { id: "a", unitPrice: 100, qty: 1 });
  const json = serializeCart(cart);
  const parsed = JSON.parse(json);
  expect(parsed.v).toBe(1);
  expect(parsed.currency).toBe("EUR");
  expect(parsed.items).toHaveLength(1);
});

test("hydrateCart accepts a plain object and re-normalises lines", () => {
  const cart = hydrateCart({
    currency: "USD",
    items: [
      { id: "a", unitPrice: 5.9, qty: 2.7 }, // floats -> trunc'd
      { id: "a", unitPrice: 5, qty: 1 }, // merged by id
    ],
  } as any);
  expect(cart.items).toHaveLength(1);
  expect(findItem(cart, "a")?.unitPrice).toBe(5);
  expect(findItem(cart, "a")?.qty).toBe(3);
});

test("hydrateCart is tolerant of malformed input", () => {
  expect(hydrateCart("not json").items).toHaveLength(0);
  expect(hydrateCart(null).items).toHaveLength(0);
  expect(hydrateCart(42).items).toHaveLength(0);
  expect(hydrateCart({ items: "nope" } as any).items).toHaveLength(0);
});

test("hydrate normalises option price deltas", () => {
  const cart = hydrateCart({
    items: [{ id: "a", unitPrice: 100, qty: 1, options: [{ id: "o", priceDelta: 2.9 }] }],
  } as any);
  expect(findItem(cart, "a")?.options?.[0]?.priceDelta).toBe(2);
});

test("mergeCarts combines quantities of matching lines", () => {
  const a = createCart({ currency: "USD", items: [
    { id: "x", unitPrice: 100, qty: 2 },
    { id: "y", unitPrice: 200, qty: 1 },
  ] });
  const b = createCart({ items: [
    { id: "x", unitPrice: 100, qty: 3 },
    { id: "z", unitPrice: 300, qty: 4 },
  ] });
  const merged = mergeCarts(a, b);
  expect(merged.items).toHaveLength(3);
  expect(findItem(merged, "x")?.qty).toBe(5);
  expect(findItem(merged, "y")?.qty).toBe(1);
  expect(findItem(merged, "z")?.qty).toBe(4);
  expect(itemCount(merged)).toBe(10);
});

test("mergeCarts takes currency from a, falling back to b", () => {
  expect(mergeCarts(createCart({ currency: "USD" }), createCart({ currency: "EUR" })).currency).toBe("USD");
  expect(mergeCarts(createCart(), createCart({ currency: "EUR" })).currency).toBe("EUR");
});

test("mergeCarts does not mutate either input", () => {
  const a = addItem(createCart(), { id: "x", unitPrice: 100, qty: 1 });
  const b = addItem(createCart(), { id: "x", unitPrice: 100, qty: 1 });
  const beforeA = JSON.stringify(a);
  const beforeB = JSON.stringify(b);
  mergeCarts(a, b);
  expect(JSON.stringify(a)).toBe(beforeA);
  expect(JSON.stringify(b)).toBe(beforeB);
});

test("clampQty enforces a min and a max", () => {
  let cart = addItem(createCart(), { id: "a", unitPrice: 100, qty: 1 });
  cart = clampQty(cart, "a", { min: 3 });
  expect(findItem(cart, "a")?.qty).toBe(3);
  cart = clampQty(cart, "a", { max: 2 });
  expect(findItem(cart, "a")?.qty).toBe(2);
});

test("clampQty to zero removes the line, and is a no-op for a missing id", () => {
  let cart = addItem(createCart(), { id: "a", unitPrice: 100, qty: 5 });
  cart = clampQty(cart, "a", { max: 0 });
  expect(findItem(cart, "a")).toBeUndefined();

  const base = addItem(createCart(), { id: "a", unitPrice: 100, qty: 1 });
  const next = clampQty(base, "ghost", { min: 2 });
  expect(next).not.toBe(base);
  expect(next.items).toHaveLength(1);
});

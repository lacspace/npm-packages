import { test, expect } from "vitest";
import {
  createOrder,
  transition,
  addLine,
  updateQty,
  orderNumber,
  randomOrderId,
  canCancel,
  canRefund,
  canShip,
  isTerminal,
  OrderError,
  ORDER_TRANSITIONS,
  type Order,
} from "./index";

const T0 = 1_700_000_000_000;

function sample(): Order {
  return createOrder({
    currency: "USD",
    now: T0,
    id: "ord_test",
    number: "ORD-20260905-0001",
    lines: [
      { sku: "tee", name: "Tee", unitPrice: 1000, qty: 2, taxRate: 0.2 }, // total 2000, tax 400
      { sku: "cap", name: "Cap", unitPrice: 500, qty: 1, taxRate: 0.1 }, // total 500, tax 50
    ],
    discount: 300,
    shipping: 200,
  });
}

test("createOrder computes totals and snapshots line totals", () => {
  const o = sample();
  expect(o.lines[0]!.total).toBe(2000);
  expect(o.lines[1]!.total).toBe(500);
  expect(o.totals.subtotal).toBe(2500);
  expect(o.totals.tax).toBe(450); // 400 + 50
  expect(o.totals.discount).toBe(300);
  expect(o.totals.shipping).toBe(200);
  expect(o.totals.total).toBe(2850); // 2500 - 300 + 450 + 200
  expect(o.status).toBe("pending");
  expect(o.history).toHaveLength(1);
  expect(o.history[0]).toEqual({ status: "pending", at: T0 });
});

test("createOrder accepts an explicit tax override", () => {
  const o = createOrder({
    currency: "USD",
    lines: [{ sku: "x", unitPrice: 1000, qty: 1 }],
    tax: 130,
  });
  expect(o.totals.tax).toBe(130);
  expect(o.totals.total).toBe(1130);
});

test("valid full lifecycle path appends history events with at/note", () => {
  let o = sample();
  const path = [
    "placed",
    "paid",
    "processing",
    "fulfilled",
    "shipped",
    "delivered",
    "completed",
  ] as const;
  let at = T0;
  path.forEach((to, i) => {
    at = T0 + (i + 1) * 1000;
    o = transition(o, to, { at, note: `→ ${to}` });
    expect(o.status).toBe(to);
    const last = o.history[o.history.length - 1]!;
    expect(last).toEqual({ status: to, at, note: `→ ${to}` });
  });
  expect(o.history).toHaveLength(1 + path.length);
  expect(o.updatedAt).toBe(at);
});

test("transition throws OrderError on an illegal jump", () => {
  const o = sample();
  expect(() => transition(o, "shipped")).toThrow(OrderError);
  try {
    transition(o, "shipped");
  } catch (e) {
    expect((e as OrderError).code).toBe("invalid-transition");
  }
});

test("isTerminal is true only for completed/cancelled/refunded", () => {
  expect(isTerminal("completed")).toBe(true);
  expect(isTerminal("cancelled")).toBe(true);
  expect(isTerminal("refunded")).toBe(true);
  expect(isTerminal("pending")).toBe(false);
  expect(isTerminal("shipped")).toBe(false);
});

test("canCancel/canRefund/canShip reflect ORDER_TRANSITIONS", () => {
  const pending = sample();
  expect(canCancel(pending)).toBe(true);
  expect(canRefund(pending)).toBe(false);
  expect(canShip(pending)).toBe(false);

  const fulfilled = transition(
    transition(transition(transition(pending, "placed"), "paid"), "processing"),
    "fulfilled",
  );
  expect(canShip(fulfilled)).toBe(true);
  expect(canRefund(fulfilled)).toBe(true);

  const completed = transition(
    transition(transition(fulfilled, "shipped"), "delivered"),
    "completed",
  );
  expect(canCancel(completed)).toBe(false);
  expect(canRefund(completed)).toBe(false);
  expect(ORDER_TRANSITIONS.completed).toEqual([]);
});

test("addLine/updateQty allowed at placed, throw after paid", () => {
  let o = transition(sample(), "placed");
  o = addLine(o, { sku: "sticker", unitPrice: 100, qty: 3, taxRate: 0 });
  expect(o.lines).toHaveLength(3);
  expect(o.totals.subtotal).toBe(2800); // 2500 + 300

  o = updateQty(o, "sticker", 1);
  expect(o.lines.find((l) => l.id === "sticker")!.qty).toBe(1);
  expect(o.totals.subtotal).toBe(2600);

  // qty 0 removes the line
  o = updateQty(o, "sticker", 0);
  expect(o.lines.find((l) => l.id === "sticker")).toBeUndefined();

  const paid = transition(o, "paid");
  expect(() => addLine(paid, { sku: "y", unitPrice: 1, qty: 1 })).toThrow(
    OrderError,
  );
  try {
    updateQty(paid, "tee", 5);
  } catch (e) {
    expect((e as OrderError).code).toBe("locked");
  }
});

test("orderNumber formatting is deterministic", () => {
  const date = new Date(Date.UTC(2026, 8, 5, 12, 0, 0)); // 2026-09-05
  expect(orderNumber(1, { date })).toBe("ORD-20260905-0001");
  expect(orderNumber(42, { date, prefix: "INV", pad: 6, separator: "/" })).toBe(
    "INV/20260905/000042",
  );
});

test("randomOrderId is unique across 100 calls and honours prefix", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) ids.add(randomOrderId());
  expect(ids.size).toBe(100);
  expect(randomOrderId({ prefix: "ord" }).startsWith("ord_")).toBe(true);
});

test("transition returns a new object; original is unchanged", () => {
  const o = sample();
  const next = transition(o, "placed", { at: T0 + 5 });
  expect(next).not.toBe(o);
  expect(o.status).toBe("pending");
  expect(o.history).toHaveLength(1);
  expect(next.status).toBe("placed");
  expect(next.history).toHaveLength(2);
});

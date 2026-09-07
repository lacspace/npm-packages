import { test, expect } from "vitest";
import { createOrder, appendEvent, orderTimeline, type Order } from "./index";

const T0 = 1_700_000_000_000;

function sample(): Order {
  return createOrder({
    currency: "USD",
    now: T0,
    id: "ord_test",
    lines: [{ sku: "tee", unitPrice: 1000, qty: 2 }],
  });
}

test("appendEvent uses an injected clock and never mutates the original", () => {
  const o = sample();
  let ticks = 0;
  const clock = () => T0 + ++ticks * 10; // 10, 20, 30…
  const a = appendEvent(o, { type: "note", note: "hello" }, { clock });
  const b = appendEvent(a, { type: "payment", data: { amount: 500 } }, { clock });

  expect(orderTimeline(o)).toEqual([]); // original untouched
  expect(a).not.toBe(o);
  expect(orderTimeline(a)).toHaveLength(1);
  expect(orderTimeline(b)).toHaveLength(2);
  expect(orderTimeline(b)[0]).toEqual({ type: "note", at: T0 + 10, note: "hello" });
  expect(orderTimeline(b)[1]).toEqual({
    type: "payment",
    at: T0 + 20,
    data: { amount: 500 },
  });
  expect(b.updatedAt).toBe(T0 + 20);
});

test("appendEvent honours an explicit `at` over the clock", () => {
  const o = sample();
  const clock = () => 999;
  const a = appendEvent(o, { type: "status_changed" }, { at: T0 + 5, clock });
  expect(orderTimeline(a)[0]!.at).toBe(T0 + 5);
});

test("orderTimeline returns [] for an order that never started one", () => {
  expect(orderTimeline(sample())).toEqual([]);
});

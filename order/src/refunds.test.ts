import { test, expect } from "vitest";
import {
  createOrder,
  recordRefund,
  refundedTotal,
  refundableRemaining,
  refundStatus,
  orderTimeline,
  OrderError,
  type Order,
} from "./index";

const T0 = 1_700_000_000_000;

function sample(): Order {
  return createOrder({
    currency: "USD",
    now: T0,
    id: "ord_test",
    lines: [{ sku: "tee", unitPrice: 1000, qty: 1 }], // total 1000
  });
}

test("a fresh order has refund status none", () => {
  const o = sample();
  expect(refundedTotal(o)).toBe(0);
  expect(refundableRemaining(o)).toBe(1000);
  expect(refundStatus(o)).toBe("none");
});

test("a partial refund then a full refund tracks amount and status", () => {
  let o = sample();
  o = recordRefund(o, 300, { at: T0 + 1, id: "ref_a", reason: "damaged" });
  expect(refundedTotal(o)).toBe(300);
  expect(refundableRemaining(o)).toBe(700);
  expect(refundStatus(o)).toBe("partially_refunded");

  o = recordRefund(o, 700, { at: T0 + 2, id: "ref_b" });
  expect(refundedTotal(o)).toBe(1000);
  expect(refundableRemaining(o)).toBe(0);
  expect(refundStatus(o)).toBe("refunded");
  expect(o.refunds).toHaveLength(2);
  expect(o.refunds![0]).toEqual({
    id: "ref_a",
    amount: 300,
    at: T0 + 1,
    reason: "damaged",
  });
});

test("refunding beyond the remaining throws refund-exceeds-total", () => {
  let o = sample();
  o = recordRefund(o, 600, { at: T0 + 1 });
  expect(() => recordRefund(o, 500, { at: T0 + 2 })).toThrow(OrderError);
  try {
    recordRefund(o, 500, { at: T0 + 2 });
  } catch (e) {
    expect((e as OrderError).code).toBe("refund-exceeds-total");
  }
});

test("a non-positive refund throws invalid-refund", () => {
  const o = sample();
  try {
    recordRefund(o, 0);
  } catch (e) {
    expect((e as OrderError).code).toBe("invalid-refund");
  }
  try {
    recordRefund(o, -50);
  } catch (e) {
    expect((e as OrderError).code).toBe("invalid-refund");
  }
});

test("recordRefund appends a refund timeline event by default", () => {
  const o = recordRefund(sample(), 250, { at: T0 + 1, id: "ref_x" });
  const last = orderTimeline(o).at(-1)!;
  expect(last.type).toBe("refund");
  expect(last.at).toBe(T0 + 1);
  expect(last.data).toMatchObject({ id: "ref_x", amount: 250 });
});

test("event:false records the refund without a timeline entry", () => {
  const o = recordRefund(sample(), 100, { at: T0 + 1, event: false });
  expect(refundedTotal(o)).toBe(100);
  expect(orderTimeline(o)).toEqual([]);
});

test("recordRefund does not mutate the original order", () => {
  const o = sample();
  const before = JSON.parse(JSON.stringify(o));
  recordRefund(o, 100, { at: T0 + 1 });
  expect(JSON.parse(JSON.stringify(o))).toEqual(before);
});

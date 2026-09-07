import { test, expect } from "vitest";
import {
  createOrder,
  fulfillLine,
  fulfillItems,
  fulfillmentStatus,
  lineFulfillmentStatus,
  lineRemainingQty,
  isFullyFulfilled,
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
    lines: [
      { sku: "tee", unitPrice: 1000, qty: 3 },
      { sku: "cap", unitPrice: 500, qty: 2 },
    ],
  });
}

test("a fresh order is unfulfilled", () => {
  const o = sample();
  expect(fulfillmentStatus(o)).toBe("unfulfilled");
  expect(lineFulfillmentStatus(o.lines[0]!)).toBe("unfulfilled");
  expect(lineRemainingQty(o.lines[0]!)).toBe(3);
  expect(isFullyFulfilled(o)).toBe(false);
});

test("fulfilling part of one line derives partially_fulfilled", () => {
  let o = sample();
  o = fulfillLine(o, "tee", 1, { at: T0 + 1 });
  expect(o.lines[0]!.fulfilledQty).toBe(1);
  expect(lineFulfillmentStatus(o.lines[0]!)).toBe("partially_fulfilled");
  expect(fulfillmentStatus(o)).toBe("partially_fulfilled");
  expect(lineRemainingQty(o.lines[0]!)).toBe(2);
  // a fulfillment event was appended
  expect(orderTimeline(o).at(-1)).toEqual({
    type: "fulfillment",
    at: T0 + 1,
    data: { lineId: "tee", qty: 1 },
  });
});

test("fulfilling every unit derives fulfilled", () => {
  let o = sample();
  o = fulfillItems(
    o,
    [
      { lineId: "tee", qty: 3 },
      { lineId: "cap", qty: 2 },
    ],
    { at: T0 + 2 },
  );
  expect(fulfillmentStatus(o)).toBe("fulfilled");
  expect(isFullyFulfilled(o)).toBe(true);
  // fulfillItems appends a single batch event
  expect(orderTimeline(o)).toHaveLength(1);
  expect(orderTimeline(o)[0]!.type).toBe("fulfillment");
});

test("fulfillLine accumulates across calls up to qty", () => {
  let o = sample();
  o = fulfillLine(o, "tee", 1, { at: T0 + 1, event: false });
  o = fulfillLine(o, "tee", 2, { at: T0 + 2, event: false });
  expect(o.lines[0]!.fulfilledQty).toBe(3);
  expect(lineFulfillmentStatus(o.lines[0]!)).toBe("fulfilled");
});

test("over-fulfilling throws fulfillment-exceeds-qty", () => {
  const o = sample();
  expect(() => fulfillLine(o, "tee", 4)).toThrow(OrderError);
  try {
    fulfillLine(o, "tee", 4);
  } catch (e) {
    expect((e as OrderError).code).toBe("fulfillment-exceeds-qty");
  }
});

test("fulfilling an unknown line or non-positive qty throws", () => {
  const o = sample();
  try {
    fulfillLine(o, "nope", 1);
  } catch (e) {
    expect((e as OrderError).code).toBe("line-not-found");
  }
  try {
    fulfillLine(o, "tee", 0);
  } catch (e) {
    expect((e as OrderError).code).toBe("invalid-fulfillment");
  }
});

test("fulfillItems is all-or-nothing on a bad item", () => {
  const o = sample();
  expect(() =>
    fulfillItems(o, [
      { lineId: "tee", qty: 1 },
      { lineId: "cap", qty: 99 }, // overruns → whole call throws
    ]),
  ).toThrow(OrderError);
});

test("fulfillLine does not mutate the original order", () => {
  const o = sample();
  const before = JSON.parse(JSON.stringify(o));
  fulfillLine(o, "tee", 1, { at: T0 + 1 });
  expect(JSON.parse(JSON.stringify(o))).toEqual(before);
});

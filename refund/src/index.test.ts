import { describe, it, expect } from "vitest";
import {
  RETURN_TRANSITIONS,
  canTransition,
  isTerminal,
  RefundError,
  createReturn,
  transition,
  refundAmount,
  restockItems,
  validateReturn,
  type ReturnItem,
} from "./index";

describe("refundAmount", () => {
  it("computes a partial refund of 2 of 3 units with correct subtotal + tax", () => {
    const items: ReturnItem[] = [
      { lineId: "l1", sku: "TEE", qty: 2, unitPrice: 1000, taxRate: 0.2 },
    ];
    const b = refundAmount(items);
    expect(b.subtotal).toBe(2000); // 1000 * 2
    expect(b.tax).toBe(400); // round(2000 * 0.2)
    expect(b.restockingFee).toBe(0);
    expect(b.shipping).toBe(0);
    expect(b.total).toBe(2400);
  });

  it("apportions tax per line for mixed rates", () => {
    const items: ReturnItem[] = [
      { lineId: "a", sku: "A", qty: 1, unitPrice: 999, taxRate: 0.13 },
      { lineId: "b", sku: "B", qty: 1, unitPrice: 500, taxRate: 0 },
    ];
    const b = refundAmount(items);
    expect(b.subtotal).toBe(1499);
    expect(b.tax).toBe(130); // round(999*0.13)=130, round(500*0)=0
  });

  it("reduces total by a flat restocking fee", () => {
    const items: ReturnItem[] = [{ lineId: "l1", sku: "X", qty: 1, unitPrice: 2000 }];
    const b = refundAmount(items, { restockingFee: 300 });
    expect(b.restockingFee).toBe(300);
    expect(b.total).toBe(1700);
  });

  it("reduces total by a percentage restocking fee", () => {
    const items: ReturnItem[] = [{ lineId: "l1", sku: "X", qty: 1, unitPrice: 2000 }];
    const b = refundAmount(items, { restockingPct: 0.1 });
    expect(b.restockingFee).toBe(200); // round(2000 * 0.1)
    expect(b.total).toBe(1800);
  });

  it("adds refunded shipping back to the total", () => {
    const items: ReturnItem[] = [{ lineId: "l1", sku: "X", qty: 1, unitPrice: 1000 }];
    const b = refundAmount(items, { refundShipping: 499 });
    expect(b.shipping).toBe(499);
    expect(b.total).toBe(1499);
  });

  it("clamps the total at 0 when the fee exceeds the refundable amount", () => {
    const items: ReturnItem[] = [{ lineId: "l1", sku: "X", qty: 1, unitPrice: 1000 }];
    const b = refundAmount(items, { restockingFee: 5000 });
    expect(b.total).toBe(0);
  });
});

describe("restockItems", () => {
  it("merges quantities by sku and drops restock:false lines", () => {
    const items: ReturnItem[] = [
      { lineId: "1", sku: "TEE", qty: 1, unitPrice: 100 },
      { lineId: "2", sku: "TEE", qty: 2, unitPrice: 100 },
      { lineId: "3", sku: "MUG", qty: 1, unitPrice: 100, restock: false },
      { lineId: "4", sku: "CAP", qty: 3, unitPrice: 100, restock: true },
    ];
    const list = restockItems(items);
    expect(list).toEqual([
      { sku: "TEE", qty: 3 },
      { sku: "CAP", qty: 3 },
    ]);
  });
});

describe("validateReturn", () => {
  const order = {
    lines: [
      { id: "l1", sku: "TEE", qty: 3 },
      { id: "l2", sku: "MUG", qty: 1 },
    ],
  };

  it("accepts a valid return", () => {
    const res = validateReturn(order, [
      { lineId: "l1", sku: "TEE", qty: 2, unitPrice: 100 },
    ]);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("rejects an unknown lineId", () => {
    const res = validateReturn(order, [
      { lineId: "nope", sku: "TEE", qty: 1, unitPrice: 100 },
    ]);
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBe(1);
  });

  it("rejects an over-quantity return", () => {
    const res = validateReturn(order, [
      { lineId: "l1", sku: "TEE", qty: 5, unitPrice: 100 },
    ]);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("only 3 were ordered");
  });
});

describe("state machine", () => {
  it("allows requested→approved→received→refunded→closed", () => {
    expect(canTransition("requested", "approved")).toBe(true);
    expect(canTransition("approved", "received")).toBe(true);
    expect(canTransition("received", "refunded")).toBe(true);
    expect(canTransition("refunded", "closed")).toBe(true);
  });

  it("marks rejected/closed/cancelled as terminal", () => {
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("closed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("requested")).toBe(false);
    expect(RETURN_TRANSITIONS.rejected).toEqual([]);
  });

  it("throws a RefundError on an illegal jump", () => {
    const ret = createReturn({ orderId: "o1", items: [], now: 1 });
    expect(() => transition(ret, "refunded")).toThrow(RefundError);
  });
});

describe("createReturn + transition", () => {
  const items: ReturnItem[] = [{ lineId: "l1", sku: "TEE", qty: 1, unitPrice: 100 }];

  it("seeds status and history", () => {
    const ret = createReturn({ orderId: "o1", items, now: 100 });
    expect(ret.status).toBe("requested");
    expect(ret.history).toEqual([{ status: "requested", at: 100 }]);
    expect(ret.createdAt).toBe(100);
    expect(ret.updatedAt).toBe(100);
    expect(ret.id).toBeTruthy();
  });

  it("transitions immutably and appends history", () => {
    const ret = createReturn({ orderId: "o1", items, now: 100 });
    const next = transition(ret, "approved", { at: 200, note: "ok" });
    expect(next).not.toBe(ret);
    expect(ret.status).toBe("requested"); // original untouched
    expect(ret.history.length).toBe(1);
    expect(next.status).toBe("approved");
    expect(next.updatedAt).toBe(200);
    expect(next.history).toEqual([
      { status: "requested", at: 100 },
      { status: "approved", at: 200, note: "ok" },
    ]);
  });
});

describe("hardening", () => {
  it("aggregates returned qty per line so split items cannot over-refund", () => {
    const order = { lines: [{ id: "l1", sku: "TEE", qty: 3 }] };
    // Two items each individually within qty, but together 4 > 3 ordered.
    const res = validateReturn(order, [
      { lineId: "l1", sku: "TEE", qty: 2, unitPrice: 100 },
      { lineId: "l1", sku: "TEE", qty: 2, unitPrice: 100 },
    ]);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("only 3 were ordered");
  });

  it("accepts split items that together stay within the ordered qty", () => {
    const order = { lines: [{ id: "l1", sku: "TEE", qty: 3 }] };
    const res = validateReturn(order, [
      { lineId: "l1", sku: "TEE", qty: 1, unitPrice: 100 },
      { lineId: "l1", sku: "TEE", qty: 2, unitPrice: 100 },
    ]);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("refundAmount on empty items is all-zero", () => {
    expect(refundAmount([])).toEqual({
      subtotal: 0,
      tax: 0,
      restockingFee: 0,
      shipping: 0,
      total: 0,
    });
  });

  it("total = subtotal + tax + shipping - restockingFee", () => {
    const items: ReturnItem[] = [
      { lineId: "a", sku: "A", qty: 2, unitPrice: 1000, taxRate: 0.2 },
    ];
    const b = refundAmount(items, { restockingFee: 150, refundShipping: 300 });
    expect(b.total).toBe(b.subtotal + b.tax + b.shipping - b.restockingFee);
  });

  it("tax is the sum of per-line rounded taxes (no lost paisa)", () => {
    const items: ReturnItem[] = [
      { lineId: "a", sku: "A", qty: 1, unitPrice: 999, taxRate: 0.13 },
      { lineId: "b", sku: "B", qty: 3, unitPrice: 333, taxRate: 0.13 },
    ];
    const b = refundAmount(items);
    expect(b.tax).toBe(Math.round(999 * 0.13) + Math.round(999 * 0.13));
  });

  it("does not mutate frozen items across compute + workflow ops", () => {
    const items: ReturnItem[] = [
      Object.freeze({
        lineId: "l1",
        sku: "TEE",
        qty: 1,
        unitPrice: 100,
        taxRate: 0.1,
      }),
    ] as ReturnItem[];
    Object.freeze(items);
    expect(() => refundAmount(items)).not.toThrow();
    expect(() => restockItems(items)).not.toThrow();
    const ret = createReturn({ orderId: "o1", items, now: 1 });
    Object.freeze(ret);
    Object.freeze(ret.items);
    Object.freeze(ret.history);
    expect(() => transition(ret, "approved", { at: 2 })).not.toThrow();
    expect(items[0]).toEqual({
      lineId: "l1",
      sku: "TEE",
      qty: 1,
      unitPrice: 100,
      taxRate: 0.1,
    });
  });

  it("a __proto__ sku does not pollute Object.prototype in restockItems", () => {
    restockItems([{ lineId: "x", sku: "__proto__", qty: 1, unitPrice: 1 }]);
    expect(({} as Record<string, unknown>).qty).toBeUndefined();
  });
});

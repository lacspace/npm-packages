import { describe, it, expect } from "vitest";
import {
  allocateProportional,
  refundLines,
  splitRefundAcrossTenders,
  RefundError,
  type OrderLine,
} from "./index";

describe("allocateProportional", () => {
  it("conserves the total exactly (largest-remainder)", () => {
    const parts = allocateProportional(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });

  it("returns all zeros for zero total or zero weights", () => {
    expect(allocateProportional(0, [3, 2])).toEqual([0, 0]);
    expect(allocateProportional(500, [0, 0])).toEqual([0, 0]);
  });

  it("never loses a penny across awkward splits", () => {
    const parts = allocateProportional(1000, [333, 333, 334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

describe("refundLines — line-level partial refunds", () => {
  const order = {
    lines: [
      { lineId: "l1", sku: "TEE", unitPrice: 1000, qty: 3 },
      { lineId: "l2", sku: "MUG", unitPrice: 500, qty: 2 },
    ] as OrderLine[],
  };

  it("refunds specific quantities of specific lines", () => {
    const r = refundLines(order, [{ lineId: "l1", qty: 2 }]);
    expect(r.subtotal).toBe(2000);
    expect(r.lines[0]!.qty).toBe(2);
    expect(r.lines[0]!.subtotal).toBe(2000);
    expect(r.lines[0]!.refundedQtyAfter).toBe(2);
    expect(r.total).toBe(2000);
  });

  it("apportions an order-level tax pool proportionally and conserves it", () => {
    // whole-order subtotal = 3*1000 + 2*500 = 4000; refund 2*1000 = 2000 (half)
    const r = refundLines(order, [{ lineId: "l1", qty: 2 }], {
      order: { tax: 401 }, // odd pool to exercise remainder safety
    });
    // proportional half of 401 = 200.5 -> 201 or 200 depending on remainder; must be integer
    expect(Number.isInteger(r.tax)).toBe(true);
    expect(r.tax).toBe(201); // allocateProportional(401,[2000,2000]) -> [201,200]
    expect(r.total).toBe(2000 + 201);
  });

  it("splits refunded tax across multiple lines with no lost unit", () => {
    const r = refundLines(
      order,
      [
        { lineId: "l1", qty: 1 },
        { lineId: "l2", qty: 1 },
      ],
      { order: { tax: 300 } },
    );
    const lineTaxSum = r.lines.reduce((a, l) => a + l.tax, 0);
    expect(lineTaxSum).toBe(r.tax);
  });

  it("optionally refunds proportional shipping, remainder-safe", () => {
    const r = refundLines(order, [{ lineId: "l1", qty: 2 }], {
      order: { shipping: 499 },
      refundShipping: true,
    });
    // half of 499 -> allocateProportional(499,[2000,2000]) = [250,249]
    expect(r.shipping).toBe(250);
    expect(Number.isInteger(r.shipping)).toBe(true);
  });

  it("does not refund shipping unless refundShipping is set", () => {
    const r = refundLines(order, [{ lineId: "l1", qty: 1 }], {
      order: { shipping: 500 },
    });
    expect(r.shipping).toBe(0);
  });

  it("falls back to per-line taxRate when no order pool is given", () => {
    const taxed = {
      lines: [{ lineId: "l1", sku: "TEE", unitPrice: 1000, qty: 3, taxRate: 0.2 }] as OrderLine[],
    };
    const r = refundLines(taxed, [{ lineId: "l1", qty: 2 }]);
    expect(r.tax).toBe(400); // round(2000 * 0.2)
  });

  it("deducts a flat restocking fee, clamping total at 0", () => {
    const r = refundLines(order, [{ lineId: "l2", qty: 1 }], { restockingFee: 200 });
    expect(r.restockingFee).toBe(200);
    expect(r.total).toBe(300); // 500 - 200
    const big = refundLines(order, [{ lineId: "l2", qty: 1 }], { restockingFee: 9999 });
    expect(big.total).toBe(0);
  });

  it("deducts a percentage restocking fee off the refunded subtotal", () => {
    const r = refundLines(order, [{ lineId: "l1", qty: 2 }], { restockingPct: 0.1 });
    expect(r.restockingFee).toBe(200); // round(2000 * 0.1)
    expect(r.total).toBe(1800);
  });

  it("honours prior refundedQty and cannot exceed the captured qty", () => {
    const partlyRefunded = {
      lines: [{ lineId: "l1", sku: "TEE", unitPrice: 1000, qty: 3, refundedQty: 2 }] as OrderLine[],
    };
    const ok = refundLines(partlyRefunded, [{ lineId: "l1", qty: 1 }]);
    expect(ok.lines[0]!.refundedQtyAfter).toBe(3);
    expect(() => refundLines(partlyRefunded, [{ lineId: "l1", qty: 2 }])).toThrow(RefundError);
  });

  it("rejects an over-refund and an unknown line", () => {
    expect(() => refundLines(order, [{ lineId: "l1", qty: 4 }])).toThrow(/only 3 remain/);
    let code: string | undefined;
    try {
      refundLines(order, [{ lineId: "nope", qty: 1 }]);
    } catch (e) {
      code = (e as RefundError).code;
    }
    expect(code).toBe("UNKNOWN_LINE");
  });

  it("accepts a bare array of lines as the order", () => {
    const r = refundLines(order.lines, [{ lineId: "l1", qty: 1 }]);
    expect(r.subtotal).toBe(1000);
  });

  it("does not mutate the input order lines", () => {
    const frozen = [Object.freeze({ lineId: "l1", sku: "TEE", unitPrice: 1000, qty: 3 })] as OrderLine[];
    Object.freeze(frozen);
    expect(() => refundLines(frozen, [{ lineId: "l1", qty: 1 }])).not.toThrow();
    expect(frozen[0]!.refundedQty).toBeUndefined();
  });
});

describe("splitRefundAcrossTenders", () => {
  it("splits proportionally to remaining capacity and conserves the total", () => {
    const parts = splitRefundAcrossTenders(1000, [
      { method: "card", amount: 3000 },
      { method: "wallet", amount: 1000 },
    ]);
    expect(parts.map((p) => p.amount).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([
      { method: "card", amount: 750 },
      { method: "wallet", amount: 250 },
    ]);
  });

  it("respects already-refunded amounts when computing capacity", () => {
    const parts = splitRefundAcrossTenders(500, [
      { method: "card", amount: 1000, refunded: 900 }, // 100 left
      { method: "wallet", amount: 1000, refunded: 600 }, // 400 left
    ]);
    expect(parts.reduce((a, p) => a + p.amount, 0)).toBe(500);
    expect(parts[0]!.amount).toBeLessThanOrEqual(100);
    expect(parts[1]!.amount).toBeLessThanOrEqual(400);
  });

  it("never assigns a tender more than its remaining capacity", () => {
    const parts = splitRefundAcrossTenders(999, [
      { method: "card", amount: 500 },
      { method: "wallet", amount: 500 },
    ]);
    for (const p of parts) expect(p.amount).toBeLessThanOrEqual(500);
    expect(parts.reduce((a, p) => a + p.amount, 0)).toBe(999);
  });

  it("rejects a refund larger than the total remaining capacity", () => {
    expect(() =>
      splitRefundAcrossTenders(5000, [
        { method: "card", amount: 3000 },
        { method: "wallet", amount: 1000 },
      ]),
    ).toThrow(/exceeds remaining tender capacity/);
  });

  it("rejects a negative refund amount", () => {
    expect(() => splitRefundAcrossTenders(-1, [{ method: "card", amount: 100 }])).toThrow(
      RefundError,
    );
  });
});

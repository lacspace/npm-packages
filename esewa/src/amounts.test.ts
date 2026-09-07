import { describe, it, expect } from "vitest";
import { validateAmounts } from "./index";

describe("validateAmounts", () => {
  it("accepts consistent amounts that sum to total_amount", () => {
    expect(validateAmounts({ amount: 100, taxAmount: 13, totalAmount: 113 })).toEqual({ ok: true });
    expect(
      validateAmounts({
        amount: 100,
        taxAmount: 10,
        productServiceCharge: 5,
        productDeliveryCharge: 5,
        totalAmount: 120,
      }),
    ).toEqual({ ok: true });
  });

  it("accepts component-only fields when totalAmount is omitted", () => {
    expect(validateAmounts({ amount: 100, taxAmount: 13 })).toEqual({ ok: true });
    expect(validateAmounts({ amount: 0 })).toEqual({ ok: true });
  });

  it("rejects a mismatched total_amount with a helpful reason", () => {
    const r = validateAmounts({ amount: 100, taxAmount: 13, totalAmount: 120 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("total_amount 120");
  });

  it("rejects negative components", () => {
    expect(validateAmounts({ amount: -1 }).ok).toBe(false);
    expect(validateAmounts({ amount: 100, taxAmount: -5, totalAmount: 95 }).ok).toBe(false);
    expect(validateAmounts({ amount: 100, productDeliveryCharge: -1, totalAmount: 99 }).reason).toContain(
      "product_delivery_charge",
    );
  });

  it("rejects non-finite numbers (NaN/Infinity)", () => {
    expect(validateAmounts({ amount: NaN }).ok).toBe(false);
    expect(validateAmounts({ amount: Infinity }).ok).toBe(false);
    expect(validateAmounts({ amount: 100, totalAmount: NaN }).ok).toBe(false);
  });

  it("absorbs floating-point drift within epsilon", () => {
    expect(validateAmounts({ amount: 0.1, taxAmount: 0.2, totalAmount: 0.3 })).toEqual({ ok: true });
  });

  it("names the exact offending field", () => {
    expect(validateAmounts({ amount: 1, taxAmount: -0.01, totalAmount: 0.99 }).reason).toContain("tax_amount");
  });
});

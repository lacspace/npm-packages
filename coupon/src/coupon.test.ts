import { describe, it, expect } from "vitest";
import { validateCoupon, applyCoupon, type Coupon } from "./index";

const now = new Date("2026-06-01T00:00:00.000Z");

describe("validateCoupon", () => {
  it("passes a plain valid coupon", () => {
    const c: Coupon = { code: "OK", type: "percent", value: 10 };
    expect(validateCoupon(c, { subtotal: 1000, now })).toEqual({ valid: true });
  });

  it("rejects not-yet-started", () => {
    const c: Coupon = {
      code: "SOON",
      type: "percent",
      value: 10,
      startsAt: "2026-07-01T00:00:00.000Z",
    };
    expect(validateCoupon(c, { subtotal: 1000, now })).toEqual({
      valid: false,
      reason: "not-yet-started",
    });
  });

  it("rejects expired", () => {
    const c: Coupon = {
      code: "OLD",
      type: "percent",
      value: 10,
      endsAt: "2026-05-01T00:00:00.000Z",
    };
    expect(validateCoupon(c, { subtotal: 1000, now })).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("rejects below min subtotal", () => {
    const c: Coupon = { code: "BIG", type: "fixed", value: 500, minSubtotal: 2000 };
    expect(validateCoupon(c, { subtotal: 1000, now })).toEqual({
      valid: false,
      reason: "below-min-subtotal",
    });
  });

  it("rejects usage-limit reached", () => {
    const c: Coupon = {
      code: "ONCE",
      type: "fixed",
      value: 500,
      usageLimit: 1,
      used: 1,
    };
    expect(validateCoupon(c, { subtotal: 1000, now })).toEqual({
      valid: false,
      reason: "usage-limit-reached",
    });
  });
});

describe("applyCoupon", () => {
  it("percent discount with maxDiscount cap", () => {
    const c: Coupon = { code: "P20", type: "percent", value: 20, maxDiscount: 150 };
    const r = applyCoupon(c, { subtotal: 1000, shipping: 200, now });
    // 20% of 1000 = 200, capped to 150
    expect(r.discount).toBe(150);
    expect(r.shippingDiscount).toBe(0);
    expect(r.total).toBe(1000 - 150 + 200); // 1050
    expect(r.valid).toBe(true);
  });

  it("percent rounds", () => {
    const c: Coupon = { code: "P15", type: "percent", value: 15 };
    const r = applyCoupon(c, { subtotal: 333, now });
    // 15% of 333 = 49.95 → 50
    expect(r.discount).toBe(50);
    expect(r.total).toBe(283);
  });

  it("fixed over subtotal is clamped to subtotal", () => {
    const c: Coupon = { code: "F5000", type: "fixed", value: 5000 };
    const r = applyCoupon(c, { subtotal: 1000, shipping: 100, now });
    expect(r.discount).toBe(1000);
    expect(r.total).toBe(100); // 1000 - 1000 + 100 - 0
  });

  it("free-shipping discounts shipping only", () => {
    const c: Coupon = { code: "FREESHIP", type: "free-shipping" };
    const r = applyCoupon(c, { subtotal: 1000, shipping: 300, now });
    expect(r.discount).toBe(0);
    expect(r.shippingDiscount).toBe(300);
    expect(r.total).toBe(1000); // 1000 - 0 + 300 - 300
  });

  it("expired coupon yields no discount and untouched total", () => {
    const c: Coupon = {
      code: "OLD",
      type: "percent",
      value: 50,
      endsAt: "2026-05-01T00:00:00.000Z",
    };
    const r = applyCoupon(c, { subtotal: 1000, shipping: 200, now });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("expired");
    expect(r.discount).toBe(0);
    expect(r.shippingDiscount).toBe(0);
    expect(r.total).toBe(1200);
  });

  it("below-min coupon yields no discount", () => {
    const c: Coupon = { code: "MIN", type: "fixed", value: 500, minSubtotal: 2000 };
    const r = applyCoupon(c, { subtotal: 1000, now });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("below-min-subtotal");
    expect(r.discount).toBe(0);
    expect(r.total).toBe(1000);
  });

  it("usage-limit reached yields no discount", () => {
    const c: Coupon = {
      code: "ONCE",
      type: "percent",
      value: 10,
      usageLimit: 5,
      used: 5,
    };
    const r = applyCoupon(c, { subtotal: 1000, now });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("usage-limit-reached");
    expect(r.discount).toBe(0);
  });
});

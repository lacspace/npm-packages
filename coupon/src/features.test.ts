import { describe, it, expect } from "vitest";
import { validateCoupon, applyCoupon, type Coupon, type OrderItem } from "./index";

const now = new Date("2026-06-01T00:00:00.000Z");

describe("tiered discounts", () => {
  const c: Coupon = {
    code: "TIER",
    type: "tiered",
    tiers: [
      { minSubtotal: 5000, type: "fixed", value: 300 },
      { minSubtotal: 10000, type: "fixed", value: 1000 },
      { minSubtotal: 2000, type: "percent", value: 5 },
    ],
  };

  it("picks the highest matching tier", () => {
    const r = applyCoupon(c, { subtotal: 12000, now });
    expect(r.discount).toBe(1000); // $10 off over $100
    expect(r.total).toBe(11000);
  });

  it("falls to a lower tier below the top threshold", () => {
    const r = applyCoupon(c, { subtotal: 6000, now });
    expect(r.discount).toBe(300);
  });

  it("grants nothing below the lowest tier", () => {
    const r = applyCoupon(c, { subtotal: 1000, now });
    expect(r.discount).toBe(0);
    expect(r.total).toBe(1000);
  });
});

describe("bogo / buy-X-get-Y", () => {
  const items: OrderItem[] = [
    { productId: "a", unitPrice: 1000, quantity: 2 },
    { productId: "b", unitPrice: 400, quantity: 2 },
  ];

  it("buy-1-get-1 discounts the cheapest unit per pair", () => {
    const c: Coupon = { code: "BOGO", type: "bogo", buyQuantity: 1, getQuantity: 1 };
    const r = applyCoupon(c, { subtotal: 2800, items, now });
    // 4 units, groups of 2 → 2 free units, cheapest first: 400 + 400
    expect(r.discount).toBe(800);
    expect(r.total).toBe(2000);
  });

  it("honours getDiscountPercent (half off the free unit)", () => {
    const c: Coupon = {
      code: "B1G1H",
      type: "bogo",
      buyQuantity: 1,
      getQuantity: 1,
      getDiscountPercent: 50,
    };
    const r = applyCoupon(c, { subtotal: 2800, items, now });
    // 2 discounted units at 50%: round(400*.5)+round(400*.5) = 400
    expect(r.discount).toBe(400);
  });

  it("no complete group means no discount", () => {
    const c: Coupon = { code: "BOGO", type: "bogo", buyQuantity: 2, getQuantity: 1 };
    const r = applyCoupon(c, { subtotal: 400, items: [{ unitPrice: 400, quantity: 2 }], now });
    // group size 3, only 2 units → 0 groups
    expect(r.discount).toBe(0);
  });

  it("bogo without items grants nothing", () => {
    const c: Coupon = { code: "BOGO", type: "bogo" };
    const r = applyCoupon(c, { subtotal: 2000, now });
    expect(r.discount).toBe(0);
  });
});

describe("product / category scope", () => {
  const items: OrderItem[] = [
    { productId: "shoe", category: "footwear", unitPrice: 5000, quantity: 1 },
    { productId: "hat", category: "apparel", unitPrice: 2000, quantity: 1 },
  ];

  it("percent applies only to in-scope items", () => {
    const c: Coupon = {
      code: "SHOES",
      type: "percent",
      value: 10,
      includeCategories: ["footwear"],
    };
    const r = applyCoupon(c, { subtotal: 7000, items, now });
    // 10% of the 5000 footwear line only
    expect(r.discount).toBe(500);
    expect(r.total).toBe(6500);
  });

  it("excludeProducts removes an item from the eligible base", () => {
    const c: Coupon = {
      code: "NOHAT",
      type: "percent",
      value: 50,
      excludeProducts: ["hat"],
    };
    const r = applyCoupon(c, { subtotal: 7000, items, now });
    expect(r.discount).toBe(2500); // 50% of 5000
  });

  it("rejects when nothing is in scope", () => {
    const c: Coupon = {
      code: "GONE",
      type: "percent",
      value: 10,
      includeCategories: ["electronics"],
    };
    const v = validateCoupon(c, { subtotal: 7000, items, now });
    expect(v).toEqual({ valid: false, reason: "out-of-scope" });
    const r = applyCoupon(c, { subtotal: 7000, items, now });
    expect(r.valid).toBe(false);
    expect(r.discount).toBe(0);
  });

  it("fixed discount is clamped to the eligible (scoped) subtotal", () => {
    const c: Coupon = {
      code: "BIGFLAT",
      type: "fixed",
      value: 9999,
      includeProducts: ["hat"],
    };
    const r = applyCoupon(c, { subtotal: 7000, items, now });
    expect(r.discount).toBe(2000); // clamped to the hat's 2000
  });
});

describe("new constraints", () => {
  it("currency guard mismatch", () => {
    const c: Coupon = { code: "USD", type: "percent", value: 10, currency: "USD" };
    expect(validateCoupon(c, { subtotal: 1000, currency: "EUR", now })).toEqual({
      valid: false,
      reason: "currency-mismatch",
    });
    expect(validateCoupon(c, { subtotal: 1000, currency: "USD", now }).valid).toBe(true);
  });

  it("per-user limit reached", () => {
    const c: Coupon = { code: "ONE", type: "fixed", value: 100, perUserLimit: 2 };
    expect(validateCoupon(c, { subtotal: 1000, userUsed: 2, now })).toEqual({
      valid: false,
      reason: "per-user-limit-reached",
    });
    expect(validateCoupon(c, { subtotal: 1000, userUsed: 1, now }).valid).toBe(true);
  });

  it("first-order-only rejects returning customers", () => {
    const c: Coupon = { code: "WELCOME", type: "percent", value: 15, firstOrderOnly: true };
    expect(validateCoupon(c, { subtotal: 1000, isFirstOrder: false, now })).toEqual({
      valid: false,
      reason: "not-first-order",
    });
    expect(validateCoupon(c, { subtotal: 1000, isFirstOrder: true, now }).valid).toBe(true);
  });

  it("validFrom / validUntil aliases behave like startsAt / endsAt", () => {
    const c: Coupon = {
      code: "ALIAS",
      type: "percent",
      value: 10,
      validUntil: "2026-05-01T00:00:00.000Z",
    };
    expect(validateCoupon(c, { subtotal: 1000, now })).toEqual({
      valid: false,
      reason: "expired",
    });
  });
});

describe("breakdown", () => {
  it("reports subtotal and shipping components", () => {
    const c: Coupon = { code: "FS", type: "free-shipping" };
    const r = applyCoupon(c, { subtotal: 1000, shipping: 300, now });
    expect(r.breakdown).toEqual([{ kind: "shipping", amount: 300 }]);
  });
});

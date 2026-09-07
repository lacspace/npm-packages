import { describe, it, expect } from "vitest";
import { applyCoupons, type Coupon } from "./index";

const now = new Date("2026-06-01T00:00:00.000Z");

describe("applyCoupons (stacking)", () => {
  it("stacks two coupons on the reducing subtotal", () => {
    const a: Coupon = { code: "TEN", type: "percent", value: 10 };
    const b: Coupon = { code: "FIVE", type: "fixed", value: 100 };
    const r = applyCoupons([a, b], { subtotal: 1000, now });
    // 10% of 1000 = 100 → remaining 900; then flat 100 → remaining 800
    expect(r.discount).toBe(200);
    expect(r.total).toBe(800);
    expect(r.applied.map((x) => x.code)).toEqual(["TEN", "FIVE"]);
  });

  it("orders by priority (higher first)", () => {
    const a: Coupon = { code: "LOW", type: "fixed", value: 100, priority: 1 };
    const b: Coupon = { code: "HIGH", type: "fixed", value: 200, priority: 5 };
    const r = applyCoupons([a, b], { subtotal: 1000, now });
    expect(r.applied.map((x) => x.code)).toEqual(["HIGH", "LOW"]);
    expect(r.discount).toBe(300);
  });

  it("never goes negative even with over-large discounts", () => {
    const a: Coupon = { code: "HALF", type: "percent", value: 60 };
    const b: Coupon = { code: "BIG", type: "fixed", value: 100000 };
    const r = applyCoupons([a, b], { subtotal: 1000, now });
    expect(r.discount).toBe(1000);
    expect(r.total).toBe(0);
    expect(r.discount).toBeLessThanOrEqual(1000);
  });

  it("a non-stackable coupon applied first blocks the rest", () => {
    const a: Coupon = { code: "SOLO", type: "percent", value: 10, stackable: false, priority: 9 };
    const b: Coupon = { code: "MORE", type: "fixed", value: 100 };
    const r = applyCoupons([a, b], { subtotal: 1000, now });
    expect(r.applied.map((x) => x.code)).toEqual(["SOLO"]);
    expect(r.skipped).toEqual([{ code: "MORE", reason: "not-stackable" }]);
    expect(r.discount).toBe(100);
  });

  it("skips a non-stackable coupon when something is already applied", () => {
    const a: Coupon = { code: "FIRST", type: "fixed", value: 100, priority: 9 };
    const b: Coupon = { code: "SOLO", type: "fixed", value: 200, stackable: false };
    const r = applyCoupons([a, b], { subtotal: 1000, now });
    expect(r.applied.map((x) => x.code)).toEqual(["FIRST"]);
    expect(r.skipped).toEqual([{ code: "SOLO", reason: "not-stackable" }]);
  });

  it("records invalid coupons in skipped with their reason", () => {
    const a: Coupon = { code: "OK", type: "fixed", value: 100 };
    const b: Coupon = {
      code: "OLD",
      type: "fixed",
      value: 100,
      endsAt: "2026-01-01T00:00:00.000Z",
    };
    const r = applyCoupons([a, b], { subtotal: 1000, now });
    expect(r.applied.map((x) => x.code)).toEqual(["OK"]);
    expect(r.skipped).toEqual([{ code: "OLD", reason: "expired" }]);
  });

  it("stacks a free-shipping coupon on the shipping line", () => {
    const a: Coupon = { code: "TEN", type: "percent", value: 10 };
    const b: Coupon = { code: "FS", type: "free-shipping" };
    const r = applyCoupons([a, b], { subtotal: 1000, shipping: 300, now });
    expect(r.discount).toBe(100);
    expect(r.shippingDiscount).toBe(300);
    expect(r.total).toBe(900); // 900 remaining subtotal + 0 shipping
  });
});

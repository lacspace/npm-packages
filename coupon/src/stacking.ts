/**
 * Coupon stacking — apply several coupons to one order with a defined priority
 * order and a `stackable` flag, computing the combined discount without ever
 * going negative. Integer minor units throughout.
 */

import { applyCoupon, type Coupon, type OrderContext } from "./index";

/** One coupon that was successfully applied while stacking. */
export interface AppliedCoupon {
  code: string;
  discount: number;
  shippingDiscount: number;
}

/** One coupon that was skipped while stacking, with the reason. */
export interface SkippedCoupon {
  code: string;
  reason: string;
}

/** Result of stacking several coupons onto one order. */
export interface StackResult {
  /** Combined subtotal discount (minor units). */
  discount: number;
  /** Combined shipping discount (minor units). */
  shippingDiscount: number;
  /** Final payable total (minor units). */
  total: number;
  /** Coupons that were applied, in application order. */
  applied: AppliedCoupon[];
  /** Coupons that were skipped, with reasons. */
  skipped: SkippedCoupon[];
}

/**
 * Apply multiple coupons to one order. Coupons are applied highest-`priority`
 * first (default 0, input order breaks ties); each subsequent coupon discounts
 * the already-reduced running subtotal, so the combined discount can never
 * exceed the subtotal or go negative.
 *
 * A coupon with `stackable: false` is applied only if nothing has been applied
 * yet, and once applied it stops any further coupons from stacking on top.
 */
export function applyCoupons(
  coupons: Coupon[],
  ctx: OrderContext,
): StackResult {
  const ordered = coupons
    .map((coupon, index) => ({ coupon, index }))
    .sort((a, b) => {
      const pa = a.coupon.priority ?? 0;
      const pb = b.coupon.priority ?? 0;
      if (pb !== pa) return pb - pa;
      return a.index - b.index;
    });

  const applied: AppliedCoupon[] = [];
  const skipped: SkippedCoupon[] = [];

  let remainingSubtotal = Math.max(0, ctx.subtotal);
  let remainingShipping = Math.max(0, ctx.shipping ?? 0);
  let totalDiscount = 0;
  let totalShippingDiscount = 0;
  let appliedAny = false;
  let blocked = false;

  for (const { coupon } of ordered) {
    if (blocked) {
      skipped.push({ code: coupon.code, reason: "not-stackable" });
      continue;
    }
    if (appliedAny && coupon.stackable === false) {
      skipped.push({ code: coupon.code, reason: "not-stackable" });
      continue;
    }

    const result = applyCoupon(coupon, {
      ...ctx,
      subtotal: remainingSubtotal,
      shipping: remainingShipping,
    });

    if (!result.valid) {
      skipped.push({ code: coupon.code, reason: result.reason ?? "invalid" });
      continue;
    }

    // Clamp defensively so the running total can never go negative.
    const discount = Math.max(0, Math.min(result.discount, remainingSubtotal));
    const shippingDiscount = Math.max(
      0,
      Math.min(result.shippingDiscount, remainingShipping),
    );

    if (discount === 0 && shippingDiscount === 0) {
      skipped.push({ code: coupon.code, reason: "no-discount" });
      continue;
    }

    remainingSubtotal -= discount;
    remainingShipping -= shippingDiscount;
    totalDiscount += discount;
    totalShippingDiscount += shippingDiscount;
    applied.push({ code: coupon.code, discount, shippingDiscount });
    appliedAny = true;

    // A non-stackable coupon, once applied, blocks everything after it.
    if (coupon.stackable === false) blocked = true;
  }

  const total = Math.max(0, remainingSubtotal + remainingShipping);

  return {
    discount: totalDiscount,
    shippingDiscount: totalShippingDiscount,
    total,
    applied,
    skipped,
  };
}

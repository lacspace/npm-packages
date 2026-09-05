/**
 * @lacspace/coupon
 *
 * Discount / coupon engine — percent, fixed and free-shipping codes with
 * validity windows, minimum-subtotal thresholds, discount caps and usage
 * limits. All money is expressed in integer minor units (e.g. cents) so there
 * is no floating-point drift.
 *
 * Zero runtime dependencies. Isomorphic (Node, edge, browser).
 */

/** A discount coupon definition. */
export interface Coupon {
  /** The code a customer enters. */
  code: string;
  /** Kind of discount. */
  type: "percent" | "fixed" | "free-shipping";
  /**
   * For `percent`, a whole percentage 0..100. For `fixed`, an amount in minor
   * units. Ignored for `free-shipping`.
   */
  value?: number;
  /** Minimum order subtotal (minor units) required for the coupon to apply. */
  minSubtotal?: number;
  /** Maximum discount (minor units) the coupon may grant. */
  maxDiscount?: number;
  /** ISO-8601 timestamp before which the coupon is not yet valid. */
  startsAt?: string;
  /** ISO-8601 timestamp after which the coupon has expired. */
  endsAt?: string;
  /** How many times the coupon may be redeemed in total. */
  usageLimit?: number;
  /** How many times it has already been redeemed. */
  used?: number;
  /** Optional currency tag for downstream formatting. */
  currency?: string;
}

/** Result of validating a coupon against a context. */
export interface CouponValidation {
  valid: boolean;
  reason?: string;
}

/** Result of applying a coupon to an order. */
export interface CouponResult extends CouponValidation {
  /** Discount applied to the subtotal (minor units). */
  discount: number;
  /** Discount applied to shipping (minor units). */
  shippingDiscount: number;
  /** Final payable total (minor units). */
  total: number;
}

/**
 * Validate a coupon against an order context: checks the validity window,
 * minimum-subtotal threshold and usage limit. Does not compute any discount.
 */
export function validateCoupon(
  coupon: Coupon,
  ctx: { subtotal: number; now?: Date },
): CouponValidation {
  const now = ctx.now ?? new Date();
  const t = now.getTime();

  if (coupon.startsAt) {
    const starts = new Date(coupon.startsAt).getTime();
    if (!Number.isNaN(starts) && t < starts) {
      return { valid: false, reason: "not-yet-started" };
    }
  }

  if (coupon.endsAt) {
    const ends = new Date(coupon.endsAt).getTime();
    if (!Number.isNaN(ends) && t > ends) {
      return { valid: false, reason: "expired" };
    }
  }

  if (typeof coupon.minSubtotal === "number" && ctx.subtotal < coupon.minSubtotal) {
    return { valid: false, reason: "below-min-subtotal" };
  }

  if (
    typeof coupon.usageLimit === "number" &&
    (coupon.used ?? 0) >= coupon.usageLimit
  ) {
    return { valid: false, reason: "usage-limit-reached" };
  }

  return { valid: true };
}

/**
 * Apply a coupon to an order. Validates first; when invalid, returns zero
 * discounts and the untouched total. When valid, computes the discount:
 *
 * - `percent`  → `round(subtotal * value / 100)`, capped by `maxDiscount` and
 *   never more than the subtotal.
 * - `fixed`    → `min(value, subtotal)`, capped by `maxDiscount`.
 * - `free-shipping` → `shippingDiscount = shipping`.
 *
 * `total = max(0, subtotal - discount + shipping - shippingDiscount)`.
 */
export function applyCoupon(
  coupon: Coupon,
  ctx: { subtotal: number; shipping?: number; now?: Date },
): CouponResult {
  const subtotal = ctx.subtotal;
  const shipping = ctx.shipping ?? 0;

  const validation = validateCoupon(coupon, { subtotal, now: ctx.now });
  if (!validation.valid) {
    return {
      ...validation,
      discount: 0,
      shippingDiscount: 0,
      total: Math.max(0, subtotal + shipping),
    };
  }

  let discount = 0;
  let shippingDiscount = 0;

  switch (coupon.type) {
    case "percent": {
      const pct = coupon.value ?? 0;
      discount = Math.round((subtotal * pct) / 100);
      break;
    }
    case "fixed": {
      const amount = coupon.value ?? 0;
      discount = Math.min(amount, subtotal);
      break;
    }
    case "free-shipping": {
      shippingDiscount = shipping;
      break;
    }
  }

  if (typeof coupon.maxDiscount === "number") {
    discount = Math.min(discount, coupon.maxDiscount);
  }
  discount = Math.min(discount, subtotal);
  discount = Math.max(0, discount);

  const total = Math.max(0, subtotal - discount + shipping - shippingDiscount);

  return { valid: true, discount, shippingDiscount, total };
}

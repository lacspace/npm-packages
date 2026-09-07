/**
 * Order-value shipping thresholds — free **or** discounted shipping once a cart
 * clears a spend target, per method.
 *
 * `freeOver` (already on {@link ShippingMethod}) zeroes the cost. This adds the
 * softer step: a *discount* — a flat amount or a basis-points cut — that applies
 * over a lower `discountOver` target when the cart hasn't yet earned free
 * shipping. Free always wins over a discount. Everything is integer-safe.
 */

/** A free / discounted-shipping rule keyed on cart subtotal (minor units). */
export interface ThresholdRule {
  /** Subtotal at/above which shipping is free. */
  freeOver?: number;
  /** Subtotal at/above which the discount applies (ignored once `freeOver` is met). */
  discountOver?: number;
  /** Discount in basis points off the cost (e.g. `5000` = 50% off). */
  discountBps?: number;
  /** Flat discount in minor units (applied after `discountBps`). */
  discountAmount?: number;
}

/** Result of applying a {@link ThresholdRule} to a cost. */
export interface ThresholdResult {
  /** Cost after the rule, in minor units (never negative). */
  cost: number;
  /** True when the free threshold applied. */
  free: boolean;
  /** True when a (non-free) discount reduced the cost. */
  discounted: boolean;
}

/**
 * Apply a free / discounted-shipping threshold to a cost given the cart subtotal.
 *
 * `freeOver` takes precedence; otherwise, at/above `discountOver`, the cost is
 * cut by `discountBps` (basis points, truncated) then `discountAmount` (flat),
 * floored at `0`. Below every threshold the cost is returned unchanged.
 */
export function applyThreshold(
  cost: number,
  subtotal: number,
  rule: ThresholdRule,
): ThresholdResult {
  const base = Math.max(0, Math.trunc(cost));
  const sub = Math.trunc(subtotal);

  if (rule.freeOver !== undefined && sub >= Math.trunc(rule.freeOver)) {
    return { cost: 0, free: true, discounted: false };
  }

  if (rule.discountOver !== undefined && sub >= Math.trunc(rule.discountOver)) {
    let next = base;
    if (rule.discountBps !== undefined) {
      next -= Math.trunc((next * Math.trunc(rule.discountBps)) / 10000);
    }
    if (rule.discountAmount !== undefined) {
      next -= Math.trunc(rule.discountAmount);
    }
    next = Math.max(0, next);
    return { cost: next, free: false, discounted: next < base };
  }

  return { cost: base, free: false, discounted: false };
}

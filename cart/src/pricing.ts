/**
 * @lacspace/cart — discounts, tax hooks and a full totals breakdown.
 *
 * These helpers extend {@link totals} additively: they compute a richer money
 * breakdown that folds in per-line option deltas, line- and cart-level
 * discounts, and an injectable tax calculator — all in **integer minor units**,
 * remainder-safe, with no floats leaking into the result.
 */

import type { Cart, CartItem } from "./index";
import { effectiveUnitPrice, itemCount, lineTotal } from "./index";

/** Coerce to a safe integer (NaN/±Infinity → 0), matching the core engine. */
function toInt(n: number): number {
  const v = Math.trunc(n);
  return Number.isFinite(v) ? v : 0;
}

/** Clamp a fraction into the `0..1` range; non-finite → 0. */
function clampFraction(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * A resolved discount. Storage/coupon-source agnostic — you resolve a coupon
 * elsewhere and pass the concrete discount in; this module never fetches.
 */
export type Discount =
  /** Percentage off, `rate` as a fraction `0..1` (e.g. `0.15` for 15%). */
  | { type: "percentage"; rate: number }
  /** A flat amount off, in integer minor units. */
  | { type: "fixed"; amount: number };

/** A discount, or a bare integer treated as a flat `fixed` amount (minor units). */
export type DiscountInput = Discount | number;

/**
 * The (post-discount) base a tax calculator receives. `amount` is the whole
 * cart's taxable amount in integer minor units.
 */
export interface TaxContext {
  /** Post-discount taxable amount, in integer minor units. */
  amount: number;
  /** The cart being priced (for per-category / per-region logic). */
  cart: Cart;
}

/**
 * An injected tax calculator. Receives the post-discount taxable amount and
 * returns the tax to add, in integer minor units. Keep it pure and synchronous;
 * the return value is coerced to a safe non-negative integer.
 */
export type TaxCalculator = (ctx: TaxContext) => number;

/** A simple rate-based tax rule with an inclusive/exclusive flag. */
export interface TaxRule {
  /** Tax rate as a fraction `0..1` (e.g. `0.2` for 20%). */
  rate: number;
  /**
   * When `true`, the taxable amount is treated as already **including** tax, so
   * the tax is extracted from it (and NOT added again to the total). Defaults to
   * `false` (exclusive — tax is added on top).
   */
  inclusive?: boolean;
}

/** Tax input: a bare fraction rate, a {@link TaxRule}, or a {@link TaxCalculator}. */
export type TaxInput = number | TaxRule | TaxCalculator;

/** Options controlling {@link cartTotals}. All amounts are integer minor units. */
export interface CartTotalsOptions {
  /** A whole-cart discount, applied after any per-line discounts. */
  discount?: DiscountInput;
  /** Per-line discounts keyed by item `id`, applied to that line's total. */
  lineDiscounts?: Record<string, DiscountInput>;
  /** Tax as a fraction rate, a {@link TaxRule}, or an injected {@link TaxCalculator}. */
  tax?: TaxInput;
  /** Flat shipping charge, in minor units. */
  shipping?: number;
}

/** The full money breakdown from {@link cartTotals}. Every field is an integer. */
export interface CartBreakdown {
  /** Sum of every line's effective total (option deltas included). */
  subtotal: number;
  /** Total discount applied (line + cart), clamped so it never exceeds subtotal. */
  discountTotal: number;
  /** Tax on the post-discount amount (extracted, not added, when inclusive). */
  taxTotal: number;
  /** Flat shipping charge. */
  shippingTotal: number;
  /** Final payable: `subtotal - discountTotal (+ taxTotal, if exclusive) + shipping`, never < 0. */
  total: number;
  /** Total units across all lines. */
  itemCount: number;
}

/** Resolve a {@link DiscountInput} against a base amount, clamped to `0..base`. */
function computeDiscount(input: DiscountInput | undefined, base: number): number {
  const cap = Math.max(0, base);
  if (input === undefined || input === null) return 0;
  if (typeof input === "number") return Math.min(Math.max(0, toInt(input)), cap);
  if (input.type === "percentage") {
    return Math.min(Math.round(cap * clampFraction(input.rate)), cap);
  }
  // fixed
  return Math.min(Math.max(0, toInt(input.amount)), cap);
}

/**
 * Compute the discount for a single line, against its effective line total.
 * Exposed for callers that want the per-line figure without the full breakdown.
 */
export function lineDiscount(item: CartItem, input: DiscountInput | undefined): number {
  return computeDiscount(input, lineTotal(item));
}

/**
 * Compute the full money breakdown for a cart: option-aware subtotal, line and
 * cart discounts, injectable tax (inclusive or exclusive) and shipping.
 *
 * All values are integer minor units and remainder-safe. Tax is computed on the
 * post-discount amount. For an **inclusive** tax rule the tax is extracted from
 * that amount and is NOT added again, so `total` stays tax-inclusive; otherwise
 * it is added on top. `total` is clamped to never be negative.
 */
export function cartTotals(cart: Cart, opts: CartTotalsOptions = {}): CartBreakdown {
  const subtotal = cart.items.reduce((sum, it) => sum + lineTotal(it), 0);

  // Per-line discounts, each clamped to its own line total.
  let lineDiscountSum = 0;
  const lineDiscounts = opts.lineDiscounts;
  if (lineDiscounts) {
    for (const it of cart.items) {
      const rule = lineDiscounts[it.id];
      if (rule !== undefined) lineDiscountSum += computeDiscount(rule, lineTotal(it));
    }
  }
  lineDiscountSum = Math.min(lineDiscountSum, subtotal);

  // Whole-cart discount, against what remains after line discounts.
  const afterLine = subtotal - lineDiscountSum;
  const cartDiscount = computeDiscount(opts.discount, afterLine);

  const discountTotal = lineDiscountSum + cartDiscount;
  const taxable = Math.max(0, subtotal - discountTotal);

  // Tax: injected calculator, rate-rule (inclusive/exclusive), or bare rate.
  let taxTotal = 0;
  let inclusive = false;
  const tax = opts.tax;
  if (typeof tax === "function") {
    taxTotal = Math.max(0, toInt(tax({ amount: taxable, cart })));
  } else if (typeof tax === "number") {
    taxTotal = Math.round(taxable * clampFraction(tax));
  } else if (tax && typeof tax === "object") {
    const rate = clampFraction(tax.rate);
    if (tax.inclusive) {
      inclusive = true;
      // Extract the tax already contained in `taxable`: t = taxable * r / (1 + r).
      taxTotal = rate > 0 ? Math.round((taxable * rate) / (1 + rate)) : 0;
    } else {
      taxTotal = Math.round(taxable * rate);
    }
  }

  const shippingTotal = Math.max(0, toInt(opts.shipping ?? 0));

  const total = Math.max(0, taxable + (inclusive ? 0 : taxTotal) + shippingTotal);

  return {
    subtotal,
    discountTotal,
    taxTotal,
    shippingTotal,
    total,
    itemCount: itemCount(cart),
  };
}

// Re-export line-price helpers so `pricing`-only importers get the full toolkit.
export { effectiveUnitPrice, lineTotal };

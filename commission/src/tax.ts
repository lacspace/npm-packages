/**
 * Tax / GST on a commission amount, as a separate integer line item.
 *
 * `exclusive` (the default) treats the commission as tax-exclusive and adds tax
 * on top: `total = commission + tax`. `inclusive` treats the commission as
 * already tax-inclusive and backs the tax out of it: `total = commission`,
 * `base + tax = commission`.
 *
 * All money is integer minor units; the tax line is rounded with an explicit
 * {@link RoundingMode} (default `half-up`) and derived so the parts always add
 * up exactly (no lost/created minor units).
 */

import { roundMinor, DEFAULT_ROUNDING, type RoundingMode } from "./rounding";

/** Options for {@link taxOnCommission}. */
export interface TaxOptions {
  /**
   * `true` when the commission already includes the tax (tax is backed out);
   * `false`/omitted when tax is added on top. Default `false` (exclusive).
   */
  inclusive?: boolean;
  /** Rounding mode (default `half-up`). */
  rounding?: RoundingMode;
}

/** Result of {@link taxOnCommission} — all money in minor units. */
export interface TaxResult {
  /** The pre-tax commission (net of tax), in minor units. */
  base: number;
  /** The tax amount, in minor units. */
  tax: number;
  /** The tax-inclusive total (`base + tax`), in minor units. */
  total: number;
  /** The tax rate applied (0..1). */
  rate: number;
  /** `true` when the input commission was treated as tax-inclusive. */
  inclusive: boolean;
}

/**
 * Compute tax on `commission` at `rate` (0..1). Returns the split into
 * `{ base, tax, total }` such that `base + tax === total` exactly.
 *
 * - Exclusive (default): `base = commission`, `tax = round(commission * rate)`,
 *   `total = base + tax`.
 * - Inclusive: `total = commission`, `base = round(commission / (1 + rate))`,
 *   `tax = total - base` (so the parts still reconcile exactly).
 */
export function taxOnCommission(commission: number, rate: number, opts: TaxOptions = {}): TaxResult {
  const mode = opts.rounding ?? DEFAULT_ROUNDING;
  const inclusive = opts.inclusive === true;
  const c = Math.trunc(commission);

  if (inclusive) {
    const base = rate <= -1 ? c : roundMinor(c / (1 + rate), mode);
    const tax = c - base;
    return { base, tax, total: c, rate, inclusive: true };
  }

  const tax = roundMinor(c * rate, mode);
  return { base: c, tax, total: c + tax, rate, inclusive: false };
}

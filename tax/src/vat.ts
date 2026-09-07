/**
 * VAT / GST convenience helpers.
 *
 * These wrap the core inclusive/exclusive split with the ergonomics real
 * checkouts want: a single call that also understands a **reverse charge**
 * (tax recorded as `0`, because the customer self-accounts), the richer
 * {@link RoundingMode} set, and a `formatRate` for turning `0.13` into
 * `"13%"` for receipts.
 */

import type { TaxResult } from "./index";
import type { RoundingMode } from "./rounding";
import { roundMinor } from "./rounding";

function assertAmount(amount: number): void {
  if (!Number.isInteger(amount)) {
    throw new TypeError(`amount must be an integer number of minor units, got ${amount}`);
  }
}

function assertRate(rate: number): void {
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0) {
    throw new RangeError(`rate must be a finite number >= 0, got ${rate}`);
  }
}

/** Options for {@link vat} / {@link gst}. */
export interface VatOptions {
  /** When `true`, `amount` is the gross and net + tax are extracted. Default `false`. */
  inclusive?: boolean;
  /** Rounding applied to the tax portion. Defaults to `"half-up"`. */
  round?: RoundingMode;
  /**
   * Reverse charge: return `tax: 0` but keep the amount. With `inclusive: true`
   * the gross is treated as the net (there is no baked-in tax to extract).
   */
  reverseCharge?: boolean;
}

/**
 * Split a price by a VAT/GST `rate` into `{ net, tax, gross }` (minor units),
 * honouring an inclusive price, extended rounding, and a reverse charge.
 *
 * `net + tax === gross` always holds exactly. A reverse charge yields
 * `{ net: amount, tax: 0, gross: amount }` — the liability is recorded elsewhere.
 */
export function vat(amount: number, rate: number, opts: VatOptions = {}): TaxResult {
  assertAmount(amount);
  assertRate(rate);
  const round = opts.round ?? "half-up";

  if (opts.reverseCharge) {
    return { net: amount, tax: 0, gross: amount };
  }

  if (opts.inclusive) {
    const gross = amount;
    const net = roundMinor(gross / (1 + rate), round);
    return { net, tax: gross - net, gross };
  }

  const net = amount;
  const t = roundMinor(net * rate, round);
  return { net, tax: t, gross: net + t };
}

/** Alias of {@link vat} for GST call sites — identical behaviour. */
export function gst(amount: number, rate: number, opts: VatOptions = {}): TaxResult {
  return vat(amount, rate, opts);
}

/** Options for {@link formatRate}. */
export interface FormatRateOptions {
  /** Fix the number of decimal places (e.g. `2` → `"13.00%"`). Default: trim trailing zeros. */
  decimals?: number;
  /** The `%` sign to append. Default `"%"`. */
  symbol?: string;
}

/**
 * Format a fractional rate as a percentage string: `0.13` → `"13%"`,
 * `0.075` → `"7.5%"`, `0.2` → `"20%"`. Trailing zeros are trimmed unless
 * `decimals` is given.
 */
export function formatRate(rate: number, opts: FormatRateOptions = {}): string {
  assertRate(rate);
  const symbol = opts.symbol ?? "%";
  const pct = rate * 100;
  if (opts.decimals !== undefined) {
    if (!Number.isInteger(opts.decimals) || opts.decimals < 0) {
      throw new RangeError(`decimals must be a non-negative integer, got ${opts.decimals}`);
    }
    return `${pct.toFixed(opts.decimals)}${symbol}`;
  }
  // Trim float noise (e.g. 0.07 * 100 = 7.000000000000001) then drop trailing zeros.
  const trimmed = Number(pct.toFixed(10)).toString();
  return `${trimmed}${symbol}`;
}

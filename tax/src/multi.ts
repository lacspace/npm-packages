/**
 * Multiple & compound taxes with a per-line breakdown, plus line-level vs
 * invoice-level rounding strategies.
 *
 * `compound()` (in the index) always cascades every rate on the running gross.
 * Real invoices are more nuanced: a state tax and a city tax are usually BOTH
 * charged on the same base, while an extra levy might be charged on base + the
 * previous taxes (tax-on-tax). {@link applyTaxes} supports both per line, keeps
 * a labelled breakdown, and honours a {@link ReverseCharge} line (recorded, but
 * zero tax).
 */

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

/** One tax to apply in {@link applyTaxes}. */
export interface TaxSpec {
  /** Rate as a fraction, e.g. `0.07` for 7%. Must be `>= 0`. */
  rate: number;
  /** Human label for the breakdown line, e.g. `"State"`, `"City"`, `"VAT"`. */
  name?: string;
  /**
   * When `true`, this tax is charged on `base + all preceding taxes so far`
   * (tax-on-tax / cascading). When `false` (default) it is charged on the
   * original `base`, so several flat taxes stack side by side.
   */
  compound?: boolean;
  /**
   * Reverse-charge line: the tax is **recorded with `tax: 0`** (the customer
   * accounts for it) but it still appears in the breakdown for audit. It never
   * changes the running total.
   */
  reverseCharge?: boolean;
}

/** One resolved line in a {@link MultiTaxResult}. */
export interface TaxBreakdownLine {
  /** The label from the {@link TaxSpec}, if any. */
  name?: string;
  /** The rate that produced this line. */
  rate: number;
  /** Whether this line was charged tax-on-tax. */
  compound: boolean;
  /** Whether this line was a recorded-but-zero reverse charge. */
  reverseCharge: boolean;
  /** The base this line was charged on, in minor units. */
  base: number;
  /** Tax charged for this line, in minor units (`0` for a reverse charge). */
  tax: number;
}

/** Result of {@link applyTaxes}. `net + totalTax === gross` exactly. */
export interface MultiTaxResult {
  /** The starting base, in minor units. */
  net: number;
  /** Ordered, labelled per-tax breakdown. */
  taxes: TaxBreakdownLine[];
  /** Sum of every line's tax, in minor units. */
  totalTax: number;
  /** `net + totalTax`, in minor units. */
  gross: number;
}

/**
 * Apply several taxes to a `net` base and return a labelled breakdown.
 *
 * Each {@link TaxSpec} is charged either on the original `net` (default) or, if
 * `compound: true`, on `net + the taxes accumulated so far` — in list order, so
 * ordering is explicit and deterministic. A `reverseCharge` line contributes
 * `0` but is still recorded.
 *
 * Every line's tax is rounded individually (line-level rounding), so
 * `net + Σ line.tax === gross` holds exactly for integer modes. Use
 * {@link taxInvoice} when you need invoice-level rounding instead.
 */
export function applyTaxes(net: number, specs: TaxSpec[], round: RoundingMode = "half-up"): MultiTaxResult {
  assertAmount(net);
  const taxes: TaxBreakdownLine[] = [];
  let accumulated = 0;
  for (const spec of specs) {
    assertRate(spec.rate);
    const compound = spec.compound ?? false;
    const reverseCharge = spec.reverseCharge ?? false;
    const base = compound ? net + accumulated : net;
    const tax = reverseCharge ? 0 : roundMinor(base * spec.rate, round);
    accumulated += tax;
    const line: TaxBreakdownLine = { rate: spec.rate, compound, reverseCharge, base, tax };
    if (spec.name !== undefined) line.name = spec.name;
    taxes.push(line);
  }
  return { net, taxes, totalTax: accumulated, gross: net + accumulated };
}

/** Which point the tax is rounded at — see {@link taxInvoice}. */
export type RoundingStrategy = "line" | "invoice";

/** A single line item on an invoice: a `net` amount taxed at one `rate`. */
export interface LineItem {
  /** Net amount for the line, in minor units. */
  net: number;
  /** Rate as a fraction, e.g. `0.13`. */
  rate: number;
  /** Optional label, echoed back on the resolved line. */
  name?: string;
}

/** One resolved line inside an {@link InvoiceTaxResult}. */
export interface InvoiceLine {
  name?: string;
  net: number;
  rate: number;
  tax: number;
  gross: number;
}

/** Result of {@link taxInvoice}. `net + tax === gross` exactly. */
export interface InvoiceTaxResult {
  /** Which rounding strategy was used. */
  strategy: RoundingStrategy;
  /** Sum of every line's net, in minor units. */
  net: number;
  /** Total tax, in minor units. */
  tax: number;
  /** `net + tax`, in minor units. */
  gross: number;
  /** Per-line breakdown. */
  lines: InvoiceLine[];
}

/**
 * Compute tax over many line items with an explicit rounding **strategy**:
 *
 * - `"line"` (default) — round **each line's** tax, then sum. Line taxes always
 *   add up to the invoice tax, but the invoice total can differ by a minor unit
 *   from a single rounding of the exact grand total.
 * - `"invoice"` — sum the **exact** (unrounded) per-line tax, then round **once**
 *   at the end. The invoice total matches a from-scratch calculation, but the
 *   per-line `tax` values (also rounded, for display) may not re-sum to it — the
 *   documented, unavoidable trade-off. `net + tax === gross` still holds for the
 *   returned totals.
 *
 * Pick `"line"` when each line is invoiced/settled independently; pick
 * `"invoice"` when only the grand total is remitted.
 */
export function taxInvoice(
  lines: LineItem[],
  opts: { strategy?: RoundingStrategy; round?: RoundingMode } = {},
): InvoiceTaxResult {
  const strategy = opts.strategy ?? "line";
  const round = opts.round ?? "half-up";
  let net = 0;
  let exactTax = 0;
  const resolved: InvoiceLine[] = [];

  for (const item of lines) {
    assertAmount(item.net);
    assertRate(item.rate);
    const raw = item.net * item.rate;
    const lineTax = roundMinor(raw, round);
    net += item.net;
    exactTax += raw;
    const line: InvoiceLine = { net: item.net, rate: item.rate, tax: lineTax, gross: item.net + lineTax };
    if (item.name !== undefined) line.name = item.name;
    resolved.push(line);
  }

  const tax = strategy === "invoice"
    ? roundMinor(exactTax, round)
    : resolved.reduce((s, l) => s + l.tax, 0);

  return { strategy, net, tax, gross: net + tax, lines: resolved };
}

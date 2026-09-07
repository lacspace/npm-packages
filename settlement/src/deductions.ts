/**
 * Fee, commission & tax deduction — integer-safe.
 *
 * Take a `gross` amount in minor units and subtract a transparent list of
 * deductions (platform commission, gateway fees, taxes, adjustments), yielding
 * a `gross → deductions → net` breakdown. Rate-based deductions use **basis
 * points** (1% = 100 bps) and floor to whole minor units, so nothing fractional
 * ever escapes. Pure — inputs are never mutated.
 */

/** Classifier for a single deduction. */
export type DeductionKind = "commission" | "fee" | "tax" | "adjustment";

/** A deduction to apply. Provide `amount`, `bps`, or both (they add up). */
export interface DeductionSpec {
  /** Human-readable label, e.g. `"Platform commission"`. */
  label: string;
  /** Classifier. Defaults to `"fee"`. */
  kind?: DeductionKind;
  /** Flat amount in minor units (`>= 0`). */
  amount?: number;
  /** Rate in basis points applied to the base (1% = 100 bps, `>= 0`). */
  bps?: number;
}

/** A resolved deduction line in the breakdown. */
export interface DeductionLine {
  label: string;
  kind: DeductionKind;
  /** Amount deducted, in minor units (always `>= 0`). */
  amount: number;
  /** Basis points used, when the deduction was rate-based. */
  bps?: number;
  /** The base the rate was applied to, in minor units. */
  base?: number;
}

/** The full `gross → deductions → net` breakdown. */
export interface DeductionResult {
  /** Gross amount before deductions, in minor units. */
  gross: number;
  /** One line per deduction, in the order supplied. */
  deductions: DeductionLine[];
  /** Sum of all deducted amounts, in minor units. */
  totalDeductions: number;
  /** `gross - totalDeductions`, clamped at `0` unless `allowNegative`. */
  net: number;
}

/** Options for {@link applyDeductions}. */
export interface DeductionOptions {
  /** Let `net` go below zero (carry-forward). Defaults to `false` → clamp at 0. */
  allowNegative?: boolean;
  /**
   * What each rate applies to:
   * - `"gross"` (default) — every `bps` rate applies to the original gross.
   * - `"running"` — each `bps` rate applies to the balance left after prior
   *   deductions (useful for tax charged on an already-reduced amount).
   */
  rateBase?: "gross" | "running";
}

/** Floor `amount * bps / 10000` toward zero, integer-safe for integer inputs. */
function bpsOf(base: number, bps: number): number {
  // base and bps are whole numbers, so base*bps is exact; Math.floor keeps the
  // result an integer and never rounds a deduction up.
  return Math.floor((base * bps) / 10000);
}

/**
 * Deduct commission, fees and taxes from `gross`, returning a transparent
 * `gross → deductions → net` breakdown. All money is integer minor units.
 *
 * ```ts
 * applyDeductions(10_000, [
 *   { label: "Commission", kind: "commission", bps: 1500 }, // 15% → 1500
 *   { label: "Gateway fee", kind: "fee", amount: 30, bps: 290 }, // 30 + 2.9%
 *   { label: "VAT", kind: "tax", bps: 1300 },
 * ]);
 * ```
 */
export function applyDeductions(
  gross: number,
  specs: DeductionSpec[],
  opts: DeductionOptions = {},
): DeductionResult {
  const g = Math.trunc(gross);
  const rateBase = opts.rateBase ?? "gross";
  const lines: DeductionLine[] = [];
  let total = 0;
  let running = g;

  for (const spec of specs) {
    const base = rateBase === "running" ? running : g;
    const flat = Math.trunc(spec.amount ?? 0);
    const rate = spec.bps != null ? bpsOf(base, spec.bps) : 0;
    const amount = flat + rate;
    const line: DeductionLine = {
      label: spec.label,
      kind: spec.kind ?? "fee",
      amount,
    };
    if (spec.bps != null) {
      line.bps = spec.bps;
      line.base = base;
    }
    lines.push(line);
    total += amount;
    running -= amount;
  }

  const rawNet = g - total;
  const net = opts.allowNegative ? rawNet : Math.max(0, rawNet);
  return { gross: g, deductions: lines, totalDeductions: total, net };
}

/**
 * @lacspace/tax
 *
 * VAT / sales-tax calculation done right. Everything works in **integer minor
 * units** (cents, paisa, …) so you never accumulate floating-point cent bugs,
 * and the split always satisfies the invariant `net + tax === gross` exactly.
 *
 * ```ts
 * import { tax, addTax, extractTax, compound, RATES } from "@lacspace/tax";
 *
 * addTax(10000, RATES.NP_VAT);          // { net: 10000, tax: 1300, gross: 11300 }
 * extractTax(11300, RATES.NP_VAT);      // { net: 10000, tax: 1300, gross: 11300 }
 * ```
 *
 * Zero dependencies · isomorphic · fully typed.
 */

/** Rounding strategy for the tax portion. */
export type Rounding = "half-up" | "bankers" | "none";

/** The split of a price into its net, tax and gross parts (all minor units). */
export interface TaxResult {
  /** Amount before tax, in minor units. */
  net: number;
  /** Tax portion, in minor units. */
  tax: number;
  /** Amount including tax, in minor units. `net + tax === gross`. */
  gross: number;
}

/** Options for {@link tax}. */
export interface TaxOptions {
  /** Tax rate as a fraction, e.g. `0.13` for 13%. Must be `>= 0`. */
  rate: number;
  /** When `true`, `amount` is treated as the gross and the net + tax are extracted. */
  inclusive?: boolean;
  /** Rounding applied to the tax portion. Defaults to `"half-up"`. */
  round?: Rounding;
}

/**
 * A handful of common tax rates as fractions. Add your own — these are just
 * conveniences so call sites read clearly.
 */
export const RATES = {
  /** Nepal VAT — 13%. */
  NP_VAT: 0.13,
  /** India GST — standard 18% slab. */
  IN_GST: 0.18,
  /** EU standard VAT — 20% (varies by member state). */
  EU_VAT: 0.2,
  /** UK VAT — standard 20%. */
  UK_VAT: 0.2,
} as const;

/** Round half away from zero — the intuitive rule (2.5 → 3, -2.5 → -3). */
function roundHalfUp(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** Round half to even ("bankers' rounding": 2.5 → 2, 3.5 → 4). */
function roundHalfEven(n: number): number {
  const floor = Math.floor(n);
  const diff = n - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  // Exactly .5 → round to the even neighbour.
  return floor % 2 === 0 ? floor : floor + 1;
}

function applyRounding(n: number, mode: Rounding): number {
  if (mode === "none") return n;
  if (mode === "bankers") return roundHalfEven(n);
  return roundHalfUp(n);
}

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

/**
 * Split a price into `{ net, tax, gross }`.
 *
 * - `inclusive: false` (default) — `amount` is the **net**; tax is added.
 * - `inclusive: true` — `amount` is the **gross**; the net + tax are extracted.
 *
 * In both directions `net + tax === gross` holds exactly, because the tax is
 * rounded and `gross` (exclusive) / `net` (inclusive) is derived from it.
 */
export function tax(amount: number, opts: TaxOptions): TaxResult {
  assertAmount(amount);
  assertRate(opts.rate);
  const round = opts.round ?? "half-up";

  if (opts.inclusive) {
    // amount is gross → net = gross / (1 + rate); tax = gross - net.
    const gross = amount;
    const net = applyRounding(gross / (1 + opts.rate), round);
    return { net, tax: gross - net, gross };
  }

  // amount is net → tax = net * rate; gross = net + tax.
  const net = amount;
  const t = applyRounding(net * opts.rate, round);
  return { net, tax: t, gross: net + t };
}

/** Add tax to a net amount. `amount` is the net (minor units). */
export function addTax(net: number, rate: number, round?: Rounding): TaxResult {
  return tax(net, { rate, inclusive: false, round });
}

/** Extract the tax already baked into a gross amount (minor units). */
export function extractTax(gross: number, rate: number, round?: Rounding): TaxResult {
  return tax(gross, { rate, inclusive: true, round });
}

/** One tax line in a {@link CompoundResult}. */
export interface CompoundTaxLine {
  /** The rate that produced this tax line. */
  rate: number;
  /** Tax charged for this line, in minor units. */
  tax: number;
}

/** Result of {@link compound} — a net, the ordered tax lines and the final gross. */
export interface CompoundResult {
  net: number;
  taxes: CompoundTaxLine[];
  gross: number;
}

/**
 * Apply several taxes in sequence, each charged on the **running gross** (i.e.
 * tax-on-tax / cascading tax). `net + Σ taxes === gross` holds exactly.
 */
export function compound(net: number, rates: number[], round?: Rounding): CompoundResult {
  assertAmount(net);
  const mode = round ?? "half-up";
  const taxes: CompoundTaxLine[] = [];
  let running = net;
  for (const rate of rates) {
    assertRate(rate);
    const t = applyRounding(running * rate, mode);
    taxes.push({ rate, tax: t });
    running += t;
  }
  return { net, taxes, gross: running };
}

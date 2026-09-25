/**
 * @lacspace/money
 * Money done right — integer minor units (no floating-point cents bugs),
 * currency-safe arithmetic, remainder-preserving allocation, and localized
 * formatting via `Intl`.
 *
 * ```ts
 * import { money } from "@lacspace/money";
 *
 * const price = money(19.99, "USD");      // 1999 minor units
 * const total = price.multiply(3);        // $59.97, exact
 * total.format();                          // "$59.97"
 * money(10, "USD").allocate([1, 1, 1]);    // [$3.34, $3.33, $3.33] — no cent lost
 * ```
 *
 * Zero dependencies · isomorphic · fully typed.
 */

import { roundMinor } from "./rounding";

/** Minor-unit exponents for currencies that aren't the default 2. */
const EXPONENTS: Record<string, number> = {
  // ISO 4217 exponent 0.
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0,
  UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // ISO lists HUF at 2, but it has been 0 here since 1.0 and changing it would
  // silently rescale every stored HUF amount — kept, and documented in the README.
  HUF: 0,
  // ISO 4217 exponent 3.
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // ISO 4217 exponent 4 (Chilean and Uruguayan units of account).
  CLF: 4, UYW: 4,
};

/** How many minor units are in one major unit for a currency (e.g. 100 for USD). */
export function decimalsFor(currency: string): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2;
}

function factorFor(currency: string): number {
  return Math.pow(10, decimalsFor(currency));
}

/** Round half away from zero — the intuitive rule for money. */
function roundHalfUp(n: number): number {
  return roundMinor(n, "half-up");
}

/** Options for {@link Money.parse} / `parseMoney`. */
export interface ParseMoneyOptions {
  /**
   * Force the decimal separator when you know the input's locale. Without it a
   * lone separator followed by exactly three digits is read as a thousands
   * separator unless the currency itself has three decimals (BHD, KWD, …):
   * `"1,234"` USD → 1234.00, `"1.234"` EUR → 1234.00, `"1.234"` BHD → 1.234.
   */
  decimalSeparator?: "." | ",";
}

// Non-ASCII digits people actually type: Arabic-Indic, Persian, Devanagari, full-width.
const DIGIT_BLOCKS = [0x0660, 0x06f0, 0x0966, 0xff10];

function normaliseDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    const block = DIGIT_BLOCKS.find((b) => cp >= b && cp <= b + 9);
    if (block !== undefined) out += String(cp - block);
    else if (cp === 0x066b) out += "."; // Arabic decimal separator
    else if (cp === 0x066c) out += ","; // Arabic thousands separator
    else if (cp === 0x2212) out += "-"; // Unicode minus sign
    else out += ch;
  }
  return out;
}

// Western (1,234,567) or Indian (12,34,567) digit grouping.
const GROUPED = /^\d{1,3}(?:(?:,\d{3})+|(?:,\d{2})*,\d{3})$/;

function parseMinor(input: string, currency: string, options: ParseMoneyOptions): number {
  const fail = (why: string): never => {
    throw new Error(`Cannot parse money from "${input}": ${why}`);
  };
  const text = normaliseDigits(String(input)).trim();
  const neg = /^\(.*\)$/.test(text) || /^[^\d]*-/.test(text) || /[\d.,][^\d]*-$/.test(text);
  const s = text.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) fail("no digits");

  const exponent = decimalsFor(currency);
  const dots = s.split(".").length - 1;
  const commas = s.split(",").length - 1;
  let dec: "." | "," | "" = options.decimalSeparator ?? "";
  if (!dec) {
    if (dots && commas) dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    else if (dots + commas === 1) {
      const sep = dots ? "." : ",";
      const after = s.length - s.indexOf(sep) - 1;
      // Three digits after a lone separator is a thousands group — a 2-decimal
      // currency cannot hold a third decimal — unless the currency has 3 decimals.
      dec = after === 3 && exponent !== 3 && s.indexOf(sep) > 0 ? "" : sep;
    }
    // Repeated single separator ("1,234,567", "1.234.567") is grouping only.
  }

  let intPart = s;
  let frac = "";
  if (dec) {
    const at = s.lastIndexOf(dec);
    intPart = s.slice(0, at);
    frac = s.slice(at + 1);
    if (/[.,]/.test(frac)) fail("separator after the decimal point");
  }
  if (intPart === "") intPart = "0";
  const grouped = intPart.replace(/\./g, ",");
  if (/[.,]/.test(intPart) && !GROUPED.test(grouped)) fail("digit grouping is not 3-digit or Indian lakh style");
  const digits = grouped.replace(/,/g, "");

  // Build the minor-unit integer from the digit string itself — no float math.
  const kept = (frac + "0".repeat(exponent)).slice(0, exponent);
  const rest = frac.slice(exponent);
  let minor = Number(digits + kept);
  if (rest && rest[0]! >= "5") minor += 1; // half-up on the dropped digits
  if (!Number.isSafeInteger(minor)) fail("amount too large");
  return neg ? -minor : minor;
}

export class Money {
  /** Integer amount in minor units (e.g. cents). */
  readonly amount: number;
  /** ISO 4217 code, upper-cased. */
  readonly currency: string;

  private constructor(minor: number, currency: string) {
    if (!Number.isInteger(minor)) {
      throw new TypeError(`Money amount must be an integer number of minor units, got ${minor}`);
    }
    this.amount = minor;
    this.currency = currency.toUpperCase();
  }

  /** From major units: `Money.of(19.99, "USD")` → 1999 minor units. */
  static of(major: number, currency: string): Money {
    return new Money(roundHalfUp(major * factorFor(currency)), currency);
  }

  /** From an integer count of minor units: `Money.fromMinor(1999, "USD")`. */
  static fromMinor(minor: number, currency: string): Money {
    return new Money(minor, currency);
  }

  /** Zero in a currency. */
  static zero(currency: string): Money {
    return new Money(0, currency);
  }

  /**
   * Parse a formatted string like "$1,234.56", "1.234,56 €", "¥1,234,567" or
   * "₹1,23,456" (best-effort, locale-agnostic — see {@link ParseMoneyOptions}).
   */
  static parse(input: string, currency: string, options: ParseMoneyOptions = {}): Money {
    return Money.fromMinor(parseMinor(input, currency, options), currency);
  }

  private assertSame(other: Money): void {
    if (other.currency !== this.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  add(other: Money): Money {
    this.assertSame(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSame(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  /** Multiply by a scalar (e.g. quantity or tax rate), rounding to whole minor units. */
  multiply(factor: number): Money {
    return new Money(roundHalfUp(this.amount * factor), this.currency);
  }

  /** Divide by a scalar, rounding to whole minor units. */
  divide(divisor: number): Money {
    if (divisor === 0) throw new Error("Division by zero");
    return new Money(roundHalfUp(this.amount / divisor), this.currency);
  }

  negate(): Money {
    return new Money(-this.amount, this.currency);
  }

  abs(): Money {
    return new Money(Math.abs(this.amount), this.currency);
  }

  /**
   * Split into parts by integer ratios, distributing leftover minor units to the
   * earliest parts so the sum always equals the original (no cent lost/created).
   * `money(10,"USD").allocate([1,1,1])` → 3.34, 3.33, 3.33.
   */
  allocate(ratios: number[]): Money[] {
    if (ratios.length === 0) throw new Error("allocate() needs at least one ratio");
    if (ratios.some((r) => r < 0)) throw new Error("allocate() ratios must be non-negative");
    const total = ratios.reduce((a, b) => a + b, 0);
    if (total === 0) throw new Error("allocate() ratios must not all be zero");
    const shares = ratios.map((r) => Math.floor((this.amount * r) / total));
    let remainder = this.amount - shares.reduce((a, b) => a + b, 0);
    // Hand out the remaining units one at a time to the parts with the biggest ratio.
    const order = ratios.map((r, i) => ({ r, i })).sort((a, b) => b.r - a.r);
    let k = 0;
    while (remainder > 0) {
      shares[order[k % order.length]!.i]! += 1;
      remainder--;
      k++;
    }
    return shares.map((s) => new Money(s, this.currency));
  }

  /** Split evenly into `n` parts, distributing the remainder fairly. */
  split(n: number): Money[] {
    if (!Number.isInteger(n) || n <= 0) throw new Error("split() needs a positive integer");
    return this.allocate(new Array(n).fill(1));
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }
  greaterThan(other: Money): boolean {
    this.assertSame(other);
    return this.amount > other.amount;
  }
  lessThan(other: Money): boolean {
    this.assertSame(other);
    return this.amount < other.amount;
  }
  greaterThanOrEqual(other: Money): boolean {
    this.assertSame(other);
    return this.amount >= other.amount;
  }
  lessThanOrEqual(other: Money): boolean {
    this.assertSame(other);
    return this.amount <= other.amount;
  }
  isZero(): boolean {
    return this.amount === 0;
  }
  isPositive(): boolean {
    return this.amount > 0;
  }
  isNegative(): boolean {
    return this.amount < 0;
  }

  /** The value in major units as a number (e.g. 19.99). Beware float for display — prefer format(). */
  toMajor(): number {
    return this.amount / factorFor(this.currency);
  }

  /** The raw integer minor-unit amount. */
  toMinor(): number {
    return this.amount;
  }

  /** Localized currency string, e.g. "$1,234.56" / "€1.234,56". */
  format(locale?: string, options?: Intl.NumberFormatOptions): string {
    const decimals = decimalsFor(this.currency);
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: this.currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        ...options,
      }).format(this.toMajor());
    } catch {
      // Unknown currency to Intl — fall back to a plain number + code.
      return `${this.toMajor().toFixed(decimals)} ${this.currency}`;
    }
  }

  toString(): string {
    return this.format();
  }

  toJSON(): { amount: number; currency: string } {
    return { amount: this.amount, currency: this.currency };
  }
}

/** Friendly constructor from major units: `money(19.99, "USD")`. */
export function money(major: number, currency: string): Money {
  return Money.of(major, currency);
}

/** Sum a list of Money (all same currency). Empty list requires a currency fallback. */
export function sumMoney(items: Money[], currency?: string): Money {
  if (items.length === 0) {
    if (!currency) throw new Error("sumMoney() of an empty list needs a currency");
    return Money.zero(currency);
  }
  return items.reduce((acc, m) => acc.add(m));
}

/** Alias of {@link sumMoney}: sum a list of same-currency Money. */
export const sum = sumMoney;

// ── New in 1.1.0 — additive, integer-safe helpers ─────────────────────────────
export { roundMinor, type RoundingMode } from "./rounding";
export { currencyExponent, currencySymbol } from "./currency";
export {
  add,
  subtract,
  multiply,
  divide,
  percentage,
  compare,
  minMoney,
  maxMoney,
  equals,
  allocate,
  split,
} from "./arithmetic";
export { formatBasic, parseMoney, type BasicFormatOptions } from "./format";
export { convert } from "./convert";

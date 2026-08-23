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

/** Minor-unit exponents for currencies that aren't the default 2. */
const EXPONENTS: Record<string, number> = {
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, HUF: 0, XAF: 0, XOF: 0, XPF: 0, RWF: 0, UGX: 0, GNF: 0,
  BHD: 3, KWD: 3, OMR: 3, TND: 3, IQD: 3, JOD: 3, LYD: 3,
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
  return n < 0 ? -Math.round(-n) : Math.round(n);
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
   * Parse a formatted string like "$1,234.56" or "1.234,56" (best-effort).
   * Non-digits except the last separator group are stripped.
   */
  static parse(input: string, currency: string): Money {
    const cleaned = input.replace(/[^\d.,-]/g, "").trim();
    if (!cleaned) throw new Error(`Cannot parse money from "${input}"`);
    const neg = /^-/.test(cleaned) || /-\d/.test(cleaned);
    let s = cleaned.replace(/-/g, "");
    // Decide the decimal separator: whichever of . or , comes last.
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    let decSep = "";
    if (lastDot >= 0 && lastComma >= 0) decSep = lastDot > lastComma ? "." : ",";
    else if (lastDot >= 0) decSep = ".";
    else if (lastComma >= 0) decSep = ",";
    let major: number;
    if (decSep) {
      const thousandsSep = decSep === "." ? "," : ".";
      s = s.split(thousandsSep).join("");
      major = Number(s.replace(decSep, "."));
    } else {
      major = Number(s);
    }
    if (Number.isNaN(major)) throw new Error(`Cannot parse money from "${input}"`);
    return Money.of(neg ? -major : major, currency);
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

/**
 * @lacspace/currency — ISO 4217: codes, numeric codes, minor units, names,
 * symbols, and Intl-free formatting that is identical on every runtime.
 *
 * ```ts
 * currency("npr")            // { code: "NPR", numeric: "524", minorUnits: 2, name: "Nepalese Rupee", symbol: "रू" }
 * minorUnits("JPY")          // 0
 * formatCurrency(1234.5, "EUR", { locale: "de" })  // "1.234,50 €"
 * toMinor(19.99, "USD")      // 1999
 * ```
 *
 * Zero dependencies · isomorphic · fully typed.
 */
import { ROWS } from "./data";

export interface Currency {
  /** ISO 4217 alphabetic code, e.g. "NPR". */
  code: string;
  /** ISO 4217 numeric code, zero-padded, e.g. "524". */
  numeric: string;
  /** Decimal places of the minor unit: 0 (JPY), 2 (USD), 3 (BHD), 4 (CLF). -1 for funds, metals and special codes. */
  minorUnits: number;
  /** English name from the ISO list. */
  name: string;
  /** Common symbol, "" when none is in general use. */
  symbol: string;
  /** True for precious metals, bond-market units, SDR, test and no-currency codes (X-codes without minor units). */
  isSpecial: boolean;
  /** "currency" for money in circulation; "fund" for ISO 4217 fund codes (BOV, CHE, CLF, MXV, USN, UYI, UYW, VED, …); "special" for X-codes. */
  kind: "currency" | "fund" | "special";
}

/** ISO 4217 codes that denote funds or units of account rather than circulating money. */
export const FUND_CODES: ReadonlySet<string> = new Set(["BOV", "CHE", "CHW", "CLF", "COU", "MXV", "USN", "UYI", "UYW", "VED"]);

const ALL: readonly Currency[] = ROWS.map(([code, numeric, minorUnits, name, symbol]) => ({
  code, numeric, minorUnits, name, symbol, isSpecial: minorUnits < 0,
  kind: minorUnits < 0 ? "special" : FUND_CODES.has(code) ? "fund" : "currency",
}));
const BY_CODE = new Map(ALL.map((c) => [c.code, c]));
const BY_NUMERIC = new Map(ALL.map((c) => [c.numeric, c]));

/**
 * All ISO 4217 codes, sorted by code. `{ special: false }` leaves out the X-codes
 * (metals, bond units, SDR, test); `{ funds: false }` also leaves out fund codes,
 * giving only money in circulation.
 */
export function currencies(opts: { special?: boolean; funds?: boolean } = {}): Currency[] {
  return ALL.filter((c) => (opts.special !== false || !c.isSpecial) && (opts.funds !== false || c.kind !== "fund"));
}

/** Look up by alphabetic or numeric code, in any case. `undefined` when unknown. */
export function currency(code: string | number): Currency | undefined {
  if (typeof code === "number") return BY_NUMERIC.get(String(code).padStart(3, "0"));
  const q = code.trim().toUpperCase();
  if (/^\d{1,3}$/.test(q)) return BY_NUMERIC.get(q.padStart(3, "0"));
  return BY_CODE.get(q);
}

/** Is this an active ISO 4217 code? (case-insensitive) */
export function isCurrencyCode(code: unknown): code is string {
  return typeof code === "string" && BY_CODE.has(code.trim().toUpperCase());
}

/** Decimal places of the minor unit. Unknown codes default to 2; special codes report 0. */
export function minorUnits(code: string): number {
  const c = currency(code);
  if (!c) return 2;
  return c.minorUnits < 0 ? 0 : c.minorUnits;
}

/** Symbol for a code, or the code itself when there is no common symbol. */
export function currencySymbol(code: string): string {
  const c = currency(code);
  return c?.symbol || (c?.code ?? code.toUpperCase());
}

/** English name, or `undefined`. */
export function currencyName(code: string | number): string | undefined {
  return currency(code)?.name;
}

/** Major → integer minor units, rounding half away from zero on the decimal the caller wrote. */
export function toMinor(major: number, code: string): number {
  const factor = 10 ** minorUnits(code);
  const scaled = Number((major * factor).toPrecision(15));
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

/** Integer minor units → major as a number (for display prefer `formatCurrency`). */
export function fromMinor(minor: number, code: string): number {
  return minor / 10 ** minorUnits(code);
}

export interface FormatOptions {
  /** "en" (1,234.56), "de" (1.234,56), "fr" (1 234,56), "ch" (1'234.56), "in" (12,34,567.89). Default "en". */
  locale?: "en" | "de" | "fr" | "ch" | "in";
  /** Show the symbol (default), the ISO code, or nothing. */
  display?: "symbol" | "code" | "none";
  /** Override the number of decimals (defaults to the currency's minor units). */
  decimals?: number;
}

const LOCALES: Record<NonNullable<FormatOptions["locale"]>, { group: string; decimal: string; suffix: boolean; indian?: boolean }> = {
  en: { group: ",", decimal: ".", suffix: false },
  de: { group: ".", decimal: ",", suffix: true },
  fr: { group: " ", decimal: ",", suffix: true },
  ch: { group: "'", decimal: ".", suffix: false },
  in: { group: ",", decimal: ".", suffix: false, indian: true },
};

/**
 * Deterministic, Intl-free formatting. `formatCurrency(1234.5, "USD")` → "$1,234.50";
 * `formatCurrency(1234, "JPY")` → "¥1,234"; `formatCurrency(1234.5, "EUR", { locale: "de" })` → "1.234,50 €".
 */
export function formatCurrency(amount: number, code: string, opts: FormatOptions = {}): string {
  const loc = LOCALES[opts.locale ?? "en"];
  const decimals = opts.decimals ?? minorUnits(code);
  const negative = amount < 0;
  const fixed = Math.abs(amount).toFixed(decimals);
  const [intPart, frac] = fixed.split(".");
  const grouped = loc.indian
    ? intPart!.replace(/(\d)(?=(\d{2})+\d$)/g, "$1,").replace(/^(\d+),(?=\d{3}$)/, "$1,")
    : intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, loc.group);
  const digits = loc.indian ? indianGroup(intPart!) : grouped;
  const number = frac ? `${digits}${loc.decimal}${frac}` : digits;
  const display = opts.display ?? "symbol";
  const c = currency(code);
  const sign = display === "none" ? "" : display === "code" ? (c?.code ?? code.toUpperCase()) : currencySymbol(code);
  let out: string;
  if (!sign) out = number;
  else if (loc.suffix || display === "code") out = `${number} ${sign}`;
  else out = `${sign}${number}`;
  return negative ? `-${out}` : out;
}

function indianGroup(int: string): string {
  if (int.length <= 3) return int;
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/**
 * Formatting & parsing helpers that live *outside* `Intl`.
 *
 * `Money.prototype.format` already uses `Intl.NumberFormat`; {@link formatBasic}
 * is a fully deterministic, no-Intl fallback for constrained runtimes or tests,
 * and {@link parseMoney} turns a human string into raw integer minor units.
 */
import { Money, decimalsFor } from "./index";
import { currencySymbol } from "./currency";

export interface BasicFormatOptions {
  /** Symbol/prefix to use. Defaults to the currency's known symbol (e.g. "$"). */
  symbol?: string;
  /** Put the symbol before or after the number. Default `"prefix"`. */
  symbolPosition?: "prefix" | "suffix";
  /** Thousands group separator. Default `","`. */
  groupSeparator?: string;
  /** Decimal separator. Default `"."`. */
  decimalSeparator?: string;
  /** Override the number of decimal places (defaults to the currency exponent). */
  decimals?: number;
  /** Space between symbol and number. Default `""` for prefix, `" "` for suffix. */
  spacing?: string;
}

/**
 * Deterministic, `Intl`-free currency formatting.
 * `formatBasic(money(1234.56, "USD"))` → `"$1,234.56"`.
 * `formatBasic(money(1000, "JPY"))` → `"¥1,000"` (0 decimals).
 */
export function formatBasic(m: Money, options: BasicFormatOptions = {}): string {
  const decimals = options.decimals ?? decimalsFor(m.currency);
  const group = options.groupSeparator ?? ",";
  const dec = options.decimalSeparator ?? ".";
  const symbol = options.symbol ?? currencySymbol(m.currency);
  const position = options.symbolPosition ?? "prefix";

  const negative = m.isNegative();
  const minor = Math.abs(m.toMinor());
  const factor = Math.pow(10, decimals);
  const intPart = Math.floor(minor / factor);
  const fracPart = minor - intPart * factor;

  // Group the integer part in threes without touching floats.
  const intStr = String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, group);
  let numeric = intStr;
  if (decimals > 0) {
    numeric += dec + String(fracPart).padStart(decimals, "0");
  }

  const spacing = options.spacing ?? (position === "suffix" ? " " : "");
  const body = position === "prefix" ? `${symbol}${spacing}${numeric}` : `${numeric}${spacing}${symbol}`;
  return negative ? `-${body}` : body;
}

/**
 * Parse a human money string into raw **integer minor units** for a currency.
 * `parseMoney("$1,234.56", "USD")` → `123456`.
 *
 * Best-effort and locale-agnostic (see the `Money.parse` note in the README):
 * whichever of `.` / `,` appears last is treated as the decimal separator.
 */
export function parseMoney(input: string, currency: string): number {
  return Money.parse(input, currency).toMinor();
}

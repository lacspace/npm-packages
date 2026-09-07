/**
 * Currency metadata — minor-unit exponents and a small symbol table.
 *
 * The canonical exponent source is {@link decimalsFor} in `index.ts`;
 * {@link currencyExponent} is a same-behaviour alias with the more discoverable
 * name asked for by finance code (USD→2, JPY→0, NPR→2, BHD→3, …).
 */
import { decimalsFor } from "./index";

/**
 * How many decimal places (the ISO-4217 exponent) a currency uses.
 * Alias of {@link decimalsFor}. USD→2, JPY→0, NPR→2, BHD→3, KWD→3.
 */
export function currencyExponent(currency: string): number {
  return decimalsFor(currency);
}

/** A handful of common currency symbols for the no-Intl fallback formatter. */
const SYMBOLS: Record<string, string> = {
  USD: "$", CAD: "$", AUD: "$", NZD: "$", SGD: "$", HKD: "$", MXN: "$",
  EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹", NPR: "रू", KRW: "₩",
  RUB: "₽", TRY: "₺", BRL: "R$", ZAR: "R", CHF: "CHF", THB: "฿", VND: "₫",
  PHP: "₱", IDR: "Rp", MYR: "RM", PKR: "₨", LKR: "₨", BDT: "৳", AED: "د.إ",
  SAR: "﷼", BHD: "ب.د", KWD: "د.ك", ILS: "₪", PLN: "zł", SEK: "kr", NOK: "kr",
  DKK: "kr", CZK: "Kč", NGN: "₦", GHS: "₵", KES: "KSh", UAH: "₴",
};

/**
 * Best-effort currency symbol for a code, e.g. `"USD"→"$"`, `"NPR"→"रू"`.
 * Falls back to the upper-cased code itself when unknown.
 */
export function currencySymbol(currency: string): string {
  const code = currency.toUpperCase();
  return SYMBOLS[code] ?? code;
}

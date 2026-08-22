/**
 * @lacspace/nepali-utils — everyday Nepal helpers: NPR currency formatting,
 * Nepali (South-Asian) digit grouping, Devanagari numerals, amount-in-words,
 * common validators, and province data. Zero-dependency, isomorphic.
 */

const DEVANAGARI = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"] as const;

/** Convert Arabic numerals to Devanagari: `"2081"` → `"२०८१"`. */
export function toDevanagari(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => DEVANAGARI[Number(d)]!);
}

/** Convert Devanagari numerals to Arabic: `"२०८१"` → `"2081"`. */
export function fromDevanagari(input: string): string {
  return input.replace(/[०-९]/g, (d) => String(DEVANAGARI.indexOf(d as (typeof DEVANAGARI)[number])));
}

/**
 * Group an integer with the South-Asian (Nepali) system: the last three digits,
 * then groups of two. `1234567` → `"12,34,567"`.
 */
export function groupNepali(value: number | string): string {
  const s = String(value).replace(/[^\d]/g, "");
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

export interface FormatNprOptions {
  /** Show a symbol/prefix. Default `"Rs. "`. Use `""` for none. */
  symbol?: string;
  /** Number of decimal places. Default `2`. */
  decimals?: number;
  /** Render digits in Devanagari. Default `false`. */
  devanagari?: boolean;
}

/**
 * Format an amount as Nepalese Rupees with South-Asian grouping.
 * `formatNPR(1234567.5)` → `"Rs. 12,34,567.50"`.
 */
export function formatNPR(amount: number, options: FormatNprOptions = {}): string {
  const { symbol = "Rs. ", decimals = 2, devanagari = false } = options;
  const negative = amount < 0;
  const fixed = Math.abs(amount).toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  let out = groupNepali(intPart!);
  if (decPart) out += "." + decPart;
  if (devanagari) out = toDevanagari(out);
  return (negative ? "-" : "") + symbol + out;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n]!;
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t]! + (o ? " " + ONES[o] : "");
}

/**
 * Amount in words using the South-Asian system (Thousand, Lakh, Crore, Arab) —
 * perfect for invoices. `numberToWords(1234567)` →
 * `"Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven"`.
 */
export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const units: [number, string][] = [
    [1e9, "Arab"],
    [1e7, "Crore"],
    [1e5, "Lakh"],
    [1e3, "Thousand"],
    [1e2, "Hundred"],
  ];
  for (const [size, name] of units) {
    if (n >= size) {
      const count = Math.floor(n / size);
      // Hundreds are 1–9; the higher units take up to two digits.
      parts.push((size === 100 ? ONES[count] : twoDigitWords(count)) + " " + name);
      n %= size;
    }
  }
  if (n > 0) parts.push(twoDigitWords(n));
  return (value < 0 ? "Minus " : "") + parts.join(" ");
}

/** `numberToWords` plus a "Rupees … only" wrapper for invoices. */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paisa = Math.round((Math.abs(amount) - rupees) * 100);
  let out = "Rupees " + numberToWords(rupees);
  if (paisa > 0) out += " and " + numberToWords(paisa) + " Paisa";
  return (amount < 0 ? "Minus " : "") + out + " Only";
}

/** True for a valid Nepali mobile number (10 digits starting 96–98, optional +977). */
export function isValidNepaliMobile(input: string): boolean {
  const s = input.replace(/[\s-]/g, "");
  return /^(\+?977)?9[678]\d{8}$/.test(s);
}

/** True for a valid Nepal PAN / VAT number (9 digits). */
export function isValidPAN(input: string): boolean {
  return /^\d{9}$/.test(input.trim());
}

export interface Province {
  number: number;
  name: string;
  nameNp: string;
  capital: string;
}

/** Nepal's seven federal provinces. */
export const PROVINCES: readonly Province[] = [
  { number: 1, name: "Koshi", nameNp: "कोशी", capital: "Biratnagar" },
  { number: 2, name: "Madhesh", nameNp: "मधेश", capital: "Janakpur" },
  { number: 3, name: "Bagmati", nameNp: "बागमती", capital: "Hetauda" },
  { number: 4, name: "Gandaki", nameNp: "गण्डकी", capital: "Pokhara" },
  { number: 5, name: "Lumbini", nameNp: "लुम्बिनी", capital: "Deukhuri" },
  { number: 6, name: "Karnali", nameNp: "कर्णाली", capital: "Birendranagar" },
  { number: 7, name: "Sudurpashchim", nameNp: "सुदूरपश्चिम", capital: "Godawari" },
];

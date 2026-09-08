/**
 * @lacspace/nepali-utils — additive extras (New in 1.2.0):
 * Roman (transliterated) Nepali amount-in-words, integer-paisa-aware NPR
 * format/parse, digit-conversion aliases, extra shape validators
 * (vehicle plate, citizenship number), and province lookup helpers.
 *
 * All zero-dependency and isomorphic. New logic only references the shared
 * helpers from `./index` inside function bodies (never at module top level),
 * so the re-export cycle stays safe.
 */

import {
  toDevanagari,
  fromDevanagari,
  groupNepali,
  ungroupNepali,
  PROVINCES,
  DISTRICTS,
  type Province,
  type District,
} from "./index";

/* ------------------------------ digit aliases ------------------------------ */

/** Alias of {@link toDevanagari} — Arabic → Nepali (Devanagari) digits: `"2081"` → `"२०८१"`. */
export function toNepaliDigits(input: string | number): string {
  return toDevanagari(input);
}

/** Alias of {@link fromDevanagari} — Nepali (Devanagari) → Arabic digits: `"२०८१"` → `"2081"`. */
export function toEnglishDigits(input: string): string {
  return fromDevanagari(input);
}

/* --------------------- Roman (transliterated) Nepali words --------------------- */

/** Transliterated (Roman) Nepali number words 0–99 — parallels the Devanagari `NEPALI_0_99`. */
const ROMAN_0_99 = [
  "Sunya", "Ek", "Dui", "Tin", "Char", "Panch", "Chha", "Sat", "Aath", "Nau",
  "Das", "Eghara", "Bahra", "Tehra", "Chaudha", "Pandhra", "Sohra", "Satra", "Athara", "Unnais",
  "Bis", "Ekkais", "Bais", "Teis", "Chaubis", "Pachchis", "Chhabbis", "Sattais", "Aththais", "Unantis",
  "Tis", "Ekatis", "Battis", "Tettis", "Chauntis", "Paintis", "Chhattis", "Saintis", "Athtis", "Unanchalis",
  "Chalis", "Ekachalis", "Bayalis", "Trichalis", "Chawalis", "Paintalis", "Chhayalis", "Satchalis", "Athchalis", "Unanchas",
  "Pachas", "Ekaunna", "Baunna", "Tripanna", "Chawanna", "Pachpanna", "Chhapanna", "Santaunna", "Anthaunna", "Unansathi",
  "Sathi", "Eksatthi", "Baisatthi", "Trisatthi", "Chausatthi", "Paisatthi", "Chhaisatthi", "Satsatthi", "Athsatthi", "Unansattari",
  "Sattari", "Ekahattar", "Bahattar", "Trihattar", "Chauhattar", "Pachhattar", "Chhaihattar", "Sathattar", "Athhattar", "Unasi",
  "Asi", "Ekasi", "Bayasi", "Triyasi", "Chaurasi", "Pachasi", "Chhayasi", "Satasi", "Athasi", "Unannabbe",
  "Nabbe", "Ekanabbe", "Bayanabbe", "Triyanabbe", "Chauranabbe", "Panchanabbe", "Chhayanabbe", "Santanabbe", "Anthanabbe", "Unansaya",
];

/**
 * Amount in words in **transliterated (Roman) Nepali**, South-Asian scale —
 * the same reading as {@link numberToWordsNepali} but in Latin letters.
 * `numberToWordsNepaliRoman(1234567)` → `"Bahra Lakh Chauntis Hajar Panch Saya Satsatthi"`.
 */
export function numberToWordsNepaliRoman(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return ROMAN_0_99[0]!;
  const parts: string[] = [];
  const units: [number, string][] = [
    [1e9, "Arab"],
    [1e7, "Karod"],
    [1e5, "Lakh"],
    [1e3, "Hajar"],
    [1e2, "Saya"],
  ];
  for (const [size, name] of units) {
    if (n >= size) {
      const count = Math.floor(n / size);
      const words = count >= 100 ? numberToWordsNepaliRoman(count) : ROMAN_0_99[count]!;
      parts.push(`${words} ${name}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(ROMAN_0_99[n]!);
  return (value < 0 ? "Mainas " : "") + parts.join(" ");
}

/** `numberToWordsNepaliRoman` plus a "Rupaiyan … Matra" wrapper for invoices. */
export function amountInWordsNepaliRoman(amount: number): string {
  let rupees = Math.floor(Math.abs(amount));
  let paisa = Math.round((Math.abs(amount) - rupees) * 100);
  if (paisa === 100) { rupees += 1; paisa = 0; }
  let out = "Rupaiyan " + numberToWordsNepaliRoman(rupees);
  if (paisa > 0) out += " " + numberToWordsNepaliRoman(paisa) + " Paisa";
  return (amount < 0 ? "Mainas " : "") + out + " Matra";
}

/* --------------------------- integer-paisa NPR --------------------------- */

/** Options for {@link formatNPRFromPaisa} — a paisa-native subset of the NPR format options. */
export interface PaisaFormatOptions {
  /** Show a symbol/prefix. Default `"Rs. "`. Use `""` for none. */
  symbol?: string;
  /** Render digits in Devanagari. Default `false`. */
  devanagari?: boolean;
  /** Include the two-digit paisa fraction. Default `true`. */
  paisa?: boolean;
}

/**
 * Parse a formatted NPR / Nepali-grouped string to an **integer number of paisa**
 * (1 rupee = 100 paisa), avoiding float drift. `"Rs. 12,34,567.50"` → `123456750`.
 * Returns `NaN` for unparseable input.
 */
export function parseNPRToPaisa(input: string | number): number {
  const rupees = ungroupNepali(input);
  if (Number.isNaN(rupees)) return NaN;
  return Math.round(rupees * 100);
}

/**
 * Format an **integer number of paisa** as an NPR string with South-Asian grouping.
 * `formatNPRFromPaisa(123456750)` → `"Rs. 12,34,567.50"`.
 */
export function formatNPRFromPaisa(paisa: number, options: PaisaFormatOptions = {}): string {
  const { symbol = "Rs. ", devanagari = false, paisa: showPaisa = true } = options;
  const negative = paisa < 0;
  const abs = Math.abs(Math.round(paisa));
  const rupees = Math.floor(abs / 100);
  const frac = abs % 100;
  let out = groupNepali(rupees);
  if (showPaisa) out += "." + String(frac).padStart(2, "0");
  if (devanagari) out = toDevanagari(out);
  return (negative ? "-" : "") + symbol + out;
}

/* --------------------------- extra validators --------------------------- */

/**
 * Loose **shape** check for a Nepali vehicle number plate — accepts both the
 * zonal ("Ba 2 Kha 1234" / "बा २ ख १२३४") and province-embossed
 * ("Province 3 01 002 KHA 1234"-style) textual forms. Devanagari or Latin
 * letters, Devanagari or Arabic digits. Returns a boolean (shape only, not a
 * registry lookup).
 */
export function isValidVehiclePlate(input: string): boolean {
  const s = fromDevanagari(String(input)).trim().replace(/[\s.\-]+/g, " ").trim();
  if (!s) return false;
  // <zone/province token> <lot number> <series letter(s)> <1-4 digit number>
  return /^([A-Za-zऀ-ॿ]{1,3}|[1-7])( \d{1,2})?( [A-Za-zऀ-ॿ]{1,3})? \d{1,4}$/.test(s)
    && /[A-Za-zऀ-ॿ]/.test(s); // must contain at least one letter token
}

/**
 * Loose **shape** check for a Nepali citizenship (nagarikta) number — accepts
 * digit groups optionally separated by `-` or `/` (Devanagari or Arabic digits),
 * total 6–15 digits. Returns a boolean (shape only, not a registry lookup).
 */
export function isValidCitizenshipNumber(input: string): boolean {
  const s = fromDevanagari(String(input)).trim();
  if (!/^[\d\-/\s]+$/.test(s)) return false;
  const digits = s.replace(/[^\d]/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

/* --------------------------- geo lookups --------------------------- */

/** Find a province by number (1–7) or English/Nepali name (case-insensitive). */
export function findProvince(query: string | number): Province | undefined {
  if (typeof query === "number") return PROVINCES.find((p) => p.number === query);
  const raw = String(query).trim();
  const q = raw.toLowerCase();
  return PROVINCES.find((p) => p.name.toLowerCase() === q || p.nameNp === raw || String(p.number) === q);
}

/** The {@link Province} a district belongs to, found by English or Nepali district name. */
export function provinceOfDistrict(districtName: string): Province | undefined {
  const raw = String(districtName).trim();
  const q = raw.toLowerCase();
  const d: District | undefined = DISTRICTS.find((x) => x.name.toLowerCase() === q || x.nameNp === raw);
  return d ? PROVINCES.find((p) => p.number === d.province) : undefined;
}

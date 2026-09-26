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
    [1e15, "Padma"],
    [1e13, "Neel"],
    [1e11, "Kharab"],
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
  if (paisa > 0) out += " ra " + numberToWordsNepaliRoman(paisa) + " Paisa";
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

const PROVINCE_NAMES = ["koshi", "madhesh", "bagmati", "gandaki", "lumbini", "karnali", "sudurpashchim", "sudurpaschim", "कोशी", "मधेश", "बागमती", "गण्डकी", "लुम्बिनी", "कर्णाली", "सुदूरपश्चिम"];
const PROVINCE_KEYWORDS = ["province", "pradesh", "प्रदेश", "प्र"];
const NUMBER_WORDS = ["no", "no.", "number", "नं", "नं."];
const LETTERS = /^[A-Za-z\u0900-\u097F]{1,4}$/; // Latin or Devanagari (incl. conjuncts like "प्र")
const DIGITS = /^\d+$/;

/**
 * Loose **shape** check for a Nepali vehicle number plate. Accepts:
 * - zonal plates: `"Ba 1 Pa 1234"`, `"Ba 2 Kha 1234"`, `"बा २ ख १२३४"`, `"Ba 1-1234"`;
 * - embossed / province plates: `"BAGMATI B AB 0123"`, `"Bagmati Pradesh 01-002 Pa 1234"`,
 *   `"Gandaki Province B AB 0123"`, `"PROVINCE 3 B AB 0123"`, `"Pradesh No 3 01 002 Kha 1234"`,
 *   `"3 B AB 0123"`, `"प्रदेश ३ ख ०१२३"`, `"बागमती प्रदेश ०१-००२ प १२३४"`.
 * A province number, when present, must be 1–7. Devanagari or Latin letters,
 * Devanagari or Arabic digits, any of space / `-` / `.` / `/` as separators.
 * Returns a boolean (shape only, not a registry lookup).
 */
export function isValidVehiclePlate(input: string): boolean {
  const s = fromDevanagari(String(input)).trim().replace(/[\s.\-/]+/g, " ").trim();
  if (!s) return false;
  const t = s.split(" ");
  if (t.length < 2 || t.length > 8) return false;
  const last = t[t.length - 1]!;
  if (!DIGITS.test(last) || last.length > 4) return false; // serial number
  const head = t.slice(0, -1);
  let i = 0;
  const low = (k: number) => (head[k] ?? "").toLowerCase();
  let provincePrefix = false;
  if (PROVINCE_NAMES.includes(low(i))) { i += 1; provincePrefix = true; }
  if (PROVINCE_KEYWORDS.includes(low(i))) { i += 1; provincePrefix = true; }
  if (provincePrefix && NUMBER_WORDS.includes(low(i))) i += 1;
  // a single digit right after a province word, or as the very first token, is the province number
  if (head[i] !== undefined && /^\d$/.test(head[i]!) && (provincePrefix || i === 0)) {
    if (!/^[1-7]$/.test(head[i]!)) return false;
    i += 1;
    provincePrefix = true;
  }
  const rest = head.slice(i);
  if (rest.length === 0) return provincePrefix; // e.g. "3 0123", "Bagmati 1234"
  let letters = 0;
  for (const tok of rest) {
    if (LETTERS.test(tok)) letters += 1;
    else if (DIGITS.test(tok) && tok.length <= 3) continue;
    else return false;
  }
  return letters >= (provincePrefix ? 0 : 1) && letters <= 3;
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

/** The {@link Province} a district belongs to, found by English or Nepali district name or alias. */
export function provinceOfDistrict(districtName: string): Province | undefined {
  const raw = String(districtName).trim();
  const q = raw.toLowerCase();
  const d: District | undefined = DISTRICTS.find(
    (x) => x.name.toLowerCase() === q || x.nameNp === raw || (x.aliases ?? []).some((a) => a.toLowerCase() === q),
  );
  return d ? PROVINCES.find((p) => p.number === d.province) : undefined;
}

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
  const str = String(value).trim();
  const negative = str.startsWith("-");
  const sign = negative ? "-" : "";
  const s = str.replace(/[^\d]/g, "");
  if (s.length <= 3) return sign + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return sign + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
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
 * Amount in words using the South-Asian system (Thousand, Lakh, Crore, Arab, Kharab, Neel, Padma) —
 * perfect for invoices. `numberToWords(1234567)` →
 * `"Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven"`.
 */
export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const units: [number, string][] = [
    [1e15, "Padma"],
    [1e13, "Neel"],
    [1e11, "Kharab"],
    [1e9, "Arab"],
    [1e7, "Crore"],
    [1e5, "Lakh"],
    [1e3, "Thousand"],
    [1e2, "Hundred"],
  ];
  for (const [size, name] of units) {
    if (n >= size) {
      const count = Math.floor(n / size);
      // Hundreds are 1–9; middle units take two digits; the top (Padma) unit can
      // itself run into the hundreds/thousands, so render its count recursively.
      const words = size === 100 ? ONES[count]! : count >= 100 ? numberToWords(count) : twoDigitWords(count);
      parts.push(words + " " + name);
      n %= size;
    }
  }
  if (n > 0) parts.push(twoDigitWords(n));
  return (value < 0 ? "Minus " : "") + parts.join(" ");
}

/** `numberToWords` plus a "Rupees … only" wrapper for invoices. */
export function amountInWords(amount: number): string {
  let rupees = Math.floor(Math.abs(amount));
  let paisa = Math.round((Math.abs(amount) - rupees) * 100);
  if (paisa === 100) { rupees += 1; paisa = 0; }
  let out = "Rupees " + numberToWords(rupees);
  if (paisa > 0) out += " and " + numberToWords(paisa) + " Paisa";
  return (amount < 0 ? "Minus " : "") + out + " Only";
}

/** Parse a formatted NPR/Nepali-grouped string back to a number (inverse of {@link formatNPR}). */
export function ungroupNepali(input: string | number): number {
  let s = fromDevanagari(String(input)).trim();
  const negative = s.startsWith("-");
  s = s.replace(/₹|rs\.?|npr|रू\.?|रु\.?/gi, ""); // strip currency symbols (incl. the dot in "Rs.")
  s = s.replace(/[^\d.]/g, ""); // drop grouping commas, spaces, everything else
  if (s === "") return NaN;
  const num = Number(s);
  return negative && !Number.isNaN(num) ? -num : num;
}

/** Alias of {@link ungroupNepali} — parse an NPR string to a number. */
export const parseNPR = ungroupNepali;

function trimNum(n: number): string {
  return Number(n.toFixed(2)).toString();
}

export interface CompactNprOptions {
  symbol?: string;
  /** Use Nepali scale words (हजार/लाख/करोड/अरब/खरब). Default false (K/Lakh/Cr/Arab/Kharab). */
  nepali?: boolean;
  /** Render digits in Devanagari. Default false. */
  devanagari?: boolean;
}

/** Compact NPR: `formatCompactNPR(1234567)` → `"Rs. 12.35 Lakh"`. */
export function formatCompactNPR(amount: number, options: CompactNprOptions = {}): string {
  const { symbol = "Rs. ", nepali = false, devanagari = false } = options;
  const negative = amount < 0;
  const a = Math.abs(amount);
  const units: [number, string, string][] = [
    [1e15, "Padma", "पद्म"],
    [1e13, "Neel", "नील"],
    [1e11, "Kharab", "खरब"],
    [1e9, "Arab", "अरब"],
    [1e7, "Cr", "करोड"],
    [1e5, "Lakh", "लाख"],
    [1e3, "K", "हजार"],
  ];
  let out: string;
  const u = units.find(([size]) => a >= size);
  if (u) out = `${trimNum(a / u[0])} ${nepali ? u[2] : u[1]}`;
  else out = trimNum(a);
  if (devanagari) out = toDevanagari(out);
  return (negative ? "-" : "") + symbol + out;
}

/* ------------------------------ land-area units ------------------------------ */

export type LandUnit = "ropani" | "aana" | "paisa" | "daam" | "bigha" | "kattha" | "dhur" | "sqm" | "sqft";

const SQFT = 0.09290304; // exact: 1 international foot = 0.3048 m
const ROPANI = 5476 * SQFT; // 508.73704704 m²
const BIGHA = 72900 * SQFT; // 6772.631616 m²

/**
 * Area of one unit in square metres (hilly = ropani system, terai = bigha system).
 * Every sub-unit is derived from its parent (ropani/16/64/256, bigha/20/400), so
 * unit ratios are exact and `convertLand(1, "ropani", "daam")` is exactly 256.
 */
export const LAND_UNIT_SQM: Record<LandUnit, number> = {
  ropani: ROPANI,
  aana: ROPANI / 16,
  paisa: ROPANI / 64,
  daam: ROPANI / 256,
  bigha: BIGHA,
  kattha: BIGHA / 20,
  dhur: BIGHA / 400,
  sqm: 1,
  sqft: SQFT,
};

/** Total square metres from a mixed measure, e.g. `{ ropani: 2, aana: 3 }` or `{ bigha: 1, kattha: 5 }`. */
export function landToSqMeters(measure: Partial<Record<LandUnit, number>>): number {
  let m2 = 0;
  for (const [unit, value] of Object.entries(measure)) m2 += (value ?? 0) * LAND_UNIT_SQM[unit as LandUnit];
  return m2;
}

/** Convert an area between any two land units. */
export function convertLand(value: number, from: LandUnit, to: LandUnit): number {
  return (value * LAND_UNIT_SQM[from]) / LAND_UNIT_SQM[to];
}

/**
 * Break square metres into the hilly system: `{ ropani, aana, paisa, daam }`.
 * Rounds to the nearest whole daam first, then carries daam → paisa → aana →
 * ropani, so `4 daam` never appears (it is `1 paisa`) and float noise from
 * `landToSqMeters` cannot leave a unit one short.
 */
export interface LandBreakdownOptions {
  /** Decimal places kept on the smallest unit (daam / dhur). Default `0` (whole units). */
  decimals?: number;
}

const roundTo = (n: number, d: number) => { const f = 10 ** d; return Math.round(n * f) / f; };

export function sqMetersToRopani(m2: number, options: LandBreakdownOptions = {}): { ropani: number; aana: number; paisa: number; daam: number } {
  const d = Math.max(0, Math.min(6, Math.floor(options.decimals ?? 0)));
  const neg = m2 < 0 ? -1 : 1;
  const total = roundTo(Math.abs(m2) / LAND_UNIT_SQM.daam, d); // daam, rounded once
  const ropani = Math.floor(total / 256 + 1e-9);
  const aana = Math.floor((total - ropani * 256) / 16 + 1e-9);
  const paisa = Math.floor((total - ropani * 256 - aana * 16) / 4 + 1e-9);
  const daam = roundTo(total - ropani * 256 - aana * 16 - paisa * 4, d);
  const z = (v: number) => (v === 0 ? 0 : neg * v);
  return { ropani: z(ropani), aana: z(aana), paisa: z(paisa), daam: z(daam) };
}

/**
 * Break square metres into the terai system: `{ bigha, kattha, dhur }`.
 * Rounds to the nearest whole dhur first, then carries dhur → kattha → bigha,
 * so `20 dhur` becomes `1 kattha` and `20 kattha` becomes `1 bigha`.
 */
export function sqMetersToBigha(m2: number, options: LandBreakdownOptions = {}): { bigha: number; kattha: number; dhur: number } {
  const d = Math.max(0, Math.min(6, Math.floor(options.decimals ?? 0)));
  const neg = m2 < 0 ? -1 : 1;
  const total = roundTo(Math.abs(m2) / LAND_UNIT_SQM.dhur, d); // dhur, rounded once
  const bigha = Math.floor(total / 400 + 1e-9);
  const kattha = Math.floor((total - bigha * 400) / 20 + 1e-9);
  const dhur = roundTo(total - bigha * 400 - kattha * 20, d);
  const z = (v: number) => (v === 0 ? 0 : neg * v);
  return { bigha: z(bigha), kattha: z(kattha), dhur: z(dhur) };
}

/** `"2-3-1-0"` ropani-aana-paisa-daam from square metres. */
export function formatRopani(m2: number): string {
  const r = sqMetersToRopani(m2);
  return `${r.ropani}-${r.aana}-${r.paisa}-${r.daam}`;
}

/** `"1-5-0"` bigha-kattha-dhur from square metres. */
export function formatBigha(m2: number): string {
  const b = sqMetersToBigha(m2);
  return `${b.bigha}-${b.kattha}-${b.dhur}`;
}

/* ------------------------------ phone & validators ------------------------------ */

/** Normalize a Nepali mobile to canonical `+9779XXXXXXXXX`, or null if invalid. */
export function normalizeMobile(input: string): string | null {
  let s = fromDevanagari(input).replace(/[\s-]/g, "");
  // Strip the country code only when a full 10-digit number follows it, so a
  // 10-digit mobile that itself starts with 977 is not mangled.
  const m = /^\+?977(\d{10})$/.exec(s);
  if (m) s = m[1]!;
  else if (s.startsWith("+")) return null;
  return /^9[678]\d{8}$/.test(s) ? `+977${s}` : null;
}

export type Carrier = "Ntc" | "Ncell" | "Smart Cell" | "UTL" | "unknown";

/**
 * Three-digit mobile prefixes (after +977) per carrier. Nepal Telecom and Ncell
 * are the only live mobile operators (2026); Smart Cell and UTL prefixes are
 * kept so old numbers still resolve, flagged by `CARRIER_STATUS`.
 */
export const CARRIER_PREFIXES: Record<Exclude<Carrier, "unknown">, readonly string[]> = {
  Ntc: ["984", "985", "986", "974", "975", "976"],
  Ncell: ["980", "981", "982", "970"],
  "Smart Cell": ["961", "962", "988"],
  UTL: ["972"],
};

/** Whether a carrier still operates a mobile network (NTA licence status, 2026). */
export const CARRIER_STATUS: Record<Exclude<Carrier, "unknown">, "active" | "defunct"> = {
  Ntc: "active",
  Ncell: "active",
  "Smart Cell": "defunct",
  UTL: "defunct",
};

/** Detect the carrier of a Nepali mobile number (see {@link CARRIER_PREFIXES}). */
export function getCarrier(input: string): Carrier {
  const n = normalizeMobile(input);
  if (!n) return "unknown";
  const p = n.slice(4, 7); // three digits after +977
  for (const [carrier, prefixes] of Object.entries(CARRIER_PREFIXES)) if (prefixes.includes(p)) return carrier as Carrier;
  return "unknown";
}

/** True for a valid Nepali mobile number (10 digits starting 96–98, optional +977). */
export function isValidNepaliMobile(input: string): boolean {
  return normalizeMobile(input) !== null; // one rule for both, so they always agree
}

/** True for a plausible Nepal landline (area code + number, e.g. 01-4XXXXXX). */
export function isValidLandline(input: string): boolean {
  const s = fromDevanagari(input).replace(/[\s-]/g, "");
  return /^0\d{7,9}$/.test(s);
}

/** True for a valid Nepal PAN / VAT number (9 digits). */
export function isValidPAN(input: string): boolean {
  return /^\d{9}$/.test(fromDevanagari(input).trim());
}

/** True for a valid Nepal VAT number (9 digits — same format as PAN). */
export const isValidVAT = isValidPAN;

/* ------------------------------ Nepali amount in words ------------------------------ */

const NEPALI_0_99 = [
  "शून्य", "एक", "दुई", "तीन", "चार", "पाँच", "छ", "सात", "आठ", "नौ",
  "दस", "एघार", "बाह्र", "तेह्र", "चौध", "पन्ध्र", "सोह्र", "सत्र", "अठार", "उन्नाइस",
  "बीस", "एक्काइस", "बाइस", "तेइस", "चौबिस", "पच्चिस", "छब्बिस", "सत्ताइस", "अठ्ठाइस", "उनन्तिस",
  "तिस", "एकतिस", "बत्तिस", "तेत्तिस", "चौँतिस", "पैँतिस", "छत्तिस", "सैँतिस", "अठतिस", "उनन्चालिस",
  "चालिस", "एकचालिस", "बयालिस", "त्रिचालिस", "चवालिस", "पैँतालिस", "छयालिस", "सतचालिस", "अठचालिस", "उनन्चास",
  "पचास", "एकाउन्न", "बाउन्न", "त्रिपन्न", "चवन्न", "पचपन्न", "छपन्न", "सन्ताउन्न", "अन्ठाउन्न", "उनन्साठी",
  "साठी", "एकसट्ठी", "बयसट्ठी", "त्रिसट्ठी", "चौंसट्ठी", "पैंसट्ठी", "छयसट्ठी", "सतसट्ठी", "अठसट्ठी", "उनन्सत्तरी",
  "सत्तरी", "एकहत्तर", "बहत्तर", "त्रिहत्तर", "चौहत्तर", "पचहत्तर", "छयहत्तर", "सतहत्तर", "अठहत्तर", "उनासी",
  "असी", "एकासी", "बयासी", "त्रियासी", "चौरासी", "पचासी", "छयासी", "सतासी", "अठासी", "उनान्नब्बे",
  "नब्बे", "एकानब्बे", "बयानब्बे", "त्रियानब्बे", "चौरानब्बे", "पन्चानब्बे", "छयानब्बे", "सन्तानब्बे", "अन्ठानब्बे", "उनान्सय",
];

/**
 * Amount in words in Nepali (Devanagari), South-Asian scale.
 * `numberToWordsNepali(1234567)` → `"बाह्र लाख चौँतिस हजार पाँच सय सतसट्ठी"`.
 */
export function numberToWordsNepali(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return NEPALI_0_99[0]!;
  const parts: string[] = [];
  const units: [number, string][] = [
    [1e15, "पद्म"],
    [1e13, "नील"],
    [1e11, "खरब"],
    [1e9, "अरब"],
    [1e7, "करोड"],
    [1e5, "लाख"],
    [1e3, "हजार"],
    [1e2, "सय"],
  ];
  for (const [size, name] of units) {
    if (n >= size) {
      const count = Math.floor(n / size);
      // NEPALI_0_99 only covers 0–99; the top (पद्म) unit can exceed that, so
      // render its count recursively.
      const words = count >= 100 ? numberToWordsNepali(count) : NEPALI_0_99[count]!;
      parts.push(`${words} ${name}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(NEPALI_0_99[n]!);
  return (value < 0 ? "माइनस " : "") + parts.join(" ");
}

/** `numberToWordsNepali` plus a "रुपैयाँ … मात्र" wrapper for Nepali invoices. */
export function amountInWordsNepali(amount: number): string {
  let rupees = Math.floor(Math.abs(amount));
  let paisa = Math.round((Math.abs(amount) - rupees) * 100);
  if (paisa === 100) { rupees += 1; paisa = 0; }
  let out = "रुपैयाँ " + numberToWordsNepali(rupees);
  if (paisa > 0) out += " र " + numberToWordsNepali(paisa) + " पैसा";
  return (amount < 0 ? "माइनस " : "") + out + " मात्र";
}

export interface Province {
  number: number;
  name: string;
  nameNp: string;
  capital: string;
  /** Capital in Nepali (Devanagari). */
  capitalNp: string;
}

/** Nepal's seven federal provinces. */
export const PROVINCES: readonly Province[] = [
  { number: 1, name: "Koshi", nameNp: "कोशी", capital: "Biratnagar", capitalNp: "विराटनगर" },
  { number: 2, name: "Madhesh", nameNp: "मधेश", capital: "Janakpur", capitalNp: "जनकपुर" },
  { number: 3, name: "Bagmati", nameNp: "बागमती", capital: "Hetauda", capitalNp: "हेटौँडा" },
  { number: 4, name: "Gandaki", nameNp: "गण्डकी", capital: "Pokhara", capitalNp: "पोखरा" },
  { number: 5, name: "Lumbini", nameNp: "लुम्बिनी", capital: "Deukhuri", capitalNp: "देउखुरी" },
  { number: 6, name: "Karnali", nameNp: "कर्णाली", capital: "Birendranagar", capitalNp: "वीरेन्द्रनगर" },
  { number: 7, name: "Sudurpashchim", nameNp: "सुदूरपश्चिम", capital: "Godawari", capitalNp: "गोदावरी" },
];

export interface District {
  name: string;
  nameNp: string;
  /** Province number 1–7. */
  province: number;
  /** Other accepted spellings/names (English or Nepali), matched by {@link findDistrict}. */
  aliases?: readonly string[];
}

/** Nepal's 77 districts, with their province number. */
export const DISTRICTS: readonly District[] = [
  // Koshi (1)
  { name: "Bhojpur", nameNp: "भोजपुर", province: 1 },
  { name: "Dhankuta", nameNp: "धनकुटा", province: 1 },
  { name: "Ilam", nameNp: "इलाम", province: 1 },
  { name: "Jhapa", nameNp: "झापा", province: 1 },
  { name: "Khotang", nameNp: "खोटाङ", province: 1 },
  { name: "Morang", nameNp: "मोरङ", province: 1 },
  { name: "Okhaldhunga", nameNp: "ओखलढुंगा", province: 1 },
  { name: "Panchthar", nameNp: "पाँचथर", province: 1 },
  { name: "Sankhuwasabha", nameNp: "संखुवासभा", province: 1 },
  { name: "Solukhumbu", nameNp: "सोलुखुम्बु", province: 1 },
  { name: "Sunsari", nameNp: "सुनसरी", province: 1 },
  { name: "Taplejung", nameNp: "ताप्लेजुङ", province: 1 },
  { name: "Terhathum", nameNp: "तेह्रथुम", province: 1 },
  { name: "Udayapur", nameNp: "उदयपुर", province: 1 },
  // Madhesh (2)
  { name: "Bara", nameNp: "बारा", province: 2 },
  { name: "Dhanusha", nameNp: "धनुषा", province: 2 },
  { name: "Mahottari", nameNp: "महोत्तरी", province: 2 },
  { name: "Parsa", nameNp: "पर्सा", province: 2 },
  { name: "Rautahat", nameNp: "रौतहट", province: 2 },
  { name: "Saptari", nameNp: "सप्तरी", province: 2 },
  { name: "Sarlahi", nameNp: "सर्लाही", province: 2 },
  { name: "Siraha", nameNp: "सिरहा", province: 2 },
  // Bagmati (3)
  { name: "Bhaktapur", nameNp: "भक्तपुर", province: 3 },
  { name: "Chitwan", nameNp: "चितवन", province: 3 },
  { name: "Dhading", nameNp: "धादिङ", province: 3 },
  { name: "Dolakha", nameNp: "दोलखा", province: 3 },
  { name: "Kathmandu", nameNp: "काठमाडौं", province: 3 },
  { name: "Kavrepalanchok", nameNp: "काभ्रेपलाञ्चोक", province: 3 },
  { name: "Lalitpur", nameNp: "ललितपुर", province: 3 },
  { name: "Makwanpur", nameNp: "मकवानपुर", province: 3 },
  { name: "Nuwakot", nameNp: "नुवाकोट", province: 3 },
  { name: "Ramechhap", nameNp: "रामेछाप", province: 3 },
  { name: "Rasuwa", nameNp: "रसुवा", province: 3 },
  { name: "Sindhuli", nameNp: "सिन्धुली", province: 3 },
  { name: "Sindhupalchok", nameNp: "सिन्धुपाल्चोक", province: 3 },
  // Gandaki (4)
  { name: "Baglung", nameNp: "बागलुङ", province: 4 },
  { name: "Gorkha", nameNp: "गोरखा", province: 4 },
  { name: "Kaski", nameNp: "कास्की", province: 4 },
  { name: "Lamjung", nameNp: "लमजुङ", province: 4 },
  { name: "Manang", nameNp: "मनाङ", province: 4 },
  { name: "Mustang", nameNp: "मुस्ताङ", province: 4 },
  { name: "Myagdi", nameNp: "म्याग्दी", province: 4 },
  { name: "Nawalparasi East", nameNp: "नवलपरासी (बर्दघाट सुस्ता पूर्व)", province: 4, aliases: ["Nawalpur", "नवलपुर", "Nawalparasi (East of Bardaghat Susta)", "Nawalparasi (Bardaghat Susta East)", "Nawalparasi Purba", "नवलपरासी पूर्व"] },
  { name: "Parbat", nameNp: "पर्वत", province: 4 },
  { name: "Syangja", nameNp: "स्याङ्जा", province: 4 },
  { name: "Tanahun", nameNp: "तनहुँ", province: 4 },
  // Lumbini (5)
  { name: "Arghakhanchi", nameNp: "अर्घाखाँची", province: 5 },
  { name: "Banke", nameNp: "बाँके", province: 5 },
  { name: "Bardiya", nameNp: "बर्दिया", province: 5 },
  { name: "Dang", nameNp: "दाङ", province: 5 },
  { name: "Eastern Rukum", nameNp: "पूर्वी रुकुम", province: 5, aliases: ["Rukum East", "Rukum Purba", "रुकुम पूर्व"] },
  { name: "Gulmi", nameNp: "गुल्मी", province: 5 },
  { name: "Kapilvastu", nameNp: "कपिलवस्तु", province: 5 },
  { name: "Nawalparasi West", nameNp: "नवलपरासी (बर्दघाट सुस्ता पश्चिम)", province: 5, aliases: ["Parasi", "परासी", "Nawalparasi (West of Bardaghat Susta)", "Nawalparasi (Bardaghat Susta West)", "Nawalparasi Paschim", "नवलपरासी पश्चिम"] },
  { name: "Palpa", nameNp: "पाल्पा", province: 5 },
  { name: "Pyuthan", nameNp: "प्युठान", province: 5 },
  { name: "Rolpa", nameNp: "रोल्पा", province: 5 },
  { name: "Rupandehi", nameNp: "रूपन्देही", province: 5 },
  // Karnali (6)
  { name: "Dailekh", nameNp: "दैलेख", province: 6 },
  { name: "Dolpa", nameNp: "डोल्पा", province: 6 },
  { name: "Humla", nameNp: "हुम्ला", province: 6 },
  { name: "Jajarkot", nameNp: "जाजरकोट", province: 6 },
  { name: "Jumla", nameNp: "जुम्ला", province: 6 },
  { name: "Kalikot", nameNp: "कालिकोट", province: 6 },
  { name: "Mugu", nameNp: "मुगु", province: 6 },
  { name: "Salyan", nameNp: "सल्यान", province: 6 },
  { name: "Surkhet", nameNp: "सुर्खेत", province: 6 },
  { name: "Western Rukum", nameNp: "पश्चिमी रुकुम", province: 6, aliases: ["Rukum West", "Rukum Paschim", "रुकुम पश्चिम"] },
  // Sudurpashchim (7)
  { name: "Achham", nameNp: "अछाम", province: 7 },
  { name: "Baitadi", nameNp: "बैतडी", province: 7 },
  { name: "Bajhang", nameNp: "बझाङ", province: 7 },
  { name: "Bajura", nameNp: "बाजुरा", province: 7 },
  { name: "Dadeldhura", nameNp: "डडेल्धुरा", province: 7 },
  { name: "Darchula", nameNp: "दार्चुला", province: 7 },
  { name: "Doti", nameNp: "डोटी", province: 7 },
  { name: "Kailali", nameNp: "कैलाली", province: 7 },
  { name: "Kanchanpur", nameNp: "कञ्चनपुर", province: 7 },
];

/** Districts in a given province (1–7). */
export function districtsByProvince(province: number): District[] {
  return DISTRICTS.filter((d) => d.province === province);
}

/** Find a district by English or Nepali name or any alias (case-insensitive). */
export function findDistrict(name: string): District | undefined {
  const raw = name.trim();
  const q = raw.toLowerCase();
  return DISTRICTS.find(
    (d) => d.name.toLowerCase() === q || d.nameNp === raw || (d.aliases ?? []).some((a) => a.toLowerCase() === q),
  );
}

/* ------------------------------------------------------------------------- *
 * New in 1.4.0 — Neel/Padma scale, `{ decimals }` on land breakdowns, stricter plate
 * grammar (province word + Pradesh/Province, province number 1–7 only), and
 * isValidNepaliMobile ≡ normalizeMobile.
 * New in 1.3.0 — Kharab scale, "र"/"ra" rupee–paisa separator, exact land-unit
 * ratios with carry-correct ropani/bigha breakdowns, Ncell 970 + carrier status,
 * Devanagari digits in landline/PAN validators, Nepali province capitals,
 * district aliases (official Nawalparasi East/West), embossed plate shapes.
 * New in 1.2.0 — Roman (transliterated) amount-in-words, integer-paisa NPR
 * format/parse, digit-conversion aliases, extra shape validators, and
 * province lookup helpers. See `./extras`.
 * ------------------------------------------------------------------------- */
export * from "./extras";

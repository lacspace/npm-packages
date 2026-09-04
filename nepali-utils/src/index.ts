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
      // Hundreds are 1–9; middle units take two digits; the top (Arab) unit can
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
  /** Use Nepali scale words (हजार/लाख/करोड/अरब). Default false (K/Lakh/Cr/Arab). */
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

/** Area of one unit in square metres (hilly = ropani system, terai = bigha system). */
export const LAND_UNIT_SQM: Record<LandUnit, number> = {
  ropani: 508.7369, // 5476 sq ft
  aana: 31.79606, // ropani / 16
  paisa: 7.949014, // ropani / 64
  daam: 1.987254, // ropani / 256
  bigha: 6772.631, // 72900 sq ft
  kattha: 338.6315, // bigha / 20
  dhur: 16.93158, // bigha / 400
  sqm: 1,
  sqft: 0.09290304,
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

/** Break square metres into the hilly system: `{ ropani, aana, paisa, daam }`. */
export function sqMetersToRopani(m2: number): { ropani: number; aana: number; paisa: number; daam: number } {
  let rem = m2;
  const ropani = Math.floor(rem / LAND_UNIT_SQM.ropani);
  rem -= ropani * LAND_UNIT_SQM.ropani;
  const aana = Math.floor(rem / LAND_UNIT_SQM.aana);
  rem -= aana * LAND_UNIT_SQM.aana;
  const paisa = Math.floor(rem / LAND_UNIT_SQM.paisa);
  rem -= paisa * LAND_UNIT_SQM.paisa;
  const daam = Math.round(rem / LAND_UNIT_SQM.daam);
  return carryRopani({ ropani, aana, paisa, daam });
}

function carryRopani(r: { ropani: number; aana: number; paisa: number; daam: number }) {
  if (r.daam >= 4) { r.paisa += Math.floor(r.daam / 4); r.daam %= 4; }
  if (r.paisa >= 4) { r.aana += Math.floor(r.paisa / 4); r.paisa %= 4; }
  if (r.aana >= 16) { r.ropani += Math.floor(r.aana / 16); r.aana %= 16; }
  return r;
}

/** Break square metres into the terai system: `{ bigha, kattha, dhur }`. */
export function sqMetersToBigha(m2: number): { bigha: number; kattha: number; dhur: number } {
  let rem = m2;
  const bigha = Math.floor(rem / LAND_UNIT_SQM.bigha);
  rem -= bigha * LAND_UNIT_SQM.bigha;
  const kattha = Math.floor(rem / LAND_UNIT_SQM.kattha);
  rem -= kattha * LAND_UNIT_SQM.kattha;
  const dhur = Math.round(rem / LAND_UNIT_SQM.dhur);
  if (dhur >= 20) return { bigha: bigha + Math.floor(dhur / 20), kattha, dhur: dhur % 20 };
  if (kattha >= 20) return { bigha: bigha + Math.floor(kattha / 20), kattha: kattha % 20, dhur };
  return { bigha, kattha, dhur };
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
  const s = fromDevanagari(input).replace(/[\s-]/g, "").replace(/^\+?977/, "");
  return /^9[678]\d{8}$/.test(s) ? `+977${s}` : null;
}

export type Carrier = "Ntc" | "Ncell" | "Smart Cell" | "UTL" | "unknown";

/** Detect the carrier of a Nepali mobile number. */
export function getCarrier(input: string): Carrier {
  const n = normalizeMobile(input);
  if (!n) return "unknown";
  const p = n.slice(4, 7); // three digits after +977
  if (["984", "985", "986", "974", "975", "976"].includes(p)) return "Ntc";
  if (["980", "981", "982"].includes(p)) return "Ncell";
  if (["961", "962", "988"].includes(p)) return "Smart Cell";
  if (p === "972") return "UTL";
  return "unknown";
}

/** True for a valid Nepali mobile number (10 digits starting 96–98, optional +977). */
export function isValidNepaliMobile(input: string): boolean {
  const s = fromDevanagari(input).replace(/[\s-]/g, "");
  return /^(\+?977)?9[678]\d{8}$/.test(s);
}

/** True for a plausible Nepal landline (area code + number, e.g. 01-4XXXXXX). */
export function isValidLandline(input: string): boolean {
  const s = input.replace(/[\s-]/g, "");
  return /^0\d{7,9}$/.test(s);
}

/** True for a valid Nepal PAN / VAT number (9 digits). */
export function isValidPAN(input: string): boolean {
  return /^\d{9}$/.test(input.trim());
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
    [1e9, "अरब"],
    [1e7, "करोड"],
    [1e5, "लाख"],
    [1e3, "हजार"],
    [1e2, "सय"],
  ];
  for (const [size, name] of units) {
    if (n >= size) {
      const count = Math.floor(n / size);
      // NEPALI_0_99 only covers 0–99; the top (अरब) unit can exceed that, so
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
  if (paisa > 0) out += " " + numberToWordsNepali(paisa) + " पैसा";
  return (amount < 0 ? "माइनस " : "") + out + " मात्र";
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

export interface District {
  name: string;
  nameNp: string;
  /** Province number 1–7. */
  province: number;
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
  { name: "Nawalpur", nameNp: "नवलपुर", province: 4 },
  { name: "Parbat", nameNp: "पर्वत", province: 4 },
  { name: "Syangja", nameNp: "स्याङ्जा", province: 4 },
  { name: "Tanahun", nameNp: "तनहुँ", province: 4 },
  // Lumbini (5)
  { name: "Arghakhanchi", nameNp: "अर्घाखाँची", province: 5 },
  { name: "Banke", nameNp: "बाँके", province: 5 },
  { name: "Bardiya", nameNp: "बर्दिया", province: 5 },
  { name: "Dang", nameNp: "दाङ", province: 5 },
  { name: "Eastern Rukum", nameNp: "पूर्वी रुकुम", province: 5 },
  { name: "Gulmi", nameNp: "गुल्मी", province: 5 },
  { name: "Kapilvastu", nameNp: "कपिलवस्तु", province: 5 },
  { name: "Parasi", nameNp: "नवलपरासी (पश्चिम)", province: 5 },
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
  { name: "Western Rukum", nameNp: "पश्चिमी रुकुम", province: 6 },
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

/** Find a district by English or Nepali name (case-insensitive). */
export function findDistrict(name: string): District | undefined {
  const q = name.trim().toLowerCase();
  return DISTRICTS.find((d) => d.name.toLowerCase() === q || d.nameNp === name.trim());
}

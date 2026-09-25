/**
 * @lacspace/phone — parse, validate and format international phone numbers.
 *
 * ```ts
 * parsePhone("+977 980-123-4567")
 * // { valid: true, country: "NP", callingCode: "977", national: "9801234567", e164: "+9779801234567",
 * //   international: "+977 980 123 4567", nationalFormat: "980 123 4567", type: "mobile" }
 * parsePhone("(202) 456-1111", { defaultCountry: "US" }).e164   // "+12024561111"
 * isValidPhone("07911 123456", "GB")                           // true
 * formatPhone("+442079460958", "international")                // "+44 2079 460958"
 * ```
 *
 * "Valid" means the number has a possible structure for its country (calling
 * code, length, leading digits) — what a form can check without a network.
 * It does not mean the number is assigned.
 *
 * Zero dependencies beyond @lacspace/country · isomorphic · fully typed.
 */
import { callingCodes, countries, countriesByCallingCode, country, type Country } from "@lacspace/country";
import { GENERIC, RULES, type Rule } from "./metadata";

export type PhoneType = "mobile" | "fixed-or-mobile" | "unknown";

export interface ParsedPhone {
  valid: true;
  /** ISO 3166-1 alpha-2 the number belongs to. */
  country: string;
  callingCode: string;
  /** National significant number: no trunk prefix, digits only. */
  national: string;
  /** "+9779801234567" */
  e164: string;
  /** "+977 980 123 4567" */
  international: string;
  /** "980 123 4567" (with the trunk prefix where the country dials one, e.g. "0980 …" in GB) */
  nationalFormat: string;
  type: PhoneType;
  /** Digits after the number, e.g. from "+44 20 7946 0958 ext. 12". */
  extension?: string;
}

export interface PhoneInvalid {
  valid: false;
  reason: "empty" | "characters" | "no-country" | "unknown-calling-code" | "length" | "leading-digits";
  country?: string;
  callingCode?: string;
  national?: string;
}

export type PhoneResult = ParsedPhone | PhoneInvalid;

export interface ParseOptions {
  /** Country to assume when the input has no "+" or "00" prefix. */
  defaultCountry?: string;
}

// Unicode digits people paste: Arabic-Indic, Persian, Devanagari, full-width.
const DIGIT_BLOCKS = [0x0660, 0x06f0, 0x0966, 0xff10];

function normaliseDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    const block = DIGIT_BLOCKS.find((b) => cp >= b && cp <= b + 9);
    if (block !== undefined) out += String(cp - block);
    else if (cp === 0xff0b) out += "+"; // full-width plus
    else if (cp === 0xff08 || cp === 0xff09 || cp === 0xff0d) out += cp === 0xff0d ? "-" : " ";
    else out += ch;
  }
  return out;
}

const CODES = callingCodes(); // longest first

function ruleFor(alpha2: string): Rule {
  return RULES[alpha2] ?? GENERIC;
}

/** Pick the country for a calling code + national number (shared codes are told apart by leading digits). */
function resolveCountry(callingCode: string, national: string): Country | undefined {
  // +1 covers the whole NANP: the islands are listed with four-digit codes ("1876").
  const candidates = callingCode === "1"
    ? countries().filter((c) => c.callingCodes.some((cc) => cc === "1" || (cc.length === 4 && cc.startsWith("1"))))
    : countriesByCallingCode(callingCode);
  if (candidates.length === 1) return candidates[0];
  // Shared codes (+1 NANP, +7 RU/KZ, +44 GB/GG/IM/JE, +61 AU/CC/CX …): the smaller members are told apart by
  // their leading digits; whatever is left belongs to the main country.
  const MAIN: Record<string, string> = { "1": "US", "7": "RU", "44": "GB", "61": "AU", "47": "NO", "358": "FI", "590": "GP", "599": "CW", "262": "RE", "212": "MA", "672": "NF", "500": "FK", "64": "NZ", "39": "IT", "55": "BR" };
  const main = MAIN[callingCode];
  const specific = candidates.filter((c) => c.alpha2 !== main && ruleFor(c.alpha2).leading?.test(national));
  if (specific.length === 1) return specific[0];
  const mainCountry = main ? candidates.find((c) => c.alpha2 === main) : undefined;
  return mainCountry ?? specific[0] ?? candidates[0];
}

function group(digits: string, groups: number[] | undefined): string {
  if (!groups) return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
  const total = groups.reduce((a, b) => a + b, 0);
  if (digits.length !== total) {
    // Length differs from the pattern: fall back to 3-digit groups from the right.
    return digits.replace(/(\d)(?=(\d{3})+$)/g, "$1 ");
  }
  const parts: string[] = [];
  let at = 0;
  for (const g of groups) { parts.push(digits.slice(at, at + g)); at += g; }
  return parts.join(" ");
}

/** Parse any human spelling of a phone number. */
export function parsePhone(input: string, opts: ParseOptions = {}): PhoneResult {
  let s = normaliseDigits(String(input ?? "")).trim();
  if (!s) return { valid: false, reason: "empty" };
  let extension: string | undefined;
  const ext = /(?:ext\.?|extension|x|#)\s*(\d{1,6})\s*$/i.exec(s);
  if (ext) { extension = ext[1]; s = s.slice(0, ext.index); }
  if (/[^\d\s()+.\-‐-―/]/.test(s)) return { valid: false, reason: "characters" };
  const plus = /^\s*\+/.test(s) || /^\s*00/.test(s);
  let digits = s.replace(/\D/g, "");
  if (/^\s*00/.test(s)) digits = digits.slice(2);

  let callingCode: string | undefined;
  let national: string;
  let c: Country | undefined;

  if (plus) {
    callingCode = CODES.find((code) => digits.startsWith(code));
    if (!callingCode) return { valid: false, reason: "unknown-calling-code" };
    // The NANP islands are listed as "1876"-style codes; the calling code is "1" and the area code is national.
    if (callingCode.length === 4 && callingCode.startsWith("1")) callingCode = "1";
    national = digits.slice(callingCode.length);
    c = resolveCountry(callingCode, national);
  } else {
    const def = opts.defaultCountry ? country(opts.defaultCountry) : undefined;
    if (!def) return { valid: false, reason: "no-country" };
    c = def;
    callingCode = def.callingCodes[0]!;
    const rule = ruleFor(def.alpha2);
    national = digits;
    // A national number that starts with the calling code and is too long to be national: treat as international.
    if (rule.trunk && national.startsWith(rule.trunk) && !rule.lengths.includes(national.length)) national = national.slice(rule.trunk.length);
    else if (rule.trunk && national.startsWith(rule.trunk) && rule.lengths.includes(national.length - rule.trunk.length)) national = national.slice(rule.trunk.length);
    if (callingCode !== "1" && national.startsWith(callingCode) && rule.lengths.includes(national.length - callingCode.length)) {
      national = national.slice(callingCode.length);
    }
    if (callingCode === "1" && national.length === 11 && national.startsWith("1")) national = national.slice(1);
    if (def.callingCodes.length > 1) c = resolveCountry(callingCode, national) ?? def;
  }
  if (!c) return { valid: false, reason: "unknown-calling-code", callingCode };
  const rule = ruleFor(c.alpha2);
  // "+44 0207 …": the trunk 0 must not follow a country code.
  if (/^0/.test(national) && rule.trunk === "0") return { valid: false, reason: "leading-digits", country: c.alpha2, callingCode, national };
  if (!rule.lengths.includes(national.length)) return { valid: false, reason: "length", country: c.alpha2, callingCode, national };
  if (rule.leading && !rule.leading.test(national)) return { valid: false, reason: "leading-digits", country: c.alpha2, callingCode, national };

  const type: PhoneType = rule.mobile ? (rule.mobile.test(national) ? "mobile" : "fixed-or-mobile") : "unknown";
  const grouped = group(national, rule.groups);
  const trunk = rule.trunk && c.alpha2 !== "US" && c.alpha2 !== "CA" && callingCode !== "1" ? rule.trunk : "";
  const result: ParsedPhone = {
    valid: true, country: c.alpha2, callingCode, national,
    e164: `+${callingCode}${national}`,
    international: `+${callingCode} ${grouped}`,
    nationalFormat: callingCode === "1" ? `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}` : `${trunk}${grouped}`,
    type,
  };
  if (extension) result.extension = extension;
  return result;
}

export function isValidPhone(input: string, defaultCountry?: string): boolean {
  return parsePhone(input, { defaultCountry }).valid;
}

/** Format to "e164", "international" or "national"; returns the input unchanged when it cannot be parsed. */
export function formatPhone(input: string, format: "e164" | "international" | "national" = "international", defaultCountry?: string): string {
  const p = parsePhone(input, { defaultCountry });
  if (!p.valid) return input;
  return format === "e164" ? p.e164 : format === "national" ? p.nationalFormat : p.international;
}

/** The country a "+…" number belongs to, or `undefined`. */
export function phoneCountry(input: string): string | undefined {
  const p = parsePhone(input);
  return p.valid ? p.country : undefined;
}

/** Countries with specific length/format rules (others use generic E.164 limits). */
export const RULED_COUNTRIES: string[] = Object.keys(RULES).sort();

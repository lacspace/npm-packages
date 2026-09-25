/**
 * @lacspace/postal-code — validate and normalise postal codes worldwide.
 *
 * ```ts
 * isValidPostalCode("sw1a 1aa", "GB")          // true
 * formatPostalCode("sw1a1aa", "GB")            // "SW1A 1AA"
 * formatPostalCode("k1a0b1", "CA")             // "K1A 0B1"
 * formatPostalCode("01310100", "BR")           // "01310-100"
 * validatePostalCode("12345-6789", "US")       // { valid: true, normalized: "12345-6789", country: "US" }
 * hasPostalCodes("AE")                         // false — the UAE has no postal codes
 * ```
 *
 * Validation is structural (the national format); it does not check that a
 * code is in use.
 *
 * Zero dependencies · isomorphic · fully typed.
 */
import { ROWS } from "./data";

export interface PostalResult {
  valid: boolean;
  country: string;
  /** Upper case with the national spacing/hyphen, e.g. "SW1A 1AA", "K1A 0B1", "01310-100". */
  normalized?: string;
  reason?: "unknown-country" | "no-postal-codes" | "format" | "empty";
}

const TABLE = new Map(ROWS.map(([c, re, layout]) => [c, { re, layout }]));

function cleanCode(input: string): string {
  return String(input ?? "").toUpperCase().replace(/[\s\-‐-―ー]/g, "").normalize("NFKC").replace(/[\s\-]/g, "");
}

/** Countries whose postal codes this package knows. */
export function postalCodeCountries(): string[] {
  return [...TABLE.keys()].filter((c) => !TABLE.get(c)!.layout.length || true).sort();
}

/** True when the country uses postal codes at all (false for AE, HK, QA, UG…). */
export function hasPostalCodes(country: string): boolean {
  const t = TABLE.get(country.toUpperCase());
  return !!t && t.layout !== "";
}

function ukFormat(code: string): string {
  // Outward + inward: the inward code is always the last three characters.
  return `${code.slice(0, -3)} ${code.slice(-3)}`;
}

function applyLayout(code: string, layout: string, country: string): string {
  if (layout === "UK") return ukFormat(code);
  // Country prefixes like "LT-", "L-", "LV-", "MD-", "AZ " are added when missing.
  const prefixMatch = /^([A-Z]+)([ -])#/.exec(layout);
  let digits = code;
  if (prefixMatch) {
    const prefix = prefixMatch[1]!;
    if (digits.startsWith(prefix)) digits = digits.slice(prefix.length);
    return `${prefix}${prefixMatch[2]}${digits}`;
  }
  if (country === "SI") digits = digits.replace(/^SI/, "");
  // Variable-length codes (US ZIP+4, SA, PR, TW, LB, KH, VN, BH, AR): only lay out the long form when the length matches.
  const slots = layout.split("").filter((ch) => ch === "#").length;
  if (digits.length !== slots) {
    // Short form: the layout for the leading part when it is a clean prefix (US "12345"), else raw.
    return digits;
  }
  let out = "";
  let i = 0;
  for (const ch of layout) out += ch === "#" ? digits[i++] : ch;
  return out;
}

/** Validate and normalise. */
export function validatePostalCode(input: string, country: string): PostalResult {
  const c = String(country ?? "").toUpperCase();
  const t = TABLE.get(c);
  if (!t) return { valid: false, country: c, reason: "unknown-country" };
  const code = cleanCode(input);
  if (t.layout === "") return code ? { valid: false, country: c, reason: "no-postal-codes" } : { valid: true, country: c, normalized: "" };
  if (!code) return { valid: false, country: c, reason: "empty" };
  if (!t.re.test(code)) return { valid: false, country: c, reason: "format" };
  return { valid: true, country: c, normalized: applyLayout(code, t.layout, c) };
}

export function isValidPostalCode(input: string, country: string): boolean {
  return validatePostalCode(input, country).valid;
}

/** The normalised code, or the input unchanged when it is not valid. */
export function formatPostalCode(input: string, country: string): string {
  const r = validatePostalCode(input, country);
  return r.valid && r.normalized !== undefined ? r.normalized : input;
}

/** A display example per country, for placeholders. */
export function examplePostalCode(country: string): string | undefined {
  const EXAMPLES: Record<string, string> = {
    US: "90210", GB: "SW1A 1AA", CA: "K1A 0B1", DE: "10115", FR: "75001", IN: "110001", NP: "44600", JP: "100-0001",
    BR: "01310-100", AU: "2000", NL: "1012 AB", IE: "D02 X285", PL: "00-001", PT: "1000-001", SE: "111 22", CZ: "110 00",
    CN: "100000", KR: "03051", SG: "018956", RU: "101000", MX: "06000", AR: "C1001AAA", ZA: "8001", AE: "", IT: "00100", ES: "28001",
  };
  return EXAMPLES[country.toUpperCase()];
}

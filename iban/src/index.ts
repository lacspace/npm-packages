/**
 * @lacspace/iban — validate, parse and format IBANs (ISO 13616 registry,
 * ISO 7064 MOD 97-10), plus BIC/SWIFT (ISO 9362) and ISIN (ISO 6166).
 *
 * ```ts
 * isValidIban("GB82 WEST 1234 5698 7654 32")  // true
 * parseIban("DE89370400440532013000")
 * // { valid: true, country: "DE", checkDigits: "89", bban: "370400440532013000", bankCode: "37040044", accountNumber: "0532013000", sepa: true, formatted: "DE89 3704 0044 0532 0130 00" }
 * generateIban("DE", "370400440532013000")   // "DE89370400440532013000"
 * isValidBic("DEUTDEFF500")                  // true
 * isValidIsin("US0378331005")                // true
 * ```
 *
 * Zero dependencies · isomorphic · fully typed.
 */
import { REGISTRY, SEPA, type Entry } from "./registry";

export { SEPA } from "./registry";

export type IbanFailReason = "empty" | "characters" | "country" | "length" | "format" | "check-digits";

export interface IbanParts {
  valid: true;
  country: string;
  checkDigits: string;
  bban: string;
  /** Bank identifier, where the registry defines its position. */
  bankCode?: string;
  /** Branch/sort code, where defined separately from the bank code. */
  branchCode?: string;
  accountNumber?: string;
  sepa: boolean;
  /** Electronic form: no spaces, upper case. */
  electronic: string;
  /** Print form: groups of four. */
  formatted: string;
}

export interface IbanInvalid {
  valid: false;
  reason: IbanFailReason;
  country?: string;
}

export type IbanResult = IbanParts | IbanInvalid;

interface Spec {
  length: number;
  bban: RegExp;
  bank?: [number, number];
  branch?: [number, number];
  account?: [number, number];
}

// Where the bank / branch / account sit inside the BBAN for the common countries.
const LAYOUT: Record<string, { bank: [number, number]; branch?: [number, number]; account?: [number, number] }> = {
  DE: { bank: [0, 8], account: [8, 18] },
  GB: { bank: [0, 4], branch: [4, 10], account: [10, 18] },
  IE: { bank: [0, 4], branch: [4, 10], account: [10, 18] },
  FR: { bank: [0, 5], branch: [5, 10], account: [10, 21] },
  MC: { bank: [0, 5], branch: [5, 10], account: [10, 21] },
  ES: { bank: [0, 4], branch: [4, 8], account: [10, 20] },
  IT: { bank: [1, 6], branch: [6, 11], account: [11, 23] },
  SM: { bank: [1, 6], branch: [6, 11], account: [11, 23] },
  NL: { bank: [0, 4], account: [4, 14] },
  BE: { bank: [0, 3], account: [3, 10] },
  AT: { bank: [0, 5], account: [5, 16] },
  CH: { bank: [0, 5], account: [5, 17] },
  LI: { bank: [0, 5], account: [5, 17] },
  PL: { bank: [0, 3], branch: [3, 7], account: [8, 24] },
  PT: { bank: [0, 4], branch: [4, 8], account: [8, 19] },
  SE: { bank: [0, 3], account: [3, 20] },
  NO: { bank: [0, 4], account: [4, 11] },
  DK: { bank: [0, 4], account: [4, 14] },
  FI: { bank: [0, 6], account: [6, 14] },
  AE: { bank: [0, 3], account: [3, 19] },
  SA: { bank: [0, 2], account: [2, 20] },
  QA: { bank: [0, 4], account: [4, 25] },
  BH: { bank: [0, 4], account: [4, 18] },
  KW: { bank: [0, 4], account: [4, 26] },
  TR: { bank: [0, 5], account: [6, 22] },
  PK: { bank: [0, 4], account: [4, 20] },
  IL: { bank: [0, 3], branch: [3, 6], account: [6, 19] },
  GR: { bank: [0, 3], branch: [3, 7], account: [7, 23] },
  CZ: { bank: [0, 4], account: [4, 20] },
  SK: { bank: [0, 4], account: [4, 20] },
  HU: { bank: [0, 3], branch: [3, 7], account: [8, 24] },
  RO: { bank: [0, 4], account: [4, 20] },
  BG: { bank: [0, 4], branch: [4, 8], account: [10, 18] },
  HR: { bank: [0, 7], account: [7, 17] },
  LT: { bank: [0, 5], account: [5, 16] },
  LV: { bank: [0, 4], account: [4, 17] },
  EE: { bank: [0, 2], account: [4, 16] },
  LU: { bank: [0, 3], account: [3, 16] },
  MT: { bank: [0, 4], branch: [4, 9], account: [9, 27] },
  CY: { bank: [0, 3], branch: [3, 8], account: [8, 24] },
  IS: { bank: [0, 4], account: [6, 12] },
  GI: { bank: [0, 4], account: [4, 19] },
  BR: { bank: [0, 8], branch: [8, 13], account: [13, 23] },
  GE: { bank: [0, 2], account: [2, 18] },
  KZ: { bank: [0, 3], account: [3, 16] },
  UA: { bank: [0, 6], account: [6, 25] },
  XK: { bank: [0, 4], account: [4, 16] },
  RS: { bank: [0, 3], account: [3, 16] },
  ME: { bank: [0, 3], account: [3, 16] },
  BA: { bank: [0, 3], branch: [3, 6], account: [6, 14] },
  MK: { bank: [0, 3], account: [3, 13] },
  AL: { bank: [0, 3], branch: [3, 7], account: [8, 24] },
  MD: { bank: [0, 2], account: [2, 20] },
  BY: { bank: [0, 4], account: [8, 24] },
  AZ: { bank: [0, 4], account: [4, 24] },
  JO: { bank: [0, 4], branch: [4, 8], account: [8, 26] },
  LB: { bank: [0, 4], account: [4, 24] },
  PS: { bank: [0, 4], account: [4, 25] },
  EG: { bank: [0, 4], branch: [4, 8], account: [8, 25] },
  TN: { bank: [0, 2], branch: [2, 5], account: [5, 20] },
  MU: { bank: [0, 6], branch: [6, 8], account: [8, 26] },
  DO: { bank: [0, 4], account: [4, 24] },
  CR: { bank: [0, 4], account: [4, 18] },
  GT: { bank: [0, 4], account: [8, 24] },
  SV: { bank: [0, 4], account: [4, 24] },
  VG: { bank: [0, 4], account: [4, 20] },
  LC: { bank: [0, 4], account: [4, 28] },
  SC: { bank: [0, 6], branch: [6, 8], account: [8, 24] },
  MR: { bank: [0, 5], branch: [5, 10], account: [10, 21] },
  IQ: { bank: [0, 4], branch: [4, 7], account: [7, 19] },
  VA: { bank: [0, 3], account: [3, 18] },
  ST: { bank: [0, 4], branch: [4, 8], account: [8, 19] },
  TL: { bank: [0, 3], account: [3, 17] },
  LY: { bank: [0, 3], branch: [3, 6], account: [6, 21] },
  SD: { bank: [0, 2], account: [2, 14] },
  RU: { bank: [0, 9], branch: [9, 14], account: [14, 29] },
  MN: { bank: [0, 4], account: [4, 16] },
  SO: { bank: [0, 4], branch: [4, 7], account: [7, 19] },
  NI: { bank: [0, 4], account: [4, 24] },
  YE: { bank: [0, 4], branch: [4, 8], account: [8, 26] },
  OM: { bank: [0, 3], account: [3, 19] },
  DJ: { bank: [0, 5], branch: [5, 10], account: [10, 21] },
  BI: { bank: [0, 5], branch: [5, 10], account: [10, 21] },
  FK: { bank: [0, 2], account: [2, 14] },
  FO: { bank: [0, 4], account: [4, 13] },
  GL: { bank: [0, 4], account: [4, 13] },
  HN: { bank: [0, 4], account: [4, 24] },
  AD: { bank: [0, 4], branch: [4, 8], account: [8, 20] },
  SI: { bank: [0, 5], account: [5, 13] },
};

function compile([country, length, format, example]: Entry): [string, Spec, string] {
  const re = format.replace(/(\d+)([nac])/g, (_, n: string, kind: string) => `${kind === "n" ? "[0-9]" : kind === "a" ? "[A-Z]" : "[A-Z0-9]"}{${n}}`);
  const layout = LAYOUT[country];
  return [country, { length, bban: new RegExp(`^${re}$`), ...layout }, example];
}

const SPECS = new Map<string, Spec>();
const EXAMPLES = new Map<string, string>();
for (const e of REGISTRY) {
  const [c, spec, ex] = compile(e);
  SPECS.set(c, spec);
  EXAMPLES.set(c, ex);
}

/** Countries in the IBAN registry. */
export function ibanCountries(): string[] {
  return [...SPECS.keys()].sort();
}

/** The registry's example IBAN for a country (handy for form placeholders). */
export function exampleIban(country: string): string | undefined {
  return EXAMPLES.get(country.toUpperCase());
}

/** IBAN length for a country, or `undefined` when it has no IBAN. */
export function ibanLength(country: string): number | undefined {
  return SPECS.get(country.toUpperCase())?.length;
}

/** Strip spaces and dashes, upper-case. */
export function electronicIban(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

/** Print format: groups of four separated by spaces. */
export function formatIban(input: string): string {
  return electronicIban(input).replace(/(.{4})(?=.)/g, "$1 ");
}

/** ISO 7064 MOD 97-10 remainder of the rearranged IBAN (letters → 10..35). */
export function mod97(rearranged: string): number {
  let remainder = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return remainder;
}

/** Full validation: characters, country, length, BBAN format and check digits. */
export function parseIban(input: string): IbanResult {
  const e = electronicIban(input ?? "");
  if (!e) return { valid: false, reason: "empty" };
  if (!/^[A-Z0-9]+$/.test(e)) return { valid: false, reason: "characters" };
  const country = e.slice(0, 2);
  const spec = SPECS.get(country);
  if (!/^[A-Z]{2}\d{2}/.test(e) || !spec) return { valid: false, reason: "country", country };
  if (e.length !== spec.length) return { valid: false, reason: "length", country };
  const bban = e.slice(4);
  if (!spec.bban.test(bban)) return { valid: false, reason: "format", country };
  if (mod97(e.slice(4) + e.slice(0, 4)) !== 1) return { valid: false, reason: "check-digits", country };
  const slice = (r?: [number, number]) => (r ? bban.slice(r[0], r[1]) : undefined);
  const parts: IbanParts = {
    valid: true, country, checkDigits: e.slice(2, 4), bban,
    sepa: SEPA.has(country), electronic: e, formatted: formatIban(e),
  };
  const bank = slice(spec.bank), branch = slice(spec.branch), account = slice(spec.account);
  if (bank !== undefined) parts.bankCode = bank;
  if (branch !== undefined) parts.branchCode = branch;
  if (account !== undefined) parts.accountNumber = account;
  return parts;
}

export function isValidIban(input: string): boolean {
  return parseIban(input).valid;
}

/** Build a valid IBAN from a country and BBAN by computing the check digits. */
export function generateIban(country: string, bban: string): string {
  const c = country.toUpperCase();
  const spec = SPECS.get(c);
  if (!spec) throw new Error(`${c} is not in the IBAN registry`);
  const b = electronicIban(bban);
  if (!spec.bban.test(b)) throw new Error(`BBAN "${b}" does not match the ${c} format`);
  const check = String(98 - mod97(b + c + "00")).padStart(2, "0");
  return `${c}${check}${b}`;
}

/* ------------------------------ BIC (ISO 9362) ------------------------------ */

export interface BicParts {
  valid: true;
  bankCode: string;
  country: string;
  locationCode: string;
  branchCode?: string;
  /** "XXX" or no branch = primary office. */
  primaryOffice: boolean;
  /** A location code ending in 0 marks a test BIC. */
  test: boolean;
  bic: string;
}

/** Parse a BIC / SWIFT code (8 or 11 characters). */
export function parseBic(input: string): BicParts | { valid: false } {
  const bic = (input ?? "").replace(/\s/g, "").toUpperCase();
  const m = /^([A-Z]{4})([A-Z]{2})([A-Z0-9]{2})([A-Z0-9]{3})?$/.exec(bic);
  if (!m) return { valid: false };
  const parts: BicParts = {
    valid: true, bankCode: m[1]!, country: m[2]!, locationCode: m[3]!,
    primaryOffice: !m[4] || m[4] === "XXX", test: m[3]!.endsWith("0"), bic,
  };
  if (m[4]) parts.branchCode = m[4];
  return parts;
}

export function isValidBic(input: string): boolean {
  return parseBic(input).valid;
}

/* ------------------------------ ISIN (ISO 6166) ------------------------------ */

/** Validate an ISIN: 2-letter country, 9 alphanumerics, Luhn check digit over the digit expansion. */
export function isValidIsin(input: string): boolean {
  const isin = (input ?? "").replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
  const digits = [...isin].map((ch) => (ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch)).join("");
  let sum = 0;
  let double = true; // the check digit (last) is not doubled; work from the right
  for (let i = digits.length - 2; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return (sum + (digits.charCodeAt(digits.length - 1) - 48)) % 10 === 0;
}

/** Compute the ISIN check digit for the first 11 characters. */
export function isinCheckDigit(first11: string): string {
  const base = first11.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}$/.test(base)) throw new Error("ISIN needs 2 letters + 9 alphanumerics");
  for (let d = 0; d <= 9; d++) if (isValidIsin(base + d)) return String(d);
  throw new Error("unreachable");
}

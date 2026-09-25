/** Business and tax identifiers outside the EU, with their published checksums. */
import { clean, digitsOnly, luhn, weightedSum } from "./checksums";

/* ------------------------------ India ------------------------------ */

const GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GST_STATE_CODES = new Set([...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, "0")), "97", "99"]);

/** Indian GSTIN: state code + PAN + entity + Z + base-36 check character. */
export function isValidGstin(value: string): boolean {
  const v = clean(value ?? "");
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v)) return false;
  if (!GST_STATE_CODES.has(v.slice(0, 2))) return false;
  if (!isValidPan(v.slice(2, 12))) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const n = GSTIN_ALPHABET.indexOf(v[i]!);
    const p = n * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_ALPHABET[(36 - (sum % 36)) % 36] === v[14];
}

/** Indian PAN: 5 letters (4th = holder type) + 4 digits + letter. Format only; PAN has no public checksum. */
export function isValidPan(value: string): boolean {
  const v = clean(value ?? "");
  return /^[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z]$/.test(v);
}

/* ------------------------------ Australia ------------------------------ */

/** Australian Business Number: 11 digits, weighted mod 89 after subtracting 1 from the first digit. */
export function isValidAbn(value: string): boolean {
  const d = digitsOnly(value ?? "");
  if (!/^[1-9]\d{10}$/.test(d)) return false;
  const adjusted = String(Number(d[0]) - 1) + d.slice(1);
  return weightedSum(adjusted, [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]) % 89 === 0;
}

/** Australian Company Number: 9 digits, weights 8..1, complement-of-10 check. */
export function isValidAcn(value: string): boolean {
  const d = digitsOnly(value ?? "");
  if (!/^\d{9}$/.test(d)) return false;
  return (10 - (weightedSum(d, [8, 7, 6, 5, 4, 3, 2, 1]) % 10)) % 10 === Number(d[8]);
}

/** Australian Tax File Number: 8 or 9 digits, weighted sum mod 11 = 0. */
export function isValidTfn(value: string): boolean {
  const d = digitsOnly(value ?? "");
  if (!/^\d{8,9}$/.test(d)) return false;
  const weights = d.length === 9 ? [1, 4, 3, 7, 5, 8, 6, 9, 10] : [10, 7, 8, 4, 6, 3, 5, 1];
  return weightedSum(d, weights) % 11 === 0;
}

/* ------------------------------ New Zealand ------------------------------ */

/** NZ IRD number: 8 or 9 digits in range, two-pass weighted mod 11. */
export function isValidIrd(value: string): boolean {
  const d = digitsOnly(value ?? "");
  if (!/^\d{8,9}$/.test(d)) return false;
  const n = Number(d);
  if (n < 10_000_000 || n > 150_000_000) return false;
  const padded = d.padStart(9, "0");
  const body = padded.slice(0, 8);
  const check = Number(padded[8]);
  const pass = (weights: number[]) => {
    const r = weightedSum(body, weights) % 11;
    return r === 0 ? 0 : 11 - r;
  };
  let c = pass([3, 2, 7, 6, 5, 4, 3, 2]);
  if (c === 10) c = pass([7, 4, 3, 2, 5, 2, 7, 6]);
  return c !== 10 && c === check;
}

/* ------------------------------ Canada / US ------------------------------ */

/** Canadian Business Number (9-digit root, optionally with program account RT0001): Luhn. */
export function isValidBn(value: string): boolean {
  const v = clean(value ?? "");
  const m = /^(\d{9})([A-Z]{2}\d{4})?$/.exec(v);
  return !!m && luhn(m[1]!);
}

const EIN_PREFIXES = new Set(
  "01 02 03 04 05 06 10 11 12 13 14 15 16 20 21 22 23 24 25 26 27 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 71 72 73 74 75 76 77 80 81 82 83 84 85 86 87 88 90 91 92 93 94 95 98 99".split(" "),
);

/** US Employer Identification Number: XX-XXXXXXX with an issued prefix. Format only; no checksum exists. */
export function isValidEin(value: string): boolean {
  const d = digitsOnly(value ?? "");
  return /^\d{9}$/.test(d) && EIN_PREFIXES.has(d.slice(0, 2));
}

/* ------------------------------ Brazil ------------------------------ */

function brCheck(digits: string, weights: number[]): number {
  const r = weightedSum(digits, weights) % 11;
  return r < 2 ? 0 : 11 - r;
}

/** Brazilian CPF: 11 digits, two mod-11 check digits; all-same-digit numbers are rejected. */
export function isValidCpf(value: string): boolean {
  const d = digitsOnly(value ?? "");
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const c1 = brCheck(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const c2 = brCheck(d.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c1 === Number(d[9]) && c2 === Number(d[10]);
}

/** Brazilian CNPJ: 14 digits, two mod-11 check digits. */
export function isValidCnpj(value: string): boolean {
  const d = digitsOnly(value ?? "");
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const c1 = brCheck(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const c2 = brCheck(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c1 === Number(d[12]) && c2 === Number(d[13]);
}

/* ------------------------------ Latin America ------------------------------ */

/** Argentine CUIT/CUIL: 11 digits, weights 5,4,3,2,7,6,5,4,3,2, mod 11. */
export function isValidCuit(value: string): boolean {
  const d = digitsOnly(value ?? "");
  if (!/^(20|23|24|27|30|33|34)\d{9}$/.test(d)) return false;
  const r = 11 - (weightedSum(d, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]) % 11);
  const check = r === 11 ? 0 : r === 10 ? 9 : r;
  return check === Number(d[10]);
}

/** Chilean RUT: 7-8 digits + check digit (0-9 or K), mod 11 with cycling weights 2..7. */
export function isValidRut(value: string): boolean {
  const v = clean(value ?? "");
  const m = /^(\d{7,8})([0-9K])$/.exec(v);
  if (!m) return false;
  let sum = 0;
  let w = 2;
  for (let i = m[1]!.length - 1; i >= 0; i--) {
    sum += (m[1]!.charCodeAt(i) - 48) * w;
    w = w === 7 ? 2 : w + 1;
  }
  const r = 11 - (sum % 11);
  const check = r === 11 ? "0" : r === 10 ? "K" : String(r);
  return check === m[2];
}

/** Mexican RFC: 3-4 letters, YYMMDD, 3-char homoclave. Format only. */
export function isValidRfc(value: string): boolean {
  const v = clean(value ?? "");
  return /^[A-ZÑ&]{3,4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z0-9]{2}[0-9A]$/.test(v);
}

/* ------------------------------ Asia-Pacific ------------------------------ */

/** Nepal PAN/VAT number: 9 digits. Format only. */
export function isValidNepalPan(value: string): boolean {
  return /^\d{9}$/.test(digitsOnly(value ?? ""));
}

/** Singapore UEN: the three published formats. Format only. */
export function isValidUen(value: string): boolean {
  const v = clean(value ?? "");
  return /^(\d{8}[A-Z]|(19|20)\d{7}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])$/.test(v);
}

/** Indonesian NPWP: 15 digits (classic) or 16 digits (2024 format). Format only. */
export function isValidNpwp(value: string): boolean {
  const d = digitsOnly(value ?? "");
  return /^\d{15}$/.test(d) || /^\d{16}$/.test(d);
}

/** Korean business registration number: 10 digits, weighted check. */
export function isValidKrBrn(value: string): boolean {
  const d = digitsOnly(value ?? "");
  if (!/^\d{10}$/.test(d)) return false;
  let sum = weightedSum(d, [1, 3, 7, 1, 3, 7, 1, 3, 5]);
  sum += Math.floor(((d.charCodeAt(8) - 48) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

/** Japanese corporate number (法人番号): 13 digits; check digit = 9 − (alternating 1/2-weighted sum mod 9). */
export function isValidJpCorporateNumber(value: string): boolean {
  const d = digitsOnly(value ?? "");
  if (!/^[1-9]\d{12}$/.test(d)) return false;
  const body = d.slice(1);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (body.charCodeAt(i) - 48) * ((12 - i) % 2 === 0 ? 2 : 1);
  return 9 - (sum % 9) === Number(d[0]);
}

/** South African tax reference number: 10 digits, Luhn. */
export function isValidZaTaxNumber(value: string): boolean {
  const d = digitsOnly(value ?? "");
  return /^[0-4]\d{9}$/.test(d) && luhn(d);
}

/** Shared checksum primitives. All take digit strings. */

/** Luhn (ISO/IEC 7812-1): true when the whole string, including its last digit, checks. */
export function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Σ digit[i] × weight[i]. */
export function weightedSum(digits: string, weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length && i < digits.length; i++) sum += (digits.charCodeAt(i) - 48) * weights[i]!;
  return sum;
}

/** ISO 7064 MOD 11,10 (used by German VAT and Croatian OIB): returns the check digit for the body. */
export function mod11_10(body: string): number {
  let product = 10;
  for (const ch of body) {
    let sum = ((ch.charCodeAt(0) - 48) + product) % 10;
    if (sum === 0) sum = 10;
    product = (2 * sum) % 11;
  }
  const check = 11 - product;
  return check === 10 ? 0 : check;
}

export const digitsOnly = (s: string): string => s.replace(/\D/g, "");
export const clean = (s: string): string => s.replace(/[\s.\-/]/g, "").toUpperCase();

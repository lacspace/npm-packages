/**
 * EU VAT numbers (VIES formats) plus GB and XI, with the national check digit
 * where one is defined. `strength` says whether a scheme is verified by its
 * checksum or by format only.
 */
import { clean, luhn, mod11_10, weightedSum } from "./checksums";

export interface SchemeResult {
  valid: boolean;
  /** "checksum": the check digit(s) were verified. "format": only the structure is known. */
  strength: "checksum" | "format";
  normalized?: string;
}

type Checker = (body: string) => SchemeResult;

const ok = (normalized: string, strength: "checksum" | "format" = "checksum"): SchemeResult => ({ valid: true, strength, normalized });
const no = (strength: "checksum" | "format" = "checksum"): SchemeResult => ({ valid: false, strength });

const CHECKS: Record<string, Checker> = {
  AT(b) {
    if (!/^U\d{8}$/.test(b)) return no();
    const d = b.slice(1);
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const p = (d.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 2);
      sum += p > 9 ? p - 9 : p;
    }
    return (96 - sum + 100) % 10 === Number(d[7]) ? ok("AT" + b) : no();
  },
  BE(b) {
    if (/^\d{9}$/.test(b)) b = "0" + b;
    if (!/^[01]\d{9}$/.test(b)) return no();
    return 97 - (Number(b.slice(0, 8)) % 97) === Number(b.slice(8)) ? ok("BE" + b) : no();
  },
  BG(b) {
    if (/^\d{9}$/.test(b)) {
      let sum = weightedSum(b, [1, 2, 3, 4, 5, 6, 7, 8]) % 11;
      if (sum === 10) sum = weightedSum(b, [3, 4, 5, 6, 7, 8, 9, 10]) % 11 % 10;
      return sum === Number(b[8]) ? ok("BG" + b) : no();
    }
    return /^\d{10}$/.test(b) ? ok("BG" + b, "format") : no("format");
  },
  CY: (b) => (/^[0-59]\d{7}[A-Z]$/.test(b) ? ok("CY" + b, "format") : no("format")),
  CZ(b) {
    if (/^\d{8}$/.test(b)) {
      const r = 11 - (weightedSum(b, [8, 7, 6, 5, 4, 3, 2]) % 11);
      const check = r === 10 ? 0 : r === 11 ? 1 : r;
      return check === Number(b[7]) ? ok("CZ" + b) : no();
    }
    return /^\d{9,10}$/.test(b) ? ok("CZ" + b, "format") : no("format");
  },
  DE(b) {
    if (!/^[1-9]\d{8}$/.test(b)) return no();
    return mod11_10(b.slice(0, 8)) === Number(b[8]) ? ok("DE" + b) : no();
  },
  DK(b) {
    if (!/^[1-9]\d{7}$/.test(b)) return no();
    return weightedSum(b, [2, 7, 6, 5, 4, 3, 2, 1]) % 11 === 0 ? ok("DK" + b) : no();
  },
  EE(b) {
    if (!/^10\d{7}$/.test(b)) return no();
    return (10 - (weightedSum(b, [3, 7, 1, 3, 7, 1, 3, 7]) % 10)) % 10 === Number(b[8]) ? ok("EE" + b) : no();
  },
  EL(b) {
    if (!/^\d{9}$/.test(b)) return no();
    return (weightedSum(b, [256, 128, 64, 32, 16, 8, 4, 2]) % 11) % 10 === Number(b[8]) ? ok("EL" + b) : no();
  },
  ES(b) {
    if (!/^[A-Z0-9]\d{7}[A-Z0-9]$/.test(b)) return no();
    const letters = "TRWAGMYFPDXBNJZSQVHLCKE";
    const first = b[0]!;
    if (/\d/.test(first)) {
      // NIF (DNI): 8 digits + letter
      return letters[Number(b.slice(0, 8)) % 23] === b[8] ? ok("ES" + b) : no();
    }
    if ("XYZ".includes(first)) {
      // NIE: X/Y/Z + 7 digits + letter, prefix counts as 0/1/2
      const n = Number("XYZ".indexOf(first) + b.slice(1, 8));
      return letters[n % 23] === b[8] ? ok("ES" + b) : no();
    }
    if (/[KLM]/.test(first)) {
      // Personal NIF starting K/L/M: same letter rule over the 7 digits
      return letters[Number(b.slice(1, 8)) % 23] === b[8] ? ok("ES" + b) : no();
    }
    // CIF: letter + 7 digits + control (digit or letter)
    const d = b.slice(1, 8);
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const n = d.charCodeAt(i) - 48;
      if (i % 2 === 0) { const p = n * 2; sum += p > 9 ? p - 9 : p; } else sum += n;
    }
    const control = (10 - (sum % 10)) % 10;
    const expected = "PQRSNW".includes(first) ? "JABCDEFGHI"[control] : /[ABEH]/.test(first) ? String(control) : undefined;
    const last = b[8]!;
    if (expected !== undefined) return last === expected ? ok("ES" + b) : no();
    return last === String(control) || last === "JABCDEFGHI"[control] ? ok("ES" + b) : no();
  },
  FI(b) {
    if (!/^\d{8}$/.test(b)) return no();
    const r = weightedSum(b, [7, 9, 10, 5, 8, 4, 2]) % 11;
    if (r === 1) return no();
    return (r === 0 ? 0 : 11 - r) === Number(b[7]) ? ok("FI" + b) : no();
  },
  FR(b) {
    if (!/^[A-Z0-9]{2}\d{9}$/.test(b)) return no();
    const siren = b.slice(2);
    if (/^\d{2}$/.test(b.slice(0, 2))) {
      const key = (12 + 3 * (Number(siren) % 97)) % 97;
      return key === Number(b.slice(0, 2)) ? ok("FR" + b) : no();
    }
    return ok("FR" + b, "format"); // alphanumeric keys use a different table
  },
  HR(b) {
    if (!/^\d{11}$/.test(b)) return no();
    return mod11_10(b.slice(0, 10)) === Number(b[10]) ? ok("HR" + b) : no();
  },
  HU(b) {
    if (!/^\d{8}$/.test(b)) return no();
    return (10 - (weightedSum(b, [9, 7, 3, 1, 9, 7, 3]) % 10)) % 10 === Number(b[7]) ? ok("HU" + b) : no();
  },
  IE(b) {
    const letters = "WABCDEFGHIJKLMNOPQRSTUV";
    let m = /^(\d{7})([A-W])([A-IW])?$/.exec(b);
    if (m) {
      let sum = weightedSum(m[1]!, [8, 7, 6, 5, 4, 3, 2]);
      if (m[3]) sum += 9 * (m[3] === "W" ? 0 : m[3]!.charCodeAt(0) - 64);
      return letters[sum % 23] === m[2] ? ok("IE" + b) : no();
    }
    m = /^(\d)([A-Z+*])(\d{5})([A-W])$/.exec(b); // pre-2013 style
    if (m) {
      const digits = "0" + m[3] + m[1];
      const sum = weightedSum(digits, [8, 7, 6, 5, 4, 3, 2]);
      return letters[sum % 23] === m[4] ? ok("IE" + b) : no();
    }
    return no();
  },
  IT(b) {
    if (!/^\d{11}$/.test(b)) return no();
    return luhn(b) ? ok("IT" + b) : no();
  },
  LT(b) {
    if (!/^(\d{9}|\d{12})$/.test(b)) return no();
    const body = b.slice(0, -1);
    let sum = 0;
    for (let i = 0; i < body.length; i++) sum += (body.charCodeAt(i) - 48) * ((i % 9) + 1);
    let check = sum % 11;
    if (check === 10) {
      sum = 0;
      for (let i = 0; i < body.length; i++) sum += (body.charCodeAt(i) - 48) * (((i + 2) % 9) + 1);
      check = sum % 11 % 10;
    }
    return check === Number(b.slice(-1)) ? ok("LT" + b) : no();
  },
  LU(b) {
    if (!/^\d{8}$/.test(b)) return no();
    return Number(b.slice(0, 6)) % 89 === Number(b.slice(6)) ? ok("LU" + b) : no();
  },
  LV: (b) => (/^\d{11}$/.test(b) ? ok("LV" + b, "format") : no("format")),
  MT(b) {
    if (!/^\d{8}$/.test(b)) return no();
    return 37 - (weightedSum(b, [3, 4, 6, 7, 8, 9]) % 37) === Number(b.slice(6)) ? ok("MT" + b) : no();
  },
  NL(b) {
    if (!/^\d{9}B\d{2}$/.test(b)) return no();
    const d = b.slice(0, 9);
    const old = weightedSum(d, [9, 8, 7, 6, 5, 4, 3, 2]) % 11 === Number(d[8]);
    // Since 2020 sole traders get numbers that only pass the MOD 97 rule over "NL" + number.
    const asDigits = ("NL" + b).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
    let r = 0;
    for (const ch of asDigits) r = (r * 10 + (ch.charCodeAt(0) - 48)) % 97;
    return old || r === 1 ? ok("NL" + b) : no();
  },
  PL(b) {
    if (!/^\d{10}$/.test(b)) return no();
    return weightedSum(b, [6, 5, 7, 2, 3, 4, 5, 6, 7]) % 11 === Number(b[9]) ? ok("PL" + b) : no();
  },
  PT(b) {
    if (!/^\d{9}$/.test(b)) return no();
    const r = 11 - (weightedSum(b, [9, 8, 7, 6, 5, 4, 3, 2]) % 11);
    return (r >= 10 ? 0 : r) === Number(b[8]) ? ok("PT" + b) : no();
  },
  RO(b) {
    if (!/^[1-9]\d{1,9}$/.test(b)) return no();
    const padded = b.padStart(10, "0");
    const check = ((weightedSum(padded, [7, 5, 3, 2, 1, 7, 5, 3, 2]) * 10) % 11) % 10;
    return check === Number(padded[9]) ? ok("RO" + b) : no();
  },
  SE(b) {
    if (!/^\d{10}01$/.test(b)) return no();
    return luhn(b.slice(0, 10)) ? ok("SE" + b) : no();
  },
  SI(b) {
    if (!/^[1-9]\d{7}$/.test(b)) return no();
    const r = 11 - (weightedSum(b, [8, 7, 6, 5, 4, 3, 2]) % 11);
    if (r === 11) return no();
    return (r === 10 ? 0 : r) === Number(b[7]) ? ok("SI" + b) : no();
  },
  SK(b) {
    if (!/^[1-9]\d[2-4]\d{7}$/.test(b)) return no();
    return Number(b) % 11 === 0 ? ok("SK" + b) : no();
  },
  GB(b) {
    if (/^(GD[0-4]\d{2}|HA[5-9]\d{2})$/.test(b)) return ok("GB" + b, "format");
    if (!/^\d{9}(\d{3})?$/.test(b)) return no();
    const sum = weightedSum(b, [8, 7, 6, 5, 4, 3, 2]);
    const check = Number(b.slice(7, 9));
    const oldStyle = (sum + check) % 97 === 0;
    const newStyle = (sum + 55 + check) % 97 === 0;
    return oldStyle || newStyle ? ok("GB" + b) : no();
  },
};
CHECKS.XI = (b) => { const r = CHECKS.GB!(b); return r.normalized ? { ...r, normalized: "XI" + r.normalized.slice(2) } : r; };
CHECKS.GR = (b) => { const r = CHECKS.EL!(b); return r.normalized ? { ...r, normalized: "EL" + r.normalized.slice(2) } : r; };

export const VAT_COUNTRIES = Object.keys(CHECKS).filter((c) => c !== "GR").sort();

/**
 * Validate a VAT number. The country can be given separately or as the prefix
 * ("DE136695976"). Greece accepts "GR" or its VAT prefix "EL"; Northern
 * Ireland is "XI".
 */
export function validateVat(value: string, country?: string): SchemeResult & { country?: string } {
  let v = clean(value ?? "");
  let c = (country ?? "").toUpperCase();
  if (!c) {
    const prefix = v.slice(0, 2);
    if (/^[A-Z]{2}$/.test(prefix) && CHECKS[prefix]) { c = prefix; v = v.slice(2); }
    else return { valid: false, strength: "format" };
  } else if (v.startsWith(c)) v = v.slice(2);
  else if (c === "GR" && v.startsWith("EL")) v = v.slice(2);
  const checker = CHECKS[c];
  if (!checker) return { valid: false, strength: "format", country: c };
  return { ...checker(v), country: c === "GR" ? "EL" : c };
}

export function isValidVat(value: string, country?: string): boolean {
  return validateVat(value, country).valid;
}

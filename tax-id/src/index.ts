/**
 * @lacspace/tax-id — tax and business identifiers with their real checksums.
 *
 * ```ts
 * validateTaxId("DE136695976")                        // { valid: true, country: "DE", type: "vat", strength: "checksum", normalized: "DE136695976" }
 * validateTaxId("27AAPFU0939F1ZV", { country: "IN" })  // { valid: true, type: "gstin", … }
 * isValidAbn("51 824 753 556")                         // true
 * isValidCnpj("11.222.333/0001-81")                    // true
 * ```
 *
 * Validation is format + checksum. It says whether a number is *well-formed*
 * for its scheme, not whether it is registered; use the issuing authority's
 * lookup (VIES, GST portal, ABR) for that.
 *
 * Zero dependencies · isomorphic · fully typed.
 */
import { validateVat, VAT_COUNTRIES, type SchemeResult } from "./eu";
import * as W from "./world";
import { clean } from "./checksums";

export { validateVat, isValidVat, VAT_COUNTRIES } from "./eu";
export type { SchemeResult } from "./eu";
export * from "./world";
export { luhn } from "./checksums";

export type TaxIdType =
  | "vat" | "gstin" | "pan" | "abn" | "acn" | "tfn" | "ird" | "bn" | "ein" | "cpf" | "cnpj" | "cuit" | "rut" | "rfc"
  | "nepal-pan" | "uen" | "npwp" | "kr-brn" | "jp-corporate" | "za-tax";

export interface TaxIdResult {
  valid: boolean;
  country?: string;
  type?: TaxIdType;
  strength?: SchemeResult["strength"];
  /** Canonical spelling: upper case, no separators, with the VAT country prefix. */
  normalized?: string;
  reason?: string;
}

interface Scheme { type: TaxIdType; check: (v: string) => boolean; strength: SchemeResult["strength"] }

const SCHEMES: Record<string, Scheme[]> = {
  IN: [{ type: "gstin", check: W.isValidGstin, strength: "checksum" }, { type: "pan", check: W.isValidPan, strength: "format" }],
  AU: [{ type: "abn", check: W.isValidAbn, strength: "checksum" }, { type: "acn", check: W.isValidAcn, strength: "checksum" }, { type: "tfn", check: W.isValidTfn, strength: "checksum" }],
  NZ: [{ type: "ird", check: W.isValidIrd, strength: "checksum" }],
  CA: [{ type: "bn", check: W.isValidBn, strength: "checksum" }],
  US: [{ type: "ein", check: W.isValidEin, strength: "format" }],
  BR: [{ type: "cnpj", check: W.isValidCnpj, strength: "checksum" }, { type: "cpf", check: W.isValidCpf, strength: "checksum" }],
  AR: [{ type: "cuit", check: W.isValidCuit, strength: "checksum" }],
  CL: [{ type: "rut", check: W.isValidRut, strength: "checksum" }],
  MX: [{ type: "rfc", check: W.isValidRfc, strength: "format" }],
  NP: [{ type: "nepal-pan", check: W.isValidNepalPan, strength: "format" }],
  SG: [{ type: "uen", check: W.isValidUen, strength: "format" }],
  ID: [{ type: "npwp", check: W.isValidNpwp, strength: "format" }],
  KR: [{ type: "kr-brn", check: W.isValidKrBrn, strength: "checksum" }],
  JP: [{ type: "jp-corporate", check: W.isValidJpCorporateNumber, strength: "checksum" }],
  ZA: [{ type: "za-tax", check: W.isValidZaTaxNumber, strength: "checksum" }],
};

/** Countries with at least one supported scheme. */
export const TAX_ID_COUNTRIES: string[] = [...new Set([...VAT_COUNTRIES.map((c) => (c === "EL" ? "GR" : c)), ...Object.keys(SCHEMES)])].sort();

/**
 * Validate any supported identifier. Give the country (ISO alpha-2) and,
 * optionally, the type; without a type every scheme for that country is tried.
 * Without a country, a VAT prefix ("DE…", "GB…") is used.
 */
export function validateTaxId(value: string, opts: { country?: string; type?: TaxIdType } = {}): TaxIdResult {
  const raw = value ?? "";
  const v = clean(raw);
  if (!v) return { valid: false, reason: "empty" };
  const country = opts.country?.toUpperCase();
  if (!country) {
    const r = validateVat(v);
    if (r.valid) return { valid: true, country: r.country, type: "vat", strength: r.strength, normalized: r.normalized };
    return { valid: false, reason: r.country ? "checksum" : "no country given and no VAT prefix" };
  }
  const tryVat = !opts.type || opts.type === "vat";
  if (tryVat && (VAT_COUNTRIES.includes(country) || country === "GR")) {
    const r = validateVat(v, country);
    if (r.valid) return { valid: true, country: r.country, type: "vat", strength: r.strength, normalized: r.normalized };
    if (opts.type === "vat") return { valid: false, country, type: "vat", strength: r.strength, reason: r.strength === "checksum" ? "checksum" : "format" };
  }
  const schemes = (SCHEMES[country] ?? []).filter((s) => !opts.type || s.type === opts.type);
  for (const s of schemes) {
    if (s.check(raw)) return { valid: true, country, type: s.type, strength: s.strength, normalized: v };
  }
  if (!schemes.length && !tryVat) return { valid: false, country, reason: `no ${opts.type} scheme for ${country}` };
  if (!schemes.length && !VAT_COUNTRIES.includes(country) && country !== "GR") return { valid: false, country, reason: `no scheme for ${country}` };
  return { valid: false, country, type: opts.type, reason: "no scheme matched" };
}

export function isValidTaxId(value: string, opts?: { country?: string; type?: TaxIdType }): boolean {
  return validateTaxId(value, opts).valid;
}

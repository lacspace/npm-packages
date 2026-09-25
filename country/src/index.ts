/**
 * @lacspace/country — ISO 3166-1 countries: codes, names, calling codes,
 * currencies, top-level domains, regions and flags. Lookup by anything.
 *
 * ```ts
 * country("np")      // { alpha2: "NP", alpha3: "NPL", numeric: "524", name: "Nepal", callingCodes: ["977"], … }
 * country("Nepal")   // same
 * country(524)       // same
 * flagEmoji("NP")    // "🇳🇵"
 * countriesUsing("EUR").length // 35
 * ```
 *
 * Zero dependencies · isomorphic · fully typed.
 */
import { ALIASES, ROWS, type Region } from "./data";

export type { Region } from "./data";

export interface Country {
  /** ISO 3166-1 alpha-2, e.g. "NP". */
  alpha2: string;
  /** ISO 3166-1 alpha-3, e.g. "NPL". */
  alpha3: string;
  /** ISO 3166-1 numeric, zero-padded, e.g. "524". */
  numeric: string;
  /** English short name. */
  name: string;
  /** ITU E.164 calling codes without "+", e.g. ["977"]; several for shared or split codes. */
  callingCodes: string[];
  /** ISO 4217 codes in circulation, primary first. */
  currencies: string[];
  /** Country-code top-level domain, e.g. ".np". */
  tld: string;
  /** UN M49 continent. */
  region: Region;
  /** Regional-indicator flag, e.g. "🇳🇵". */
  flag: string;
}

/** The flag emoji for an alpha-2 code (two regional-indicator symbols). */
export function flagEmoji(alpha2: string): string {
  const code = alpha2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const ALL: readonly Country[] = ROWS.map(([alpha2, alpha3, numeric, name, calling, currencies, tld, region]) => ({
  alpha2, alpha3, numeric, name,
  callingCodes: calling ? calling.split(",") : [],
  currencies: currencies ? currencies.split(",") : [],
  tld, region, flag: flagEmoji(alpha2),
}));

/** Fold case, accents and punctuation so "Côte d'Ivoire", "cote divoire" and "COTE D'IVOIRE" agree. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "") // d'Ivoire ≡ dIvoire
    .replace(/&/g, " and ")
    .replace(/\bst\.?\s/g, "saint ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|sar china|province of china)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_ALPHA2 = new Map(ALL.map((c) => [c.alpha2, c]));
const BY_ALPHA3 = new Map(ALL.map((c) => [c.alpha3, c]));
const BY_NUMERIC = new Map(ALL.map((c) => [c.numeric, c]));
const BY_NAME = new Map<string, Country>();
for (const c of ALL) {
  BY_NAME.set(normalizeName(c.name), c);
  // "Korea, Republic of" is also findable as "Republic of Korea".
  const comma = c.name.indexOf(",");
  if (comma > 0) BY_NAME.set(normalizeName(`${c.name.slice(comma + 1)} ${c.name.slice(0, comma)}`), c);
  // Drop a parenthetical: "Virgin Islands (British)" → "virgin islands british" already; also "falkland islands".
  const paren = c.name.indexOf(" (");
  if (paren > 0 && !BY_NAME.has(normalizeName(c.name.slice(0, paren)))) BY_NAME.set(normalizeName(c.name.slice(0, paren)), c);
}
for (const [alias, code] of Object.entries(ALIASES)) BY_NAME.set(normalizeName(alias), BY_ALPHA2.get(code)!);

/** All 249 countries, sorted by alpha-2. */
export function countries(): Country[] {
  return ALL.slice();
}

/**
 * Find a country by alpha-2, alpha-3, numeric code, name or a common alias.
 * Case-, accent- and punctuation-insensitive. `undefined` when nothing matches.
 */
export function country(query: string | number): Country | undefined {
  if (typeof query === "number") return BY_NUMERIC.get(String(query).padStart(3, "0"));
  const q = query.trim();
  if (!q) return undefined;
  if (/^\d{1,3}$/.test(q)) return BY_NUMERIC.get(q.padStart(3, "0"));
  const upper = q.toUpperCase();
  if (upper.length === 2 && BY_ALPHA2.has(upper)) return BY_ALPHA2.get(upper);
  if (upper.length === 3 && BY_ALPHA3.has(upper)) return BY_ALPHA3.get(upper);
  const n = normalizeName(q);
  if (BY_NAME.has(n)) return BY_NAME.get(n);
  // "Myanmar (Burma)": try the head and the parenthetical separately.
  const paren = /^(.*?)\s*\((.*?)\)\s*$/.exec(q);
  if (paren) return BY_NAME.get(normalizeName(paren[1]!)) ?? BY_NAME.get(normalizeName(paren[2]!));
  return undefined;
}

/** Is this an assigned ISO 3166-1 alpha-2 code? (case-insensitive) */
export function isCountryCode(code: unknown): code is string {
  return typeof code === "string" && BY_ALPHA2.has(code.toUpperCase());
}

/** English short name for any code, or `undefined`. */
export function countryName(code: string | number): string | undefined {
  return country(code)?.name;
}

export function alpha2ToAlpha3(alpha2: string): string | undefined {
  return BY_ALPHA2.get(alpha2.toUpperCase())?.alpha3;
}
export function alpha3ToAlpha2(alpha3: string): string | undefined {
  return BY_ALPHA3.get(alpha3.toUpperCase())?.alpha2;
}
export function numericToAlpha2(numeric: string | number): string | undefined {
  return BY_NUMERIC.get(String(numeric).padStart(3, "0"))?.alpha2;
}

/** Primary calling code (without "+") for a country, e.g. "977". */
export function callingCode(code: string | number): string | undefined {
  return country(code)?.callingCodes[0];
}

/** Countries sharing a calling code, e.g. "1" → US, CA, and the NANP islands; "44" → GB, GG, IM, JE. */
export function countriesByCallingCode(callingCode: string | number): Country[] {
  const cc = String(callingCode).replace(/^\+/, "");
  return ALL.filter((c) => c.callingCodes.includes(cc));
}

/** Countries where an ISO 4217 currency circulates. */
export function countriesUsing(currency: string): Country[] {
  const code = currency.toUpperCase();
  return ALL.filter((c) => c.currencies.includes(code));
}

/** Countries in a UN M49 continent. */
export function countriesInRegion(region: Region): Country[] {
  return ALL.filter((c) => c.region === region);
}

/**
 * Search by partial name, code or alias. Name-prefix matches rank first, then
 * word-prefix, then substring. `limit` defaults to 10.
 */
export function searchCountries(query: string, limit = 10): Country[] {
  const q = normalizeName(query);
  if (!q) return [];
  const exact = country(query);
  const scored: Array<[number, Country]> = [];
  for (const c of ALL) {
    const n = normalizeName(c.name);
    let score = 0;
    if (c === exact) score = 4;
    else if (n.startsWith(q)) score = 3;
    else if (n.split(" ").some((w) => w.startsWith(q))) score = 2;
    else if (n.includes(q)) score = 1;
    else if (c.alpha2.toLowerCase() === q || c.alpha3.toLowerCase() === q) score = 3;
    if (score) scored.push([score, c]);
  }
  for (const [alias, code] of Object.entries(ALIASES)) {
    if (normalizeName(alias).startsWith(q)) {
      const c = BY_ALPHA2.get(code)!;
      if (!scored.some(([, x]) => x === c)) scored.push([2, c]);
    }
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(([, c]) => c);
}

/** Every calling code in use, longest first (so "1264" is tried before "1"). */
export function callingCodes(): string[] {
  const set = new Set<string>();
  for (const c of ALL) for (const cc of c.callingCodes) set.add(cc);
  return [...set].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

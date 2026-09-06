/**
 * Pure data-cleaning helpers — website tidy-up, best-effort E.164 phone
 * normalisation, and lead sorting. All exported so they can be unit-tested and
 * reused; none touch the network or the disk.
 */
import type { Lead } from "./types.js";

const TRACKING_PARAMS =
  /^(utm_|fbclid$|gclid$|gbraid$|wbraid$|mc_|_hs|ref$|ref_src$|source$|igshid$|yclid$)/i;

/**
 * Tidy a website URL: unwrap a Google `/url?q=…` redirect, drop tracking query
 * params (utm_*, fbclid, gclid…) and any fragment, and lower-case the host.
 * Returns `undefined` for empty input, and the original string if it can't be
 * parsed as a URL. Pure.
 */
export function cleanWebsite(url?: string): string | undefined {
  if (!url) return undefined;
  let raw = url.trim();
  if (!raw) return undefined;

  // Unwrap Google redirect wrappers: https://www.google.com/url?q=<real>
  const g = raw.match(/[?&](?:q|url)=([^&]+)/i);
  if (g && /google\.[a-z.]+\/url/i.test(raw)) {
    try {
      raw = decodeURIComponent(g[1]!);
    } catch {
      /* keep raw */
    }
  }

  let u: URL;
  try {
    u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return raw;
  }
  u.hash = "";
  u.host = u.host.toLowerCase();
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  }
  let href = u.toString();
  // Drop a bare trailing slash on a root URL for tidiness (keep it elsewhere).
  if (u.pathname === "/" && !u.search) href = href.replace(/\/$/, "");
  return href;
}

/**
 * ISO-3166 alpha-2 → E.164 country calling code, for a curated set of common
 * markets. Extend as needed; unknown codes fall through to best-effort.
 */
export const CALLING_CODES: Record<string, string> = {
  NP: "977", IN: "91", US: "1", CA: "1", GB: "44", AU: "61", NZ: "64",
  SG: "65", MY: "60", ID: "62", TH: "66", PH: "63", VN: "84", BD: "880",
  PK: "92", LK: "94", AE: "971", SA: "966", QA: "974", KW: "965", BH: "973",
  OM: "968", CN: "86", HK: "852", JP: "81", KR: "82", DE: "49", FR: "33",
  ES: "34", IT: "39", NL: "31", BE: "32", CH: "41", AT: "43", SE: "46",
  NO: "47", DK: "45", FI: "358", IE: "353", PT: "351", PL: "48", ZA: "27",
  NG: "234", KE: "254", EG: "20", BR: "55", MX: "52", AR: "54", TR: "90",
};

/** Resolve a country argument (ISO-2 code or a raw calling code) to digits. */
export function callingCode(country?: string): string | undefined {
  if (!country) return undefined;
  const c = country.trim().replace(/^\+/, "");
  if (/^\d{1,4}$/.test(c)) return c;
  return CALLING_CODES[c.toUpperCase()];
}

/**
 * Best-effort E.164 normalisation of a phone string given a default country
 * (an ISO-2 code like `"NP"` or a calling code like `"977"`). Numbers that
 * already start with `+` are kept as international. When the result isn't a
 * plausible 8–15-digit number, the original string is returned unchanged. Pure.
 */
export function normalizePhone(raw?: string, country?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const isIntl = /^\+/.test(trimmed) || /^00\d/.test(trimmed);
  let digits = trimmed.replace(/[^0-9]/g, "");
  if (/^00\d/.test(trimmed)) digits = digits.replace(/^00/, "");

  const cc = callingCode(country);

  if (isIntl) {
    return plausible(digits) ? `+${digits}` : trimmed;
  }
  if (!cc) return trimmed; // no country to anchor a local number
  if (digits.startsWith(cc)) return plausible(digits) ? `+${digits}` : trimmed;
  const local = digits.replace(/^0+/, ""); // national trunk prefix
  const e164 = `${cc}${local}`;
  return plausible(e164) ? `+${e164}` : trimmed;
}

function plausible(digits: string): boolean {
  return digits.length >= 8 && digits.length <= 15;
}

/** Keys a lead list can be sorted by. */
export type SortKey = "rating" | "reviews" | "name" | "priceLevel";

const priceRank = (p?: string): number => (p ? p.replace(/[^$€£₹¥₩]/g, "").length : 0);

/**
 * Sort leads by a key, missing values always last. Stable, pure, new array.
 * `dir` defaults to descending for numeric keys and ascending for `name`.
 */
export function sortLeads(leads: Lead[], by?: SortKey, dir?: "asc" | "desc"): Lead[] {
  if (!by) return [...leads];
  const desc = dir ? dir === "desc" : by !== "name";
  const val = (l: Lead): number | string | undefined => {
    if (by === "name") return l.name?.toLowerCase();
    if (by === "priceLevel") return l.priceLevel ? priceRank(l.priceLevel) : undefined;
    return l[by] as number | undefined;
  };
  return [...leads]
    .map((lead, i) => ({ lead, i }))
    .sort((a, b) => {
      const av = val(a.lead);
      const bv = val(b.lead);
      const aMissing = av === undefined || av === "";
      const bMissing = bv === undefined || bv === "";
      if (aMissing && bMissing) return a.i - b.i;
      if (aMissing) return 1;
      if (bMissing) return -1;
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      if (desc) cmp = -cmp;
      return cmp !== 0 ? cmp : a.i - b.i;
    })
    .map((x) => x.lead);
}

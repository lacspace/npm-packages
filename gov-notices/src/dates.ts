/**
 * Date parsing for Nepali notice boards: Bikram Sambat (BS) in Devanagari or
 * ASCII digits, numeric or with month names, plus the AD forms these sites also
 * print ("Sep 15, 2026", "2026-10-01T11:37:02Z").
 */
import { BS_MAX_YEAR, BS_MIN_YEAR, adToBs, bsToAd, daysInBsMonth } from "@lacspace/nepali-date";

export interface BsParsed {
  /** BS date, "YYYY-MM-DD", ASCII digits. */
  bs: string;
  /** The same day in AD, "YYYY-MM-DD". */
  ad: string;
}

export interface ParsedDate {
  /** AD date, "YYYY-MM-DD". */
  ad: string;
  /** BS date, "YYYY-MM-DD" (when inside the BS 1970–2086 table). */
  bs?: string;
  /** The substring that was read, exactly as printed. */
  raw: string;
  /** Which calendar the source text was written in. */
  calendar: "bs" | "ad";
}

const pad = (n: number) => String(n).padStart(2, "0");
const DEV_DIGITS = "०१२३४५६७८९";

/** Devanagari digits → ASCII digits; everything else untouched. */
export function toAsciiDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)));
}

/** BS month-name spellings (Roman and Devanagari, lower-cased) → month number. */
const BS_MONTHS: Record<string, number> = {};
const addMonths = (n: number, names: string[]) => { for (const x of names) BS_MONTHS[x.toLowerCase()] = n; };
addMonths(1, ["baisakh", "baishakh", "baisakha", "vaisakh", "vaishakh", "बैशाख", "वैशाख", "बैसाख"]);
addMonths(2, ["jestha", "jeth", "jeshtha", "jyestha", "जेठ", "जेष्ठ", "ज्येष्ठ"]);
addMonths(3, ["asar", "ashadh", "asadh", "ashar", "aashadh", "असार", "आषाढ", "अषाढ"]);
addMonths(4, ["shrawan", "shravan", "saun", "sawan", "srawan", "साउन", "श्रावण"]);
addMonths(5, ["bhadra", "bhadau", "bhado", "भदौ", "भाद्र"]);
addMonths(6, ["ashwin", "asoj", "aswin", "ashoj", "aswin", "असोज", "आश्विन", "आश्‍विन", "अश्विन"]);
addMonths(7, ["kartik", "kattik", "kartika", "कात्तिक", "कार्तिक"]);
addMonths(8, ["mangsir", "mangshir", "marga", "margashirsha", "मंसिर", "मङ्सिर", "मङसिर", "मार्गशीर्ष", "मार्ग"]);
addMonths(9, ["poush", "push", "paush", "pus", "पुस", "पौष"]);
addMonths(10, ["magh", "माघ"]);
addMonths(11, ["falgun", "fagun", "phalgun", "phagun", "फागुन", "फाल्गुन"]);
addMonths(12, ["chaitra", "chait", "चैत", "चैत्र"]);

const AD_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Longest first so "Baishakh" wins over "Baisakh", "चैत्र" over "चैत".
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BS_NAME_RE = Object.keys(BS_MONTHS).sort((a, b) => b.length - a.length).map(escape).join("|");
const AD_NAME_RE = Object.keys(AD_MONTHS).sort((a, b) => b.length - a.length).join("|");

// A name must not be glued to other letters (Devanagari marks count as letters here).
const L = "(?<![\\p{L}\\p{M}])";
const R = "(?![\\p{L}\\p{M}])";
const NUM_YMD = /(?<!\d)(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?!\d)/u;
const BS_Y_M_D = new RegExp(`(?<!\\d)(\\d{4})\\s*(?:साल\\s*)?,?\\s*${L}(${BS_NAME_RE})${R}\\s*,?\\s*(\\d{1,2})(?!\\d)`, "iu");
const BS_M_D_Y = new RegExp(`${L}(${BS_NAME_RE})${R}\\s*(\\d{1,2})(?:\\s*गते)?\\s*,?\\s*(\\d{4})(?!\\d)`, "iu");
const BS_D_M_Y = new RegExp(`(?<!\\d)(\\d{1,2})(?:\\s*गते)?\\s*,?\\s*${L}(${BS_NAME_RE})${R}\\s*,?\\s*(\\d{4})(?!\\d)`, "iu");
const AD_M_D_Y = new RegExp(`\\b(${AD_NAME_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})(?!\\d)`, "i");
const AD_D_M_Y = new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+(${AD_NAME_RE})\\.?\\s*,?\\s*(\\d{4})(?!\\d)`, "i");

/** BS y/m/d → { bs, ad } when it is a real day in the conversion table, else null. */
export function bsParts(y: number, m: number, d: number): BsParsed | null {
  if (!Number.isInteger(y) || y < BS_MIN_YEAR || y > BS_MAX_YEAR || m < 1 || m > 12 || d < 1) return null;
  if (d > daysInBsMonth(y, m)) return null;
  const ad = bsToAd(y, m, d);
  return { bs: `${y}-${pad(m)}-${pad(d)}`, ad: `${ad.getFullYear()}-${pad(ad.getMonth() + 1)}-${pad(ad.getDate())}` };
}

/** AD y/m/d → ISO date + BS (when inside the table), or null for an impossible day. */
export function adParts(y: number, m: number, d: number): { ad: string; bs?: string } | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  const out: { ad: string; bs?: string } = { ad: `${y}-${pad(m)}-${pad(d)}` };
  try {
    const b = adToBs(new Date(y, m - 1, d));
    out.bs = `${b.year}-${pad(b.month)}-${pad(b.day)}`;
  } catch { /* outside the BS table */ }
  return out;
}

interface Hit { index: number; raw: string; cal: "bs" | "ad" | "num"; y: number; m: number; d: number }

function hits(src: string): Hit[] {
  const s = toAsciiDigits(src); // same length: each Devanagari digit is one UTF-16 unit
  const out: Hit[] = [];
  const push = (re: RegExp, cal: Hit["cal"], pick: (m: RegExpExecArray) => [number, number, number]) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(s))) {
      const [y, mo, d] = pick(m);
      out.push({ index: m.index, raw: src.slice(m.index, m.index + m[0].length), cal, y, m: mo, d });
    }
  };
  const bsMonth = (x: string) => BS_MONTHS[x.toLowerCase()] ?? 0;
  const adMonth = (x: string) => AD_MONTHS[x.toLowerCase()] ?? 0;
  push(NUM_YMD, "num", (m) => [+m[1]!, +m[2]!, +m[3]!]);
  push(BS_Y_M_D, "bs", (m) => [+m[1]!, bsMonth(m[2]!), +m[3]!]);
  push(BS_M_D_Y, "bs", (m) => [+m[3]!, bsMonth(m[1]!), +m[2]!]);
  push(BS_D_M_Y, "bs", (m) => [+m[3]!, bsMonth(m[2]!), +m[1]!]);
  push(AD_M_D_Y, "ad", (m) => [+m[3]!, adMonth(m[1]!), +m[2]!]);
  push(AD_D_M_Y, "ad", (m) => [+m[3]!, adMonth(m[2]!), +m[1]!]);
  return out.sort((a, b) => a.index - b.index || b.raw.length - a.raw.length);
}

/**
 * Parse a Bikram Sambat date anywhere in `s`: "२०८२/०६/१८", "2082-06-18",
 * "2082.6.18", "२०८२ असोज १८", "Asoj 18, 2082", "१४ आश्विन २०८३". The day is
 * checked against the real month length. Numeric dates are always read as BS.
 */
export function parseBsDate(s: string): BsParsed | null {
  if (!s) return null;
  for (const h of hits(s)) {
    if (h.cal === "ad") continue;
    const r = bsParts(h.y, h.m, h.d);
    if (r) return r;
    if (h.cal === "num") return null; // a numeric date that is not a real BS day
  }
  return null;
}

/** Read a numeric y-m-d as BS or AD by its year. */
function numeric(h: Hit): ParsedDate | null {
  const { y, m, d, raw } = h;
  if (y >= 2050 && y <= 2100) {
    const r = bsParts(y, m, d);
    return r ? { ad: r.ad, bs: r.bs, raw, calendar: "bs" } : null;
  }
  if (y >= 1990 && y < 2050 && m <= 12) {
    const r = adParts(y, m, d);
    return r ? { ...r, raw, calendar: "ad" } : null;
  }
  if (y >= 2000 && y <= 2100) {
    const r = bsParts(y, m, d);
    return r ? { ad: r.ad, bs: r.bs, raw, calendar: "bs" } : null;
  }
  return null;
}

/**
 * Parse the first date found in `s`, in either calendar. Numeric y-m-d with a
 * year of 2050–2100 is BS (BS 2050 began in 1993, so a notice dated "2083-06-15"
 * is BS); 1990–2049 is AD ("2025-10-04"). Month names decide the calendar
 * themselves ("Asoj" → BS, "Sep" → AD).
 */
export function parseDate(s: string): ParsedDate | null {
  if (!s) return null;
  for (const h of hits(s)) {
    if (h.cal === "num") {
      const r = numeric(h);
      if (r) return r;
    } else if (h.cal === "bs") {
      const r = bsParts(h.y, h.m, h.d);
      if (r) return { ad: r.ad, bs: r.bs, raw: h.raw, calendar: "bs" };
    } else {
      const r = adParts(h.y, h.m, h.d);
      if (r) return { ...r, raw: h.raw, calendar: "ad" };
    }
  }
  return null;
}

/** An ISO timestamp → the calendar day in Nepal (UTC+05:45). */
export function nepalDay(iso: string): ParsedDate | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const n = new Date(t + 345 * 60_000);
  const r = adParts(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate());
  return r ? { ...r, raw: iso, calendar: "ad" } : null;
}

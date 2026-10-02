import { bsToAd, BS_MIN_YEAR, BS_MAX_YEAR } from "./bs.js";

export type Lang = "en" | "ne" | "auto";

const AD_MIN_YEAR = 1990;
/** A parsed date is rejected if it lands more than this many ms in the future. */
const FUTURE_SLACK_MS = 36 * 3600 * 1000; // +1 day + tz slack

/** Convert Devanagari digits to Arabic; leave everything else. */
export function normalizeDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
}

// Nepali month → index 1..12 (Baisakh … Chaitra), with spelling variants (Devanagari + Latin).
const NE_MONTHS: Record<string, number> = {
  "बैशाख": 1, "वैशाख": 1, baisakh: 1, baishakh: 1, baisak: 1, baishak: 1, vaisakh: 1, boishakh: 1,
  "जेठ": 2, "ज्येष्ठ": 2, jestha: 2, jeth: 2, jeshtha: 2, jyestha: 2,
  "असार": 3, "आषाढ": 3, "आषाढ़": 3, "असाढ": 3, ashar: 3, asar: 3, ashadh: 3, asadh: 3, ashad: 3,
  "साउन": 4, "श्रावण": 4, "स्रावण": 4, sawan: 4, saun: 4, shrawan: 4, shravan: 4, srawan: 4, shrawn: 4,
  "भदौ": 5, "भाद्र": 5, "भाद्रपद": 5, bhadau: 5, bhadra: 5, bhado: 5, bhadaur: 5, vadau: 5,
  "असोज": 6, "आश्विन": 6, "आशोज": 6, asoj: 6, ashoj: 6, ashwin: 6, aswin: 6, ashvin: 6, ashwini: 6,
  "कात्तिक": 7, "कार्तिक": 7, "काती": 7, kattik: 7, kartik: 7, karthik: 7, kaartik: 7,
  "मंसिर": 8, "मार्ग": 8, "मार्गशीर्ष": 8, "मङ्सिर": 8, mangsir: 8, mansir: 8, marga: 8, margashirsha: 8,
  "पुस": 9, "पौष": 9, "पूस": 9, push: 9, pus: 9, poush: 9, paush: 9,
  "माघ": 10, "माग": 10, magh: 10, maagh: 10, mag: 10,
  "फागुन": 11, "फाल्गुन": 11, fagun: 11, falgun: 11, phagun: 11, phalgun: 11, faagun: 11,
  "चैत": 12, "चैत्र": 12, chait: 12, chaitra: 12, chaet: 12, chaitr: 12,
};

// English months → 1..12.
const EN_MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function neMonthIndex(token: string): number | undefined {
  const t = token.trim();
  if (NE_MONTHS[t] !== undefined) return NE_MONTHS[t];
  const lower = t.toLowerCase().replace(/[^a-z]/g, "");
  return NE_MONTHS[lower];
}

/** Build a UTC date; returns null for an impossible calendar date. */
function utc(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export interface ParseOptions {
  /** Reference "now" for relative phrases and future rejection. Default: new Date(). */
  now?: Date;
  /** Hint the language of relative phrases. Default: auto. */
  lang?: Lang;
}

/** Reject dates that are impossible for a published article (too old / in the future). */
function plausible(date: Date | null, now: Date): Date | null {
  if (!date || isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() < AD_MIN_YEAR) return null;
  if (date.getTime() - now.getTime() > FUTURE_SLACK_MS) return null;
  return date;
}

// --- relative phrases ("2 hours ago", "३ घण्टा अगाडि", "today", "आज") --------------
const EN_UNIT_MS: Record<string, number> = {
  second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000,
  month: 2629800000, year: 31557600000,
};
const NE_UNIT_WORDS: [RegExp, keyof typeof EN_UNIT_MS][] = [
  [/सेकेन्ड|सेकन्ड/, "second"], [/मिनेट/, "minute"], [/घण्टा|घन्टा/, "hour"],
  [/दिन/, "day"], [/हप्ता|साता/, "week"], [/महिना/, "month"], [/वर्ष|साल|बर्ष/, "year"],
];

function parseRelative(input: string, now: Date): Date | null {
  const s = input.trim();
  const low = s.toLowerCase();
  if (/\b(today|just now|moments? ago)\b/.test(low) || /आज|भर्खरै|अहिले/.test(s)) return now;
  if (/\byesterday\b/.test(low) || /हिजो/.test(s)) return new Date(now.getTime() - 86400000);
  // English "N unit(s) ago"
  const en = low.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*(ago|back)/);
  if (en) return new Date(now.getTime() - Number(en[1]) * EN_UNIT_MS[en[2] as keyof typeof EN_UNIT_MS]!);
  // Nepali "N unit अगाडि/अघि/पहिले"
  const digits = normalizeDigits(s);
  const neNum = digits.match(/(\d+)\s*([^\d]+?)\s*(अगाडि|अघि|पहिले|अगाडी)/);
  if (neNum) {
    for (const [re, unit] of NE_UNIT_WORDS) {
      if (re.test(neNum[2]!)) return new Date(now.getTime() - Number(neNum[1]) * EN_UNIT_MS[unit]!);
    }
  }
  return null;
}

// --- BS dates in text ("२०८३ असोज १६", "वि.सं. 2076 भदौ 25", "असोज १६, २०८३") -------
function parseBs(input: string, now: Date): Date | null {
  const s = normalizeDigits(input);
  // year + month-name + day. Month names in either script; Latin needs a word boundary
  // so a short spelling (mag/pus/asar) can't match inside another word.
  // Month keys contain no regex metacharacters, so no escaping is needed.
  const monthAlt = Object.keys(NE_MONTHS)
    .sort((a, b) => b.length - a.length) // longest-match first
    .map((k) => (/[^\x00-\x7F]/.test(k) ? k : `\\b${k}\\b`))
    .join("|");
  const reYMD = new RegExp(`(\\d{4})\\s*(${monthAlt})\\s*(\\d{1,2})`, "i");
  const reMDY = new RegExp(`(${monthAlt})\\s*(\\d{1,2})[,\\s]+(\\d{4})`, "i");
  let y: number | undefined, mo: number | undefined, d: number | undefined;
  let m = s.match(reYMD);
  if (m) {
    y = Number(m[1]); mo = neMonthIndex(m[2]!); d = Number(m[3]);
  } else if ((m = s.match(reMDY))) {
    mo = neMonthIndex(m[1]!); d = Number(m[2]); y = Number(m[3]);
  }
  if (y && mo && d && y >= BS_MIN_YEAR && y <= BS_MAX_YEAR) {
    try {
      return plausible(bsToAd(y, mo, d), now);
    } catch {
      return null;
    }
  }
  return null;
}

// --- English / ISO / numeric dates -------------------------------------------------
function parseEnglish(input: string, now: Date): Date | null {
  const s = input.trim();
  // ISO 8601 (date or datetime) — the most reliable; parse directly.
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const d = utc(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return plausible(d, now);
  }
  // "10 September 2019" / "10 Sep 2019"
  let m = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && EN_MONTHS[m[2]!.toLowerCase()]) {
    return plausible(utc(Number(m[3]), EN_MONTHS[m[2]!.toLowerCase()]!, Number(m[1])), now);
  }
  // "September 10, 2019" / "Sep 10 2019"
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m && EN_MONTHS[m[1]!.toLowerCase()]) {
    return plausible(utc(Number(m[3]), EN_MONTHS[m[1]!.toLowerCase()]!, Number(m[2])), now);
  }
  // "YYYY/MM/DD"
  m = s.match(/\b(\d{4})[/.](\d{1,2})[/.](\d{1,2})\b/);
  if (m) return plausible(utc(Number(m[1]), Number(m[2]), Number(m[3])), now);
  return null;
}

/**
 * Parse one date-ish string into a Date (UTC), or null. Tries, in order:
 * relative phrases → ISO/English → Bikram Sambat. Rejects dates before 1990 or more
 * than ~1 day in the future. Deterministic.
 */
export function parseAnyDate(input: string, options: ParseOptions = {}): Date | null {
  if (!input) return null;
  const now = options.now ?? new Date();
  const s = input.trim();
  if (!s) return null;
  return (
    parseRelative(s, now) ??
    parseEnglish(s, now) ??
    parseBs(s, now) ??
    null
  );
}

export { AD_MIN_YEAR };

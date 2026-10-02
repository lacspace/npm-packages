import { bsToAd, BS_MIN_YEAR, BS_MAX_YEAR } from "./bs.js";

export type Lang = "en" | "ne" | "auto";

const AD_MIN_YEAR = 1990;
/** A parsed date is rejected if it lands more than this many ms in the future. */
const FUTURE_SLACK_MS = 36 * 3600 * 1000; // +1 day + tz slack
/** Nepal Standard Time offset: +05:45. */
const NPT_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;
/** Offset from a calendar day's UTC midnight to NOON Nepal time. */
const NOON_NPT_MS = 12 * 3600 * 1000 - NPT_OFFSET_MS;

/** Convert Devanagari digits to Arabic; leave everything else. */
export function normalizeDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
}

type Cal = "bs" | "ad";
interface MonthInfo {
  i: number;
  cal: Cal;
}

// Nepali (Bikram Sambat) months → 1..12 (Baisakh … Chaitra), Devanagari + Latin spellings.
const BS_MONTHS: Record<string, number> = {
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

// Gregorian months → 1..12, Latin + Nepali-script transliterations of the English names.
const AD_MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  "जनवरी": 1, "फेब्रुअरी": 2, "फेब्रुअरि": 2, "मार्च": 3, "अप्रिल": 4, "अप्रील": 4,
  "मे": 5, "मई": 5, "जुन": 6, "जून": 6, "जुलाई": 7, "जुलाइ": 7, "अगस्ट": 8, "अगस्त": 8,
  "सेप्टेम्बर": 9, "सेप्टेम्वर": 9, "अक्टोबर": 10, "अक्टुबर": 10, "अक्तोबर": 10,
  "नोभेम्बर": 11, "नोवेम्बर": 11, "नोभेम्वर": 11, "डिसेम्बर": 12, "डिसेम्वर": 12,
};

const MONTH_MAP: Record<string, MonthInfo> = {};
for (const [k, i] of Object.entries(BS_MONTHS)) MONTH_MAP[k] = { i, cal: "bs" };
for (const [k, i] of Object.entries(AD_MONTHS)) MONTH_MAP[k] = { i, cal: "ad" };

const MONTH_KEYS = Object.keys(MONTH_MAP).sort((a, b) => b.length - a.length);
const MONTH_ALT = MONTH_KEYS.map((k) => (/[^\x00-\x7F]/.test(k) ? k : `\\b${k}\\b`)).join("|");
const MONTH_RE = new RegExp(`(${MONTH_ALT})`, "i");

function lookupMonth(token: string): MonthInfo | undefined {
  const t = token.trim();
  return MONTH_MAP[t] ?? MONTH_MAP[t.toLowerCase().replace(/[^a-z]/g, "")];
}

export interface ParseOptions {
  /** Reference "now" for relative phrases and future rejection. Default: new Date(). */
  now?: Date;
  /** Hint the language of relative phrases. Default: auto. */
  lang?: Lang;
  /** Allow dates in the future (for upcoming-event detection). Default false. */
  allowFuture?: boolean;
}

function plausible(date: Date | null, now: Date, allowFuture: boolean): Date | null {
  if (!date || isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() < AD_MIN_YEAR) return null;
  if (!allowFuture && date.getTime() - now.getTime() > FUTURE_SLACK_MS) return null;
  return date;
}

interface TimePart {
  hh: number;
  mm: number;
  ss: number;
}

/** Pull an HH:MM(:SS) time out of a string; return it and the string with it removed. */
function splitTime(s: string): { time: TimePart | null; rest: string } {
  const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return { time: null, rest: s };
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return { time: null, rest: s };
  return { time: { hh, mm, ss: Number(m[3] ?? 0) }, rest: s.replace(m[0], " ") };
}

/** Build an instant from a calendar day (its UTC-midnight ms) + optional NPT time. */
function instantFrom(calMidnightMs: number, time: TimePart | null): Date {
  if (time) {
    return new Date(calMidnightMs + (time.hh * 3600 + time.mm * 60 + time.ss) * 1000 - NPT_OFFSET_MS);
  }
  return new Date(calMidnightMs + NOON_NPT_MS); // date-only → noon Nepal time
}

/** The calendar day (Y/M/D) of an instant in Nepal time. */
function nptDayMidnightMs(now: Date): number {
  const local = new Date(now.getTime() + NPT_OFFSET_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

function utcMidnight(y: number, m: number, d: number): number | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.getTime();
}

// --- relative phrases ---------------------------------------------------------------
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
  const digits = normalizeDigits(s);
  const { time } = splitTime(digits);
  const atDay = (dayMidnightMs: number) =>
    time ? instantFrom(dayMidnightMs, time) : now; // "आज १३:३८" → today at that NPT time

  if (/\b(today|just now|moments? ago)\b/.test(low) || /आज|भर्खरै|अहिले/.test(s)) {
    return time ? instantFrom(nptDayMidnightMs(now), time) : now;
  }
  if (/\byesterday\b/.test(low) || /हिजो/.test(s)) {
    return atDay(nptDayMidnightMs(now) - 86400000);
  }
  const en = low.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*(ago|back)/);
  if (en) return new Date(now.getTime() - Number(en[1]) * EN_UNIT_MS[en[2] as keyof typeof EN_UNIT_MS]!);
  const neNum = digits.match(/(\d+)\s*([^\d]+?)\s*(अगाडि|अघि|पहिले|अगाडी)/);
  if (neNum) {
    for (const [re, unit] of NE_UNIT_WORDS) {
      if (re.test(neNum[2]!)) return new Date(now.getTime() - Number(neNum[1]) * EN_UNIT_MS[unit]!);
    }
  }
  return null;
}

// --- ISO / numeric ------------------------------------------------------------------
function parseNumeric(input: string, now: Date, allowFuture: boolean): Date | null {
  const s = input.trim();
  // ISO 8601 with a time component — preserve the instant (native parse honors the zone).
  const isoDt = s.match(/\b(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)(Z|[+-]\d{2}:?\d{2})?/);
  if (isoDt) {
    const raw = `${isoDt[1]}T${isoDt[2]}${isoDt[3] ?? "+05:45"}`; // no zone → Nepal time
    return plausible(new Date(raw), now, allowFuture);
  }
  // ISO date-only → noon Nepal time.
  const isoDate = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoDate) {
    const ms = utcMidnight(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));
    return ms === null ? null : plausible(instantFrom(ms, null), now, allowFuture);
  }
  // YYYY/MM/DD (Gregorian).
  const slash = s.match(/\b(\d{4})[/.](\d{1,2})[/.](\d{1,2})\b/);
  if (slash) {
    const ms = utcMidnight(Number(slash[1]), Number(slash[2]), Number(slash[3]));
    return ms === null ? null : plausible(instantFrom(ms, null), now, allowFuture);
  }
  return null;
}

// --- month-name dates (BS or AD; any day/month/year order) --------------------------
function parseMonthName(input: string, now: Date, allowFuture: boolean): Date | null {
  const normalized = normalizeDigits(input);
  const mMonth = normalized.match(MONTH_RE);
  if (!mMonth) return null;
  const info = lookupMonth(mMonth[0]);
  if (!info) return null;

  // Remove the month word, then pull the time out, then read the remaining numbers.
  const withoutMonth = normalized.replace(mMonth[0], " ");
  const { time, rest } = splitTime(withoutMonth);
  const nums = (rest.match(/\d{1,4}/g) ?? []).map(Number);
  let year: number | undefined;
  let day: number | undefined;
  for (const n of nums) {
    if (n >= 1000) {
      if (year === undefined) year = n;
    }
  }
  for (const n of nums) {
    if (n !== year && n >= 1 && n <= 32) {
      day = n;
      break;
    }
  }
  if (year === undefined || day === undefined) return null;

  if (info.cal === "bs") {
    if (year < BS_MIN_YEAR || year > BS_MAX_YEAR) return null;
    try {
      return plausible(instantFrom(bsToAd(year, info.i, day).getTime(), time), now, allowFuture);
    } catch {
      return null;
    }
  }
  const ms = utcMidnight(year, info.i, day);
  return ms === null ? null : plausible(instantFrom(ms, time), now, allowFuture);
}

/**
 * Parse one date-ish string into a Date, or null. Tries: relative phrases →
 * ISO/numeric → month-name (BS or AD, any day/month/year order, with weekday/filler
 * words and ordinals tolerated). Times are kept at full precision; a time with no zone
 * is read as Nepal time (+05:45) and a date with no time as noon Nepal time. Rejects
 * dates before 1990 or (unless `allowFuture`) more than ~1 day in the future.
 */
export function parseAnyDate(input: string, options: ParseOptions = {}): Date | null {
  if (!input) return null;
  const now = options.now ?? new Date();
  const allowFuture = options.allowFuture ?? false;
  const s = input.trim();
  if (!s) return null;
  return (
    parseRelative(s, now) ??
    parseNumeric(s, now, allowFuture) ??
    parseMonthName(s, now, allowFuture) ??
    null
  );
}

export { AD_MIN_YEAR, NPT_OFFSET_MS };

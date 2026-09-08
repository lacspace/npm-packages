/**
 * @lacspace/nepali-date — plain-function extras (formatting, arithmetic,
 * parsing and calendar helpers) that complement the `NepaliDate` class.
 *
 * Everything here is additive and byte-for-byte compatible with the existing
 * API. The BS ↔ AD conversion tables and math are NEVER re-implemented — all
 * calendar arithmetic reuses `bsToAd` (the single source of truth) so results
 * are guaranteed identical to the rest of the package.
 */

import { BS_MIN_YEAR, BS_MAX_YEAR, BS_MONTH_DAYS } from "./data";
import {
  bsToAd,
  toDevanagari,
  fromDevanagari,
  NEPALI_MONTHS,
  NEPALI_MONTHS_NP,
  NEPALI_WEEKDAYS,
  NEPALI_WEEKDAYS_NP,
  type BSDate,
} from "./index";

const MS_PER_DAY = 86_400_000;

function assertYear(year: number): void {
  if (year < BS_MIN_YEAR || year > BS_MAX_YEAR) {
    throw new RangeError(
      `@lacspace/nepali-date supports BS years ${BS_MIN_YEAR}–${BS_MAX_YEAR}; got ${year}.`,
    );
  }
}

/* --------------------------------- calendar --------------------------------- */

/**
 * Days in a given BS month (28–32), read from the calendar tables.
 * Throws `RangeError` for an out-of-range year or a month outside 1–12.
 */
export function daysInBsMonth(year: number, month: number): number {
  assertYear(year);
  if (month < 1 || month > 12) throw new RangeError(`Month must be 1–12; got ${month}.`);
  return BS_MONTH_DAYS[year - BS_MIN_YEAR]![month - 1]!;
}

/**
 * Total days in a BS year (its 12 month lengths summed).
 *
 * Note: Bikram Sambat has **no simple leap rule** — a year's length (usually
 * 365, occasionally 366) is fixed by the astronomical tables, not by a formula.
 * Always read the tables via this helper rather than assuming a pattern.
 */
export function bsYearLength(year: number): number {
  assertYear(year);
  return BS_MONTH_DAYS[year - BS_MIN_YEAR]!.reduce((a, b) => a + b, 0);
}

/** Localised BS month name (1 = Baisakh … 12 = Chaitra). */
export function bsMonthName(month: number, opts: { nepali?: boolean } = {}): string {
  if (month < 1 || month > 12) throw new RangeError(`Month must be 1–12; got ${month}.`);
  return (opts.nepali ? NEPALI_MONTHS_NP : NEPALI_MONTHS)[month - 1]!;
}

/** Localised weekday name (0 = Sunday … 6 = Saturday). */
export function bsWeekdayName(weekday: number, opts: { nepali?: boolean } = {}): string {
  if (weekday < 0 || weekday > 6) throw new RangeError(`Weekday must be 0–6; got ${weekday}.`);
  return (opts.nepali ? NEPALI_WEEKDAYS_NP : NEPALI_WEEKDAYS)[weekday]!;
}

/** Weekday (0 = Sunday … 6 = Saturday) of a BS date. */
export function bsWeekday(bs: BSDate): number {
  return bsToAd(bs.year, bs.month, bs.day).getDay();
}

/** 1-based week-of-month for a BS date (weeks start on Sunday). */
export function bsWeekOfMonth(bs: BSDate): number {
  const firstWeekday = bsToAd(bs.year, bs.month, 1).getDay();
  return Math.floor((firstWeekday + bs.day - 1) / 7) + 1;
}

/* --------------------------------- fiscal year --------------------------------- */

/**
 * Nepali fiscal year for a BS date: Shrawan 1 → Ashadh end.
 * Months 4–12 (Shrawan…Chaitra) belong to a FY starting this year; 1–3 to the
 * FY that started the previous year.
 */
export function bsFiscalYear(bs: BSDate): { start: number; end: number } {
  return bs.month >= 4
    ? { start: bs.year, end: bs.year + 1 }
    : { start: bs.year - 1, end: bs.year };
}

/** Fiscal-year label for a BS date, e.g. "2081/82". */
export function bsFiscalYearLabel(bs: BSDate): string {
  const { start, end } = bsFiscalYear(bs);
  return `${start}/${String(end).slice(-2)}`;
}

/* --------------------------------- arithmetic --------------------------------- */

function dayIndex(bs: BSDate): number {
  const d = bsToAd(bs.year, bs.month, bs.day);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY);
}

/** Whole days between two BS dates (`a − b`); negative when `a` is earlier. */
export function diffDays(a: BSDate, b: BSDate): number {
  return dayIndex(a) - dayIndex(b);
}

/** First day of a BS date's month: `{ year, month, day: 1 }`. */
export function startOfBsMonth(bs: BSDate): BSDate {
  assertYear(bs.year);
  if (bs.month < 1 || bs.month > 12) throw new RangeError(`Month must be 1–12; got ${bs.month}.`);
  return { year: bs.year, month: bs.month, day: 1 };
}

/** Last day of a BS date's month (clamped to that month's length). */
export function endOfBsMonth(bs: BSDate): BSDate {
  return { year: bs.year, month: bs.month, day: daysInBsMonth(bs.year, bs.month) };
}

/* --------------------------------- parsing --------------------------------- */

/**
 * Parse a BS date string ("2081-03-15", "२०८१/०३/१५", "2081.3.15") into a
 * validated `{ year, month, day }`. Accepts Arabic or Devanagari digits and any
 * non-digit separators. Throws if the shape is wrong or the date is not a real
 * BS date per the tables.
 */
export function parseBs(input: string): BSDate {
  const nums = fromDevanagari(input).match(/\d+/g);
  if (!nums || nums.length < 3) throw new Error(`cannot parse BS date "${input}"`);
  const year = Number(nums[0]);
  const month = Number(nums[1]);
  const day = Number(nums[2]);
  const max = daysInBsMonth(year, month); // validates year + month
  if (day < 1 || day > max) {
    throw new RangeError(`Day must be 1–${max} for ${bsMonthName(month)} ${year}; got ${day}.`);
  }
  return { year, month, day };
}

/** Like `parseBs`, but returns `null` instead of throwing on any bad input. */
export function tryParseBs(input: string): BSDate | null {
  try {
    return parseBs(input);
  } catch {
    return null;
  }
}

/* --------------------------------- formatting --------------------------------- */

/** English ordinal of a number, e.g. 1 → "1st", 15 → "15th", 22 → "22nd". */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = Math.abs(n) % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * Rich token formatter for a BS date. Tokens:
 * `YYYY` `YY` `MMMM` (month name) `MM` `M` `DD` `Do` (ordinal) `D`
 * `dddd` / `ddd` (weekday). Default pattern `"YYYY-MM-DD"`.
 *
 * Pass `{ nepali: true }` to render digits in Devanagari (०१२…) and use Nepali
 * month/weekday names.
 */
export function formatBs(
  bs: BSDate,
  pattern = "YYYY-MM-DD",
  opts: { nepali?: boolean } = {},
): string {
  const np = opts.nepali ?? false;
  const wd = bsWeekday(bs);
  const digits = (s: string | number) => (np ? toDevanagari(s) : String(s));
  const pad = (n: number) => digits(String(n).padStart(2, "0"));
  const map: Record<string, string> = {
    YYYY: digits(bs.year),
    YY: digits(String(bs.year).slice(-2)),
    MMMM: bsMonthName(bs.month, { nepali: np }),
    MM: pad(bs.month),
    M: digits(bs.month),
    DD: pad(bs.day),
    Do: np ? digits(bs.day) : ordinal(bs.day),
    D: digits(bs.day),
    dddd: bsWeekdayName(wd, { nepali: np }),
    ddd: np ? bsWeekdayName(wd, { nepali: true }) : NEPALI_WEEKDAYS[wd]!.slice(0, 3),
  };
  return pattern.replace(/YYYY|YY|MMMM|MM|M|DD|Do|D|dddd|ddd/g, (t) => map[t] ?? t);
}

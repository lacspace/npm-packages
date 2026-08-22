/**
 * @lacspace/nepali-date — Bikram Sambat (BS) ↔ Gregorian (AD) date conversion.
 * Zero-dependency, isomorphic. Supported BS range: 1970–2086 (AD 1913–2030).
 */

import { BS_MIN_YEAR, BS_MAX_YEAR, REFERENCE_AD, BS_MONTH_DAYS } from "./data";

const MS_PER_DAY = 86_400_000;

export const NEPALI_MONTHS = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
] as const;

export const NEPALI_MONTHS_NP = [
  "बैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज",
  "कात्तिक", "मंसिर", "पुष", "माघ", "फागुन", "चैत",
] as const;

export const NEPALI_WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

export const NEPALI_WEEKDAYS_NP = [
  "आइतबार", "सोमबार", "मंगलबार", "बुधबार", "बिहीबार", "शुक्रबार", "शनिबार",
] as const;

const DEVANAGARI_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"] as const;

/** Convert Arabic numerals in a string to Devanagari (e.g. "2081" → "२०८१"). */
export function toDevanagari(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => DEVANAGARI_DIGITS[Number(d)]!);
}

/** Convert Devanagari numerals in a string to Arabic (e.g. "२०८१" → "2081"). */
export function fromDevanagari(input: string): string {
  return input.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d as (typeof DEVANAGARI_DIGITS)[number])));
}

export interface BSDate {
  year: number;
  /** 1–12 (Baisakh = 1). */
  month: number;
  day: number;
}

function refDayIndex(): number {
  return Math.floor(Date.UTC(REFERENCE_AD[0], REFERENCE_AD[1], REFERENCE_AD[2]) / MS_PER_DAY);
}

function adDayIndex(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

function daysInBsMonth(year: number, month: number): number {
  return BS_MONTH_DAYS[year - BS_MIN_YEAR]![month - 1]!;
}

function assertInRange(year: number): void {
  if (year < BS_MIN_YEAR || year > BS_MAX_YEAR) {
    throw new RangeError(
      `@lacspace/nepali-date supports BS years ${BS_MIN_YEAR}–${BS_MAX_YEAR}; got ${year}.`,
    );
  }
}

/** Convert a Gregorian `Date` to a Bikram Sambat `{ year, month, day }`. */
export function adToBs(date: Date): BSDate {
  let offset = adDayIndex(date) - refDayIndex();
  if (offset < 0) {
    throw new RangeError("Date is before the supported Bikram Sambat range (BS 1970).");
  }
  for (let year = BS_MIN_YEAR; year <= BS_MAX_YEAR; year++) {
    for (let month = 1; month <= 12; month++) {
      const len = daysInBsMonth(year, month);
      if (offset < len) return { year, month, day: offset + 1 };
      offset -= len;
    }
  }
  throw new RangeError("Date is after the supported Bikram Sambat range (BS 2086).");
}

/** Convert a Bikram Sambat date to a Gregorian `Date` (local midnight of that day). */
export function bsToAd(year: number, month: number, day: number): Date {
  assertInRange(year);
  if (month < 1 || month > 12) throw new RangeError(`Month must be 1–12; got ${month}.`);
  const max = daysInBsMonth(year, month);
  if (day < 1 || day > max) {
    throw new RangeError(`Day must be 1–${max} for ${NEPALI_MONTHS[month - 1]} ${year}; got ${day}.`);
  }
  let days = 0;
  for (let y = BS_MIN_YEAR; y < year; y++) {
    for (let m = 1; m <= 12; m++) days += daysInBsMonth(y, m);
  }
  for (let m = 1; m < month; m++) days += daysInBsMonth(year, m);
  days += day - 1;

  const utc = new Date((refDayIndex() + days) * MS_PER_DAY);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/**
 * A Bikram Sambat calendar date. Construct from today, a Gregorian `Date`, or
 * explicit BS parts.
 *
 * ```ts
 * new NepaliDate();                 // today
 * new NepaliDate(new Date());       // from an AD date
 * new NepaliDate(2081, 1, 1);       // from BS parts (month is 1–12)
 * ```
 */
export class NepaliDate {
  private readonly bs: BSDate;
  private readonly ad: Date;

  constructor();
  constructor(adDate: Date);
  constructor(bsYear: number, bsMonth: number, bsDay: number);
  constructor(a?: Date | number, b?: number, c?: number) {
    if (a === undefined) {
      this.ad = new Date();
      this.bs = adToBs(this.ad);
    } else if (a instanceof Date) {
      this.ad = new Date(a.getFullYear(), a.getMonth(), a.getDate());
      this.bs = adToBs(this.ad);
    } else {
      this.bs = { year: a, month: b as number, day: c as number };
      this.ad = bsToAd(this.bs.year, this.bs.month, this.bs.day);
    }
  }

  static fromAD(date: Date): NepaliDate {
    return new NepaliDate(date);
  }
  static fromBS(year: number, month: number, day: number): NepaliDate {
    return new NepaliDate(year, month, day);
  }

  /** BS year, e.g. 2081. */
  getYear(): number {
    return this.bs.year;
  }
  /** BS month, 1–12 (Baisakh = 1). */
  getMonth(): number {
    return this.bs.month;
  }
  /** BS day of month, 1–32. */
  getDate(): number {
    return this.bs.day;
  }
  /** Weekday, 0 (Sunday) – 6 (Saturday). */
  getDay(): number {
    return this.ad.getDay();
  }
  /** The equivalent Gregorian `Date` (local midnight). */
  toAD(): Date {
    return new Date(this.ad);
  }
  /** `{ year, month, day }` in BS. */
  toBS(): BSDate {
    return { ...this.bs };
  }

  /**
   * Format with tokens: `YYYY` `YY` `MM` `M` `DD` `D` `MMMM` (month name)
   * `ddd`/`dddd` (weekday). Default: `YYYY-MM-DD`.
   */
  format(pattern = "YYYY-MM-DD"): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    const map: Record<string, string> = {
      YYYY: String(this.bs.year),
      YY: String(this.bs.year).slice(-2),
      MMMM: NEPALI_MONTHS[this.bs.month - 1]!,
      MM: pad(this.bs.month),
      M: String(this.bs.month),
      DD: pad(this.bs.day),
      D: String(this.bs.day),
      dddd: NEPALI_WEEKDAYS[this.getDay()]!,
      ddd: NEPALI_WEEKDAYS[this.getDay()]!.slice(0, 3),
    };
    return pattern.replace(/YYYY|YY|MMMM|MM|M|DD|D|dddd|ddd/g, (t) => map[t] ?? t);
  }

  /** Same as `format`, but in Nepali (Devanagari digits + Nepali names). */
  formatNepali(pattern = "YYYY MMMM D, dddd"): string {
    const map: Record<string, string> = {
      YYYY: toDevanagari(this.bs.year),
      MMMM: NEPALI_MONTHS_NP[this.bs.month - 1]!,
      MM: toDevanagari(String(this.bs.month).padStart(2, "0")),
      M: toDevanagari(this.bs.month),
      DD: toDevanagari(String(this.bs.day).padStart(2, "0")),
      D: toDevanagari(this.bs.day),
      dddd: NEPALI_WEEKDAYS_NP[this.getDay()]!,
    };
    return pattern.replace(/YYYY|MMMM|MM|M|DD|D|dddd/g, (t) => map[t] ?? t);
  }

  /** ISO-like `YYYY-MM-DD` in BS. */
  toString(): string {
    return this.format("YYYY-MM-DD");
  }
}

export { BS_MIN_YEAR, BS_MAX_YEAR } from "./data";
export default NepaliDate;

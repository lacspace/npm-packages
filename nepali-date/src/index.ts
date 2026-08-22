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

  /* ------------------------------ queries ------------------------------ */

  /** Number of days in this BS month (28–32). */
  daysInMonth(): number {
    return daysInBsMonth(this.bs.year, this.bs.month);
  }

  /** Days in a given BS month. */
  static daysInMonth(year: number, month: number): number {
    assertInRange(year);
    if (month < 1 || month > 12) throw new RangeError(`Month must be 1–12; got ${month}.`);
    return daysInBsMonth(year, month);
  }

  /** True if `(year, month, day)` is a valid, in-range BS date. */
  static isValid(year: number, month: number, day: number): boolean {
    try {
      if (month < 1 || month > 12) return false;
      if (day < 1 || day > NepaliDate.daysInMonth(year, month)) return false;
      return true;
    } catch {
      return false;
    }
  }

  /** True on Saturday (Nepal's weekly holiday). */
  isSaturday(): boolean {
    return this.getDay() === 6;
  }

  /** True on the Nepali weekend (Saturday). */
  isWeekend(): boolean {
    return this.isSaturday();
  }

  /** True if this date is today. */
  isToday(): boolean {
    return this.isSame(new NepaliDate(), "day");
  }

  /* ------------------------------ arithmetic ------------------------------ */

  /** A new date `n` days from this one (n may be negative). */
  addDays(n: number): NepaliDate {
    const d = new Date(this.ad);
    d.setDate(d.getDate() + n);
    return NepaliDate.fromAD(d);
  }

  /** A new date `n` BS months away, clamping the day to the target month length. */
  addMonths(n: number): NepaliDate {
    const total = this.bs.year * 12 + (this.bs.month - 1) + n;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    const day = Math.min(this.bs.day, NepaliDate.daysInMonth(year, month));
    return NepaliDate.fromBS(year, month, day);
  }

  /** A new date `n` BS years away (day clamped). */
  addYears(n: number): NepaliDate {
    return this.addMonths(n * 12);
  }

  /* ------------------------------ comparison ------------------------------ */

  /** -1 if before `other`, 0 if same day, 1 if after. */
  compare(other: NepaliDate): -1 | 0 | 1 {
    const a = adDayIndex(this.ad);
    const b = adDayIndex(other.ad);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  isBefore(other: NepaliDate): boolean {
    return this.compare(other) < 0;
  }
  isAfter(other: NepaliDate): boolean {
    return this.compare(other) > 0;
  }

  /** Equality at day / month / year granularity (default "day"). */
  isSame(other: NepaliDate, unit: "day" | "month" | "year" = "day"): boolean {
    if (unit === "year") return this.bs.year === other.bs.year;
    if (unit === "month") return this.bs.year === other.bs.year && this.bs.month === other.bs.month;
    return this.compare(other) === 0;
  }

  /** Difference from `other` in the given unit (this − other), truncated. */
  diff(other: NepaliDate, unit: "days" | "weeks" | "months" | "years" = "days"): number {
    const days = adDayIndex(this.ad) - adDayIndex(other.ad);
    if (unit === "days") return days;
    if (unit === "weeks") return Math.trunc(days / 7);
    let months = (this.bs.year - other.bs.year) * 12 + (this.bs.month - other.bs.month);
    if (months > 0 && this.bs.day < other.bs.day) months -= 1;
    else if (months < 0 && this.bs.day > other.bs.day) months += 1;
    return unit === "months" ? months : Math.trunc(months / 12);
  }

  /* ------------------------------ fiscal year ------------------------------ */

  /** Nepali fiscal year (Shrawan 1 → Ashadh end): `{ start, end }` BS years. */
  fiscalYear(): { start: number; end: number } {
    // months 4..12 (Shrawan..Chaitra) → FY start = this year; 1..3 → start = last year
    return this.bs.month >= 4
      ? { start: this.bs.year, end: this.bs.year + 1 }
      : { start: this.bs.year - 1, end: this.bs.year };
  }

  /** Fiscal-year label, e.g. "2081/82". */
  fiscalYearLabel(): string {
    const { start, end } = this.fiscalYear();
    return `${start}/${String(end).slice(-2)}`;
  }

  /* ------------------------------ relative time ------------------------------ */

  /** Human "time from now", e.g. "3 दिन अघि" / "in 2 months". */
  fromNow(opts: { nepali?: boolean; now?: NepaliDate } = {}): string {
    const now = opts.now ?? new NepaliDate();
    const days = this.diff(now, "days");
    const np = opts.nepali ?? false;
    if (days === 0) return np ? "आज" : "today";
    if (days === -1) return np ? "हिजो" : "yesterday";
    if (days === 1) return np ? "भोलि" : "tomorrow";
    const abs = Math.abs(days);
    const past = days < 0;
    let n: number;
    let unitEn: string;
    let unitNp: string;
    if (abs < 30) {
      n = abs;
      unitEn = "day";
      unitNp = "दिन";
    } else if (abs < 365) {
      n = Math.round(abs / 30);
      unitEn = "month";
      unitNp = "महिना";
    } else {
      n = Math.round(abs / 365);
      unitEn = "year";
      unitNp = "वर्ष";
    }
    if (np) return `${toDevanagari(n)} ${unitNp} ${past ? "अघि" : "पछि"}`;
    return past ? `${n} ${unitEn}${n > 1 ? "s" : ""} ago` : `in ${n} ${unitEn}${n > 1 ? "s" : ""}`;
  }

  /* ------------------------------ calendar grid ------------------------------ */

  /**
   * Weeks (Sun–Sat) for this BS month, for calendar UIs. Cells outside the
   * month are `null`; in-month cells carry the day and its `NepaliDate`.
   */
  getMonthMatrix(): ({ day: number; date: NepaliDate; isToday: boolean } | null)[][] {
    const first = NepaliDate.fromBS(this.bs.year, this.bs.month, 1);
    const lead = first.getDay(); // 0 = Sunday
    const total = this.daysInMonth();
    const today = new NepaliDate();
    const cells: ({ day: number; date: NepaliDate; isToday: boolean } | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= total; d++) {
      const date = NepaliDate.fromBS(this.bs.year, this.bs.month, d);
      cells.push({ day: d, date, isToday: date.isSame(today, "day") });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: ({ day: number; date: NepaliDate; isToday: boolean } | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  /* ------------------------------ parsing & ranges ------------------------------ */

  /** Parse a BS date string ("2081-01-15", "२०८१/०१/१५", "2081.1.15"). */
  static parse(input: string): NepaliDate {
    const nums = fromDevanagari(input).match(/\d+/g);
    if (!nums || nums.length < 3) throw new Error(`cannot parse BS date "${input}"`);
    return NepaliDate.fromBS(Number(nums[0]), Number(nums[1]), Number(nums[2]));
  }

  /** Iterate each day from `start` to `end` (inclusive). */
  static *eachDay(start: NepaliDate, end: NepaliDate): Generator<NepaliDate, void, unknown> {
    const step = start.isAfter(end) ? -1 : 1;
    let cur = start;
    while (true) {
      yield cur;
      if (cur.isSame(end, "day")) break;
      cur = cur.addDays(step);
    }
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

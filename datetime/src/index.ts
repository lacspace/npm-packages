/**
 * @lacspace/datetime — a zero-dependency, isomorphic, immutable date-time toolkit.
 *
 * Date MATH + token FORMAT/PARSE + COMPARISON over the native `Date`.
 * Every function is pure: inputs are never mutated, a fresh `Date` is always returned.
 *
 * Interop:
 *  - Humanized / relative-time display  →  pair with @lacspace/humanize
 *  - Timezone-aware conversion          →  pair with @lacspace/timezone
 *  - Bikram Sambat (BS ↔ AD)            →  pair with @lacspace/nepali-date
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Anything that can name a moment in time. */
export type DateInput = Date | number | string;

/** A unit of calendar/clock granularity. */
export type Unit =
  | "year"
  | "quarter"
  | "month"
  | "week"
  | "day"
  | "hour"
  | "minute"
  | "second";

/** A unit usable with {@link diff}. */
export type DiffUnit = Unit | "millisecond";

/** A relative duration, added to or subtracted from a date. */
export interface Duration {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

/** A calendar breakdown of the interval between two dates (from {@link difference}). */
export interface DurationBreakdown {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Locale month/weekday names for {@link format} and {@link parse}. Defaults to English. */
export interface LocaleData {
  /** 12 full month names, January first. */
  months?: string[];
  /** 12 short month names, Jan first. */
  monthsShort?: string[];
  /** 7 full weekday names, Sunday first. */
  weekdays?: string[];
  /** 7 short weekday names, Sun first. */
  weekdaysShort?: string[];
}

export interface FormatOptions {
  locale?: LocaleData;
  /** Format the UTC wall-clock instead of the local one. */
  utc?: boolean;
}

export interface ParseOptions {
  locale?: LocaleData;
  /** Throw on mismatch instead of returning an Invalid Date. Default `false`. */
  throwOnInvalid?: boolean;
}

/** 0 = Sunday … 6 = Saturday. */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WeekOptions {
  /** First day of the week. Default `1` (Monday, ISO-8601). */
  weekStartsOn?: WeekStartsOn;
}

export interface ISOOptions {
  /** Emit the UTC instant with a `Z` suffix instead of the local offset. */
  utc?: boolean;
}

/** Boundary inclusivity for {@link isBetween}: `[` / `]` inclusive, `(` / `)` exclusive. */
export type Inclusivity = "()" | "[]" | "(]" | "[)";

// ---------------------------------------------------------------------------
// Default (English) locale
// ---------------------------------------------------------------------------

const EN: Required<LocaleData> = {
  months: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
  monthsShort: [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ],
  weekdays: [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ],
  weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const INVALID = new Date(NaN);

function pad(n: number, len = 2): string {
  return String(Math.abs(Math.trunc(n))).padStart(len, "0");
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function parseOffset(token: string): number {
  if (token === "Z") return 0;
  const sign = token[0] === "-" ? -1 : 1;
  const body = token.slice(1).replace(":", "");
  const hh = Number(body.slice(0, 2));
  const mm = Number(body.slice(2, 4));
  return sign * (hh * 60 + mm);
}

/** Coerce any {@link DateInput} to a fresh `Date` (never mutating the input). */
export function toDate(input: DateInput): Date {
  if (input instanceof Date) return new Date(input.getTime());
  if (typeof input === "number") return new Date(input);
  if (typeof input === "string") return parseISO(input);
  return new Date(NaN);
}

function isInvalid(d: Date): boolean {
  return Number.isNaN(d.getTime());
}

/** Overflow-safe in-place month shift (Jan 31 + 1 → Feb 28/29). */
function shiftMonths(r: Date, totalMonths: number): void {
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + totalMonths);
  const dim = daysInMonth(r.getFullYear(), r.getMonth());
  r.setDate(Math.min(day, dim));
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

/**
 * Return a new date shifted by the given duration. Immutable and
 * month-overflow-safe: e.g. `add(Jan 31, { months: 1 })` → Feb 28/29.
 * Years/months/weeks/days shift the wall-clock calendar; hours/minutes/
 * seconds/milliseconds shift by absolute elapsed time.
 */
export function add(input: DateInput, duration: Duration): Date {
  const r = toDate(input);
  if (isInvalid(r)) return INVALID;
  const {
    years = 0, months = 0, weeks = 0, days = 0,
    hours = 0, minutes = 0, seconds = 0, milliseconds = 0,
  } = duration;

  if (years || months) shiftMonths(r, years * 12 + months);
  if (weeks || days) r.setDate(r.getDate() + days + weeks * 7);

  const msDelta =
    (((hours * 60 + minutes) * 60 + seconds) * 1000) + milliseconds;
  return msDelta ? new Date(r.getTime() + msDelta) : r;
}

/** Return a new date shifted backwards by the given duration. */
export function subtract(input: DateInput, duration: Duration): Date {
  const neg: Duration = {};
  (Object.keys(duration) as (keyof Duration)[]).forEach((k) => {
    const v = duration[k];
    if (typeof v === "number") neg[k] = -v;
  });
  return add(input, neg);
}

export const addMilliseconds = (d: DateInput, n: number): Date => add(d, { milliseconds: n });
export const addSeconds = (d: DateInput, n: number): Date => add(d, { seconds: n });
export const addMinutes = (d: DateInput, n: number): Date => add(d, { minutes: n });
export const addHours = (d: DateInput, n: number): Date => add(d, { hours: n });
export const addDays = (d: DateInput, n: number): Date => add(d, { days: n });
export const addWeeks = (d: DateInput, n: number): Date => add(d, { weeks: n });
export const addMonths = (d: DateInput, n: number): Date => add(d, { months: n });
export const addYears = (d: DateInput, n: number): Date => add(d, { years: n });

export const subMilliseconds = (d: DateInput, n: number): Date => add(d, { milliseconds: -n });
export const subSeconds = (d: DateInput, n: number): Date => add(d, { seconds: -n });
export const subMinutes = (d: DateInput, n: number): Date => add(d, { minutes: -n });
export const subHours = (d: DateInput, n: number): Date => add(d, { hours: -n });
export const subDays = (d: DateInput, n: number): Date => add(d, { days: -n });
export const subWeeks = (d: DateInput, n: number): Date => add(d, { weeks: -n });
export const subMonths = (d: DateInput, n: number): Date => add(d, { months: -n });
export const subYears = (d: DateInput, n: number): Date => add(d, { years: -n });

// ---------------------------------------------------------------------------
// start / end of unit
// ---------------------------------------------------------------------------

function weekStartDiff(day: number, weekStartsOn: number): number {
  return (day - weekStartsOn + 7) % 7;
}

/** Return a new date snapped to the start of the given unit (local time). */
export function startOf(input: DateInput, unit: Unit, opts: WeekOptions = {}): Date {
  const r = toDate(input);
  if (isInvalid(r)) return INVALID;
  switch (unit) {
    case "year":
      r.setMonth(0, 1);
      r.setHours(0, 0, 0, 0);
      break;
    case "quarter":
      r.setMonth(Math.floor(r.getMonth() / 3) * 3, 1);
      r.setHours(0, 0, 0, 0);
      break;
    case "month":
      r.setDate(1);
      r.setHours(0, 0, 0, 0);
      break;
    case "week": {
      const start = opts.weekStartsOn ?? 1;
      r.setDate(r.getDate() - weekStartDiff(r.getDay(), start));
      r.setHours(0, 0, 0, 0);
      break;
    }
    case "day":
      r.setHours(0, 0, 0, 0);
      break;
    case "hour":
      r.setMinutes(0, 0, 0);
      break;
    case "minute":
      r.setSeconds(0, 0);
      break;
    case "second":
      r.setMilliseconds(0);
      break;
  }
  return r;
}

/** Return a new date snapped to the last millisecond of the given unit (local time). */
export function endOf(input: DateInput, unit: Unit, opts: WeekOptions = {}): Date {
  const r = toDate(input);
  if (isInvalid(r)) return INVALID;
  switch (unit) {
    case "year":
      r.setMonth(11, 31);
      r.setHours(23, 59, 59, 999);
      break;
    case "quarter": {
      const qEndMonth = Math.floor(r.getMonth() / 3) * 3 + 2;
      r.setMonth(qEndMonth, daysInMonth(r.getFullYear(), qEndMonth));
      r.setHours(23, 59, 59, 999);
      break;
    }
    case "month":
      r.setDate(daysInMonth(r.getFullYear(), r.getMonth()));
      r.setHours(23, 59, 59, 999);
      break;
    case "week": {
      const start = opts.weekStartsOn ?? 1;
      r.setDate(r.getDate() - weekStartDiff(r.getDay(), start) + 6);
      r.setHours(23, 59, 59, 999);
      break;
    }
    case "day":
      r.setHours(23, 59, 59, 999);
      break;
    case "hour":
      r.setMinutes(59, 59, 999);
      break;
    case "minute":
      r.setSeconds(59, 999);
      break;
    case "second":
      r.setMilliseconds(999);
      break;
  }
  return r;
}

// ---------------------------------------------------------------------------
// diff
// ---------------------------------------------------------------------------

const MS = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
} as const;

/** Signed, calendar-correct, truncated difference in whole months (a − b). */
function monthDiff(a: Date, b: Date): number {
  const sign = a.getTime() >= b.getTime() ? 1 : -1;
  const hi = sign > 0 ? a : b;
  const lo = sign > 0 ? b : a;
  let months =
    (hi.getFullYear() - lo.getFullYear()) * 12 + (hi.getMonth() - lo.getMonth());
  const anchor = new Date(lo.getTime());
  shiftMonths(anchor, months);
  if (anchor.getTime() > hi.getTime()) months--;
  return months === 0 ? 0 : sign * months;
}

/** Normalise `-0` to `0` so truncated diffs never surprise strict equality. */
function noNegZero(n: number): number {
  return n === 0 ? 0 : n;
}

/**
 * Signed difference between two dates, expressed in `unit` and truncated
 * toward zero. `diff(a, b, unit)` reads as "a minus b".
 */
export function diff(a: DateInput, b: DateInput, unit: DiffUnit = "millisecond"): number {
  const A = toDate(a);
  const B = toDate(b);
  if (isInvalid(A) || isInvalid(B)) return NaN;
  const delta = A.getTime() - B.getTime();
  switch (unit) {
    case "year": return Math.trunc(monthDiff(A, B) / 12);
    case "quarter": return Math.trunc(monthDiff(A, B) / 3);
    case "month": return monthDiff(A, B);
    case "week": return noNegZero(Math.trunc(delta / MS.week));
    case "day": return noNegZero(Math.trunc(delta / MS.day));
    case "hour": return noNegZero(Math.trunc(delta / MS.hour));
    case "minute": return noNegZero(Math.trunc(delta / MS.minute));
    case "second": return noNegZero(Math.trunc(delta / MS.second));
    case "millisecond": return delta;
  }
}

export const diffInMilliseconds = (a: DateInput, b: DateInput): number => diff(a, b, "millisecond");
export const diffInSeconds = (a: DateInput, b: DateInput): number => diff(a, b, "second");
export const diffInMinutes = (a: DateInput, b: DateInput): number => diff(a, b, "minute");
export const diffInHours = (a: DateInput, b: DateInput): number => diff(a, b, "hour");
export const diffInDays = (a: DateInput, b: DateInput): number => diff(a, b, "day");
export const diffInWeeks = (a: DateInput, b: DateInput): number => diff(a, b, "week");
export const diffInMonths = (a: DateInput, b: DateInput): number => diff(a, b, "month");
export const diffInYears = (a: DateInput, b: DateInput): number => diff(a, b, "year");

/**
 * Full calendar breakdown of the interval `a − b` as
 * `{ years, months, days, hours, minutes, seconds }`. All fields share the
 * sign of `a − b`.
 */
export function difference(a: DateInput, b: DateInput): DurationBreakdown {
  const A = toDate(a);
  const B = toDate(b);
  if (isInvalid(A) || isInvalid(B)) {
    return { years: NaN, months: NaN, days: NaN, hours: NaN, minutes: NaN, seconds: NaN };
  }
  const sign = A.getTime() >= B.getTime() ? 1 : -1;
  const hi = new Date(Math.max(A.getTime(), B.getTime()));
  const lo = new Date(Math.min(A.getTime(), B.getTime()));

  let years = hi.getFullYear() - lo.getFullYear();
  let cursor = addYears(lo, years);
  if (cursor.getTime() > hi.getTime()) {
    years--;
    cursor = addYears(lo, years);
  }

  let months = 0;
  for (;;) {
    const next = addMonths(cursor, 1);
    if (next.getTime() <= hi.getTime()) {
      months++;
      cursor = next;
    } else break;
  }

  let days = 0;
  for (;;) {
    const next = addDays(cursor, 1);
    if (next.getTime() <= hi.getTime()) {
      days++;
      cursor = next;
    } else break;
  }

  let rem = hi.getTime() - cursor.getTime();
  const hours = Math.floor(rem / MS.hour);
  rem -= hours * MS.hour;
  const minutes = Math.floor(rem / MS.minute);
  rem -= minutes * MS.minute;
  const seconds = Math.floor(rem / MS.second);

  return {
    years: sign * years,
    months: sign * months,
    days: sign * days,
    hours: sign * hours,
    minutes: sign * minutes,
    seconds: sign * seconds,
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export function isBefore(a: DateInput, b: DateInput): boolean {
  return toDate(a).getTime() < toDate(b).getTime();
}

export function isAfter(a: DateInput, b: DateInput): boolean {
  return toDate(a).getTime() > toDate(b).getTime();
}

export function isEqual(a: DateInput, b: DateInput): boolean {
  return toDate(a).getTime() === toDate(b).getTime();
}

export function isSameDay(a: DateInput, b: DateInput): boolean {
  return isSame(a, b, "day");
}

/** Whether `a` and `b` fall in the same calendar `unit` (local time). */
export function isSame(a: DateInput, b: DateInput, unit: Unit = "day", opts: WeekOptions = {}): boolean {
  return startOf(a, unit, opts).getTime() === startOf(b, unit, opts).getTime();
}

/** Earliest of the given dates, or `undefined` when none are supplied. */
export function min(...dates: DateInput[]): Date | undefined {
  let best: Date | undefined;
  for (const d of dates) {
    const cur = toDate(d);
    if (isInvalid(cur)) continue;
    if (!best || cur.getTime() < best.getTime()) best = cur;
  }
  return best;
}

/** Latest of the given dates, or `undefined` when none are supplied. */
export function max(...dates: DateInput[]): Date | undefined {
  let best: Date | undefined;
  for (const d of dates) {
    const cur = toDate(d);
    if (isInvalid(cur)) continue;
    if (!best || cur.getTime() > best.getTime()) best = cur;
  }
  return best;
}

/** Clamp a date into the `[min, max]` range (either bound optional). */
export function clamp(input: DateInput, bounds: { min?: DateInput; max?: DateInput }): Date {
  let r = toDate(input);
  if (bounds.min !== undefined) {
    const lo = toDate(bounds.min);
    if (r.getTime() < lo.getTime()) r = lo;
  }
  if (bounds.max !== undefined) {
    const hi = toDate(bounds.max);
    if (r.getTime() > hi.getTime()) r = hi;
  }
  return new Date(r.getTime());
}

/**
 * Whether `date` lies between `start` and `end`. `inclusivity` controls the
 * boundaries (`"[]"` inclusive both ends by default; `"("`/`")"` exclusive).
 * `start`/`end` may be given in any order.
 */
export function isBetween(
  date: DateInput,
  start: DateInput,
  end: DateInput,
  inclusivity: Inclusivity = "[]",
): boolean {
  const t = toDate(date).getTime();
  const a = toDate(start).getTime();
  const b = toDate(end).getTime();
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const lowOk = inclusivity[0] === "[" ? t >= lo : t > lo;
  const highOk = inclusivity[1] === "]" ? t <= hi : t < hi;
  return lowOk && highOk;
}

/** The date from `dates` nearest to `date`, or `undefined` if none valid. */
export function closestTo(date: DateInput, dates: DateInput[]): Date | undefined {
  const target = toDate(date).getTime();
  let best: Date | undefined;
  let bestDist = Infinity;
  for (const d of dates) {
    const cur = toDate(d);
    if (isInvalid(cur)) continue;
    const dist = Math.abs(cur.getTime() - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = cur;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

function yearOf(input: number | DateInput): number {
  if (typeof input === "number" && Number.isInteger(input) && Math.abs(input) < 10_000) {
    return input;
  }
  return toDate(input as DateInput).getFullYear();
}

/** Whether the year (a year number, or the year of a date) is a leap year. */
export function isLeapYear(input: number | DateInput): boolean {
  const y = yearOf(input);
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Number of days in a month. Call with a date — `daysInMonth(date)` — or with
 * an explicit `daysInMonth(year, monthIndex)` where `monthIndex` is 0-based.
 */
export function daysInMonth(input: DateInput, month?: number): number {
  let year: number;
  let m: number;
  if (month === undefined) {
    const d = toDate(input);
    year = d.getFullYear();
    m = d.getMonth();
  } else {
    year = input as number;
    m = month;
  }
  return new Date(year, m + 1, 0).getDate();
}

/** Whether the date falls on a Saturday or Sunday (local time). */
export function isWeekend(input: DateInput): boolean {
  const day = toDate(input).getDay();
  return day === 0 || day === 6;
}

/** Day of the year, 1–366. */
export function getDayOfYear(input: DateInput): number {
  const d = toDate(input);
  const startUTC = Date.UTC(d.getFullYear(), 0, 1);
  const curUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((curUTC - startUTC) / MS.day) + 1;
}

/** ISO-8601 week number of the year (weeks start Monday; week 1 holds Jan 4). */
export function getWeekOfYear(input: DateInput): number {
  const d = toDate(input);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / MS.week);
}

/** Calendar quarter, 1–4. */
export function getQuarter(input: DateInput): number {
  return Math.floor(toDate(input).getMonth() / 3) + 1;
}

/** Whether the input represents a valid date. */
export function isValid(input: DateInput): boolean {
  return !isInvalid(toDate(input));
}

// ---------------------------------------------------------------------------
// Token format / parse
// ---------------------------------------------------------------------------

const TOKEN_RE =
  /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|SSS|A|a|Z/g;

/**
 * Format a date with dayjs/moment-style tokens.
 *
 * Tokens: `YYYY YY` (year), `MMMM MMM MM M` (month), `DD D` (day),
 * `dddd ddd` (weekday), `HH H` (24h), `hh h` (12h), `mm m`, `ss s`,
 * `SSS` (ms), `A a` (meridiem), `Z` (offset). Wrap literal text in `[…]`.
 */
export function format(input: DateInput, pattern: string, opts: FormatOptions = {}): string {
  const d = toDate(input);
  if (isInvalid(d)) return "Invalid Date";
  const loc = { ...EN, ...(opts.locale ?? {}) };
  const utc = !!opts.utc;

  const year = utc ? d.getUTCFullYear() : d.getFullYear();
  const month = utc ? d.getUTCMonth() : d.getMonth();
  const date = utc ? d.getUTCDate() : d.getDate();
  const weekday = utc ? d.getUTCDay() : d.getDay();
  const hours = utc ? d.getUTCHours() : d.getHours();
  const minutes = utc ? d.getUTCMinutes() : d.getMinutes();
  const seconds = utc ? d.getUTCSeconds() : d.getSeconds();
  const millis = utc ? d.getUTCMilliseconds() : d.getMilliseconds();
  const offset = utc ? 0 : -d.getTimezoneOffset();
  const h12 = hours % 12 === 0 ? 12 : hours % 12;

  return pattern.replace(TOKEN_RE, (matched: string, escaped?: string): string => {
    if (escaped !== undefined) return escaped;
    switch (matched) {
      case "YYYY": return pad(year, 4);
      case "YY": return pad(year % 100, 2);
      case "MMMM": return loc.months[month] ?? "";
      case "MMM": return loc.monthsShort[month] ?? "";
      case "MM": return pad(month + 1);
      case "M": return String(month + 1);
      case "DD": return pad(date);
      case "D": return String(date);
      case "dddd": return loc.weekdays[weekday] ?? "";
      case "ddd": return loc.weekdaysShort[weekday] ?? "";
      case "HH": return pad(hours);
      case "H": return String(hours);
      case "hh": return pad(h12);
      case "h": return String(h12);
      case "mm": return pad(minutes);
      case "m": return String(minutes);
      case "ss": return pad(seconds);
      case "s": return String(seconds);
      case "SSS": return pad(millis, 3);
      case "A": return hours < 12 ? "AM" : "PM";
      case "a": return hours < 12 ? "am" : "pm";
      case "Z": return utc ? "Z" : formatOffset(offset);
      default: return matched;
    }
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function monthFromName(loc: Required<LocaleData>, value: string, short: boolean): number {
  const arr = short ? loc.monthsShort : loc.months;
  const lower = value.toLowerCase();
  return arr.findIndex((n) => n.toLowerCase() === lower);
}

interface ParseFields {
  year?: number;
  month?: number;
  day?: number;
  hour24?: number;
  hour12?: number;
  minute: number;
  second: number;
  ms: number;
  meridiem?: "AM" | "PM";
  offset?: number;
}

/**
 * Parse a string against a token pattern (the inverse of {@link format}).
 * Strict, whole-string match: on mismatch it returns an Invalid Date, or
 * throws when `opts.throwOnInvalid` is set.
 */
export function parse(input: string, pattern: string, opts: ParseOptions = {}): Date {
  const loc = { ...EN, ...(opts.locale ?? {}) };
  const fail = (): Date => {
    if (opts.throwOnInvalid) {
      throw new Error(`Unable to parse "${input}" with pattern "${pattern}"`);
    }
    return new Date(NaN);
  };

  const fields: ParseFields = { minute: 0, second: 0, ms: 0 };
  const handlers: Array<(v: string) => void> = [];
  let regexStr = "^";
  let last = 0;
  let m: RegExpExecArray | null;

  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(pattern)) !== null) {
    if (m.index > last) regexStr += escapeRegExp(pattern.slice(last, m.index));
    last = m.index + m[0].length;

    if (m[1] !== undefined) {
      regexStr += escapeRegExp(m[1]);
      continue;
    }

    switch (m[0]) {
      case "YYYY": regexStr += "(\\d{4})"; handlers.push((v) => { fields.year = +v; }); break;
      case "YY": regexStr += "(\\d{2})"; handlers.push((v) => { fields.year = 2000 + +v; }); break;
      case "MMMM": regexStr += "([A-Za-z\\u00C0-\\u024F]+)"; handlers.push((v) => { fields.month = monthFromName(loc, v, false); }); break;
      case "MMM": regexStr += "([A-Za-z\\u00C0-\\u024F]+)"; handlers.push((v) => { fields.month = monthFromName(loc, v, true); }); break;
      case "MM": case "M": regexStr += "(\\d{1,2})"; handlers.push((v) => { fields.month = +v - 1; }); break;
      case "DD": case "D": regexStr += "(\\d{1,2})"; handlers.push((v) => { fields.day = +v; }); break;
      case "HH": case "H": regexStr += "(\\d{1,2})"; handlers.push((v) => { fields.hour24 = +v; }); break;
      case "hh": case "h": regexStr += "(\\d{1,2})"; handlers.push((v) => { fields.hour12 = +v; }); break;
      case "mm": case "m": regexStr += "(\\d{1,2})"; handlers.push((v) => { fields.minute = +v; }); break;
      case "ss": case "s": regexStr += "(\\d{1,2})"; handlers.push((v) => { fields.second = +v; }); break;
      case "SSS": regexStr += "(\\d{3})"; handlers.push((v) => { fields.ms = +v; }); break;
      case "A": regexStr += "(AM|PM)"; handlers.push((v) => { fields.meridiem = v.toUpperCase() as "AM" | "PM"; }); break;
      case "a": regexStr += "(am|pm)"; handlers.push((v) => { fields.meridiem = v.toUpperCase() as "AM" | "PM"; }); break;
      case "dddd": case "ddd": regexStr += "([A-Za-z\\u00C0-\\u024F]+)"; handlers.push(() => { /* consumed, not used */ }); break;
      case "Z": regexStr += "(Z|[+-]\\d{2}:?\\d{2})"; handlers.push((v) => { fields.offset = parseOffset(v); }); break;
    }
  }
  if (pattern.length > last) regexStr += escapeRegExp(pattern.slice(last));
  regexStr += "$";

  const match = new RegExp(regexStr).exec(input);
  if (!match) return fail();
  for (let i = 0; i < handlers.length; i++) {
    handlers[i]!(match[i + 1] ?? "");
  }

  let hour = 0;
  if (fields.hour24 !== undefined) {
    hour = fields.hour24;
  } else if (fields.hour12 !== undefined) {
    hour = fields.hour12 % 12;
    if (fields.meridiem === "PM") hour += 12;
  }

  const year = fields.year ?? 1970;
  const month = fields.month ?? 0;
  const day = fields.day ?? 1;

  if (
    !(month >= 0 && month <= 11) ||
    !(day >= 1 && day <= 31) ||
    hour > 23 || fields.minute > 59 || fields.second > 59
  ) {
    return fail();
  }

  let out: Date;
  if (fields.offset !== undefined) {
    out = new Date(
      Date.UTC(year, month, day, hour, fields.minute, fields.second, fields.ms) -
        fields.offset * 60_000,
    );
  } else {
    out = new Date(year, month, day, hour, fields.minute, fields.second, fields.ms);
    // Reject impossible calendar dates (e.g. Feb 30 rolling into March).
    if (out.getMonth() !== month || out.getDate() !== day) return fail();
  }
  if (isInvalid(out)) return fail();
  return out;
}

// ---------------------------------------------------------------------------
// ISO / Unix
// ---------------------------------------------------------------------------

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Parse an ISO-8601 / RFC-3339 string into a `Date`. A date-only string and a
 * time without offset are read as local; a `Z` or `±HH:mm` offset pins the
 * instant. Returns an Invalid Date for non-ISO input.
 */
export function parseISO(str: string): Date {
  if (typeof str !== "string") return new Date(NaN);
  const m = ISO_RE.exec(str.trim());
  if (!m) return new Date(NaN);

  const year = +m[1]!;
  const month = +m[2]! - 1;
  const day = +m[3]!;
  const hasTime = m[4] !== undefined;
  const hour = m[4] ? +m[4] : 0;
  const minute = m[5] ? +m[5] : 0;
  const second = m[6] ? +m[6] : 0;
  const ms = m[7] ? Math.round(Number(`0.${m[7]}`) * 1000) : 0;
  const off = m[8];

  if (month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return new Date(NaN);
  }

  let out: Date;
  if (off) {
    const offMin = parseOffset(off);
    out = new Date(Date.UTC(year, month, day, hour, minute, second, ms) - offMin * 60_000);
  } else if (!hasTime) {
    out = new Date(year, month, day, 0, 0, 0, 0);
  } else {
    out = new Date(year, month, day, hour, minute, second, ms);
  }
  // Reject overflowed calendar dates (Feb 30, month 13 already blocked above).
  if (!off && (out.getMonth() !== month || out.getDate() !== day)) return new Date(NaN);
  return out;
}

/**
 * Emit an ISO-8601 / RFC-3339 string. With `{ utc: true }` the UTC instant is
 * emitted with a `Z` suffix; otherwise the local wall-clock with its offset.
 */
export function toISO(input: DateInput, opts: ISOOptions = {}): string {
  const d = toDate(input);
  if (isInvalid(d)) return "Invalid Date";
  if (opts.utc) {
    return (
      `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
      `.${pad(d.getUTCMilliseconds(), 3)}Z`
    );
  }
  return (
    `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${pad(d.getMilliseconds(), 3)}${formatOffset(-d.getTimezoneOffset())}`
  );
}

/** Unix timestamp in whole seconds. */
export function unix(input: DateInput): number {
  return Math.floor(toDate(input).getTime() / 1000);
}

/** Construct a `Date` from a Unix timestamp in seconds. */
export function fromUnix(seconds: number): Date {
  return new Date(seconds * 1000);
}

// ---------------------------------------------------------------------------
// New in 1.1.0 — relative-time, business days & calendar helpers
// ---------------------------------------------------------------------------

export { formatRelative } from "./relative";
export type { RelativeUnit, RelativeOptions } from "./relative";

export {
  isBusinessDay,
  addBusinessDays,
  subBusinessDays,
  nextBusinessDay,
  previousBusinessDay,
  businessDaysBetween,
} from "./business";
export type { BusinessDayOptions } from "./business";

export {
  isToday,
  isYesterday,
  isTomorrow,
  isPast,
  isFuture,
  isFirstDayOfMonth,
  isLastDayOfMonth,
  nextWeekday,
  previousWeekday,
  getMonthName,
  getWeekdayName,
  getDaysInYear,
  calendarGrid,
} from "./calendar";
export type {
  NowOptions,
  NameOptions,
  CalendarCell,
  CalendarGridOptions,
} from "./calendar";

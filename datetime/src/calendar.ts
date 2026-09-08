/**
 * Calendar helpers: a month-grid builder, "relative to now" predicates,
 * weekday navigation and localized name getters. Everything is immutable and
 * built on the core primitives, so it inherits their timezone semantics.
 */

import type { DateInput, WeekStartsOn, WeekOptions, LocaleData } from "./index";
import {
  toDate, addDays, subDays, startOf, endOf, isSame, isWeekend, isLeapYear, format,
} from "./index";

// ---------------------------------------------------------------------------
// Relative-to-now predicates (all injectable via `opts.now` for testability)
// ---------------------------------------------------------------------------

export interface NowOptions {
  /** The reference "now". Defaults to the current time. */
  now?: DateInput;
}

function nowDate(opts: NowOptions): Date {
  return opts.now === undefined ? new Date() : toDate(opts.now);
}

/** Whether the date is on the same calendar day as now (local time). */
export function isToday(input: DateInput, opts: NowOptions = {}): boolean {
  return isSame(input, nowDate(opts), "day");
}

/** Whether the date is on the day before now (local time). */
export function isYesterday(input: DateInput, opts: NowOptions = {}): boolean {
  return isSame(input, subDays(nowDate(opts), 1), "day");
}

/** Whether the date is on the day after now (local time). */
export function isTomorrow(input: DateInput, opts: NowOptions = {}): boolean {
  return isSame(input, addDays(nowDate(opts), 1), "day");
}

/** Whether the instant lies strictly before now. */
export function isPast(input: DateInput, opts: NowOptions = {}): boolean {
  return toDate(input).getTime() < nowDate(opts).getTime();
}

/** Whether the instant lies strictly after now. */
export function isFuture(input: DateInput, opts: NowOptions = {}): boolean {
  return toDate(input).getTime() > nowDate(opts).getTime();
}

/** Whether the date is the first day of its month (local time). */
export function isFirstDayOfMonth(input: DateInput): boolean {
  return toDate(input).getDate() === 1;
}

/** Whether the date is the last day of its month (local time). */
export function isLastDayOfMonth(input: DateInput): boolean {
  const d = toDate(input);
  return d.getDate() === endOf(d, "month").getDate();
}

// ---------------------------------------------------------------------------
// Weekday navigation
// ---------------------------------------------------------------------------

/** The next date strictly after the input whose weekday is `weekday` (0 = Sunday). */
export function nextWeekday(input: DateInput, weekday: WeekStartsOn): Date {
  const d = toDate(input);
  if (Number.isNaN(d.getTime())) return new Date(NaN);
  const ahead = ((weekday - d.getDay() + 7) % 7) || 7;
  return addDays(d, ahead);
}

/** The nearest date strictly before the input whose weekday is `weekday` (0 = Sunday). */
export function previousWeekday(input: DateInput, weekday: WeekStartsOn): Date {
  const d = toDate(input);
  if (Number.isNaN(d.getTime())) return new Date(NaN);
  const behind = ((d.getDay() - weekday + 7) % 7) || 7;
  return subDays(d, behind);
}

// ---------------------------------------------------------------------------
// Name getters / year length
// ---------------------------------------------------------------------------

export interface NameOptions {
  locale?: LocaleData;
  /** Use the abbreviated form (Jan / Mon). Default `false`. */
  short?: boolean;
}

/** The month name of the date (localized). `{ short: true }` gives `Jan`. */
export function getMonthName(input: DateInput, opts: NameOptions = {}): string {
  return format(input, opts.short ? "MMM" : "MMMM", { locale: opts.locale });
}

/** The weekday name of the date (localized). `{ short: true }` gives `Mon`. */
export function getWeekdayName(input: DateInput, opts: NameOptions = {}): string {
  return format(input, opts.short ? "ddd" : "dddd", { locale: opts.locale });
}

/** Number of days in the year — 366 in a leap year, else 365. */
export function getDaysInYear(input: number | DateInput): number {
  return isLeapYear(input) ? 366 : 365;
}

// ---------------------------------------------------------------------------
// Month calendar grid
// ---------------------------------------------------------------------------

/** One cell in a {@link calendarGrid}. */
export interface CalendarCell {
  /** Local midnight of the cell's day. */
  date: Date;
  /** Day of month, 1–31. */
  day: number;
  /** Month index, 0–11. */
  month: number;
  /** Full year. */
  year: number;
  /** Whether the cell belongs to the requested month. */
  inMonth: boolean;
  /** Whether the cell is "now"'s calendar day. */
  isToday: boolean;
  /** Whether the cell falls on a Saturday/Sunday. */
  isWeekend: boolean;
}

export interface CalendarGridOptions extends WeekOptions, NowOptions {
  /** Always emit six rows (42 cells), padding trailing weeks. Default `false`. */
  fixedWeeks?: boolean;
}

/**
 * Build a month view as rows of 7 {@link CalendarCell}s. Leading/trailing cells
 * from the neighbouring months fill the first and last weeks (`inMonth: false`).
 * The week start honours `opts.weekStartsOn` (default Monday). Pass
 * `fixedWeeks: true` for a stable 6-row grid.
 */
export function calendarGrid(input: DateInput, opts: CalendarGridOptions = {}): CalendarCell[][] {
  const anchor = toDate(input);
  if (Number.isNaN(anchor.getTime())) return [];
  const targetMonth = anchor.getMonth();
  const start = startOf(startOf(anchor, "month"), "week", opts);
  const monthEnd = endOf(anchor, "month");
  const today = nowDate(opts);

  const rows: CalendarCell[][] = [];
  let cursor = start;
  const enough = (): boolean => {
    if (opts.fixedWeeks) return rows.length >= 6;
    // Stop once we've covered the whole month and completed the final week.
    return rows.length >= 4 && cursor.getTime() > monthEnd.getTime();
  };

  while (!enough()) {
    const week: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        date: new Date(cursor.getTime()),
        day: cursor.getDate(),
        month: cursor.getMonth(),
        year: cursor.getFullYear(),
        inMonth: cursor.getMonth() === targetMonth,
        isToday: isSame(cursor, today, "day"),
        isWeekend: isWeekend(cursor),
      });
      cursor = addDays(cursor, 1);
    }
    rows.push(week);
    if (rows.length >= 6) break; // hard cap
  }
  return rows;
}

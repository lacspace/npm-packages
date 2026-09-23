/**
 * The date engine.
 *
 * Every function here is pure: it reads the Date objects you hand it and
 * returns new ones. Nothing is ever mutated, so the value you passed in is the
 * value you still have afterwards — the single most common source of bugs in
 * hand-rolled calendar code.
 *
 * Three rules hold throughout:
 *
 * 1. **Local time, consistently.** A calendar shows the user's own days, so all
 *    arithmetic goes through the local-time constructor. Nothing here reads or
 *    writes UTC parts, and nothing parses ISO strings implicitly (`new
 *    Date("2025-02-03")` is UTC midnight, which is the previous day in the
 *    Americas — we never do that to you).
 * 2. **Calendar arithmetic, not millisecond arithmetic.** `addDays(d, 1)`
 *    rebuilds the date from its parts, so it lands on the next calendar day
 *    even across a daylight-saving transition where the day is 23 or 25 hours
 *    long. Differences are measured between start-of-day values and rounded,
 *    for the same reason.
 * 3. **No locale table.** Month and weekday names come from
 *    `Intl.DateTimeFormat`, so the package stays small and every locale the
 *    runtime knows about works. When a locale is unavailable we degrade rather
 *    than throw.
 */

/** Days of the week as `Date#getDay` numbers — 0 is Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Milliseconds in one 24-hour day. Only used for *rounded* differences. */
const DAY_MS = 86_400_000;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/* ==========================================================================
   Construction
   ========================================================================== */

/**
 * Build a local-time Date from its parts.
 *
 * Wraps the constructor's two-digit-year trap: `new Date(50, 0, 1)` is 1950,
 * which quietly breaks any app that renders years under 100. Here year 50 is
 * year 50.
 */
export function makeDate(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0,
): Date {
  const date = new Date(year, month, day, hours, minutes, seconds, ms);
  if (year >= 0 && year < 100) date.setFullYear(year, month, day);
  return date;
}

/** A copy, so callers can hand the result around without aliasing. */
export function cloneDate(date: Date): Date {
  return new Date(date.getTime());
}

/** True for a real Date carrying a real time — `new Date("nope")` is not one. */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** Leap years by the full Gregorian rule, not the "divisible by 4" myth. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** How many days a month has. `month` is 0-based and may be out of range. */
export function daysInMonth(year: number, month: number): number {
  const shift = Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  const y = year + shift;
  if (m === 1) return isLeapYear(y) ? 29 : 28;
  return MONTH_LENGTHS[m] ?? 31;
}

/* ==========================================================================
   Boundaries
   ========================================================================== */

/** Midnight at the start of the given local day. */
export function startOfDay(date: Date): Date {
  return makeDate(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** The last representable instant of the local day — 23:59:59.999. */
export function endOfDay(date: Date): Date {
  return makeDate(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** Midnight on the first day of the week containing `date`. */
export function startOfWeek(date: Date, weekStartsOn: Weekday = 0): Date {
  const offset = (date.getDay() - weekStartsOn + 7) % 7;
  return startOfDay(addDays(date, -offset));
}

/** The final instant of the week containing `date`. */
export function endOfWeek(date: Date, weekStartsOn: Weekday = 0): Date {
  return endOfDay(addDays(startOfWeek(date, weekStartsOn), 6));
}

/** Midnight on the 1st of the month containing `date`. */
export function startOfMonth(date: Date): Date {
  return makeDate(date.getFullYear(), date.getMonth(), 1);
}

/** The final instant of the month containing `date`. */
export function endOfMonth(date: Date): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  return makeDate(year, month, daysInMonth(year, month), 23, 59, 59, 999);
}

/** Midnight on 1 January of the year containing `date`. */
export function startOfYear(date: Date): Date {
  return makeDate(date.getFullYear(), 0, 1);
}

/** The final instant of the year containing `date`. */
export function endOfYear(date: Date): Date {
  return makeDate(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

/* ==========================================================================
   Arithmetic
   ========================================================================== */

/**
 * Move by whole calendar days, keeping the wall-clock time.
 *
 * Rebuilt from parts rather than by adding 86,400,000ms, so a step across a
 * daylight-saving boundary still lands on the next calendar day at the same
 * displayed time instead of drifting an hour and, twice a year, repeating or
 * skipping a date.
 */
export function addDays(date: Date, amount: number): Date {
  return makeDate(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + amount,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

/** Move by whole weeks. */
export function addWeeks(date: Date, amount: number): Date {
  return addDays(date, amount * 7);
}

/**
 * Move by whole months, clamping the day to the target month's length.
 *
 * 31 January plus one month is 28 February (29 in a leap year), not 3 March.
 * Clamping is what users expect from a "next month" arrow and what every
 * spreadsheet does.
 */
export function addMonths(date: Date, amount: number): Date {
  const target = date.getMonth() + amount;
  const year = date.getFullYear() + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const day = Math.min(date.getDate(), daysInMonth(year, month));
  return makeDate(
    year,
    month,
    day,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

/** Move by whole years, clamping 29 February to the 28th off a leap year. */
export function addYears(date: Date, amount: number): Date {
  return addMonths(date, amount * 12);
}

/** Move by minutes. Time-of-day arithmetic, so plain millisecond maths is right. */
export function addMinutes(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * 60_000);
}

/** Move by hours. */
export function addHours(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * 3_600_000);
}

/* ==========================================================================
   Comparison
   ========================================================================== */

/** Same calendar day in local time, whatever the clock says. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Same calendar month of the same year. */
export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Same calendar year. */
export function isSameYear(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear();
}

/** Same week, given where the week starts. */
export function isSameWeek(a: Date, b: Date, weekStartsOn: Weekday = 0): boolean {
  return isSameDay(startOfWeek(a, weekStartsOn), startOfWeek(b, weekStartsOn));
}

/** -1, 0 or 1 comparing only the calendar day — useful as a sort comparator. */
export function compareDay(a: Date, b: Date): -1 | 0 | 1 {
  const left = startOfDay(a).getTime();
  const right = startOfDay(b).getTime();
  return left < right ? -1 : left > right ? 1 : 0;
}

/** `a` falls on an earlier calendar day than `b`. */
export function isBeforeDay(a: Date, b: Date): boolean {
  return compareDay(a, b) === -1;
}

/** `a` falls on a later calendar day than `b`. */
export function isAfterDay(a: Date, b: Date): boolean {
  return compareDay(a, b) === 1;
}

/**
 * Whole calendar days from `b` to `a`.
 *
 * Measured between midnights and rounded, so a 23-hour or 25-hour DST day
 * still counts as exactly one day.
 */
export function diffInDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

/** Whole calendar months from `b` to `a`, ignoring the day of the month. */
export function diffInMonths(a: Date, b: Date): number {
  return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
}

/** Pull a date inside `min`/`max`. Either bound may be omitted. */
export function clampDate(date: Date, min?: Date | null, max?: Date | null): Date {
  if (min && date.getTime() < min.getTime()) return cloneDate(min);
  if (max && date.getTime() > max.getTime()) return cloneDate(max);
  return cloneDate(date);
}

/* ==========================================================================
   The month grid
   ========================================================================== */

/** One cell of a month grid. */
export interface CalendarDay {
  /** Midnight on the day this cell represents. */
  date: Date;
  /** Day of the month, 1-31. */
  day: number;
  /** 0-based month this cell actually belongs to. */
  month: number;
  /** Full year this cell actually belongs to. */
  year: number;
  /** `Date#getDay` value, 0 = Sunday. */
  weekday: number;
  /** True when the cell is padding from the previous or next month. */
  outside: boolean;
  /** Stable `yyyy-MM-dd` key for React lists. */
  key: string;
}

/** Options for {@link monthGrid}. */
export interface MonthGridOptions {
  /** Which weekday the row starts on. 0 = Sunday (US), 1 = Monday (most of the world). */
  weekStartsOn?: Weekday;
  /** Always emit six rows, so the calendar never changes height month to month. */
  fixedWeeks?: boolean;
}

/**
 * The cells of a month, as whole weeks.
 *
 * Every row is exactly seven cells: the month is padded at both ends with days
 * from the neighbouring months, marked `outside`. Rendering a partial first row
 * is the usual shortcut here and it breaks both grid semantics and arrow-key
 * navigation, so this never does it.
 */
export function monthGrid(
  year: number,
  month: number,
  options: MonthGridOptions = {},
): CalendarDay[][] {
  const { weekStartsOn = 0, fixedWeeks = false } = options;
  const first = makeDate(year, month, 1);
  const gridStart = startOfWeek(first, weekStartsOn);
  const gridEnd = startOfDay(endOfWeek(endOfMonth(first), weekStartsOn));

  let weeks = Math.round((diffInDays(gridEnd, gridStart) + 1) / 7);
  if (fixedWeeks && weeks < 6) weeks = 6;

  const rows: CalendarDay[][] = [];
  for (let w = 0; w < weeks; w += 1) {
    const row: CalendarDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = addDays(gridStart, w * 7 + d);
      row.push({
        date,
        day: date.getDate(),
        month: date.getMonth(),
        year: date.getFullYear(),
        weekday: date.getDay(),
        outside: date.getMonth() !== month || date.getFullYear() !== year,
        key: formatDate(date, "yyyy-MM-dd"),
      });
    }
    rows.push(row);
  }
  return rows;
}

/** The seven weekday numbers in display order for a given first weekday. */
export function weekdayOrder(weekStartsOn: Weekday = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < 7; i += 1) out.push((weekStartsOn + i) % 7);
  return out;
}

/** Every day from `start` to `end` inclusive, as midnights. */
export function eachDayOfInterval(start: Date, end: Date): Date[] {
  const from = startOfDay(start);
  const count = diffInDays(end, from);
  if (count < 0) return [];
  const out: Date[] = [];
  for (let i = 0; i <= count; i += 1) out.push(addDays(from, i));
  return out;
}

/** The seven days of the week containing `date`. */
export function weekDays(date: Date, weekStartsOn: Weekday = 0): Date[] {
  const start = startOfWeek(date, weekStartsOn);
  return eachDayOfInterval(start, addDays(start, 6));
}

/**
 * ISO-8601 week number (weeks start Monday; week 1 holds the first Thursday).
 * Shown in the gutter by `WeekPicker` and useful for reporting UIs.
 */
export function isoWeekNumber(date: Date): number {
  const thursday = addDays(startOfWeek(date, 1), 3);
  const firstThursday = addDays(startOfWeek(makeDate(thursday.getFullYear(), 0, 4), 1), 3);
  return 1 + Math.round(diffInDays(thursday, firstThursday) / 7);
}

/* ==========================================================================
   Ranges
   ========================================================================== */

/** A start/end pair. Either end may be null while the user is mid-selection. */
export interface DateRange {
  start: Date | null;
  end: Date | null;
}

/** A range with both ends chosen. */
export interface CompleteRange {
  start: Date;
  end: Date;
}

/** Both ends present — narrows the type, so no non-null assertions downstream. */
export function isCompleteRange(range: DateRange): range is CompleteRange {
  return range.start !== null && range.end !== null;
}

/**
 * Put a range the right way round.
 *
 * A user dragging backwards hands you an end before the start; every consumer
 * of a range would otherwise need the same swap, so it happens once, here.
 */
export function normalizeRange(range: DateRange): DateRange {
  const { start, end } = range;
  if (start && end && end.getTime() < start.getTime()) {
    return { start: cloneDate(end), end: cloneDate(start) };
  }
  return {
    start: start ? cloneDate(start) : null,
    end: end ? cloneDate(end) : null,
  };
}

/** The day falls inside the range, inclusive of both ends. */
export function isInRange(date: Date, range: DateRange): boolean {
  const { start, end } = normalizeRange(range);
  if (!start || !end) return false;
  return compareDay(date, start) >= 0 && compareDay(date, end) <= 0;
}

/** The day is the first day of the range. */
export function isRangeStart(date: Date, range: DateRange): boolean {
  const { start } = normalizeRange(range);
  return start !== null && isSameDay(date, start);
}

/** The day is the last day of the range. */
export function isRangeEnd(date: Date, range: DateRange): boolean {
  const { end } = normalizeRange(range);
  return end !== null && isSameDay(date, end);
}

/**
 * The range a hover would produce: from the anchor to whatever is under the
 * pointer, in the right order. Null when there is nothing to preview.
 */
export function previewRange(anchor: Date | null, hovered: Date | null): DateRange {
  if (!anchor || !hovered) return { start: null, end: null };
  return normalizeRange({ start: anchor, end: hovered });
}

/** The day would be painted by the hover preview. */
export function isInPreviewRange(date: Date, anchor: Date | null, hovered: Date | null): boolean {
  if (!anchor || !hovered) return false;
  return isInRange(date, previewRange(anchor, hovered));
}

/** Nights between the two ends — 3 nights from Monday to Thursday. */
export function nightsBetween(start: Date, end: Date): number {
  return Math.abs(diffInDays(end, start));
}

/** Rules a completed range must satisfy. */
export interface RangeLimits {
  /** Fewest nights a range may span. A 2-night minimum rejects a single night. */
  minNights?: number;
  /** Most nights a range may span. */
  maxNights?: number;
}

/** The completed range satisfies the min/max night rules. */
export function isRangeAllowed(range: DateRange, limits: RangeLimits = {}): boolean {
  const norm = normalizeRange(range);
  if (!isCompleteRange(norm)) return true;
  const nights = nightsBetween(norm.start, norm.end);
  if (limits.minNights !== undefined && nights < limits.minNights) return false;
  if (limits.maxNights !== undefined && nights > limits.maxNights) return false;
  return true;
}

/**
 * Apply a click to a range, handling the selection order.
 *
 * Clicking with nothing selected (or with a finished range) starts a new one.
 * Clicking before the pending start re-anchors there rather than producing a
 * backwards range — a user who clicks the wrong end should not have to clear
 * the field. A second click that would break the night limits also re-anchors,
 * which is the only honest response when the range is not allowed to exist.
 */
export function selectRangeDate(
  range: DateRange,
  date: Date,
  limits: RangeLimits = {},
): DateRange {
  const day = startOfDay(date);
  const { start, end } = range;

  if (!start || end) return { start: day, end: null };
  if (isBeforeDay(day, start)) return { start: day, end: null };

  const candidate: DateRange = { start: cloneDate(start), end: day };
  if (!isRangeAllowed(candidate, limits)) return { start: day, end: null };
  return candidate;
}

/* ==========================================================================
   Disabled days
   ========================================================================== */

/** Every way a day can be blocked. All of them combine with OR. */
export interface DisabledRules {
  /** Nothing before this day is selectable. */
  min?: Date | null;
  /** Nothing after this day is selectable. */
  max?: Date | null;
  /** Specific days — holidays, sold-out dates. Compared by calendar day. */
  dates?: Date[];
  /** Weekday numbers to block. `[0, 6]` blocks weekends. */
  weekdays?: number[];
  /** Anything the other rules cannot express. */
  matcher?: (date: Date) => boolean;
}

/**
 * Is this day blocked?
 *
 * The rules are checked cheapest-first so the caller's `matcher` — usually the
 * one that hits an array or a Set — runs only when nothing simpler has already
 * decided.
 */
export function isDateDisabled(date: Date, rules: DisabledRules = {}): boolean {
  const { min, max, dates, weekdays, matcher } = rules;
  if (min && isBeforeDay(date, min)) return true;
  if (max && isAfterDay(date, max)) return true;
  if (weekdays && weekdays.includes(date.getDay())) return true;
  if (dates && dates.some((d) => isSameDay(d, date))) return true;
  if (matcher && matcher(date)) return true;
  return false;
}

/** A whole month is out of reach of the min/max bounds. */
export function isMonthDisabled(
  year: number,
  month: number,
  bounds: { min?: Date | null; max?: Date | null } = {},
): boolean {
  const first = makeDate(year, month, 1);
  const last = endOfMonth(first);
  if (bounds.min && last.getTime() < startOfDay(bounds.min).getTime()) return true;
  if (bounds.max && first.getTime() > endOfDay(bounds.max).getTime()) return true;
  return false;
}

/** A whole year is out of reach of the min/max bounds. */
export function isYearDisabled(
  year: number,
  bounds: { min?: Date | null; max?: Date | null } = {},
): boolean {
  if (bounds.min && year < bounds.min.getFullYear()) return true;
  if (bounds.max && year > bounds.max.getFullYear()) return true;
  return false;
}

/**
 * The nearest selectable day from `from`, searching outwards.
 *
 * Used when keyboard focus lands on a blocked day and when a picker opens on a
 * month whose first day is disabled. Gives up after `limit` days rather than
 * spinning forever on a calendar where everything is blocked.
 */
export function nextEnabledDate(
  from: Date,
  rules: DisabledRules = {},
  direction: 1 | -1 = 1,
  limit = 366,
): Date | null {
  let cursor = startOfDay(from);
  for (let i = 0; i <= limit; i += 1) {
    if (!isDateDisabled(cursor, rules)) return cursor;
    cursor = addDays(cursor, direction);
  }
  return null;
}

/* ==========================================================================
   Locale names, via Intl
   ========================================================================== */

/**
 * A locale tag the runtime can actually use, or `undefined` to mean "whatever
 * the runtime's default is".
 *
 * Node builds with a trimmed ICU know one locale; browsers know hundreds. A
 * date picker must not throw on the small build, so an unknown or malformed
 * tag degrades to the default instead of exploding.
 */
export function resolveLocale(locale?: string): string | undefined {
  if (!locale) return undefined;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(locale).length > 0 ? locale : undefined;
  } catch {
    return undefined;
  }
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** A cached `Intl.DateTimeFormat`, or null when Intl cannot serve this request. */
function formatter(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat | null {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`;
  const hit = formatterCache.get(key);
  if (hit) return hit;
  try {
    const made = new Intl.DateTimeFormat(resolveLocale(locale), options);
    formatterCache.set(key, made);
    return made;
  } catch {
    return null;
  }
}

/** Format a date through `Intl`, falling back to an ISO-ish string. */
export function formatIntl(
  date: Date,
  locale?: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  const fmt = formatter(locale, options);
  if (!fmt) return formatDate(date, "yyyy-MM-dd");
  try {
    return fmt.format(date);
  } catch {
    return formatDate(date, "yyyy-MM-dd");
  }
}

/**
 * The twelve month names in the given locale, January first.
 *
 * Derived from `Intl` rather than a shipped table: the package stays a few
 * kilobytes and every locale the runtime knows about works, including ones
 * that did not exist when this was written.
 */
export function monthNames(locale?: string, width: "long" | "short" | "narrow" = "long"): string[] {
  const fmt = formatter(locale, { month: width });
  const out: string[] = [];
  for (let m = 0; m < 12; m += 1) {
    const date = makeDate(2021, m, 1);
    out.push(fmt ? fmt.format(date) : String(m + 1));
  }
  return out;
}

/**
 * Weekday names in display order for a given first weekday.
 *
 * `narrow` is what a calendar header wants ("M T W T F S S"); `short` is the
 * readable three-letter form.
 */
export function weekdayNames(
  locale?: string,
  width: "long" | "short" | "narrow" = "short",
  weekStartsOn: Weekday = 0,
): string[] {
  const fmt = formatter(locale, { weekday: width });
  // 1 August 2021 was a Sunday, so it anchors the week without a lookup table.
  const sunday = makeDate(2021, 7, 1);
  return weekdayOrder(weekStartsOn).map((day) => {
    const date = addDays(sunday, day);
    return fmt ? fmt.format(date) : String(day);
  });
}

/**
 * The full, spoken date — "Monday, 3 February 2025".
 *
 * This is what goes in a day cell's `aria-label`. A screen-reader user hears a
 * complete date rather than the bare number the sighted user reads from its
 * position in the grid.
 */
export function fullDateLabel(date: Date, locale?: string): string {
  return formatIntl(date, locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** The month and year as a calendar caption — "February 2025". */
export function monthLabel(date: Date, locale?: string): string {
  return formatIntl(date, locale, { month: "long", year: "numeric" });
}

/* ==========================================================================
   Token formatting and parsing
   ========================================================================== */

interface PatternPart {
  /** A run of one repeated letter (`yyyy`), or a literal when `literal` is true. */
  text: string;
  literal: boolean;
}

/**
 * Split a pattern into tokens and literals. Text inside single quotes is
 * literal, so `'at' HH:mm` renders the word rather than a stray weekday token;
 * `''` is a literal apostrophe.
 */
function splitPattern(pattern: string): PatternPart[] {
  const parts: PatternPart[] = [];
  let i = 0;
  while (i < pattern.length) {
    const char = pattern.charAt(i);
    if (char === "'") {
      let j = i + 1;
      let text = "";
      while (j < pattern.length) {
        if (pattern.charAt(j) === "'") {
          if (pattern.charAt(j + 1) === "'") {
            text += "'";
            j += 2;
            continue;
          }
          break;
        }
        text += pattern.charAt(j);
        j += 1;
      }
      parts.push({ text: text === "" ? "'" : text, literal: true });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z]/.test(char)) {
      let j = i;
      while (j < pattern.length && pattern.charAt(j) === char) j += 1;
      parts.push({ text: pattern.slice(i, j), literal: false });
      i = j;
      continue;
    }
    let j = i;
    while (j < pattern.length && !/[A-Za-z']/.test(pattern.charAt(j))) j += 1;
    parts.push({ text: pattern.slice(i, j), literal: true });
    i = j;
  }
  return parts;
}

function pad(value: number, length: number): string {
  const sign = value < 0 ? "-" : "";
  return sign + String(Math.abs(value)).padStart(length, "0");
}

/**
 * Format a date against a pattern.
 *
 * Tokens: `yyyy` `yy` `MMMM` `MMM` `MM` `M` `dd` `d` `EEEE` `EEE` `HH` `H`
 * `hh` `h` `mm` `m` `ss` `s` `a` `SSS`. Anything else is copied through, and
 * text in single quotes is always literal.
 *
 * Name tokens (`MMMM`, `EEE`, `a`) go through `Intl` with the given locale;
 * the numeric ones do not, so `formatDate(d, "yyyy-MM-dd")` is deterministic
 * everywhere and is safe to use as a key or to send to a server.
 */
export function formatDate(date: Date, pattern = "yyyy-MM-dd", locale?: string): string {
  if (!isValidDate(date)) return "";
  const parts = splitPattern(pattern);
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  let out = "";

  for (const part of parts) {
    if (part.literal) {
      out += part.text;
      continue;
    }
    switch (part.text) {
      case "yyyy":
        out += pad(date.getFullYear(), 4);
        break;
      case "yy":
        out += pad(date.getFullYear() % 100, 2);
        break;
      case "MMMM":
        out += monthNames(locale, "long")[date.getMonth()] ?? String(date.getMonth() + 1);
        break;
      case "MMM":
        out += monthNames(locale, "short")[date.getMonth()] ?? String(date.getMonth() + 1);
        break;
      case "MM":
        out += pad(date.getMonth() + 1, 2);
        break;
      case "M":
        out += String(date.getMonth() + 1);
        break;
      case "dd":
        out += pad(date.getDate(), 2);
        break;
      case "d":
        out += String(date.getDate());
        break;
      case "EEEE":
        out += formatIntl(date, locale, { weekday: "long" });
        break;
      case "EEE":
      case "EE":
      case "E":
        out += formatIntl(date, locale, { weekday: "short" });
        break;
      case "HH":
        out += pad(hours24, 2);
        break;
      case "H":
        out += String(hours24);
        break;
      case "hh":
        out += pad(hours12, 2);
        break;
      case "h":
        out += String(hours12);
        break;
      case "mm":
        out += pad(date.getMinutes(), 2);
        break;
      case "m":
        out += String(date.getMinutes());
        break;
      case "ss":
        out += pad(date.getSeconds(), 2);
        break;
      case "s":
        out += String(date.getSeconds());
        break;
      case "SSS":
        out += pad(date.getMilliseconds(), 3);
        break;
      case "a":
        out += hours24 < 12 ? "AM" : "PM";
        break;
      default:
        out += part.text;
    }
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** What a parsed pattern captured, before it becomes a Date. */
interface ParsedFields {
  year?: number;
  month?: number;
  day?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  ms?: number;
  meridiem?: "AM" | "PM";
  hour12?: boolean;
}

/**
 * Parse text the user typed against the same pattern used to format it.
 *
 * Strict on purpose: the whole string must match, every field must be in
 * range, and the result must round-trip — so `31/02/2025` is rejected rather
 * than silently becoming 3 March, which is what `new Date(...)` would hand
 * you. Returns null for anything it cannot read, and null is a real answer:
 * show the field as invalid rather than guessing.
 *
 * `MMM`/`MMMM` are matched against the locale's month names; `EEE`/`EEEE` are
 * matched and ignored, since the weekday is implied by the date.
 */
export function parseDate(text: string, pattern = "yyyy-MM-dd", locale?: string): Date | null {
  const input = text.trim();
  if (!input) return null;

  const parts = splitPattern(pattern);
  const order: Array<(fields: ParsedFields, value: string) => void> = [];
  const longMonths = monthNames(locale, "long");
  const shortMonths = monthNames(locale, "short");
  let source = "^";

  const nameGroup = (names: string[]): string =>
    `(${names.map((n) => escapeRegExp(n)).join("|")})`;
  const monthFromName = (value: string, names: string[]): number => {
    const lower = value.toLocaleLowerCase();
    return names.findIndex((n) => n.toLocaleLowerCase() === lower);
  };

  for (const part of parts) {
    if (part.literal) {
      source += escapeRegExp(part.text).replace(/\s+/g, "\\s+");
      continue;
    }
    switch (part.text) {
      case "yyyy":
        source += "(\\d{4})";
        order.push((f, v) => {
          f.year = Number(v);
        });
        break;
      case "yy":
        source += "(\\d{2})";
        order.push((f, v) => {
          const n = Number(v);
          f.year = n < 70 ? 2000 + n : 1900 + n;
        });
        break;
      case "MMMM":
      case "MMM": {
        const names = part.text === "MMMM" ? longMonths : shortMonths;
        source += nameGroup(names);
        order.push((f, v) => {
          const index = monthFromName(v, names);
          if (index >= 0) f.month = index;
        });
        break;
      }
      case "MM":
      case "M":
        source += part.text === "MM" ? "(\\d{2})" : "(\\d{1,2})";
        order.push((f, v) => {
          f.month = Number(v) - 1;
        });
        break;
      case "dd":
      case "d":
        source += part.text === "dd" ? "(\\d{2})" : "(\\d{1,2})";
        order.push((f, v) => {
          f.day = Number(v);
        });
        break;
      case "EEEE":
      case "EEE":
      case "EE":
      case "E":
        source += "([^\\d,/\\-\\s]+)";
        order.push(() => {
          /* the weekday is implied by the date, so it is read and discarded */
        });
        break;
      case "HH":
      case "H":
        source += part.text === "HH" ? "(\\d{2})" : "(\\d{1,2})";
        order.push((f, v) => {
          f.hours = Number(v);
        });
        break;
      case "hh":
      case "h":
        source += part.text === "hh" ? "(\\d{2})" : "(\\d{1,2})";
        order.push((f, v) => {
          f.hours = Number(v);
          f.hour12 = true;
        });
        break;
      case "mm":
      case "m":
        source += part.text === "mm" ? "(\\d{2})" : "(\\d{1,2})";
        order.push((f, v) => {
          f.minutes = Number(v);
        });
        break;
      case "ss":
      case "s":
        source += part.text === "ss" ? "(\\d{2})" : "(\\d{1,2})";
        order.push((f, v) => {
          f.seconds = Number(v);
        });
        break;
      case "SSS":
        source += "(\\d{3})";
        order.push((f, v) => {
          f.ms = Number(v);
        });
        break;
      case "a":
        source += "([AaPp][Mm])";
        order.push((f, v) => {
          f.meridiem = v.toUpperCase() === "PM" ? "PM" : "AM";
        });
        break;
      default:
        source += escapeRegExp(part.text);
    }
  }
  source += "$";

  let match: RegExpExecArray | null = null;
  try {
    match = new RegExp(source, "i").exec(input);
  } catch {
    return null;
  }
  if (!match) return null;

  const fields: ParsedFields = {};
  for (let i = 0; i < order.length; i += 1) {
    const captured = match[i + 1];
    if (captured === undefined) return null;
    const apply = order[i];
    if (apply) apply(fields, captured);
  }

  const year = fields.year ?? new Date().getFullYear();
  const month = fields.month ?? 0;
  const day = fields.day ?? 1;
  let hours = fields.hours ?? 0;
  const minutes = fields.minutes ?? 0;
  const seconds = fields.seconds ?? 0;
  const ms = fields.ms ?? 0;

  if (fields.hour12 || fields.meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = from12Hour(hours, fields.meridiem ?? "AM");
  }

  if (month < 0 || month > 11) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  if (seconds < 0 || seconds > 59) return null;

  const date = makeDate(year, month, day, hours, minutes, seconds, ms);
  // Final guard: if the runtime moved anything, the input was not a real date.
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

/* ==========================================================================
   Time of day
   ========================================================================== */

/** A wall-clock time, with no date attached. */
export interface TimeValue {
  hours: number;
  minutes: number;
  seconds: number;
}

/** How finely each part of a time may be chosen. */
export interface TimeSteps {
  /** Hour increment. 1 by default. */
  hourStep?: number;
  /** Minute increment — 15 gives a quarter-hour picker. */
  minuteStep?: number;
  /** Second increment. */
  secondStep?: number;
}

/** The time of day carried by a Date. */
export function getTimeValue(date: Date): TimeValue {
  return { hours: date.getHours(), minutes: date.getMinutes(), seconds: date.getSeconds() };
}

/** A copy of `date` with its time replaced. The date part is untouched. */
export function setTimeValue(date: Date, time: TimeValue): Date {
  return makeDate(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    time.hours,
    time.minutes,
    time.seconds,
    0,
  );
}

/** Round to the nearest multiple of `step`, halves going up. */
export function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 1) return Math.round(value);
  return Math.round(value / step) * step;
}

/** Round *down* to a multiple of `step` — what a slot grid wants. */
export function floorToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 1) return Math.floor(value);
  return Math.floor(value / step) * step;
}

/**
 * Snap a time onto the configured steps.
 *
 * Rounding can push a value past its ceiling — 58 minutes at a 15-minute step
 * rounds to 60 — so each part is clamped back inside its range afterwards
 * rather than overflowing into the next hour behind the user's back.
 */
export function normalizeTime(time: TimeValue, steps: TimeSteps = {}): TimeValue {
  const { hourStep = 1, minuteStep = 1, secondStep = 1 } = steps;
  return {
    hours: Math.min(23, Math.max(0, roundToStep(time.hours, hourStep))),
    minutes: Math.min(59, Math.max(0, roundToStep(time.minutes, minuteStep))),
    seconds: Math.min(59, Math.max(0, roundToStep(time.seconds, secondStep))),
  };
}

/** 24-hour to 12-hour. Midnight and noon are 12, as humans write them. */
export function to12Hour(hours24: number): { hour: number; period: "AM" | "PM" } {
  const period: "AM" | "PM" = hours24 < 12 ? "AM" : "PM";
  const hour = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return { hour, period };
}

/** 12-hour back to 24-hour. 12 AM is 0, 12 PM is 12. */
export function from12Hour(hour12: number, period: "AM" | "PM"): number {
  const base = hour12 % 12;
  return period === "PM" ? base + 12 : base;
}

/** Step one part of a time, wrapping round rather than stopping at the end. */
export function stepTimePart(value: number, delta: number, max: number, step = 1): number {
  const span = max + 1;
  const next = (value + delta * step) % span;
  return next < 0 ? next + span : next;
}

/** Render a time — `14:30`, or `2:30:00 PM` in 12-hour mode with seconds. */
export function formatTimeValue(
  time: TimeValue,
  options: { use12Hour?: boolean; showSeconds?: boolean } = {},
): string {
  const { use12Hour = false, showSeconds = false } = options;
  const { hour, period } = to12Hour(time.hours);
  const head = use12Hour ? String(hour) : pad(time.hours, 2);
  const body = `${head}:${pad(time.minutes, 2)}${showSeconds ? `:${pad(time.seconds, 2)}` : ""}`;
  return use12Hour ? `${body} ${period}` : body;
}

/**
 * Read a time a user typed. Accepts `9`, `9:5`, `09:05:30`, `9pm`, `9:05 PM`.
 * Returns null on anything out of range, so a typo shows as invalid instead of
 * being clamped into a time nobody chose.
 */
export function parseTimeText(text: string): TimeValue | null {
  const input = text.trim().toUpperCase();
  const match = /^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(AM|PM)?$/.exec(input);
  if (!match) return null;

  const rawHours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  const period = match[4];

  if (minutes > 59 || seconds > 59) return null;

  let hours = rawHours;
  if (period) {
    if (rawHours < 1 || rawHours > 12) return null;
    hours = from12Hour(rawHours, period === "PM" ? "PM" : "AM");
  } else if (rawHours > 23) {
    return null;
  }
  return { hours, minutes, seconds };
}

/* ==========================================================================
   Schedule slots
   ========================================================================== */

/** The shape of a day in a schedule grid. */
export interface SlotSpec {
  /** First hour shown, 0-23. */
  startHour?: number;
  /** Hour the grid stops at, exclusive. */
  endHour?: number;
  /** Minutes per slot. 30 gives half-hour bookings. */
  slotMinutes?: number;
}

/** Every slot start on one day, as Dates. */
export function daySlots(day: Date, spec: SlotSpec = {}): Date[] {
  const { startHour = 9, endHour = 17, slotMinutes = 30 } = spec;
  if (slotMinutes <= 0 || endHour <= startHour) return [];
  const base = makeDate(day.getFullYear(), day.getMonth(), day.getDate(), startHour, 0, 0, 0);
  const count = Math.floor(((endHour - startHour) * 60) / slotMinutes);
  const out: Date[] = [];
  for (let i = 0; i < count; i += 1) out.push(addMinutes(base, i * slotMinutes));
  return out;
}

/** `count` consecutive days starting at `start`, as midnights. */
export function scheduleDays(start: Date, count: number): Date[] {
  const from = startOfDay(start);
  const out: Date[] = [];
  for (let i = 0; i < Math.max(0, count); i += 1) out.push(addDays(from, i));
  return out;
}

/** A stable, sortable key for a slot — `2025-02-03T09:30`. */
export function slotKey(date: Date): string {
  return formatDate(date, "yyyy-MM-dd'T'HH:mm");
}

/** Is this slot in the list? Compared by key, so Date identity does not matter. */
export function hasSlot(slots: Date[], slot: Date): boolean {
  const key = slotKey(slot);
  return slots.some((s) => slotKey(s) === key);
}

/** Add or remove a slot, returning a new array. */
export function toggleSlot(slots: Date[], slot: Date): Date[] {
  const key = slotKey(slot);
  const without = slots.filter((s) => slotKey(s) !== key);
  if (without.length !== slots.length) return without;
  return [...slots, slot].sort((a, b) => a.getTime() - b.getTime());
}

/* ==========================================================================
   Relative time
   ========================================================================== */

/** Units `RelativeTime` buckets into, smallest first. */
export type RelativeUnit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";

/** A relative distance, split into a magnitude, a unit and a direction. */
export interface RelativeParts {
  /** Always positive — the direction lives in `past`. */
  value: number;
  unit: RelativeUnit;
  /** True when `date` is earlier than `now`. */
  past: boolean;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const WEEK_MS = 604_800_000;
/** The mean Gregorian month, so "1 month" does not flicker across month lengths. */
const MONTH_MS = 2_629_746_000;
const YEAR_MS = 31_556_952_000;

/**
 * Bucket the distance between two instants.
 *
 * Truncating rather than rounding is deliberate: at 90 seconds people say "a
 * minute ago", not "two minutes ago". The boundaries are the plain ones — 60
 * seconds, 60 minutes, 24 hours, 7 days — so the label never disagrees with
 * the clock the user is also looking at.
 */
export function relativeParts(date: Date, now: Date): RelativeParts {
  const diff = date.getTime() - now.getTime();
  const past = diff < 0;
  const abs = Math.abs(diff);

  if (abs < MINUTE_MS) return { value: Math.floor(abs / 1000), unit: "second", past };
  if (abs < HOUR_MS) return { value: Math.floor(abs / MINUTE_MS), unit: "minute", past };
  if (abs < DAY_MS) return { value: Math.floor(abs / HOUR_MS), unit: "hour", past };
  if (abs < WEEK_MS) return { value: Math.floor(abs / DAY_MS), unit: "day", past };
  if (abs < MONTH_MS) return { value: Math.floor(abs / WEEK_MS), unit: "week", past };
  if (abs < YEAR_MS) return { value: Math.floor(abs / MONTH_MS), unit: "month", past };
  return { value: Math.floor(abs / YEAR_MS), unit: "year", past };
}

/**
 * The English wording, used when `Intl.RelativeTimeFormat` is missing.
 *
 * Handles the singular ("1 minute ago", never "1 minutes ago") and calls a
 * distance under a second what it is rather than "in 0 seconds".
 */
export function relativeFallback(parts: RelativeParts): string {
  if (parts.unit === "second" && parts.value < 1) return "just now";
  const noun = parts.value === 1 ? parts.unit : `${parts.unit}s`;
  return parts.past ? `${parts.value} ${noun} ago` : `in ${parts.value} ${noun}`;
}

/**
 * "3 minutes ago" in the given locale.
 *
 * Uses `Intl.RelativeTimeFormat` where it exists — it knows that Polish has
 * three plural forms and English has two — and falls back to plain English
 * otherwise, so this never throws and never returns an empty string.
 */
export function formatRelative(date: Date, now: Date, locale?: string): string {
  const parts = relativeParts(date, now);
  if (parts.unit === "second" && parts.value < 1) return relativeFallback(parts);
  try {
    const rtf = new Intl.RelativeTimeFormat(resolveLocale(locale), { numeric: "always" });
    return rtf.format(parts.past ? -parts.value : parts.value, parts.unit);
  } catch {
    return relativeFallback(parts);
  }
}

/**
 * How long until the label could change, in milliseconds.
 *
 * A timestamp from last year does not need a timer ticking every second, and a
 * page with fifty of them should not be doing fifty pointless renders a
 * second. Seconds refresh every second; anything past an hour refreshes hourly.
 */
export function relativeRefreshMs(parts: RelativeParts): number {
  switch (parts.unit) {
    case "second":
      return 1000;
    case "minute":
      return 30_000;
    case "hour":
      return 5 * MINUTE_MS;
    default:
      return HOUR_MS;
  }
}

/* ==========================================================================
   Preset ranges
   ========================================================================== */

/** A named range offered as a one-click shortcut. */
export interface RangePreset {
  /** Stable id, used as the React key and reported on selection. */
  id: string;
  /** What the button says. */
  label: string;
  /** Built from "now", so presets stay correct whenever they are opened. */
  range: (now: Date) => DateRange;
}

/**
 * The shortcuts every reporting UI ends up needing.
 *
 * Pass your own `presets` to replace them; these exist so the common case is
 * one prop rather than thirty lines of date maths in your app.
 */
export function defaultPresets(): RangePreset[] {
  return [
    { id: "today", label: "Today", range: (now) => ({ start: startOfDay(now), end: startOfDay(now) }) },
    {
      id: "last7",
      label: "Last 7 days",
      range: (now) => ({ start: startOfDay(addDays(now, -6)), end: startOfDay(now) }),
    },
    {
      id: "last30",
      label: "Last 30 days",
      range: (now) => ({ start: startOfDay(addDays(now, -29)), end: startOfDay(now) }),
    },
    {
      id: "this-month",
      label: "This month",
      range: (now) => ({ start: startOfMonth(now), end: startOfDay(endOfMonth(now)) }),
    },
    {
      id: "last-month",
      label: "Last month",
      range: (now) => {
        const prev = addMonths(startOfMonth(now), -1);
        return { start: prev, end: startOfDay(endOfMonth(prev)) };
      },
    },
    {
      id: "ytd",
      label: "Year to date",
      range: (now) => ({ start: startOfYear(now), end: startOfDay(now) }),
    },
  ];
}

/* ==========================================================================
   Keyboard movement
   ========================================================================== */

/**
 * Where a key press should move focus inside a month grid.
 *
 * Returns the new date, or null when the key means nothing to a calendar — so
 * the caller can `preventDefault()` on exactly the keys it handled and leave
 * Tab, Escape and typing alone.
 *
 * Arrows move one day or one week, PageUp/PageDown a month (Shift makes it a
 * year), Home and End go to the ends of the week. This is the WAI-ARIA grid
 * pattern; matching it is why a keyboard user can drive this calendar without
 * being told how.
 */
export function nextFocusFromKey(
  date: Date,
  key: string,
  weekStartsOn: Weekday = 0,
  shiftKey = false,
): Date | null {
  switch (key) {
    case "ArrowLeft":
      return addDays(date, -1);
    case "ArrowRight":
      return addDays(date, 1);
    case "ArrowUp":
      return addDays(date, -7);
    case "ArrowDown":
      return addDays(date, 7);
    case "PageUp":
      return shiftKey ? addYears(date, -1) : addMonths(date, -1);
    case "PageDown":
      return shiftKey ? addYears(date, 1) : addMonths(date, 1);
    case "Home":
      return startOfWeek(date, weekStartsOn);
    case "End":
      return startOfDay(addDays(startOfWeek(date, weekStartsOn), 6));
    default:
      return null;
  }
}

/**
 * A deterministic UTC stamp — `2025-02-03 14:05 UTC`.
 *
 * `RelativeTime` renders this before it has mounted. Local-time text cannot be
 * used there: the server's time zone is not the reader's, so the two would
 * disagree and React would throw the server HTML away. UTC is the one
 * rendering both ends agree on, and it is replaced by the local, relative
 * label the moment the component mounts.
 */
export function utcStamp(date: Date): string {
  if (!isValidDate(date)) return "";
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

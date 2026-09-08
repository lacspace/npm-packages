/**
 * Business-day arithmetic with injectable weekends and holidays.
 *
 * Weekends default to Saturday + Sunday. Holidays are matched by local
 * calendar day, so the time-of-day component of a holiday input is ignored.
 * Every function is immutable and returns a fresh `Date`; the wall-clock time
 * of the input is preserved across day shifts.
 */

import type { DateInput, WeekStartsOn } from "./index";
import { toDate, addDays, startOf } from "./index";

export interface BusinessDayOptions {
  /** Weekday numbers treated as non-working (0 = Sunday … 6 = Saturday). Default `[0, 6]`. */
  weekends?: WeekStartsOn[];
  /** Dates treated as holidays (matched by local calendar day). */
  holidays?: DateInput[];
}

const INVALID = new Date(NaN);

function dayKey(d: Date): number {
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
}

interface Resolved {
  weekends: Set<number>;
  holidays: Set<number>;
}

function resolve(opts: BusinessDayOptions): Resolved {
  const weekends = new Set<number>(opts.weekends ?? [0, 6]);
  const holidays = new Set<number>();
  for (const h of opts.holidays ?? []) {
    const d = toDate(h);
    if (!Number.isNaN(d.getTime())) holidays.add(dayKey(d));
  }
  return { weekends, holidays };
}

function isWorking(d: Date, r: Resolved): boolean {
  return !r.weekends.has(d.getDay()) && !r.holidays.has(dayKey(d));
}

/** Whether the date is a working day: not a weekend and not a holiday (local time). */
export function isBusinessDay(input: DateInput, opts: BusinessDayOptions = {}): boolean {
  const d = toDate(input);
  if (Number.isNaN(d.getTime())) return false;
  return isWorking(d, resolve(opts));
}

/**
 * Shift by `n` business days, skipping weekends and holidays. Positive `n`
 * moves forward, negative back. `n = 0` returns the input unchanged (even if
 * it is not itself a business day). Time-of-day is preserved.
 */
export function addBusinessDays(input: DateInput, n: number, opts: BusinessDayOptions = {}): Date {
  let d = toDate(input);
  if (Number.isNaN(d.getTime())) return INVALID;
  if (!n) return d;
  const r = resolve(opts);
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(Math.trunc(n));
  while (remaining > 0) {
    d = addDays(d, step);
    if (isWorking(d, r)) remaining--;
  }
  return d;
}

/** Shift backwards by `n` business days (the inverse of {@link addBusinessDays}). */
export function subBusinessDays(input: DateInput, n: number, opts: BusinessDayOptions = {}): Date {
  return addBusinessDays(input, -n, opts);
}

/** The next business day strictly after the input (time-of-day preserved). */
export function nextBusinessDay(input: DateInput, opts: BusinessDayOptions = {}): Date {
  return addBusinessDays(input, 1, opts);
}

/** The previous business day strictly before the input (time-of-day preserved). */
export function previousBusinessDay(input: DateInput, opts: BusinessDayOptions = {}): Date {
  return addBusinessDays(input, -1, opts);
}

/**
 * Count the business days in the half-open range between `a` and `b`,
 * excluding the calendar day of `a` and including the calendar day of `b`
 * (so it composes with {@link addBusinessDays}). The result is signed: it is
 * negative when `b` precedes `a`.
 */
export function businessDaysBetween(a: DateInput, b: DateInput, opts: BusinessDayOptions = {}): number {
  const A = toDate(a);
  const B = toDate(b);
  if (Number.isNaN(A.getTime()) || Number.isNaN(B.getTime())) return NaN;
  const r = resolve(opts);
  const sign = A.getTime() <= B.getTime() ? 1 : -1;
  let cursor = startOf(sign > 0 ? A : B, "day");
  const stop = startOf(sign > 0 ? B : A, "day").getTime();
  let count = 0;
  while (cursor.getTime() < stop) {
    cursor = addDays(cursor, 1);
    if (isWorking(cursor, r)) count++;
  }
  return sign * count;
}

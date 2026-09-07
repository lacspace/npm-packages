/**
 * Settlement schedule — compute the next payout date.
 *
 * Given a schedule (`daily`, `weekly`, or `T+N`) and a starting date, work out
 * the next date money would actually land, skipping weekends and a supplied
 * holiday list. All dates are handled in **UTC** for determinism and returned at
 * UTC midnight. Pure — no wall-clock reads, no mutation.
 */

const DAY_MS = 86_400_000;

/** Kind of payout cadence. */
export type ScheduleKind = "daily" | "weekly" | "tplus";

/** A payout cadence definition. */
export interface Schedule {
  kind: ScheduleKind;
  /** For `weekly`: target day of week, `0`=Sun … `6`=Sat. Defaults to `5` (Fri). */
  weekday?: number;
  /** For `tplus`: number of days after `from` (`T+N`). Defaults to `1`. */
  days?: number;
  /** Skip Saturdays & Sundays. Defaults to `true`. */
  skipWeekends?: boolean;
  /** Holiday dates to skip, as `"YYYY-MM-DD"` (UTC) strings. */
  holidays?: string[];
}

/** Accepted input forms for a date. */
export type DateInput = Date | number | string;

/** Normalize any {@link DateInput} to a UTC-midnight epoch-ms value. */
function toUtcMidnight(input: DateInput): number {
  const d = input instanceof Date ? input : new Date(input);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Format an epoch-ms value as a `"YYYY-MM-DD"` UTC date key. */
function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whether a UTC-midnight `ms` is blocked (weekend or holiday). */
function isBlocked(ms: number, skipWeekends: boolean, holidays: Set<string>): boolean {
  if (holidays.has(ymd(ms))) return true;
  if (skipWeekends) {
    const dow = new Date(ms).getUTCDay();
    if (dow === 0 || dow === 6) return true;
  }
  return false;
}

/** Roll `ms` forward one day at a time until it is not blocked. */
function advance(ms: number, skipWeekends: boolean, holidays: Set<string>): number {
  let cur = ms;
  while (isBlocked(cur, skipWeekends, holidays)) cur += DAY_MS;
  return cur;
}

/**
 * Compute the next payout date on or after the cadence's natural target,
 * strictly after `from`, skipping weekends and holidays.
 *
 * - `daily` → the next day.
 * - `tplus` → `from + days` (default `T+1`).
 * - `weekly` → the next occurrence of `weekday` (default Friday) after `from`.
 *
 * The result is then rolled forward past any weekend/holiday and returned as a
 * `Date` at UTC midnight.
 *
 * ```ts
 * // 2026-01-01 is a Thursday; T+2 lands on Sat → rolls to Mon 2026-01-05.
 * nextPayoutDate({ kind: "tplus", days: 2 }, "2026-01-01");
 * nextPayoutDate({ kind: "weekly", weekday: 5 }, "2026-01-01"); // next Friday
 * ```
 */
export function nextPayoutDate(schedule: Schedule, from: DateInput): Date {
  const skipWeekends = schedule.skipWeekends ?? true;
  const holidays = new Set(schedule.holidays ?? []);
  const start = toUtcMidnight(from);

  let target: number;
  if (schedule.kind === "daily") {
    target = start + DAY_MS;
  } else if (schedule.kind === "tplus") {
    const n = Math.max(0, Math.trunc(schedule.days ?? 1));
    // T+0 could equal `from`; still move at least to `from` and skip forward.
    target = start + n * DAY_MS;
  } else {
    // weekly: first `weekday` strictly after `from`.
    const weekday = ((Math.trunc(schedule.weekday ?? 5) % 7) + 7) % 7;
    const startDow = new Date(start).getUTCDay();
    let delta = (weekday - startDow + 7) % 7;
    if (delta === 0) delta = 7;
    target = start + delta * DAY_MS;
  }

  return new Date(advance(target, skipWeekends, holidays));
}

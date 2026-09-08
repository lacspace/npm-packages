/**
 * Extra, purely-additive operations on {@link Duration} values: overall sign,
 * clamping, summing and calendar-aware rebalancing. Everything here is a plain
 * function that returns a NEW Duration (or a number) — the inputs are never
 * mutated, matching the immutable core.
 */

import { Duration, type CalendarOptions } from "./index";

const FIELDS = [
  "years",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
  "milliseconds",
] as const;

/**
 * Overall sign of a Duration, taken from its first non-zero field
 * (years → milliseconds) — the same single-signed convention `.toISO()` uses.
 * Returns `-1`, `0` or `1`.
 */
export function durationSign(d: Duration): -1 | 0 | 1 {
  for (const f of FIELDS) {
    if (d[f] > 0) return 1;
    if (d[f] < 0) return -1;
  }
  return 0;
}

/** True when the overall sign of the Duration is negative. */
export function isNegativeDuration(d: Duration): boolean {
  return durationSign(d) < 0;
}

/**
 * Constrain `d` to the inclusive range `[min, max]` using
 * {@link Duration.compare} (the same nominal ordering used by
 * `maxDuration` / `minDuration`). Throws if `min` is greater than `max`.
 */
export function clampDuration(d: Duration, min: Duration, max: Duration): Duration {
  if (min.compare(max) > 0) {
    throw new RangeError("clampDuration: min must not be greater than max");
  }
  if (d.compare(min) < 0) return min;
  if (d.compare(max) > 0) return max;
  return d;
}

/**
 * Add any number of Durations (or parts) together, field-by-field. Returns
 * {@link Duration.zero} when called with no arguments. A thin, readable wrapper
 * over repeated `.add(...)`.
 */
export function sumDurations(...durations: Duration[]): Duration {
  return durations.reduce<Duration>((acc, d) => acc.add(d), Duration.zero);
}

/**
 * Fully collapse a Duration to a normalized, calendar-free form by converting
 * every field (including months/years) to milliseconds and re-expanding via
 * {@link Duration.fromMillis}. Because this crosses calendar units it obeys the
 * usual {@link CalendarOptions} contract: a Duration carrying months/years
 * THROWS unless you opt in with `assumeMonthDays` / `assumeYearDays`.
 *
 * For carry-only normalization that keeps months/years symbolic, use the core
 * `.normalize()` method instead.
 */
export function rebalance(d: Duration, opts: CalendarOptions = {}): Duration {
  return Duration.fromMillis(d.toMillis(opts));
}

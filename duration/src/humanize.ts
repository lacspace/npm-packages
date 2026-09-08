/**
 * Optional, dependency-free humanizer for {@link Duration} values. The core of
 * `@lacspace/duration` is deliberately about DATA / MATH, not words — but a small
 * calendar-safe formatter that reads the fields directly (never converting
 * months/years to a millisecond count) is handy, so it lives here as an opt-in.
 *
 * For richer, locale-aware phrasing pair the numeric side with
 * `@lacspace/humanize` (a separate, optional package — not a dependency here).
 */

import { Duration, type DurationUnit } from "./index";
import { durationSign } from "./ops";

const UNIT_ORDER: DurationUnit[] = [
  "years",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
  "milliseconds",
];

const SHORT: Record<DurationUnit, string> = {
  years: "y",
  months: "mo",
  weeks: "w",
  days: "d",
  hours: "h",
  minutes: "m",
  seconds: "s",
  milliseconds: "ms",
};

const LONG_SINGULAR: Record<DurationUnit, string> = {
  years: "year",
  months: "month",
  weeks: "week",
  days: "day",
  hours: "hour",
  minutes: "minute",
  seconds: "second",
  milliseconds: "millisecond",
};

/** Options for {@link humanizeDuration}. All optional. */
export interface HumanizeOptions {
  /**
   * Which units to consider, in the order given. Defaults to every unit that is
   * non-zero on the Duration (years → milliseconds).
   */
  units?: DurationUnit[];
  /** Cap the number of (most-significant-first) units emitted, e.g. `2`. */
  largest?: number;
  /** `"1h 30m"` (short, default) vs `"1 hour 30 minutes"` (long). */
  short?: boolean;
  /** String between parts. Defaults to `" "`. */
  separator?: string;
  /** Joins the final part, e.g. `" and "` → `"1 hour and 30 minutes"`. */
  conjunction?: string;
  /**
   * Normalize (carry) the Duration before formatting, so `{ minutes: 90 }`
   * renders as `"1h 30m"`. Defaults to `false` (fields are shown as given).
   */
  normalize?: boolean;
  /** Text for an empty Duration. Defaults to `"0s"` (short) / `"0 seconds"`. */
  zero?: string;
}

/**
 * Render a Duration as a compact human string from its fields — calendar-safe
 * (months/years are shown as-is, never converted). Uses the single-signed
 * convention: a wholly-negative span is prefixed with `-`.
 *
 * @example
 * humanizeDuration(duration({ hours: 1, minutes: 30 }));                 // "1h 30m"
 * humanizeDuration(duration({ hours: 1, minutes: 30 }), { short: false });// "1 hour 30 minutes"
 * humanizeDuration(duration({ minutes: 90 }), { normalize: true });      // "1h 30m"
 * humanizeDuration(parseDuration("P1Y6M"));                              // "1y 6mo"
 */
export function humanizeDuration(d: Duration, opts: HumanizeOptions = {}): string {
  const short = opts.short ?? true;
  const separator = opts.separator ?? " ";
  const source = opts.normalize ? d.normalize() : d;

  const sign = durationSign(source);
  const zeroText = opts.zero ?? (short ? "0s" : "0 seconds");
  if (sign === 0) return zeroText;

  const units = opts.units ?? UNIT_ORDER;
  const parts: string[] = [];
  for (const unit of units) {
    const raw = source[unit];
    if (raw === 0) continue;
    const value = Math.abs(raw);
    parts.push(formatPart(unit, value, short));
    if (opts.largest != null && parts.length >= opts.largest) break;
  }

  if (parts.length === 0) return zeroText;

  let body: string;
  if (opts.conjunction && parts.length > 1) {
    const head = parts.slice(0, -1).join(separator);
    body = `${head}${opts.conjunction}${parts[parts.length - 1]}`;
  } else {
    body = parts.join(separator);
  }

  return sign < 0 ? `-${body}` : body;
}

function formatPart(unit: DurationUnit, value: number, short: boolean): string {
  if (short) return `${trim(value)}${SHORT[unit]}`;
  const noun = LONG_SINGULAR[unit];
  return `${trim(value)} ${noun}${value === 1 ? "" : "s"}`;
}

/** Trim a float to a readable, non-exponential string. */
function trim(n: number): string {
  if (Number.isInteger(n)) return String(n);
  let str = n.toFixed(6);
  str = str.replace(/\.?0+$/, "");
  return str;
}

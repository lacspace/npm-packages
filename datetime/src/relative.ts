/**
 * Relative-time formatting — "3 hours ago", "in 2 days".
 *
 * A thin, zero-dependency wrapper over the platform `Intl.RelativeTimeFormat`
 * (available on Node 18+ and every modern browser). When that API is missing
 * it falls back to a compact English rendering so the function never throws.
 */

import type { DateInput } from "./index";
import { toDate } from "./index";

/** A unit understood by {@link formatRelative} / `Intl.RelativeTimeFormat`. */
export type RelativeUnit =
  | "year"
  | "quarter"
  | "month"
  | "week"
  | "day"
  | "hour"
  | "minute"
  | "second";

export interface RelativeOptions {
  /** The moment to measure against. Defaults to "now" (`Date.now()`). */
  now?: DateInput;
  /** BCP-47 locale(s) forwarded to `Intl.RelativeTimeFormat`. */
  locale?: string | string[];
  /** `"auto"` yields idiomatic phrasing ("yesterday"); `"always"` forces numbers ("1 day ago"). Default `"auto"`. */
  numeric?: "always" | "auto";
  /** Width of the phrasing. Default `"long"`. */
  style?: "long" | "short" | "narrow";
  /** Force a specific unit instead of picking the largest natural one. */
  unit?: RelativeUnit;
}

/** Calendar-approximate milliseconds per unit, largest first. */
const UNIT_MS: Record<RelativeUnit, number> = {
  year: 31_557_600_000, // 365.25 d
  quarter: 7_889_400_000, // 91.3125 d
  month: 2_629_800_000, // 30.4375 d
  week: 604_800_000,
  day: 86_400_000,
  hour: 3_600_000,
  minute: 60_000,
  second: 1000,
};

const ORDER: RelativeUnit[] = [
  "year", "quarter", "month", "week", "day", "hour", "minute", "second",
];

function pickUnit(deltaMs: number): RelativeUnit {
  const abs = Math.abs(deltaMs);
  for (const u of ORDER) {
    if (abs >= UNIT_MS[u]) return u;
  }
  return "second";
}

function fallback(value: number, unit: RelativeUnit): string {
  if (value === 0) return unit === "day" ? "today" : `this ${unit}`;
  const plural = Math.abs(value) === 1 ? unit : `${unit}s`;
  return value < 0
    ? `${Math.abs(value)} ${plural} ago`
    : `in ${value} ${plural}`;
}

/**
 * Describe `date` relative to `now` (default: the current time), e.g.
 * `"3 hours ago"` or `"in 2 days"`. The unit is chosen automatically as the
 * largest that fits (calendar-approximate); pass `opts.unit` to force one.
 * A negative distance is in the past, a positive one in the future.
 */
export function formatRelative(date: DateInput, opts: RelativeOptions = {}): string {
  const target = toDate(date);
  const base = opts.now === undefined ? new Date() : toDate(opts.now);
  if (Number.isNaN(target.getTime()) || Number.isNaN(base.getTime())) {
    return "Invalid Date";
  }

  const delta = target.getTime() - base.getTime();
  const unit = opts.unit ?? pickUnit(delta);
  const value = Math.round(delta / UNIT_MS[unit]);

  const RTF = (Intl as { RelativeTimeFormat?: typeof Intl.RelativeTimeFormat })
    .RelativeTimeFormat;
  if (typeof RTF !== "function") return fallback(value, unit);

  const rtf = new RTF(opts.locale, {
    numeric: opts.numeric ?? "auto",
    style: opts.style ?? "long",
  });
  return rtf.format(value, unit);
}

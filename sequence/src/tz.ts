/** Timezone helpers built on Intl.DateTimeFormat only. DST-correct for any IANA zone. */

import type { TimeInput } from "./types";

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
  weekday: number; // 0 = Sunday
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const validity = new Map<string, boolean>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** True when the runtime knows this IANA zone name. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  const cached = validity.get(tz);
  if (cached !== undefined) return cached;
  let ok = true;
  try {
    formatter(tz).format(0);
  } catch {
    ok = false;
  }
  validity.set(tz, ok);
  return ok;
}

/** Convert a TimeInput to epoch ms. Throws TypeError on an invalid date. */
export function toMs(t: TimeInput): number {
  const ms = t instanceof Date ? t.getTime() : typeof t === "number" ? t : typeof t === "string" ? Date.parse(t) : NaN;
  if (!Number.isFinite(ms)) throw new TypeError(`Invalid date: ${String(t)}`);
  return ms;
}

export function toIso(t: TimeInput): string {
  return new Date(toMs(t)).toISOString();
}

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(ms: number, tz: string): ZonedParts {
  const parts = formatter(tz).formatToParts(new Date(ms));
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hour = get("hour");
  if (hour === 24) hour = 0;
  return {
    year,
    month,
    day,
    hour,
    minute: get("minute"),
    second: get("second"),
    ms: ((ms % 1000) + 1000) % 1000,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** Zone offset (local − UTC) in ms at an instant. */
export function offsetMs(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, p.ms) - ms;
}

/**
 * The instant of a wall-clock time in a zone. Out-of-range fields roll over
 * (day 32 = next month, ms past midnight = later time). An ambiguous wall time
 * (DST fall-back) resolves to the first occurrence; a skipped one (DST
 * spring-forward gap) resolves to the instant after the gap.
 */
export function zonedToUtc(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const offsets = new Set([offsetMs(wall - 86_400_000, tz), offsetMs(wall, tz), offsetMs(wall + 86_400_000, tz)]);
  const candidates = [...offsets].map((o) => wall - o);
  const valid = candidates.filter((c) => c + offsetMs(c, tz) === wall);
  if (valid.length > 0) return Math.min(...valid);
  return Math.max(...candidates);
}

/** "YYYY-MM-DD" for local calendar parts. */
export function dateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Normalise (year, month, day + n) through the proleptic calendar. */
export function addCalendarDays(
  year: number,
  month: number,
  day: number,
  n: number,
): { year: number; month: number; day: number; weekday: number } {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() };
}

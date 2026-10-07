/** IANA time-zone math on top of Intl.DateTimeFormat. DST-correct, no tz database shipped. */

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

/** True if Intl knows this IANA zone. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of a UTC instant in `timeZone`. */
export function toLocal(ms: number, timeZone: string): LocalParts {
  const parts = formatter(timeZone).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset of `timeZone` from UTC at instant `ms`, in minutes (e.g. +345 for Asia/Kathmandu). */
export function offsetMinutes(ms: number, timeZone: string): number {
  const p = toLocal(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/**
 * UTC instant for a wall-clock time in `timeZone`. For times skipped by a DST
 * jump the result lands after the gap; for repeated times the earlier
 * occurrence is used.
 */
export function fromLocal(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const o1 = offsetMinutes(naive - 0, timeZone);
  let t = naive - o1 * 60000;
  const o2 = offsetMinutes(t, timeZone);
  if (o2 !== o1) {
    const t2 = naive - o2 * 60000;
    // Pick the candidate that maps back to the requested wall time, if any.
    const p = toLocal(t2, timeZone);
    t = p.hour === hour && p.minute === minute ? t2 : Math.max(t, t2);
  } else {
    // Ambiguous (fall-back) hour: prefer the earlier instant.
    const earlier = t - 3600000;
    const pe = toLocal(earlier, timeZone);
    if (pe.hour === hour && pe.minute === minute && pe.day === day) t = earlier;
  }
  return t;
}

/** Day of week (0=Sun) of a calendar date. */
export function weekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function ymd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(year: number, month: number, day: number, n: number): [number, number, number] {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

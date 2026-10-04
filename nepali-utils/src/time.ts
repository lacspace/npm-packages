/** Nepal Standard Time helpers (UTC+05:45, no daylight saving). */

/** NPT offset from UTC in minutes. */
export const NPT_OFFSET_MINUTES = 345;

export interface NptParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

/** Wall-clock parts of `date` in Nepal: `toNpt(new Date("2026-10-04T05:15:00Z"))` → 11:00 Sunday. */
export function toNpt(date: Date = new Date()): NptParts {
  const d = new Date(date.getTime() + NPT_OFFSET_MINUTES * 60_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    weekday: d.getUTCDay(),
  };
}

/** The instant for a Nepal wall-clock time: `fromNpt(2026, 10, 4, 15, 0)` → 09:15Z. */
export function fromNpt(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - NPT_OFFSET_MINUTES * 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");
const DEV = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];

/**
 * Format a time in NPT. Default `"YYYY-MM-DD HH:mm"`; `{ time: true }` → `"HH:mm"`;
 * `{ hour12: true }` → `"3:00 PM"`; `{ devanagari: true }` uses Nepali digits.
 */
export function formatNpt(date: Date, options: { time?: boolean; hour12?: boolean; devanagari?: boolean; seconds?: boolean } = {}): string {
  const p = toNpt(date);
  let clock: string;
  if (options.hour12) {
    const h = p.hour % 12 || 12;
    clock = `${h}:${pad(p.minute)}${options.seconds ? ":" + pad(p.second) : ""} ${p.hour < 12 ? "AM" : "PM"}`;
  } else clock = `${pad(p.hour)}:${pad(p.minute)}${options.seconds ? ":" + pad(p.second) : ""}`;
  const out = options.time ? clock : `${p.year}-${pad(p.month)}-${pad(p.day)} ${clock}`;
  return options.devanagari ? out.replace(/\d/g, (d) => DEV[Number(d)]!) : out;
}

/** ISO 8601 string with the +05:45 offset: `"2026-10-04T11:00:00+05:45"`. */
export function toNptIso(date: Date): string {
  const p = toNpt(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}+05:45`;
}

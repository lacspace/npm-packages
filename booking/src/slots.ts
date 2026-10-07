/** Free-slot finder. */

import { addDays, fromLocal, isValidTimeZone, toLocal, weekday, ymd } from "./tz";

export interface Interval {
  start: string;
  end: string;
}

export interface WorkingHours {
  /** "HH:MM" local start, e.g. "09:00". */
  start: string;
  /** "HH:MM" local end, e.g. "17:00". "24:00" means midnight at the end of the day. */
  end: string;
  /** Working days, 0 = Sunday … 6 = Saturday. Nepal: [0,1,2,3,4,5]. */
  days: number[];
}

export interface FreeSlotsInput {
  /** Busy intervals (ISO 8601 with offset or Z). Invalid entries are ignored. */
  busy: Interval[];
  /** Search window start (ISO). */
  from: string;
  /** Search window end (ISO). */
  to: string;
  durationMinutes: number;
  hours: WorkingHours;
  /** IANA zone the working hours and holidays are in, e.g. "Asia/Kathmandu". */
  timezone: string;
  /** Minutes kept free before and after every busy interval. Default 0. */
  buffer?: number;
  /** Distance between candidate starts. Default = durationMinutes. */
  stepMinutes?: number;
  /** Earliest start is now + this many minutes. Default 0. */
  minNoticeMinutes?: number;
  /** "Now" (ISO). Default: the current time. */
  now?: string;
  /** Local dates ("YYYY-MM-DD") with no availability. */
  holidays?: string[];
  /** Stop after this many slots. Default 1000. */
  limit?: number;
}

const MAX_DAYS = 400;

function parseTime(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

function parseIso(s: unknown): number | null {
  if (typeof s !== "string" && !(s instanceof Date)) return null;
  const t = s instanceof Date ? s.getTime() : Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** Sort and merge overlapping/adjacent intervals (ms). */
export function mergeIntervals(list: Array<[number, number]>): Array<[number, number]> {
  const sorted = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Array<[number, number]> = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * Bookable slots inside working hours that don't touch busy time.
 * Returns [] for invalid input (unknown zone, bad dates, non-positive duration).
 */
export function freeSlots(input: FreeSlotsInput): Interval[] {
  if (!input || typeof input !== "object") return [];
  const { timezone } = input;
  if (!isValidTimeZone(timezone)) return [];
  const from = parseIso(input.from);
  const to = parseIso(input.to);
  const dur = Number(input.durationMinutes);
  if (from === null || to === null || to <= from || !(dur > 0) || !Number.isFinite(dur)) return [];
  const step = Number(input.stepMinutes) > 0 ? Number(input.stepMinutes) : dur;
  const buffer = Number(input.buffer) > 0 ? Number(input.buffer) : 0;
  const notice = Number(input.minNoticeMinutes) > 0 ? Number(input.minNoticeMinutes) : 0;
  const nowMs = input.now !== undefined ? parseIso(input.now) : Date.now();
  if (nowMs === null) return [];
  const limit = Number(input.limit) > 0 ? Math.floor(Number(input.limit)) : 1000;

  const hStart = parseTime(input.hours?.start);
  const hEnd = parseTime(input.hours?.end);
  if (hStart === null || hEnd === null || hEnd <= hStart) return [];
  const days = new Set(Array.isArray(input.hours?.days) ? input.hours.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : []);
  const holidays = new Set(Array.isArray(input.holidays) ? input.holidays.filter((h) => typeof h === "string").map((h) => h.trim().slice(0, 10)) : []);

  const busy = mergeIntervals(
    (Array.isArray(input.busy) ? input.busy : [])
      .map((b): [number, number] | null => {
        const s = parseIso(b?.start);
        const e = parseIso(b?.end);
        return s === null || e === null ? null : [s - buffer * 60000, e + buffer * 60000];
      })
      .filter((x): x is [number, number] => x !== null),
  );

  const earliest = Math.max(from, nowMs + notice * 60000);
  const out: Interval[] = [];
  const first = toLocal(from, timezone);
  const last = toLocal(to, timezone);
  const lastKey = ymd(last.year, last.month, last.day);
  let [y, m, d] = [first.year, first.month, first.day];
  let bi = 0;

  for (let i = 0; i < MAX_DAYS && ymd(y, m, d) <= lastKey; i++, [y, m, d] = addDays(y, m, d, 1)) {
    if (!days.has(weekday(y, m, d)) || holidays.has(ymd(y, m, d))) continue;
    const dayStart = fromLocal(y, m, d, Math.floor(hStart / 60), hStart % 60, timezone);
    const dayEnd =
      hEnd === 1440
        ? (() => {
            const [ny, nm, nd] = addDays(y, m, d, 1);
            return fromLocal(ny, nm, nd, 0, 0, timezone);
          })()
        : fromLocal(y, m, d, Math.floor(hEnd / 60), hEnd % 60, timezone);
    const windowEnd = Math.min(dayEnd, to);

    for (let s = dayStart; s + dur * 60000 <= windowEnd; s += step * 60000) {
      if (s < earliest) continue;
      const e = s + dur * 60000;
      while (bi < busy.length && (busy[bi] as [number, number])[1] <= s) bi++;
      let clash = false;
      for (let k = bi; k < busy.length; k++) {
        const [bs, be] = busy[k] as [number, number];
        if (bs >= e) break;
        if (bs < e && be > s) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      out.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString() });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

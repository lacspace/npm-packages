import type { DateLike } from "./types";

/** Nepal Time is a fixed UTC+05:45 (no daylight saving). */
export const NPT_OFFSET_MINUTES = 5 * 60 + 45;

const DAY_MS = 86_400_000;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/;
const TIME_RE = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(?:([AaPp])\.?\s*[Mm]\.?)?$/;

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

/** Parse a strict YYYY-MM-DD (or the date part of YYYY-MM-DDT...). */
export function parseYmd(ymd: unknown): { y: number; m: number; d: number } | undefined {
  if (typeof ymd !== "string") return undefined;
  const match = YMD_RE.exec(ymd.trim());
  if (!match) return undefined;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return undefined;
  return { y, m, d };
}

/** Parse "17:00", "5:00 PM", "5 PM", "12:30 AM", optional seconds. Blank means midnight. */
export function parseTime(time: unknown): { h: number; mi: number; s: number } | undefined {
  if (time === undefined || time === null) return { h: 0, mi: 0, s: 0 };
  if (typeof time !== "string") return undefined;
  const t = time.trim();
  if (t === "") return { h: 0, mi: 0, s: 0 };
  const match = TIME_RE.exec(t);
  if (!match) return undefined;
  let h = Number(match[1]);
  const hasMin = match[2] !== undefined;
  const mi = hasMin ? Number(match[2]) : 0;
  const s = match[3] !== undefined ? Number(match[3]) : 0;
  const mer = match[4];
  if (mi > 59 || s > 59) return undefined;
  if (mer) {
    if (h < 1 || h > 12) return undefined;
    const pm = mer === "p" || mer === "P";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  } else {
    // A bare hour without AM/PM is ambiguous; require minutes in 24-hour form.
    if (!hasMin || h > 23) return undefined;
  }
  return { h, mi, s };
}

/**
 * Convert a Nepal wall-clock date (and optional time) to a real instant.
 * Returns undefined for an invalid date or time. Never throws.
 */
export function nptDate(ymd: string, time?: string): Date | undefined {
  const date = parseYmd(ymd);
  const t = parseTime(time);
  if (!date || !t) return undefined;
  const ms =
    Date.UTC(date.y, date.m - 1, date.d, t.h, t.mi, t.s) - NPT_OFFSET_MINUTES * 60_000;
  // Date.UTC maps years 0-99 to 1900-1999; fix that up.
  const out = new Date(ms);
  if (date.y < 100) out.setUTCFullYear(out.getUTCFullYear() - 1900);
  return Number.isNaN(out.getTime()) ? undefined : out;
}

/** Read a DateLike as epoch ms. A bare YYYY-MM-DD string is read as NPT midnight. NaN when invalid. */
export function toMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = nptDate(s);
      return d ? d.getTime() : NaN;
    }
    if (s === "") return NaN;
    return Date.parse(s);
  }
  return NaN;
}

/**
 * The last moment an issue still matters: the latest of close, extended close and listing.
 * Invalid or missing dates are ignored. Returns NaN when none is valid.
 */
export function lastRelevant(issue: {
  closeDate: DateLike;
  extendedCloseDate?: DateLike;
  listingDate?: DateLike;
}): number {
  if (!issue || typeof issue !== "object") return NaN;
  let best = NaN;
  for (const v of [issue.closeDate, issue.extendedCloseDate, issue.listingDate]) {
    const ms = toMs(v);
    if (!Number.isNaN(ms) && (Number.isNaN(best) || ms > best)) best = ms;
  }
  return best;
}

/**
 * True when the issue's last relevant moment is more than `days` days before `now`.
 * False when no date is valid.
 */
export function isArchivable(
  issue: { closeDate: DateLike; extendedCloseDate?: DateLike; listingDate?: DateLike },
  now: Date | number = Date.now(),
  days = 30,
): boolean {
  const last = lastRelevant(issue);
  const nowMs = toMs(now);
  if (Number.isNaN(last) || Number.isNaN(nowMs) || !Number.isFinite(days)) return false;
  return last + days * DAY_MS < nowMs;
}

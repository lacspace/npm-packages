/**
 * Session segments, countdowns and multi-session helpers.
 *
 * The base MarketClock answers "open / pre-open / closed". These pure functions
 * add the richer model: distinct **segments** (pre-open · regular · post ·
 * closed), the next segment change, half-day / early-close awareness, and the
 * next N trading sessions — all DST-correct via the same tz helpers.
 *
 * Every function is a pure function of `(spec, instant)` so results are fully
 * deterministic for a fixed instant, regardless of the host clock or timezone.
 */

import type { ExchangeSpec } from "./index";
import { localParts, utcFromLocal } from "./tz";

/** A distinct trading-day segment. */
export type Segment = "pre-open" | "regular" | "post" | "closed";

/** A single trading session (regular hours), half-day adjusted. */
export interface SessionWindow {
  /** "YYYY-MM-DD" exchange-local date. */
  date: string;
  /** Regular-session open instant. */
  open: Date;
  /** Regular-session close instant (early on a half-day). */
  close: Date;
  /** True when this date is an early-close / half-day session. */
  halfDay: boolean;
}

/** The next segment boundary: the segment that begins at `at`. */
export interface SegmentChange {
  segment: Segment;
  at: Date;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function isoDate(p: { y: number; m: number; d: number }): string {
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Effective regular open/close for a date, applying a half-day override. */
function regularFor(spec: ExchangeSpec, dateStr: string): { open: string; close: string } {
  const hd = spec.halfDays?.[dateStr];
  if (hd) return { open: hd.open ?? spec.regular.open, close: hd.close };
  return spec.regular;
}

function isWeekend(spec: ExchangeSpec, date: Date): boolean {
  return spec.weekend.includes(localParts(spec, date).day);
}

/** Is the date a full-day exchange holiday? */
export function isHoliday(spec: ExchangeSpec, date: Date = new Date()): boolean {
  return spec.holidays.includes(isoDate(localParts(spec, date)));
}

/** A day the exchange trades (not weekend, not a full-day holiday). Half-days count. */
export function isTradingDay(spec: ExchangeSpec, date: Date = new Date()): boolean {
  return !isWeekend(spec, date) && !isHoliday(spec, date);
}

/** Is the date an early-close / half-day trading session? */
export function isHalfDay(spec: ExchangeSpec, date: Date = new Date()): boolean {
  return (
    !!spec.halfDays &&
    Object.prototype.hasOwnProperty.call(spec.halfDays, isoDate(localParts(spec, date))) &&
    isTradingDay(spec, date)
  );
}

/** The segment the market is in at `at`. */
export function currentSegment(spec: ExchangeSpec, at: Date = new Date()): Segment {
  if (!isTradingDay(spec, at)) return "closed";
  const p = localParts(spec, at);
  const reg = regularFor(spec, isoDate(p));
  if (p.minute >= toMinutes(reg.open) && p.minute < toMinutes(reg.close)) return "regular";
  if (spec.preOpen) {
    if (p.minute >= toMinutes(spec.preOpen.open) && p.minute < toMinutes(spec.preOpen.close)) {
      return "pre-open";
    }
  }
  if (spec.postClose) {
    if (p.minute >= toMinutes(spec.postClose.open) && p.minute < toMinutes(spec.postClose.close)) {
      return "post";
    }
  }
  return "closed";
}

/** The next moment the current segment changes, strictly after `at`. */
export function nextSegmentChange(spec: ExchangeSpec, at: Date = new Date()): SegmentChange {
  const current = currentSegment(spec, at);
  const nowMs = at.getTime();
  const start = localParts(spec, at);
  for (let i = 0; i < 500; i++) {
    const dp = new Date(Date.UTC(start.y, start.m - 1, start.d) + i * 86400000);
    const p = { y: dp.getUTCFullYear(), m: dp.getUTCMonth() + 1, d: dp.getUTCDate() };
    if (spec.weekend.includes(dp.getUTCDay())) continue;
    const dateStr = isoDate(p);
    if (spec.holidays.includes(dateStr)) continue;
    const reg = regularFor(spec, dateStr);
    const mins = new Set<number>();
    if (spec.preOpen) {
      mins.add(toMinutes(spec.preOpen.open));
      mins.add(toMinutes(spec.preOpen.close));
    }
    mins.add(toMinutes(reg.open));
    mins.add(toMinutes(reg.close));
    if (spec.postClose) {
      mins.add(toMinutes(spec.postClose.open));
      mins.add(toMinutes(spec.postClose.close));
    }
    for (const mn of [...mins].sort((a, b) => a - b)) {
      const t = utcFromLocal(spec, p.y, p.m, p.d, mn);
      if (t <= nowMs) continue;
      const seg = currentSegment(spec, new Date(t));
      if (seg !== current) return { segment: seg, at: new Date(t) };
    }
  }
  throw new Error("no segment change found within 500 days");
}

/** The next regular-session open instant strictly after `from` (half-day aware). */
export function nextOpenAt(spec: ExchangeSpec, from: Date = new Date()): Date {
  const start = localParts(spec, from);
  for (let i = 0; i < 500; i++) {
    const dp = new Date(Date.UTC(start.y, start.m - 1, start.d) + i * 86400000);
    const p = { y: dp.getUTCFullYear(), m: dp.getUTCMonth() + 1, d: dp.getUTCDate() };
    if (spec.weekend.includes(dp.getUTCDay())) continue;
    const dateStr = isoDate(p);
    if (spec.holidays.includes(dateStr)) continue;
    const reg = regularFor(spec, dateStr);
    const openUtc = utcFromLocal(spec, p.y, p.m, p.d, toMinutes(reg.open));
    if (openUtc > from.getTime()) return new Date(openUtc);
  }
  throw new Error("no trading day found within 500 days");
}

/** The next regular-session close instant strictly after `from` (half-day aware). */
export function nextCloseAt(spec: ExchangeSpec, from: Date = new Date()): Date {
  const start = localParts(spec, from);
  for (let i = 0; i < 500; i++) {
    const dp = new Date(Date.UTC(start.y, start.m - 1, start.d) + i * 86400000);
    const p = { y: dp.getUTCFullYear(), m: dp.getUTCMonth() + 1, d: dp.getUTCDate() };
    if (spec.weekend.includes(dp.getUTCDay())) continue;
    const dateStr = isoDate(p);
    if (spec.holidays.includes(dateStr)) continue;
    const reg = regularFor(spec, dateStr);
    const closeUtc = utcFromLocal(spec, p.y, p.m, p.d, toMinutes(reg.close));
    if (closeUtc > from.getTime()) return new Date(closeUtc);
  }
  throw new Error("no trading day found within 500 days");
}

/** Milliseconds until the next regular open (always > 0). */
export function timeUntilOpen(spec: ExchangeSpec, now: Date = new Date()): number {
  return nextOpenAt(spec, now).getTime() - now.getTime();
}

/** Milliseconds until the next regular close (always > 0; early on a half-day). */
export function timeUntilClose(spec: ExchangeSpec, now: Date = new Date()): number {
  return nextCloseAt(spec, now).getTime() - now.getTime();
}

/**
 * The next `n` trading sessions at/after `now`, skipping weekends, holidays and
 * honouring half-day early closes. A session already underway (close still in
 * the future) is included as the first entry.
 */
export function nextSessions(spec: ExchangeSpec, now: Date = new Date(), n = 1): SessionWindow[] {
  const out: SessionWindow[] = [];
  const nowMs = now.getTime();
  const start = localParts(spec, now);
  for (let i = 0; i < 800 && out.length < n; i++) {
    const dp = new Date(Date.UTC(start.y, start.m - 1, start.d) + i * 86400000);
    const p = { y: dp.getUTCFullYear(), m: dp.getUTCMonth() + 1, d: dp.getUTCDate() };
    if (spec.weekend.includes(dp.getUTCDay())) continue;
    const dateStr = isoDate(p);
    if (spec.holidays.includes(dateStr)) continue;
    const reg = regularFor(spec, dateStr);
    const close = utcFromLocal(spec, p.y, p.m, p.d, toMinutes(reg.close));
    if (close <= nowMs) continue;
    const open = utcFromLocal(spec, p.y, p.m, p.d, toMinutes(reg.open));
    out.push({
      date: dateStr,
      open: new Date(open),
      close: new Date(close),
      halfDay: isHalfDay(spec, new Date(open)),
    });
  }
  return out;
}

/**
 * All trading sessions whose open instant falls within `[a, b)`. Returns `[]`
 * when `b <= a`.
 */
export function sessionsBetween(spec: ExchangeSpec, a: Date, b: Date): SessionWindow[] {
  const out: SessionWindow[] = [];
  const aMs = a.getTime();
  const bMs = b.getTime();
  if (bMs <= aMs) return out;
  const start = localParts(spec, a);
  for (let i = 0; i < 2000; i++) {
    const dp = new Date(Date.UTC(start.y, start.m - 1, start.d) + i * 86400000);
    const p = { y: dp.getUTCFullYear(), m: dp.getUTCMonth() + 1, d: dp.getUTCDate() };
    const dateStr = isoDate(p);
    const reg = regularFor(spec, dateStr);
    const open = utcFromLocal(spec, p.y, p.m, p.d, toMinutes(reg.open));
    if (open >= bMs) break;
    if (spec.weekend.includes(dp.getUTCDay())) continue;
    if (spec.holidays.includes(dateStr)) continue;
    if (open < aMs) continue;
    const close = utcFromLocal(spec, p.y, p.m, p.d, toMinutes(reg.close));
    out.push({
      date: dateStr,
      open: new Date(open),
      close: new Date(close),
      halfDay: isHalfDay(spec, new Date(open)),
    });
  }
  return out;
}

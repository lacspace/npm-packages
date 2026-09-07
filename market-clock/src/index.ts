/**
 * @lacspace/market-clock
 * Is the market open right now? When does it next open / close?
 *
 * A holiday-aware, timezone-correct trading clock for stock exchanges. Ships
 * with NSE / BSE (India) presets — India has no DST, so a fixed IST offset is
 * exact. Bring your own exchange spec or override the holiday list any time.
 *
 * Note: the bundled holiday lists are hand-maintained and only cover the years
 * listed. Extend them per year from the official exchange circular (e.g.
 * `new MarketClock({ ...NSE, holidays: [...NSE.holidays, "2027-..."] })`).
 *
 * Zero dependencies · isomorphic · fully typed.
 */

import { localParts, utcFromLocal } from "./tz";
import {
  currentSegment,
  nextSegmentChange,
  timeUntilOpen,
  timeUntilClose,
  nextSessions,
  sessionsBetween,
  isHalfDay,
  type Segment,
  type SegmentChange,
  type SessionWindow,
} from "./sessions";

export interface Session {
  /** "HH:MM" 24-hour, in exchange-local time. */
  open: string;
  close: string;
}

/** An early-close / half-day override for a single date. */
export interface HalfDay {
  /** "HH:MM" early close in exchange-local time (e.g. "13:00"). */
  close: string;
  /** Optional early/late open; defaults to the regular open. */
  open?: string;
}

export interface ExchangeSpec {
  name: string;
  /** Minutes ahead of UTC (IST = +330). Exchanges without DST only. */
  offsetMinutes: number;
  regular: Session;
  preOpen?: Session;
  /**
   * Post-market / after-hours session (optional). Enables the "post" segment.
   * @since 1.1.0
   */
  postClose?: Session;
  /**
   * IANA timezone (e.g. "America/New_York"). When set it is DST-correct via
   * `Intl` and takes precedence over `offsetMinutes`. Omit for no-DST exchanges.
   * @since 1.1.0
   */
  timeZone?: string;
  /**
   * Early-close / half-day overrides, keyed by "YYYY-MM-DD" exchange-local date.
   * @since 1.1.0
   */
  halfDays?: Record<string, HalfDay>;
  /** Weekday numbers that are always closed (0 = Sunday … 6 = Saturday). */
  weekend: number[];
  /** Full-day holidays as "YYYY-MM-DD" in exchange-local dates. */
  holidays: string[];
}

export type MarketStatus = "pre-open" | "open" | "closed";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

interface LocalParts {
  y: number;
  m: number;
  d: number;
  day: number;
  minute: number;
}

export class MarketClock {
  private readonly regOpen: number;
  private readonly regClose: number;
  private readonly preOpen: number | null;
  private readonly preClose: number | null;

  constructor(public readonly spec: ExchangeSpec) {
    this.regOpen = toMinutes(spec.regular.open);
    this.regClose = toMinutes(spec.regular.close);
    this.preOpen = spec.preOpen ? toMinutes(spec.preOpen.open) : null;
    this.preClose = spec.preOpen ? toMinutes(spec.preOpen.close) : null;
  }

  /** Exchange-local calendar parts for an instant. */
  private parts(date: Date): LocalParts {
    return localParts(this.spec, date);
  }

  /** UTC epoch millis for an exchange-local calendar day + minute-of-day. */
  private utcFor(y: number, m: number, d: number, minute: number): number {
    return utcFromLocal(this.spec, y, m, d, minute);
  }

  private isoDate(p: { y: number; m: number; d: number }): string {
    return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  }

  isWeekend(at: Date = new Date()): boolean {
    return this.spec.weekend.includes(this.parts(at).day);
  }

  isHoliday(at: Date = new Date()): boolean {
    return this.spec.holidays.includes(this.isoDate(this.parts(at)));
  }

  /** A day the exchange trades (not weekend, not a holiday). */
  isTradingDay(at: Date = new Date()): boolean {
    return !this.isWeekend(at) && !this.isHoliday(at);
  }

  isOpen(at: Date = new Date()): boolean {
    if (!this.isTradingDay(at)) return false;
    const { minute } = this.parts(at);
    return minute >= this.regOpen && minute < this.regClose;
  }

  isPreOpen(at: Date = new Date()): boolean {
    if (this.preOpen === null || this.preClose === null) return false;
    if (!this.isTradingDay(at)) return false;
    const { minute } = this.parts(at);
    return minute >= this.preOpen && minute < this.preClose;
  }

  status(at: Date = new Date()): MarketStatus {
    if (this.isOpen(at)) return "open";
    if (this.isPreOpen(at)) return "pre-open";
    return "closed";
  }

  /** The next moment the regular session opens, strictly after `from`. */
  nextOpen(from: Date = new Date()): Date {
    const start = this.parts(from);
    for (let i = 0; i < 500; i++) {
      const dayMs = Date.UTC(start.y, start.m - 1, start.d) + i * 86400000;
      const dp = new Date(dayMs);
      const p = { y: dp.getUTCFullYear(), m: dp.getUTCMonth() + 1, d: dp.getUTCDate() };
      if (this.spec.weekend.includes(dp.getUTCDay())) continue;
      if (this.spec.holidays.includes(this.isoDate(p))) continue;
      const openUtc = this.utcFor(p.y, p.m, p.d, this.regOpen);
      if (openUtc > from.getTime()) return new Date(openUtc);
    }
    throw new Error("no trading day found within 500 days");
  }

  /** The next moment the regular session closes, strictly after `from`. */
  nextClose(from: Date = new Date()): Date {
    const start = this.parts(from);
    for (let i = 0; i < 500; i++) {
      const dayMs = Date.UTC(start.y, start.m - 1, start.d) + i * 86400000;
      const dp = new Date(dayMs);
      const p = { y: dp.getUTCFullYear(), m: dp.getUTCMonth() + 1, d: dp.getUTCDate() };
      if (this.spec.weekend.includes(dp.getUTCDay())) continue;
      if (this.spec.holidays.includes(this.isoDate(p))) continue;
      const closeUtc = this.utcFor(p.y, p.m, p.d, this.regClose);
      if (closeUtc > from.getTime()) return new Date(closeUtc);
    }
    throw new Error("no trading day found within 500 days");
  }

  /** Milliseconds until the session closes, or 0 if not currently open. */
  msToClose(at: Date = new Date()): number {
    if (!this.isOpen(at)) return 0;
    return this.nextClose(at).getTime() - at.getTime();
  }

  /** Milliseconds until the next open, or 0 if already open. */
  msToOpen(at: Date = new Date()): number {
    if (this.isOpen(at)) return 0;
    return this.nextOpen(at).getTime() - at.getTime();
  }

  /* ---- 1.1.0: segments · countdowns · half-days · multi-session ---- */

  /** Is `at` an early-close / half-day trading session? @since 1.1.0 */
  isHalfDay(at: Date = new Date()): boolean {
    return isHalfDay(this.spec, at);
  }

  /** The distinct segment at `at`: pre-open · regular · post · closed. @since 1.1.0 */
  currentSegment(at: Date = new Date()): Segment {
    return currentSegment(this.spec, at);
  }

  /** The next segment boundary strictly after `at`. @since 1.1.0 */
  nextSegmentChange(at: Date = new Date()): SegmentChange {
    return nextSegmentChange(this.spec, at);
  }

  /** Milliseconds until the next regular open (always > 0). @since 1.1.0 */
  timeUntilOpen(now: Date = new Date()): number {
    return timeUntilOpen(this.spec, now);
  }

  /** Milliseconds until the next regular close (early on a half-day). @since 1.1.0 */
  timeUntilClose(now: Date = new Date()): number {
    return timeUntilClose(this.spec, now);
  }

  /** The next `n` trading sessions at/after `now` (skips weekends/holidays). @since 1.1.0 */
  nextSessions(now: Date = new Date(), n = 1): SessionWindow[] {
    return nextSessions(this.spec, now, n);
  }

  /** All trading sessions whose open falls within `[a, b)`. @since 1.1.0 */
  sessionsBetween(a: Date, b: Date): SessionWindow[] {
    return sessionsBetween(this.spec, a, b);
  }
}

export function createClock(spec: ExchangeSpec): MarketClock {
  return new MarketClock(spec);
}

/**
 * NSE trading holidays. Nationally-fixed days are reliable; the rest follow the
 * annual NSE circular and may shift year to year — verify and extend as needed
 * (spread via `new MarketClock({ ...NSE, holidays: [...NSE.holidays, ...] })`).
 */
const NSE_HOLIDAYS: string[] = [
  // 2025
  "2025-02-26", "2025-03-14", "2025-03-31", "2025-04-10", "2025-04-14",
  "2025-04-18", "2025-05-01", "2025-08-15", "2025-08-27", "2025-10-02",
  "2025-10-21", "2025-10-22", "2025-11-05", "2025-12-25",
  // 2026 (nationally-fixed observances; confirm exchange circular for the rest)
  "2026-01-26", "2026-03-04", "2026-04-01", "2026-05-01", "2026-10-02",
  "2026-11-09", "2026-12-25",
];

/** National Stock Exchange of India. Pre-open 09:00–09:15, regular 09:15–15:30 IST. */
export const NSE: ExchangeSpec = {
  name: "NSE",
  offsetMinutes: 330,
  preOpen: { open: "09:00", close: "09:15" },
  regular: { open: "09:15", close: "15:30" },
  weekend: [0, 6],
  holidays: NSE_HOLIDAYS,
};

/** Bombay Stock Exchange — same session timings and holiday calendar as NSE. */
export const BSE: ExchangeSpec = {
  ...NSE,
  name: "BSE",
};

/* --------------------------------------------------------------------------
 * 1.1.0 — additive public API: presets + session/segment functions & types.
 * ------------------------------------------------------------------------ */

import { NYSE, NASDAQ, LSE, TSE, HKEX, SGX } from "./presets";

export { NYSE, NASDAQ, LSE, TSE, HKEX, SGX } from "./presets";

export {
  currentSegment,
  nextSegmentChange,
  nextOpenAt,
  nextCloseAt,
  timeUntilOpen,
  timeUntilClose,
  nextSessions,
  sessionsBetween,
  isHalfDay,
  isHoliday,
  isTradingDay,
  type Segment,
  type SegmentChange,
  type SessionWindow,
} from "./sessions";

/** All built-in exchange presets, keyed by name. @since 1.1.0 */
export const PRESETS = {
  NSE,
  BSE,
  NYSE,
  NASDAQ,
  LSE,
  TSE,
  HKEX,
  SGX,
} as const;

/** Union of built-in preset keys. @since 1.1.0 */
export type PresetName = keyof typeof PRESETS;

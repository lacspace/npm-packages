/**
 * @lacspace/market-clock
 * Is the market open right now? When does it next open / close?
 *
 * A holiday-aware, timezone-correct trading clock for stock exchanges. Ships
 * with NSE / BSE (India) presets — India has no DST, so a fixed IST offset is
 * exact. Bring your own exchange spec or override the holiday list any time.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export interface Session {
  /** "HH:MM" 24-hour, in exchange-local time. */
  open: string;
  close: string;
}

export interface ExchangeSpec {
  name: string;
  /** Minutes ahead of UTC (IST = +330). Exchanges without DST only. */
  offsetMinutes: number;
  regular: Session;
  preOpen?: Session;
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
    const local = new Date(date.getTime() + this.spec.offsetMinutes * 60000);
    return {
      y: local.getUTCFullYear(),
      m: local.getUTCMonth() + 1,
      d: local.getUTCDate(),
      day: local.getUTCDay(),
      minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
    };
  }

  /** UTC epoch millis for an exchange-local calendar day + minute-of-day. */
  private utcFor(y: number, m: number, d: number, minute: number): number {
    return Date.UTC(y, m - 1, d) + minute * 60000 - this.spec.offsetMinutes * 60000;
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

  /** The next moment the regular session opens, at or after `from`. */
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

  /** The next moment the regular session closes, at or after `from`. */
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

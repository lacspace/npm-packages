/**
 * Delivery estimate / SLA maths: a business-day ETA that skips weekends and
 * holidays, and an on-time / late verdict against a promised date. Pure and
 * isomorphic — only the built-in `Date`. All day comparisons are in local time.
 */
import { CourierError } from "./index";
import { toDate, startOfDay } from "./_time";

/** Days treated as the weekend: Sunday (0) and Saturday (6). */
export const DEFAULT_WEEKEND: number[] = [0, 6];

export interface BusinessDayOptions {
  /** Day-of-week numbers (0=Sun … 6=Sat) treated as non-working. Default `[0,6]`. */
  weekend?: number[];
  /** Dates to skip as holidays (compared at day granularity). */
  holidays?: Array<string | number | Date>;
}

function holidaySet(holidays?: Array<string | number | Date>): Set<number> {
  const set = new Set<number>();
  if (holidays) for (const h of holidays) set.add(startOfDay(toDate(h)).getTime());
  return set;
}

/** `true` when `date` is a working day (not weekend, not a holiday). */
export function isBusinessDay(date: string | number | Date, opts: BusinessDayOptions = {}): boolean {
  const d = toDate(date);
  const weekend = opts.weekend ?? DEFAULT_WEEKEND;
  if (weekend.includes(d.getDay())) return false;
  return !holidaySet(opts.holidays).has(startOfDay(d).getTime());
}

/**
 * Add (or, for a negative `days`, subtract) that many **business** days to
 * `start`, skipping weekends and holidays. The clock time of `start` is kept.
 */
export function addBusinessDays(
  start: string | number | Date,
  days: number,
  opts: BusinessDayOptions = {},
): Date {
  if (!Number.isFinite(days)) {
    throw new CourierError("addBusinessDays: `days` must be a finite number.", {
      code: "invalid_argument",
    });
  }
  const weekend = opts.weekend ?? DEFAULT_WEEKEND;
  const holidays = holidaySet(opts.holidays);
  const isBiz = (d: Date) =>
    !weekend.includes(d.getDay()) && !holidays.has(startOfDay(d).getTime());

  let d = toDate(start);
  const step = days >= 0 ? 1 : -1;
  let remaining = Math.abs(Math.trunc(days));
  while (remaining > 0) {
    d = new Date(d.getTime());
    d.setDate(d.getDate() + step);
    if (isBiz(d)) remaining--;
  }
  return d;
}

export interface EtaInput {
  shipDate: string | number | Date;
  /** Promised transit time in **business** days. */
  transitDays: number;
  weekend?: number[];
  holidays?: Array<string | number | Date>;
}

/**
 * Estimate a delivery date: `transitDays` business days after `shipDate`,
 * skipping weekends and holidays. `transitDays: 0` returns the ship date.
 */
export function estimateDelivery(input: EtaInput): Date {
  if (!Number.isFinite(input.transitDays) || input.transitDays < 0) {
    throw new CourierError("estimateDelivery: `transitDays` must be a non-negative number.", {
      code: "invalid_argument",
    });
  }
  return addBusinessDays(input.shipDate, input.transitDays, {
    weekend: input.weekend,
    holidays: input.holidays,
  });
}

/**
 * Count business days between two dates (day granularity). Positive when `to`
 * is after `from`, negative when before; excludes `from`, includes `to`.
 */
export function businessDaysBetween(
  from: string | number | Date,
  to: string | number | Date,
  opts: BusinessDayOptions = {},
): number {
  let a = startOfDay(toDate(from));
  const b = startOfDay(toDate(to));
  if (a.getTime() === b.getTime()) return 0;
  const sign = a.getTime() < b.getTime() ? 1 : -1;
  const weekend = opts.weekend ?? DEFAULT_WEEKEND;
  const holidays = holidaySet(opts.holidays);
  const isBiz = (d: Date) =>
    !weekend.includes(d.getDay()) && !holidays.has(startOfDay(d).getTime());

  let count = 0;
  while (a.getTime() !== b.getTime()) {
    a = new Date(a.getTime());
    a.setDate(a.getDate() + sign);
    if (isBiz(a)) count += sign;
  }
  return count;
}

export interface SlaInput {
  /** Promised / estimated delivery date to measure against. */
  due: string | number | Date;
  /** Actual delivery time; when omitted the current clock is used. */
  deliveredAt?: string | number | Date;
  /** Injectable clock (epoch ms); defaults to `Date.now`. */
  now?: () => number;
}

export interface SlaResult {
  onTime: boolean;
  late: boolean;
  /** Whether an actual `deliveredAt` was supplied (vs measuring against now). */
  delivered: boolean;
  /** Milliseconds early (negative) or late (positive) vs `due`. */
  deltaMs: number;
}

/**
 * Compare a delivery (or, if undelivered, the current time) against a promised
 * `due` date and report on-time / late. Anything at or before `due` is on time.
 */
export function evaluateSla(input: SlaInput): SlaResult {
  const due = toDate(input.due).getTime();
  const now = input.now ?? (() => Date.now());
  const delivered = input.deliveredAt !== undefined;
  const at = delivered ? toDate(input.deliveredAt!).getTime() : now();
  const late = at > due;
  return { onTime: !late, late, delivered, deltaMs: at - due };
}

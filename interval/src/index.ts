/**
 * @lacspace/interval — time ranges, date iteration and business-day math.
 *
 * Zero-dependency, isomorphic (no `node:` imports — runs in Node, browsers,
 * Deno, Bun, edge/workers). Works with `Date | number` (epoch ms) everywhere.
 *
 * ## Conventions
 * - **Intervals are half-open `[start, end)` by default.** The start instant is
 *   included, the end instant is not. Two intervals that merely touch
 *   (`a.end === b.start`) therefore do **not** overlap — they *abut*.
 * - **Calendar helpers work in UTC.** `startOfDay`, week/month boundaries,
 *   weekday detection and business-day math are all computed against UTC so
 *   results are deterministic regardless of the host machine's timezone. Pass
 *   fixed UTC dates for reproducible behaviour.
 */

export type DateInput = Date | number;

/** A half-open time range `[start, end)`. `start <= end` always holds. */
export interface Interval {
  start: Date;
  end: Date;
}

/** Configuration for business-day helpers. */
export interface BusinessDayConfig {
  /** Weekday numbers (0 = Sunday … 6 = Saturday) treated as weekend. Default `[0, 6]`. */
  weekendDays?: number[];
  /** Holidays to skip. Accepts `Date`, epoch ms, or `"YYYY-MM-DD"` strings (parsed as UTC). */
  holidays?: (Date | number | string)[];
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// ---------------------------------------------------------------------------
// Internal date helpers (self-contained; UTC-based; zero external deps)
// ---------------------------------------------------------------------------

function toDate(d: DateInput): Date {
  return d instanceof Date ? new Date(d.getTime()) : new Date(d);
}

function startOfDay(d: DateInput): Date {
  const x = toDate(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

function startOfHour(d: DateInput): Date {
  const x = toDate(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), x.getUTCHours()));
}

function startOfMonth(d: DateInput): Date {
  const x = toDate(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1));
}

function addMonths(d: DateInput, n: number): Date {
  const x = toDate(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1));
}

/** Add `n` calendar days in UTC, preserving the time-of-day. */
function addDays(d: DateInput, n: number): Date {
  const x = toDate(d);
  return new Date(
    Date.UTC(
      x.getUTCFullYear(),
      x.getUTCMonth(),
      x.getUTCDate() + n,
      x.getUTCHours(),
      x.getUTCMinutes(),
      x.getUTCSeconds(),
      x.getUTCMilliseconds()
    )
  );
}

function startOfWeek(d: DateInput, weekStartsOn: number): Date {
  const s = startOfDay(d);
  const day = s.getUTCDay();
  const diff = (day - weekStartsOn + 7) % 7;
  return addDays(s, -diff);
}

/** Are two dates the same UTC calendar day? */
export function isSameDay(a: DateInput, b: DateInput): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

// ---------------------------------------------------------------------------
// Construction & validation
// ---------------------------------------------------------------------------

/**
 * Build an {@link Interval} from two instants. Order is normalized so the
 * earlier instant becomes `start`. Both endpoints are copied defensively.
 */
export function interval(start: DateInput, end: DateInput): Interval {
  let s = toDate(start);
  let e = toDate(end);
  if (s.getTime() > e.getTime()) {
    const t = s;
    s = e;
    e = t;
  }
  return { start: s, end: e };
}

/** Is `iv` a well-formed interval (real dates, `start <= end`)? */
export function isValidInterval(iv: unknown): iv is Interval {
  if (!iv || typeof iv !== "object") return false;
  const { start, end } = iv as Partial<Interval>;
  return (
    start instanceof Date &&
    end instanceof Date &&
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    start.getTime() <= end.getTime()
  );
}

// ---------------------------------------------------------------------------
// Pure operations on intervals
// ---------------------------------------------------------------------------

/** Length of the interval in milliseconds. */
export function durationMs(iv: Interval): number {
  return iv.end.getTime() - iv.start.getTime();
}

/** Does `iv` contain `date`? Half-open: `start <= date < end`. */
export function contains(iv: Interval, date: DateInput): boolean {
  const t = toDate(date).getTime();
  return t >= iv.start.getTime() && t < iv.end.getTime();
}

/** Do the two intervals overlap? Half-open — touching intervals do NOT overlap. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Do the intervals touch exactly at an endpoint without overlapping? */
export function abuts(a: Interval, b: Interval): boolean {
  return a.end.getTime() === b.start.getTime() || b.end.getTime() === a.start.getTime();
}

/** Are the two intervals identical (same start and end)? */
export function isEqual(a: Interval, b: Interval): boolean {
  return a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime();
}

/** The overlapping region, or `null` if they don't overlap (touching → `null`). */
export function intersection(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start.getTime(), b.start.getTime());
  const end = Math.min(a.end.getTime(), b.end.getTime());
  return start < end ? { start: new Date(start), end: new Date(end) } : null;
}

/** The combined span if the intervals overlap or abut, else `null` (disjoint). */
export function union(a: Interval, b: Interval): Interval | null {
  if (!overlaps(a, b) && !abuts(a, b)) return null;
  return {
    start: new Date(Math.min(a.start.getTime(), b.start.getTime())),
    end: new Date(Math.max(a.end.getTime(), b.end.getTime())),
  };
}

/** The parts of `a` that are NOT in `b`. Returns 0, 1 or 2 intervals. */
export function difference(a: Interval, b: Interval): Interval[] {
  const inter = intersection(a, b);
  if (!inter) return [{ start: new Date(a.start), end: new Date(a.end) }];
  const out: Interval[] = [];
  if (a.start.getTime() < inter.start.getTime()) {
    out.push({ start: new Date(a.start), end: new Date(inter.start) });
  }
  if (inter.end.getTime() < a.end.getTime()) {
    out.push({ start: new Date(inter.end), end: new Date(a.end) });
  }
  return out;
}

/** The empty space between two disjoint intervals, or `null` if they overlap/abut. */
export function gap(a: Interval, b: Interval): Interval | null {
  const [first, second] = a.start.getTime() <= b.start.getTime() ? [a, b] : [b, a];
  if (first.end.getTime() < second.start.getTime()) {
    return { start: new Date(first.end), end: new Date(second.start) };
  }
  return null;
}

/** Clamp a date into `[start, end]` (returns a new `Date`). */
export function clampDate(iv: Interval, date: DateInput): Date {
  const t = toDate(date).getTime();
  if (t < iv.start.getTime()) return new Date(iv.start);
  if (t > iv.end.getTime()) return new Date(iv.end);
  return new Date(t);
}

/**
 * Split an interval into consecutive chunks of `byMs` milliseconds. The final
 * chunk may be shorter than `byMs`. Accepts a number or `{ every }`.
 */
export function split(iv: Interval, by: number | { every: number }): Interval[] {
  const every = typeof by === "number" ? by : by.every;
  if (!(every > 0)) throw new RangeError("split: step must be a positive number of ms");
  const out: Interval[] = [];
  const end = iv.end.getTime();
  let s = iv.start.getTime();
  while (s < end) {
    const e = Math.min(s + every, end);
    out.push({ start: new Date(s), end: new Date(e) });
    s = e;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Merging / set operations over lists
// ---------------------------------------------------------------------------

/**
 * Sort and coalesce a list of intervals, merging any that overlap OR abut
 * (touch). Returns a fresh, sorted, non-overlapping list.
 */
export function mergeIntervals(list: Interval[]): Interval[] {
  const arr = list
    .filter(isValidInterval)
    .map((iv) => ({ start: new Date(iv.start), end: new Date(iv.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const iv of arr) {
    const last = out[out.length - 1];
    if (last && iv.start.getTime() <= last.end.getTime()) {
      if (iv.end.getTime() > last.end.getTime()) last.end = new Date(iv.end);
    } else {
      out.push({ start: new Date(iv.start), end: new Date(iv.end) });
    }
  }
  return out;
}

/** Intersection of every interval in the list, or `null` if empty/disjoint. */
export function intersectAll(list: Interval[]): Interval | null {
  if (list.length === 0) return null;
  let acc: Interval | null = { start: new Date(list[0]!.start), end: new Date(list[0]!.end) };
  for (let i = 1; i < list.length; i++) {
    acc = intersection(acc, list[i]!);
    if (!acc) return null;
  }
  return acc;
}

/**
 * The free (gap) intervals between busy intervals, bounded by `within`.
 * The classic free/busy calendar calculation. Busy intervals are merged and
 * clipped to `within` first.
 */
export function invert(list: Interval[], within: Interval): Interval[] {
  const w = { start: new Date(within.start), end: new Date(within.end) };
  const busy: Interval[] = [];
  for (const iv of mergeIntervals(list)) {
    const clipped = intersection(iv, w);
    if (clipped) busy.push(clipped);
  }
  const out: Interval[] = [];
  let cursor = w.start.getTime();
  for (const b of busy) {
    if (b.start.getTime() > cursor) {
      out.push({ start: new Date(cursor), end: new Date(b.start) });
    }
    cursor = Math.max(cursor, b.end.getTime());
  }
  if (cursor < w.end.getTime()) {
    out.push({ start: new Date(cursor), end: new Date(w.end) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Iteration
// ---------------------------------------------------------------------------

/** Start-of-day (UTC) for every day the interval touches, inclusive of the end day. */
export function eachDayOfInterval(iv: Interval): Date[] {
  const out: Date[] = [];
  const last = startOfDay(iv.end).getTime();
  let d = startOfDay(iv.start);
  while (d.getTime() <= last) {
    out.push(new Date(d));
    d = addDays(d, 1);
  }
  return out;
}

/** Start-of-hour (UTC) for every hour the interval touches, inclusive of the end hour. */
export function eachHourOfInterval(iv: Interval): Date[] {
  const out: Date[] = [];
  const last = startOfHour(iv.end).getTime();
  let t = startOfHour(iv.start).getTime();
  while (t <= last) {
    out.push(new Date(t));
    t += HOUR_MS;
  }
  return out;
}

/**
 * Start-of-week (UTC) for every week the interval touches, inclusive of the
 * end week. `weekStartsOn` defaults to `1` (Monday); use `0` for Sunday.
 */
export function eachWeekOfInterval(iv: Interval, opts?: { weekStartsOn?: number }): Date[] {
  const w = opts?.weekStartsOn ?? 1;
  const out: Date[] = [];
  const last = startOfWeek(iv.end, w).getTime();
  let d = startOfWeek(iv.start, w);
  while (d.getTime() <= last) {
    out.push(new Date(d));
    d = addDays(d, 7);
  }
  return out;
}

/** Start-of-month (UTC) for every month the interval touches, inclusive of the end month. */
export function eachMonthOfInterval(iv: Interval): Date[] {
  const out: Date[] = [];
  const last = startOfMonth(iv.end).getTime();
  let d = startOfMonth(iv.start);
  while (d.getTime() <= last) {
    out.push(new Date(d));
    d = addMonths(d, 1);
  }
  return out;
}

/**
 * Generic stepped iteration: instants from `start` up to and including `end`,
 * spaced `step` milliseconds apart.
 */
export function eachOfInterval(iv: Interval, opts: { step: number }): Date[] {
  const { step } = opts;
  if (!(step > 0)) throw new RangeError("eachOfInterval: step must be a positive number of ms");
  const out: Date[] = [];
  const end = iv.end.getTime();
  let t = iv.start.getTime();
  while (t <= end) {
    out.push(new Date(t));
    t += step;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Business days (weekend + holiday aware)
// ---------------------------------------------------------------------------

function weekendSet(cfg?: BusinessDayConfig): Set<number> {
  return new Set(cfg?.weekendDays ?? [0, 6]);
}

function holidaySet(cfg?: BusinessDayConfig): Set<number> {
  const set = new Set<number>();
  for (const h of cfg?.holidays ?? []) {
    const d = typeof h === "string" ? new Date(h) : toDate(h);
    if (!Number.isNaN(d.getTime())) set.add(startOfDay(d).getTime());
  }
  return set;
}

/** Is `date` a business day — not a weekend and not a configured holiday? */
export function isBusinessDay(date: DateInput, cfg?: BusinessDayConfig): boolean {
  const d = startOfDay(date);
  if (weekendSet(cfg).has(d.getUTCDay())) return false;
  return !holidaySet(cfg).has(d.getTime());
}

// Internal variant that reuses precomputed sets (hot loops).
function isBiz(dayStart: Date, weekend: Set<number>, holidays: Set<number>): boolean {
  if (weekend.has(dayStart.getUTCDay())) return false;
  return !holidays.has(dayStart.getTime());
}

/**
 * Add `n` business days, skipping weekends and holidays, preserving the
 * time-of-day. Negative `n` moves backward. `n === 0` returns a copy unchanged.
 */
export function addBusinessDays(date: DateInput, n: number, cfg?: BusinessDayConfig): Date {
  let d = toDate(date);
  if (n === 0) return d;
  const weekend = weekendSet(cfg);
  const holidays = holidaySet(cfg);
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d = addDays(d, step);
    if (isBiz(startOfDay(d), weekend, holidays)) remaining--;
  }
  return d;
}

/** Subtract `n` business days. Equivalent to `addBusinessDays(date, -n, cfg)`. */
export function subtractBusinessDays(date: DateInput, n: number, cfg?: BusinessDayConfig): Date {
  return addBusinessDays(date, -n, cfg);
}

/** The first business day strictly after `date`. */
export function nextBusinessDay(date: DateInput, cfg?: BusinessDayConfig): Date {
  return addBusinessDays(date, 1, cfg);
}

/** The first business day strictly before `date`. */
export function prevBusinessDay(date: DateInput, cfg?: BusinessDayConfig): Date {
  return addBusinessDays(date, -1, cfg);
}

/**
 * Count business days in the half-open range `[a, b)`. Returns a negative
 * number when `b` is before `a`.
 */
export function businessDaysBetween(a: DateInput, b: DateInput, cfg?: BusinessDayConfig): number {
  let start = startOfDay(a);
  let end = startOfDay(b);
  if (start.getTime() === end.getTime()) return 0;
  const sign = end.getTime() > start.getTime() ? 1 : -1;
  if (sign < 0) {
    const t = start;
    start = end;
    end = t;
  }
  const weekend = weekendSet(cfg);
  const holidays = holidaySet(cfg);
  let count = 0;
  let d = start;
  const stop = end.getTime();
  while (d.getTime() < stop) {
    if (isBiz(d, weekend, holidays)) count++;
    d = addDays(d, 1);
  }
  return count * sign;
}

/** Every business day (start-of-day, UTC) within the interval, inclusive of the end day. */
export function eachBusinessDayOfInterval(iv: Interval, cfg?: BusinessDayConfig): Date[] {
  const weekend = weekendSet(cfg);
  const holidays = holidaySet(cfg);
  return eachDayOfInterval(iv).filter((d) => isBiz(d, weekend, holidays));
}

// ---------------------------------------------------------------------------
// Extra interval algebra & list aggregation (added in 1.1.0)
// ---------------------------------------------------------------------------

export {
  containsInterval,
  overlapMs,
  isEmpty,
  midpoint,
  shift,
  expand,
} from "./algebra";

export {
  sortIntervals,
  totalDuration,
  coverage,
  gaps,
  differenceAll,
  maxConcurrency,
} from "./aggregate";

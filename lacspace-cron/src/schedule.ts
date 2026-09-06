/**
 * Compute run times for a cron (or `@every`) schedule, test whether a given
 * instant matches, list runs in a window, and find where two schedules overlap —
 * all timezone-aware via the built-in `Intl` API (no deps).
 *
 * The cron algorithm walks the timeline one unit at a time (one minute for
 * 5-field expressions, one second for 6-field), formats each candidate into the
 * target timezone with `Intl.DateTimeFormat`, and matches the broken-out parts
 * against the parsed fields. The search is capped at ~5 years.
 */
import { parseSchedule, CronError } from "./parse.js";
import type { CronFields, Schedule } from "./parse.js";

/** Options for {@link nextRuns} / {@link prevRuns}. */
export interface NextRunsOptions {
  /** Start instant (exclusive). Defaults to now. */
  from?: Date;
  /** IANA timezone (e.g. `"America/New_York"`). Defaults to the host timezone. */
  tz?: string;
  /** How many run times to return. Defaults to 5. */
  count?: number;
  /** Seed for resolving Jenkins-style `H` tokens (default: the expression). */
  seed?: string;
}

/** Options for {@link runsBetween}. */
export interface RunsBetweenOptions {
  /** IANA timezone. Defaults to the host timezone. */
  tz?: string;
  /** Seed for resolving `H` tokens. */
  seed?: string;
  /** Safety cap on the number of runs returned (default 100000). */
  limit?: number;
}

/** Options for {@link overlaps}. */
export interface OverlapOptions {
  /** Start instant for the search (default: now). */
  from?: Date;
  /** IANA timezone both expressions are evaluated in. Defaults to host tz. */
  tz?: string;
  /** How far ahead to search, in days (default 366). */
  withinDays?: number;
  /** Seed for resolving `H` tokens in either expression. */
  seed?: string;
}

/** Result of {@link overlaps}. */
export interface OverlapResult {
  /** True if the two schedules fire at the same instant within the window. */
  overlaps: boolean;
  /** The first common instant found, or `null`. */
  next: Date | null;
  /** How many candidate instants were checked before stopping. */
  checked: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

interface TzParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

function hostTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(tz);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour12: false,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        weekday: "short",
      });
    } catch {
      throw new CronError(`Unknown timezone "${tz}".`);
    }
    formatterCache.set(tz, fmt);
  }
  return fmt;
}

/** Break an instant into calendar/clock parts in the target timezone. */
function partsInTz(date: Date, tz: string): TzParts {
  const parts = formatterFor(tz).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some engines emit "24" for midnight
  const weekday = WEEKDAY_INDEX[get("weekday")] ?? 0;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday,
  };
}

/** Number of days in the given (1-based) month of the given year. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Does a candidate satisfy the day-of-month field (numeric list or specials)? */
function dayOfMonthMatches(f: CronFields, p: TzParts): boolean {
  if (f.dayOfMonth.includes(p.day)) return true;
  if (f.dayOfMonthSpecial.length === 0) return false;
  const dim = daysInMonth(p.year, p.month);
  for (const s of f.dayOfMonthSpecial) {
    switch (s.type) {
      case "last":
        if (p.day === dim) return true;
        break;
      case "lastOffset":
        if (p.day === dim - (s.offset ?? 0)) return true;
        break;
      case "lastWeekday":
        if (p.day === lastWeekdayOfMonth(p, dim)) return true;
        break;
      case "nearestWeekday":
        if (p.day === nearestWeekday(p, Math.min(s.day ?? 1, dim), dim)) return true;
        break;
    }
  }
  return false;
}

/** Weekday (0-6) of a given day-of-month, derived from the candidate's parts. */
function weekdayOfDay(p: TzParts, day: number): number {
  return (((p.weekday + (day - p.day)) % 7) + 7) % 7;
}

/** The day-of-month of the last weekday (Mon-Fri) of the month. */
function lastWeekdayOfMonth(p: TzParts, dim: number): number {
  const w = weekdayOfDay(p, dim);
  if (w === 6) return dim - 1; // Saturday -> Friday
  if (w === 0) return dim - 2; // Sunday -> Friday
  return dim;
}

/** The day-of-month the `nW` token fires on (nearest weekday, no month-hop). */
function nearestWeekday(p: TzParts, target: number, dim: number): number {
  const w = weekdayOfDay(p, target);
  if (w === 6) {
    // Saturday: prefer the Friday before, else the Monday after.
    return target - 1 >= 1 ? target - 1 : target + 2;
  }
  if (w === 0) {
    // Sunday: prefer the Monday after, else the Friday before.
    return target + 1 <= dim ? target + 1 : target - 2;
  }
  return target;
}

/** Does a candidate satisfy the day-of-week field (numeric list or specials)? */
function dayOfWeekMatches(f: CronFields, p: TzParts): boolean {
  if (f.dayOfWeek.includes(p.weekday)) return true;
  if (f.dayOfWeekSpecial.length === 0) return false;
  const dim = daysInMonth(p.year, p.month);
  for (const s of f.dayOfWeekSpecial) {
    if (p.weekday !== s.weekday) continue;
    if (s.type === "last") {
      if (p.day + 7 > dim) return true; // no later occurrence this month
    } else if (s.type === "nth") {
      if (Math.floor((p.day - 1) / 7) + 1 === s.nth) return true;
    }
  }
  return false;
}

function matchesParts(f: CronFields, p: TzParts): boolean {
  if (f.hasSeconds && !f.second.includes(p.second)) return false;
  if (!f.minute.includes(p.minute)) return false;
  if (!f.hour.includes(p.hour)) return false;
  if (!f.month.includes(p.month)) return false;

  const domMatch = dayOfMonthMatches(f, p);
  const dowMatch = dayOfWeekMatches(f, p);
  let dayOk: boolean;
  if (f.domRestricted && f.dowRestricted) dayOk = domMatch || dowMatch;
  else if (f.domRestricted) dayOk = domMatch;
  else if (f.dowRestricted) dayOk = dowMatch;
  else dayOk = true;
  return dayOk;
}

const MAX_SPAN_MS = 5 * 366 * 24 * 60 * 60 * 1000; // ~5 years

/** True if `date` (interpreted in `tz`) satisfies the cron expression. */
export function matchesCron(expr: string, date: Date, tz?: string): boolean {
  const sched = parseSchedule(expr);
  const zone = tz ?? hostTimeZone();
  if (sched.kind === "every") {
    // Interval schedules have no wall-clock anchor; align to the Unix epoch.
    return date.getTime() % sched.intervalMs === 0;
  }
  return matchesFields(sched, date, zone);
}

/** Like {@link matchesCron} but takes already-parsed cron fields. */
export function matchesFields(f: CronFields, date: Date, tz: string): boolean {
  return matchesParts(f, partsInTz(date, tz));
}

function schedFrom(expr: string, seed?: string): Schedule {
  return parseSchedule(expr, seed === undefined ? {} : { seed });
}

/** Iterate the cron timeline; `dir` is +1 (forward) or -1 (backward). */
function walk(
  f: CronFields,
  tz: string,
  startMs: number,
  count: number,
  dir: 1 | -1,
): Date[] {
  const stepMs = f.hasSeconds ? 1000 : 60_000;
  let ms = Math.floor(startMs / stepMs) * stepMs;
  if (dir === 1) {
    if (ms <= startMs) ms += stepMs; // strictly after
  } else {
    if (ms >= startMs) ms -= stepMs; // strictly before
  }
  const limit = startMs + dir * MAX_SPAN_MS;
  const runs: Date[] = [];
  for (; runs.length < count && (dir === 1 ? ms <= limit : ms >= limit); ms += dir * stepMs) {
    const d = new Date(ms);
    if (matchesFields(f, d, tz)) runs.push(d);
  }
  return runs;
}

/**
 * Return the next `count` run times strictly after `from`, in timezone `tz`.
 * Returned `Date`s are absolute instants (format them in the same `tz`).
 * Throws {@link CronError} if nothing matches within the ~5-year cap.
 */
export function nextRuns(expr: string, opts: NextRunsOptions = {}): Date[] {
  const sched = schedFrom(expr, opts.seed);
  const count = opts.count ?? 5;
  if (count <= 0) return [];
  const from = opts.from ?? new Date();
  const startMs = from.getTime();
  if (!Number.isFinite(startMs)) throw new CronError("Invalid 'from' date.");

  if (sched.kind === "every") {
    const runs: Date[] = [];
    for (let i = 1; i <= count; i++) runs.push(new Date(startMs + i * sched.intervalMs));
    return runs;
  }

  const tz = opts.tz ?? hostTimeZone();
  const runs = walk(sched, tz, startMs, count, 1);
  if (runs.length === 0) {
    throw new CronError(
      `No matching run found within 5 years for "${sched.source}" — the schedule may be impossible (e.g. Feb 30).`,
    );
  }
  return runs;
}

/**
 * Return the previous `count` run times strictly before `from`, most-recent
 * first. Same options as {@link nextRuns}. Throws if nothing matches in ~5 years.
 */
export function prevRuns(expr: string, opts: NextRunsOptions = {}): Date[] {
  const sched = schedFrom(expr, opts.seed);
  const count = opts.count ?? 5;
  if (count <= 0) return [];
  const from = opts.from ?? new Date();
  const startMs = from.getTime();
  if (!Number.isFinite(startMs)) throw new CronError("Invalid 'from' date.");

  if (sched.kind === "every") {
    const runs: Date[] = [];
    for (let i = 1; i <= count; i++) runs.push(new Date(startMs - i * sched.intervalMs));
    return runs;
  }

  const tz = opts.tz ?? hostTimeZone();
  const runs = walk(sched, tz, startMs, count, -1);
  if (runs.length === 0) {
    throw new CronError(
      `No matching run found within the 5 years before "${from.toISOString()}" for "${sched.source}".`,
    );
  }
  return runs;
}

/**
 * List every run in the closed window `[from, to]` (inclusive of a boundary that
 * actually matches). Returns them in chronological order. Capped at `limit`
 * (default 100000) runs for safety.
 */
export function runsBetween(
  expr: string,
  from: Date,
  to: Date,
  opts: RunsBetweenOptions = {},
): Date[] {
  const sched = schedFrom(expr, opts.seed);
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new CronError("Invalid 'from'/'to' date.");
  }
  if (toMs < fromMs) throw new CronError("'to' must be at or after 'from'.");
  const limit = opts.limit ?? 100_000;
  const runs: Date[] = [];

  if (sched.kind === "every") {
    // Grid anchored at `from`; include multiples of the interval within the window.
    for (let t = fromMs + sched.intervalMs; t <= toMs && runs.length < limit; t += sched.intervalMs) {
      runs.push(new Date(t));
    }
    return runs;
  }

  const tz = opts.tz ?? hostTimeZone();
  const stepMs = sched.hasSeconds ? 1000 : 60_000;
  let ms = Math.ceil(fromMs / stepMs) * stepMs; // first aligned instant >= from
  for (; ms <= toMs && runs.length < limit; ms += stepMs) {
    const d = new Date(ms);
    if (matchesFields(sched, d, tz)) runs.push(d);
  }
  return runs;
}

/** Just the number of runs in `[from, to]` — {@link runsBetween} without the array. */
export function countBetween(
  expr: string,
  from: Date,
  to: Date,
  opts: RunsBetweenOptions = {},
): number {
  return runsBetween(expr, from, to, { ...opts, limit: opts.limit ?? Number.MAX_SAFE_INTEGER }).length;
}

/* --------------------------------------------------------------------------
 * DST safety
 * ------------------------------------------------------------------------ */

/** Options for {@link dstWarnings}. */
export interface DstOptions {
  /** Start of the window to inspect (default: now). */
  from?: Date;
  /** IANA timezone to evaluate the schedule in. Defaults to host tz. */
  tz?: string;
  /** How many days ahead to inspect (default 366). */
  days?: number;
  /** Seed for resolving `H` tokens. */
  seed?: string;
}

/** A schedule run that falls on a problematic local time due to a DST change. */
export interface DstWarning {
  /** `skipped` — the local time never happens; the run is silently dropped.
   *  `repeated` — the local time happens twice; the run fires on the first. */
  kind: "skipped" | "repeated";
  /** The affected local wall-clock time, e.g. `"2021-03-14 02:30"`. */
  local: string;
}

/** The tz offset (minutes east of UTC) in effect at instant `ms`. */
function offsetMinutes(tz: string, ms: number): number {
  const p = partsInTz(new Date(ms), tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - ms) / 60_000);
}

interface Wall { year: number; month: number; day: number; hour: number; minute: number; second: number; }

/** How many real instants correspond to a wall-clock time: 0 (skipped), 1, or 2 (repeated). */
function instantsForWall(tz: string, w: Wall): number {
  const asUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const found = new Set<number>();
  for (const probe of [asUTC - 86_400_000, asUTC + 86_400_000]) {
    const t = asUTC - offsetMinutes(tz, probe) * 60_000;
    const p = partsInTz(new Date(t), tz);
    if (p.year === w.year && p.month === w.month && p.day === w.day &&
        p.hour === w.hour && p.minute === w.minute) {
      found.add(t);
    }
  }
  return found.size;
}

interface Transition { at: number; }

/** Find DST offset transitions (to the nearest minute) within a window. */
function findTransitions(tz: string, fromMs: number, toMs: number): Transition[] {
  const out: Transition[] = [];
  let prev = offsetMinutes(tz, fromMs);
  for (let ms = fromMs + 3_600_000; ms <= toMs; ms += 3_600_000) {
    const off = offsetMinutes(tz, ms);
    if (off !== prev) {
      let lo = ms - 3_600_000;
      let hi = ms;
      while (hi - lo > 60_000) {
        const mid = Math.floor((lo + hi) / 2 / 60_000) * 60_000;
        if (offsetMinutes(tz, mid) === prev) lo = mid; else hi = mid;
      }
      out.push({ at: hi });
      prev = off;
    }
  }
  return out;
}

function pad2(n: number): string { return String(n).padStart(2, "0"); }

/**
 * Inspect a schedule for runs that land on a **skipped** or **repeated** local
 * time because of a daylight-saving transition in `tz`. Returns one warning per
 * affected wall-clock slot. `@every` interval schedules are DST-agnostic → `[]`.
 */
export function dstWarnings(expr: string, opts: DstOptions = {}): DstWarning[] {
  const sched = schedFrom(expr, opts.seed);
  if (sched.kind === "every") return [];
  const tz = opts.tz ?? hostTimeZone();
  const fromMs = (opts.from ?? new Date()).getTime();
  const toMs = fromMs + (opts.days ?? 366) * 86_400_000;

  const warnings: DstWarning[] = [];
  const seen = new Set<string>();
  const seconds = sched.hasSeconds ? sched.second : [0];

  for (const tr of findTransitions(tz, fromMs, toMs)) {
    // Inspect the local calendar day on each side of the transition instant.
    for (const sideMs of [tr.at - 7_200_000, tr.at + 60_000]) {
      const dp = partsInTz(new Date(sideMs), tz);
      const weekday = new Date(Date.UTC(dp.year, dp.month - 1, dp.day)).getUTCDay();
      for (const hour of sched.hour) {
        for (const minute of sched.minute) {
          for (const second of seconds) {
            const wallParts: TzParts = {
              year: dp.year, month: dp.month, day: dp.day,
              hour, minute, second, weekday,
            };
            if (!matchesParts(sched, wallParts)) continue;
            const count = instantsForWall(tz, wallParts);
            if (count === 1) continue;
            const local = `${dp.year}-${pad2(dp.month)}-${pad2(dp.day)} ${pad2(hour)}:${pad2(minute)}` +
              (sched.hasSeconds ? `:${pad2(second)}` : "");
            const key = `${count}|${local}`;
            if (seen.has(key)) continue;
            seen.add(key);
            warnings.push({ kind: count === 0 ? "skipped" : "repeated", local });
          }
        }
      }
    }
  }
  warnings.sort((a, b) => a.local.localeCompare(b.local));
  return warnings;
}

/** Evaluate any schedule at an instant (cron via tz parts, `@every` via epoch grid). */
function matchAt(sched: Schedule, ms: number, tz: string): boolean {
  if (sched.kind === "every") return ms % sched.intervalMs === 0;
  return matchesFields(sched, new Date(ms), tz);
}

/**
 * Do two expressions ever fire at the same instant within a bounded window?
 * Returns whether they overlap and the first common instant found. Searches
 * minute-by-minute (second-by-second if either side needs sub-minute precision),
 * from `opts.from` (default now) over `opts.withinDays` (default 366).
 */
export function overlaps(a: string, b: string, opts: OverlapOptions = {}): OverlapResult {
  const sa = schedFrom(a, opts.seed);
  const sb = schedFrom(b, opts.seed);
  const tz = opts.tz ?? hostTimeZone();
  const from = opts.from ?? new Date();
  const withinDays = opts.withinDays ?? 366;

  const needsSeconds =
    (sa.kind === "cron" && sa.hasSeconds) ||
    (sb.kind === "cron" && sb.hasSeconds) ||
    (sa.kind === "every" && sa.intervalMs % 60_000 !== 0) ||
    (sb.kind === "every" && sb.intervalMs % 60_000 !== 0);
  const stepMs = needsSeconds ? 1000 : 60_000;

  const startMs = Math.ceil(from.getTime() / stepMs) * stepMs;
  const endMs = startMs + withinDays * 86_400_000;
  const HARD_CAP = 5_000_000;

  let checked = 0;
  for (let ms = startMs; ms <= endMs && checked < HARD_CAP; ms += stepMs) {
    checked++;
    if (matchAt(sa, ms, tz) && matchAt(sb, ms, tz)) {
      return { overlaps: true, next: new Date(ms), checked };
    }
  }
  return { overlaps: false, next: null, checked };
}

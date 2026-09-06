/**
 * Compute upcoming run times for a cron expression, and test whether a given
 * instant matches — all timezone-aware via the built-in `Intl` API (no deps).
 *
 * The algorithm walks forward from the start instant one unit at a time (one
 * minute for 5-field expressions, one second for 6-field), formats each
 * candidate into the target timezone with `Intl.DateTimeFormat`, and matches the
 * broken-out parts against the parsed fields. The search is capped at ~5 years.
 */
import { parseCron, CronError } from "./parse.js";
import type { CronFields } from "./parse.js";

/** Options for {@link nextRuns}. */
export interface NextRunsOptions {
  /** Start instant (exclusive). Defaults to now. */
  from?: Date;
  /** IANA timezone (e.g. `"America/New_York"`). Defaults to the host timezone. */
  tz?: string;
  /** How many run times to return. Defaults to 5. */
  count?: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

interface TzParts {
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
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday,
  };
}

function matchesParts(f: CronFields, p: TzParts): boolean {
  if (f.hasSeconds && !f.second.includes(p.second)) return false;
  if (!f.minute.includes(p.minute)) return false;
  if (!f.hour.includes(p.hour)) return false;
  if (!f.month.includes(p.month)) return false;

  const domMatch = f.dayOfMonth.includes(p.day);
  const dowMatch = f.dayOfWeek.includes(p.weekday);
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
  const f = parseCron(expr);
  return matchesFields(f, date, tz ?? hostTimeZone());
}

/** Like {@link matchesCron} but takes already-parsed fields. */
export function matchesFields(f: CronFields, date: Date, tz: string): boolean {
  return matchesParts(f, partsInTz(date, tz));
}

/**
 * Return the next `count` run times strictly after `from`, in timezone `tz`.
 * Returned `Date`s are absolute instants (format them in the same `tz`).
 * Throws {@link CronError} if nothing matches within the ~5-year cap.
 */
export function nextRuns(expr: string, opts: NextRunsOptions = {}): Date[] {
  const f = parseCron(expr);
  const tz = opts.tz ?? hostTimeZone();
  const count = opts.count ?? 5;
  if (count <= 0) return [];
  const from = opts.from ?? new Date();
  const startMs = from.getTime();
  if (!Number.isFinite(startMs)) throw new CronError("Invalid 'from' date.");

  // Timezone offsets are always a whole number of minutes, so minute/second
  // boundaries in any zone line up with absolute-time boundaries.
  const stepMs = f.hasSeconds ? 1000 : 60_000;
  let ms = Math.floor(startMs / stepMs) * stepMs;
  if (ms <= startMs) ms += stepMs; // strictly after `from`
  const limit = startMs + MAX_SPAN_MS;

  const runs: Date[] = [];
  for (; ms <= limit && runs.length < count; ms += stepMs) {
    const d = new Date(ms);
    if (matchesFields(f, d, tz)) runs.push(d);
  }

  if (runs.length === 0) {
    throw new CronError(
      `No matching run found within 5 years for "${f.source}" — the schedule may be impossible (e.g. Feb 30).`,
    );
  }
  return runs;
}

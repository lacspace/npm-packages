/**
 * @lacspace/timezone
 *
 * A zero-dependency, isomorphic IANA-timezone toolkit built ON TOP of the
 * platform `Intl.DateTimeFormat`, which ships the IANA tz database in every
 * modern JS runtime (Node 18+, browsers, edge). We never bundle the tz data,
 * so this package stays tiny and is always as current as the host runtime.
 *
 * Scope: the TIMEZONE layer only — offsets, the local wall-clock breakdown for
 * an instant, and DST-correct conversion between a zone's wall time and a UTC
 * instant. (Trading hours live in `@lacspace/market-clock`; calendar math in
 * UTC/local lives in `@lacspace/datetime`.)
 */

/** An absolute instant: a `Date`, or epoch milliseconds. */
export type Instant = Date | number;

/** The wall-clock breakdown of an instant, as observed in a given zone. */
export interface ZonedParts {
  /** Full year, e.g. 2024. */
  year: number;
  /** Month, 1-12 (NOT 0-indexed). */
  month: number;
  /** Day of month, 1-31. */
  day: number;
  /** Hour, 0-23. */
  hour: number;
  /** Minute, 0-59. */
  minute: number;
  /** Second, 0-59. */
  second: number;
  /** Day of week, 0 = Sunday … 6 = Saturday (matches `Date.prototype.getUTCDay`). */
  weekday: number;
  /** UTC offset in minutes at this instant in this zone (DST-aware). e.g. 345 for +05:45. */
  offsetMinutes: number;
  /** Short zone abbreviation from Intl, e.g. "EST", "EDT", "GMT+5:45". */
  abbreviation: string;
}

/** Wall-clock fields to interpret AS local time in a zone. Missing fields default to 0. */
export interface WallTimeInput {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  ms?: number;
}

/** Result of {@link toZone}: the same instant, plus its wall-clock parts in the target zone. */
export interface ToZoneResult {
  /** The same absolute instant (a fresh `Date`). */
  date: Date;
  /** Wall-clock parts in the target zone. */
  parts: ZonedParts;
}

/** Result of {@link convert}: the same instant, with its parts in both zones. */
export interface ConvertResult {
  /** The same absolute instant (a fresh `Date`). */
  date: Date;
  /** Wall-clock parts in `fromZone`. */
  from: ZonedParts;
  /** Wall-clock parts in `toZone`. */
  to: ZonedParts;
}

/** A DST (or offset) transition discovered by {@link nextTransition}. */
export interface Transition {
  /** The exact instant (to the second) at which the offset changes. */
  at: Date;
  /** UTC offset in minutes just before the transition. */
  offsetBefore: number;
  /** UTC offset in minutes at/after the transition. */
  offsetAfter: number;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000;

const _formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(zone: string): Intl.DateTimeFormat {
  let f = _formatterCache.get(zone);
  if (!f) {
    // en-US + explicit numeric fields → stable, parseable output on every engine.
    // hourCycle "h23" guarantees hour 0-23 (never "24"). timeZoneName "short"
    // yields the abbreviation ("EST", "GMT+5:45", …) in the same pass.
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    });
    _formatterCache.set(zone, f);
  }
  return f;
}

function toDate(instant?: Instant): Date {
  if (instant == null) return new Date();
  if (instant instanceof Date) return instant;
  return new Date(instant);
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  abbreviation: string;
}

/** Break an instant into its raw wall-clock fields in `zone` via Intl.formatToParts. */
function wallParts(date: Date, zone: string): WallParts {
  const parts = getFormatter(zone).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const get = (k: string): string => map[k] ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // defensive; h23 should never yield 24
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    abbreviation: get("timeZoneName"),
  };
}

/** Offset in minutes = (wall time read as if UTC) − (the real instant). */
function offsetFromWall(w: WallParts, date: Date): number {
  const asUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUTC - date.getTime()) / MINUTE_MS);
}

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

// ---------------------------------------------------------------------------
// Offsets
// ---------------------------------------------------------------------------

/**
 * UTC offset in **minutes** for `zone` at `instant` (defaults to now), DST-aware.
 * Positive is east of UTC: Asia/Kathmandu → 345, America/New_York → -300 (winter).
 *
 * @throws {RangeError} if `zone` is not a valid IANA time zone (from Intl).
 */
export function getOffset(zone: string, instant?: Instant): number {
  const date = toDate(instant);
  return offsetFromWall(wallParts(date, zone), date);
}

/**
 * Same as {@link getOffset} but formatted as `"+05:45"` / `"-04:00"` / `"+00:00"`.
 */
export function getOffsetString(zone: string, instant?: Instant): string {
  const min = getOffset(zone, instant);
  const sign = min < 0 ? "-" : "+";
  const abs = Math.abs(min);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

// ---------------------------------------------------------------------------
// Wall-clock breakdown
// ---------------------------------------------------------------------------

/**
 * The wall-clock breakdown of `instant` as observed in `zone`.
 * `month` is 1-12; `weekday` is 0 (Sun)–6 (Sat).
 *
 * @throws {RangeError} if `zone` is not a valid IANA time zone.
 */
export function zonedParts(instant: Instant, zone: string): ZonedParts {
  const date = toDate(instant);
  const w = wallParts(date, zone);
  const asUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const offsetMinutes = Math.round((asUTC - date.getTime()) / MINUTE_MS);
  // A UTC date built from the wall fields has the same weekday as the local wall day.
  const weekday = new Date(asUTC).getUTCDay();
  return {
    year: w.year,
    month: w.month,
    day: w.day,
    hour: w.hour,
    minute: w.minute,
    second: w.second,
    weekday,
    offsetMinutes,
    abbreviation: w.abbreviation,
  };
}

// ---------------------------------------------------------------------------
// Wall time → UTC instant (the DST fixpoint)
// ---------------------------------------------------------------------------

/**
 * Interpret `parts` AS local wall-clock time in `zone` and return the correct
 * UTC `Date`. This is the inverse of {@link zonedParts}.
 *
 * Uses the standard **two-pass** technique: treat the wall fields as if they
 * were UTC to get a first guess, read the zone's offset at that guess, correct
 * by that offset, then re-read the offset at the corrected instant and correct
 * once more (this second pass fixes results that land on the other side of a
 * DST boundary).
 *
 * The second pass is what keeps *real* wall times correct right after a
 * transition (a valid post-spring-forward time whose naive guess picked the
 * pre-transition offset gets corrected to the true instant).
 *
 * DST edge cases (best-effort, and inherent to any wall→instant mapping — there
 * is no single "right" answer, so document what you get):
 * - **Nonexistent** wall times (the "spring-forward" gap, e.g. 02:30 on a day
 *   the clock jumps 02:00→03:00) do not exist on the timeline. They still return
 *   a valid instant; the two-pass lands it on the pre-gap side, so the returned
 *   instant's own `zonedParts` reads one gap-length earlier (02:30 → 01:30).
 * - **Ambiguous** wall times (the "fall-back" hour that occurs twice) map to a
 *   single instant — the earlier (pre-fall-back) occurrence. The two-pass does
 *   not let you pick the later one; if you need that, disambiguate by supplying
 *   the intended offset yourself.
 *
 * @throws {RangeError} if `zone` is not a valid IANA time zone.
 */
export function fromZoned(parts: WallTimeInput, zone: string): Date {
  const { year, month, day, hour = 0, minute = 0, second = 0, ms = 0 } = parts;
  // Wall fields treated as if they were already UTC.
  const wallAsUTC = Date.UTC(year, month - 1, day, hour, minute, second, ms);

  // Pass 1: offset at the naive guess.
  const off1 = getOffset(zone, wallAsUTC);
  const utc1 = wallAsUTC - off1 * MINUTE_MS;

  // Pass 2: offset at the corrected instant may differ across a DST boundary.
  const off2 = getOffset(zone, utc1);
  if (off2 === off1) return new Date(utc1);

  return new Date(wallAsUTC - off2 * MINUTE_MS);
}

// ---------------------------------------------------------------------------
// Convenience conversions (an instant is absolute; these re-express it)
// ---------------------------------------------------------------------------

/**
 * The same absolute `instant`, plus its wall-clock parts in `zone`.
 */
export function toZone(instant: Instant, zone: string): ToZoneResult {
  const date = toDate(instant);
  return { date: new Date(date.getTime()), parts: zonedParts(date, zone) };
}

/**
 * Re-express one absolute `instant` in two zones at once. The instant itself is
 * unchanged (it is absolute); `fromZone` and `toZone` only affect the returned
 * wall-clock parts. Handy for "it's 14:00 in New York, what time in Tokyo?".
 */
export function convert(instant: Instant, fromZone: string, toZone: string): ConvertResult {
  const date = toDate(instant);
  return {
    date: new Date(date.getTime()),
    from: zonedParts(date, fromZone),
    to: zonedParts(date, toZone),
  };
}

// ---------------------------------------------------------------------------
// Zone discovery / validation
// ---------------------------------------------------------------------------

/**
 * A compact fallback list of common IANA zones, used only when the runtime does
 * not expose `Intl.supportedValuesOf('timeZone')` (older engines). Modern
 * runtimes return the full ~400-zone database instead.
 */
export const FALLBACK_TIME_ZONES: readonly string[] = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Halifax",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "Asia/Bangkok",
  "Asia/Dhaka",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Jerusalem",
  "Asia/Kabul",
  "Asia/Karachi",
  "Asia/Kathmandu",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tehran",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Berlin",
  "Europe/Dublin",
  "Europe/Istanbul",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Europe/Rome",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

/**
 * All IANA time zones known to the runtime via `Intl.supportedValuesOf('timeZone')`.
 * Falls back to {@link FALLBACK_TIME_ZONES} on engines that lack that API.
 */
export function listTimeZones(): string[] {
  const anyIntl = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  if (typeof anyIntl.supportedValuesOf === "function") {
    try {
      return anyIntl.supportedValuesOf("timeZone");
    } catch {
      /* fall through */
    }
  }
  return FALLBACK_TIME_ZONES.slice();
}

/**
 * Whether `zone` is a valid IANA time zone accepted by the runtime's Intl.
 * `"UTC"` is valid; non-strings and unknown ids are not.
 */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The host's current IANA time zone, from
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`. Falls back to `"UTC"`.
 */
export function getSystemTimeZone(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// ---------------------------------------------------------------------------
// DST detection (best-effort, by scanning offsets)
// ---------------------------------------------------------------------------

/**
 * The zone's **standard** (non-DST) offset for a given year, taken as the
 * minimum monthly offset across that year. DST always *adds* to standard time,
 * so the minimum is the standard offset in both hemispheres. Best-effort:
 * assumes at most a normal seasonal DST regime.
 */
function standardOffsetForYear(zone: string, year: number): number {
  let min = Infinity;
  for (let m = 0; m < 12; m++) {
    const off = getOffset(zone, Date.UTC(year, m, 1, 12, 0, 0));
    if (off < min) min = off;
  }
  return min;
}

/**
 * Whether `zone` is observing DST at `instant` (defaults to now).
 *
 * Best-effort: it compares the offset at the instant against the zone's minimum
 * offset over that calendar year (its standard time) and reports DST when the
 * current offset is larger. Zones without DST always return `false`.
 *
 * @throws {RangeError} if `zone` is not a valid IANA time zone.
 */
export function isDST(zone: string, instant?: Instant): boolean {
  const date = toDate(instant);
  const current = getOffset(zone, date);
  const year = zonedParts(date, zone).year;
  return current > standardOffsetForYear(zone, year);
}

/**
 * The next offset transition (DST start/end, or any offset change) in `zone`
 * at or after `from` (defaults to now), or `null` if none occurs within the
 * scan horizon.
 *
 * How it works (and its limits): it steps forward in coarse 6-hour increments
 * for up to ~13 months looking for a change in the UTC offset, then binary-
 * searches the bracketing window down to the **millisecond** to pin the exact
 * transition instant. It reports only the *first* transition found; zones with
 * no upcoming change (e.g. Asia/Kathmandu, Asia/Kolkata) return `null`.
 *
 * @throws {RangeError} if `zone` is not a valid IANA time zone.
 */
export function nextTransition(zone: string, from?: Instant): Transition | null {
  const startMs = toDate(from).getTime();
  const stepMs = 6 * 60 * 60 * 1000; // 6h — far finer than any transition spacing
  const horizonMs = startMs + 400 * 24 * 60 * 60 * 1000; // ~13 months

  let prevMs = startMs;
  let prevOff = getOffset(zone, prevMs);

  for (let t = startMs + stepMs; t <= horizonMs; t += stepMs) {
    const off = getOffset(zone, t);
    if (off !== prevOff) {
      // Binary-search (prevMs, t] for the exact millisecond the offset flips.
      let lo = prevMs;
      let hi = t;
      while (hi - lo > 1) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (getOffset(zone, mid) === prevOff) lo = mid;
        else hi = mid;
      }
      return { at: new Date(hi), offsetBefore: prevOff, offsetAfter: getOffset(zone, hi) };
    }
    prevMs = t;
    prevOff = off;
  }
  return null;
}

// ---------------------------------------------------------------------------
// New in 1.1.0 — zoned formatting, zone comparison, backward/range transitions
// (focused sibling modules, re-exported here to keep the public surface flat).
// ---------------------------------------------------------------------------

export { formatInZone, getAbbreviation } from "./format";
export type { FormatInZoneOptions } from "./format";

export { compareZones, offsetDifference } from "./compare";
export type { ZoneComparison } from "./compare";

export { previousTransition, listTransitions, transitionsInYear } from "./transitions";

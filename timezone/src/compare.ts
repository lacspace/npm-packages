/**
 * Zone-vs-zone comparison — how far ahead/behind one IANA zone's local clock is
 * relative to another at a given instant (DST-aware, since it reads live
 * offsets). Handy for "how many hours is Tokyo ahead of New York right now?".
 */

import { getOffset } from "./index";
import type { Instant } from "./index";

/** Result of {@link compareZones}. */
export interface ZoneComparison {
  /** The first zone id. */
  zoneA: string;
  /** The second zone id. */
  zoneB: string;
  /** UTC offset of `zoneA` at the instant, in minutes. */
  offsetA: number;
  /** UTC offset of `zoneB` at the instant, in minutes. */
  offsetB: number;
  /** `offsetA − offsetB`, in minutes. Positive ⇒ `zoneA`'s clock is ahead of `zoneB`'s. */
  differenceMinutes: number;
  /** `differenceMinutes / 60`, in hours (may be fractional, e.g. `5.75`). */
  differenceHours: number;
  /** Which zone's local clock reads later: `"A"`, `"B"`, or `"same"`. */
  ahead: "A" | "B" | "same";
}

/**
 * Compare two zones at `instant` (defaults to now) and report the offset gap
 * between them, DST-aware. `differenceMinutes` is `offsetA − offsetB`, so a
 * positive value means `zoneA` is east of / ahead of `zoneB`.
 *
 * @throws {RangeError} if either `zone` is not a valid IANA time zone.
 */
export function compareZones(zoneA: string, zoneB: string, instant?: Instant): ZoneComparison {
  const date = instant ?? new Date();
  const offsetA = getOffset(zoneA, date);
  const offsetB = getOffset(zoneB, date);
  const differenceMinutes = offsetA - offsetB;
  return {
    zoneA,
    zoneB,
    offsetA,
    offsetB,
    differenceMinutes,
    differenceHours: differenceMinutes / 60,
    ahead: differenceMinutes > 0 ? "A" : differenceMinutes < 0 ? "B" : "same",
  };
}

/**
 * The signed offset difference `getOffset(zoneA) − getOffset(zoneB)` in minutes
 * at `instant` (defaults to now). A thin shortcut for
 * {@link compareZones}`(...).differenceMinutes`.
 *
 * @throws {RangeError} if either `zone` is not a valid IANA time zone.
 */
export function offsetDifference(zoneA: string, zoneB: string, instant?: Instant): number {
  const date = instant ?? new Date();
  return getOffset(zoneA, date) - getOffset(zoneB, date);
}

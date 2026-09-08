/**
 * Historical / range transition discovery — companions to `nextTransition`.
 * `previousTransition` scans *backward*; `listTransitions` / `transitionsInYear`
 * enumerate *every* offset change in a window. All are search-based (they
 * observe offset changes via `getOffset`), so they inherit the same honest
 * limits as `nextTransition`: they see whatever the runtime's tz data says and
 * assume normal transition spacing (months apart, never sub-6-hour).
 */

import { getOffset, nextTransition } from "./index";
import type { Instant, Transition } from "./index";

function toMs(instant?: Instant): number {
  if (instant == null) return Date.now();
  if (instant instanceof Date) return instant.getTime();
  return new Date(instant).getTime();
}

const STEP_MS = 6 * 60 * 60 * 1000; // 6h — finer than any real transition spacing
const HORIZON_MS = 400 * 24 * 60 * 60 * 1000; // ~13 months

/**
 * The most recent offset transition (DST start/end, or any offset change) in
 * `zone` at or before `from` (defaults to now), or `null` if none occurs within
 * the ~13-month scan horizon before it.
 *
 * The mirror image of `nextTransition`: it steps *backward* in 6-hour
 * increments looking for a change in the UTC offset, then binary-searches the
 * bracketing window down to the **millisecond** to pin the exact instant. Zones
 * with no recent change (e.g. Asia/Kathmandu, Asia/Kolkata) return `null`.
 *
 * @throws {RangeError} if `zone` is not a valid IANA time zone.
 */
export function previousTransition(zone: string, from?: Instant): Transition | null {
  const endMs = toMs(from);
  const floorMs = endMs - HORIZON_MS;

  let laterMs = endMs;
  let laterOff = getOffset(zone, laterMs);

  for (let t = endMs - STEP_MS; t >= floorMs; t -= STEP_MS) {
    const off = getOffset(zone, t);
    if (off !== laterOff) {
      // Offset flips from `off` (earlier) to `laterOff` somewhere in (t, laterMs].
      // Binary-search for the exact millisecond it changes.
      let lo = t; // getOffset(lo) === off
      let hi = laterMs; // getOffset(hi) === laterOff
      while (hi - lo > 1) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (getOffset(zone, mid) === off) lo = mid;
        else hi = mid;
      }
      return { at: new Date(hi), offsetBefore: off, offsetAfter: getOffset(zone, hi) };
    }
    laterMs = t;
    laterOff = off;
  }
  return null;
}

/**
 * Every offset transition in `zone` within the half-open-ish window
 * `[range.from, range.to]`, in chronological order. Repeatedly applies
 * `nextTransition`, so it shares that function's search characteristics.
 * Returns `[]` for zones (or windows) with no changes.
 *
 * @throws {RangeError} if `zone` is not a valid IANA time zone.
 */
export function listTransitions(
  zone: string,
  range: { from: Instant; to: Instant },
): Transition[] {
  const endMs = toMs(range.to);
  const out: Transition[] = [];
  let cursor: number = toMs(range.from);

  // Guard: worst case a couple of transitions per year over any sane window.
  for (let i = 0; i < 10_000; i++) {
    const t = nextTransition(zone, cursor);
    if (!t) break;
    const atMs = t.at.getTime();
    if (atMs > endMs) break;
    out.push(t);
    cursor = atMs + 1000; // step just past this one so the next scan advances
  }
  return out;
}

/**
 * Every offset transition in `zone` during calendar `year` (UTC), in order —
 * typically the two DST switches for a DST zone, or `[]` for a zone without DST.
 *
 * @throws {RangeError} if `zone` is not a valid IANA time zone.
 */
export function transitionsInYear(zone: string, year: number): Transition[] {
  return listTransitions(zone, {
    from: Date.UTC(year, 0, 1, 0, 0, 0),
    to: Date.UTC(year, 11, 31, 23, 59, 59, 999),
  });
}

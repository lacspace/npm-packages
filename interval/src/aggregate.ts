/**
 * List-level aggregation for `@lacspace/interval`: sorting, total covered
 * duration, coverage/utilization, inner gaps, many-way difference and peak
 * concurrency.
 *
 * Zero-dependency, isomorphic. Builds on the core list operations
 * (`mergeIntervals`, `difference`, `durationMs`, `intersection`) and, like
 * them, returns fresh intervals that never alias the inputs.
 */

import { mergeIntervals, difference, durationMs, intersection } from "./index";
import type { Interval } from "./index";

/** A fresh list sorted by `start` (then `end`), with endpoints copied defensively. */
export function sortIntervals(list: Interval[]): Interval[] {
  return list
    .map((iv) => ({ start: new Date(iv.start), end: new Date(iv.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
}

/**
 * Total covered duration in milliseconds — overlaps are counted **once**
 * (the list is merged first). `[]` → `0`.
 */
export function totalDuration(list: Interval[]): number {
  let total = 0;
  for (const iv of mergeIntervals(list)) total += durationMs(iv);
  return total;
}

/**
 * Fraction of `within` covered by `list`, in `[0, 1]` (overlaps counted once).
 * Returns `0` when `within` is empty (zero-length).
 */
export function coverage(list: Interval[], within: Interval): number {
  const span = durationMs(within);
  if (span <= 0) return 0;
  let covered = 0;
  for (const iv of mergeIntervals(list)) {
    const clipped = intersection(iv, within);
    if (clipped) covered += durationMs(clipped);
  }
  return covered / span;
}

/**
 * The empty spaces **between** the intervals once merged — i.e. the gaps that
 * separate the covered blocks. Unlike {@link invert} there is no outer bound:
 * nothing before the first block or after the last is returned. Fewer than two
 * disjoint blocks → `[]`.
 */
export function gaps(list: Interval[]): Interval[] {
  const merged = mergeIntervals(list);
  const out: Interval[] = [];
  for (let i = 1; i < merged.length; i++) {
    out.push({ start: new Date(merged[i - 1]!.end), end: new Date(merged[i]!.start) });
  }
  return out;
}

/**
 * The parts of `a` not covered by **any** interval in `subtract`. Generalises
 * {@link difference} to a whole list; returns a sorted, non-overlapping list
 * (possibly empty).
 */
export function differenceAll(a: Interval, subtract: Interval[]): Interval[] {
  let pieces: Interval[] = [{ start: new Date(a.start), end: new Date(a.end) }];
  for (const s of subtract) {
    const next: Interval[] = [];
    for (const p of pieces) next.push(...difference(p, s));
    pieces = next;
    if (pieces.length === 0) break;
  }
  return pieces;
}

/**
 * Peak number of intervals overlapping at any single instant (max concurrency).
 * Half-open semantics: an interval ending exactly when another begins are
 * **not** simultaneous. `[]` → `0`.
 */
export function maxConcurrency(list: Interval[]): number {
  const events: { t: number; delta: number }[] = [];
  for (const iv of list) {
    const s = iv.start.getTime();
    const e = iv.end.getTime();
    if (e <= s) continue; // ignore empty/invalid intervals
    events.push({ t: s, delta: 1 });
    events.push({ t: e, delta: -1 });
  }
  // Sort by time; process ends (-1) before starts (+1) at an equal instant.
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let cur = 0;
  let peak = 0;
  for (const ev of events) {
    cur += ev.delta;
    if (cur > peak) peak = cur;
  }
  return peak;
}

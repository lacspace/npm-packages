/**
 * Extra single- and pair-interval algebra for `@lacspace/interval`.
 *
 * Zero-dependency, isomorphic. All helpers operate on already-built
 * {@link Interval}s (half-open `[start, end)`) and return fresh `Date`s /
 * intervals — never aliasing the inputs — matching the rest of the package.
 */

import type { Interval } from "./index";

/**
 * Does `outer` fully contain `inner`? True when every instant of `inner` lies
 * within `outer` (`outer.start <= inner.start` and `inner.end <= outer.end`).
 * An empty `inner` sitting on `outer`'s boundary still counts as contained.
 */
export function containsInterval(outer: Interval, inner: Interval): boolean {
  return (
    outer.start.getTime() <= inner.start.getTime() &&
    inner.end.getTime() <= outer.end.getTime()
  );
}

/** Milliseconds of overlap between two intervals — `0` when they don't overlap. */
export function overlapMs(a: Interval, b: Interval): number {
  const start = Math.max(a.start.getTime(), b.start.getTime());
  const end = Math.min(a.end.getTime(), b.end.getTime());
  return start < end ? end - start : 0;
}

/** Is the interval empty (zero-length, `start === end`)? */
export function isEmpty(iv: Interval): boolean {
  return iv.start.getTime() === iv.end.getTime();
}

/** The instant exactly halfway through the interval (a fresh `Date`). */
export function midpoint(iv: Interval): Date {
  return new Date((iv.start.getTime() + iv.end.getTime()) / 2);
}

/** A copy of the interval translated by `ms` milliseconds (negative moves earlier). */
export function shift(iv: Interval, ms: number): Interval {
  return { start: new Date(iv.start.getTime() + ms), end: new Date(iv.end.getTime() + ms) };
}

/**
 * Grow the interval by `ms` on **both** ends (start earlier, end later).
 * A negative `ms` shrinks it; if shrinking would invert the interval it
 * collapses to a zero-length interval at its centre.
 */
export function expand(iv: Interval, ms: number): Interval {
  const s = iv.start.getTime() - ms;
  const e = iv.end.getTime() + ms;
  if (s > e) {
    const mid = (s + e) / 2;
    return { start: new Date(mid), end: new Date(mid) };
  }
  return { start: new Date(s), end: new Date(e) };
}

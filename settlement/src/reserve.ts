/**
 * Holds / reserves / rolling reserve.
 *
 * Withhold a slice of a settlement (a percentage in basis points, a flat
 * amount, or both) and release it after N days. Track how much is still `held`
 * versus `available` at any moment through an **injectable clock**, so tests are
 * fully deterministic and nothing here ever reads the wall clock unless you let
 * it. All money is integer minor units. Pure — inputs are never mutated.
 */

/** A clock returning the current time in epoch milliseconds. */
export type Clock = () => number;

const DAY_MS = 86_400_000;

/** How much to withhold and when to release it. */
export interface ReserveSpec {
  /** Rate in basis points of the base to hold (1% = 100 bps, `>= 0`). */
  bps?: number;
  /** Flat amount to hold, in minor units (`>= 0`). */
  flat?: number;
  /** Days after `heldAt` before the reserve is released (`>= 0`). */
  releaseAfterDays: number;
}

/** A single withheld reserve. */
export interface ReserveEntry {
  /** Amount held, in minor units (`>= 0`). */
  amount: number;
  /** When it was withheld, epoch ms. */
  heldAt: number;
  /** When it becomes available, epoch ms (`heldAt + releaseAfterDays`). */
  releaseAt: number;
  /** Optional external reference. */
  ref?: string;
}

/** Held vs available split of a set of reserves at a point in time. */
export interface ReserveBalance {
  /** Still locked, in minor units. */
  held: number;
  /** Released and payable, in minor units. */
  available: number;
}

/** Floor `base * bps / 10000`, integer-safe for integer inputs. */
function bpsOf(base: number, bps: number): number {
  return Math.floor((base * bps) / 10000);
}

/**
 * Compute the amount to withhold from `base` for `spec`. The held amount is the
 * flat part plus the rate part, floored, and never more than `base`.
 */
export function reserveAmount(base: number, spec: ReserveSpec): number {
  const b = Math.trunc(base);
  const flat = Math.trunc(spec.flat ?? 0);
  const rate = spec.bps != null ? bpsOf(b, spec.bps) : 0;
  const held = flat + rate;
  return Math.min(Math.max(0, held), Math.max(0, b));
}

/**
 * Build a {@link ReserveEntry} withholding part of `base` per `spec`, stamped at
 * the current time from the injected `clock` (defaults to `Date.now`).
 *
 * ```ts
 * const clock = () => Date.parse("2026-01-01T00:00:00Z");
 * holdReserve(10_000, { bps: 1000, releaseAfterDays: 7 }, clock);
 * // → { amount: 1000, heldAt: …, releaseAt: heldAt + 7d, }
 * ```
 */
export function holdReserve(
  base: number,
  spec: ReserveSpec,
  clock: Clock = Date.now,
  ref?: string,
): ReserveEntry {
  const heldAt = clock();
  const days = Math.max(0, Math.trunc(spec.releaseAfterDays));
  const entry: ReserveEntry = {
    amount: reserveAmount(base, spec),
    heldAt,
    releaseAt: heldAt + days * DAY_MS,
  };
  if (ref !== undefined) entry.ref = ref;
  return entry;
}

/** Whether a reserve has reached its release time as of the injected clock. */
export function isReleased(entry: ReserveEntry, clock: Clock = Date.now): boolean {
  return clock() >= entry.releaseAt;
}

/**
 * Split a set of reserves into `held` (still locked) vs `available` (released)
 * as of the injected `clock`. A reserve counts as available once the clock
 * reaches its `releaseAt`.
 */
export function reserveBalance(
  entries: ReserveEntry[],
  clock: Clock = Date.now,
): ReserveBalance {
  const now = clock();
  let held = 0;
  let available = 0;
  for (const e of entries) {
    const amt = Math.trunc(e.amount);
    if (now >= e.releaseAt) available += amt;
    else held += amt;
  }
  return { held, available };
}

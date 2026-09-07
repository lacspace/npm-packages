/**
 * Free-function arithmetic, comparison and distribution helpers.
 *
 * These are thin, functional-style wrappers around the immutable {@link Money}
 * class — handy for `list.reduce(add)` / point-free pipelines — plus the pieces
 * that take an explicit {@link RoundingMode} (scalar multiply/divide, percentage).
 * Nothing here mutates; every function returns a fresh `Money`.
 */
import { Money } from "./index";
import { roundMinor, type RoundingMode } from "./rounding";

/** `a + b` (same currency, else throws). */
export function add(a: Money, b: Money): Money {
  return a.add(b);
}

/** `a − b` (same currency, else throws). */
export function subtract(a: Money, b: Money): Money {
  return a.subtract(b);
}

/**
 * Multiply by a scalar with an explicit rounding mode (default `"half-up"`,
 * matching `Money.prototype.multiply`).
 */
export function multiply(m: Money, factor: number, mode: RoundingMode = "half-up"): Money {
  return Money.fromMinor(roundMinor(m.toMinor() * factor, mode), m.currency);
}

/** Divide by a scalar with an explicit rounding mode (default `"half-up"`). */
export function divide(m: Money, divisor: number, mode: RoundingMode = "half-up"): Money {
  if (divisor === 0) throw new Error("Division by zero");
  return Money.fromMinor(roundMinor(m.toMinor() / divisor, mode), m.currency);
}

/**
 * A percentage of an amount, e.g. `percentage(money(100,"USD"), 8.5)` → $8.50.
 * Rounds to whole minor units with the given mode (default `"half-up"`).
 */
export function percentage(m: Money, percent: number, mode: RoundingMode = "half-up"): Money {
  return Money.fromMinor(roundMinor((m.toMinor() * percent) / 100, mode), m.currency);
}

/** −1 / 0 / 1 ordering (same currency, else throws) — for `Array.sort`. */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  if (a.lessThan(b)) return -1;
  if (a.greaterThan(b)) return 1;
  return 0;
}

/** The smallest of one or more `Money` (all same currency). */
export function minMoney(first: Money, ...rest: Money[]): Money {
  return rest.reduce((acc, m) => (m.lessThan(acc) ? m : acc), first);
}

/** The largest of one or more `Money` (all same currency). */
export function maxMoney(first: Money, ...rest: Money[]): Money {
  return rest.reduce((acc, m) => (m.greaterThan(acc) ? m : acc), first);
}

/** `true` when two amounts are equal in value and currency. */
export function equals(a: Money, b: Money): boolean {
  return a.equals(b);
}

/**
 * Split by integer ratio weights, remainder-preserving (delegates to
 * `Money.prototype.allocate`). `allocate(money(10,"USD"), [1,1,1])`.
 */
export function allocate(m: Money, ratios: number[]): Money[] {
  return m.allocate(ratios);
}

/** Split into `n` equal parts, remainder-preserving (`Money.prototype.split`). */
export function split(m: Money, n: number): Money[] {
  return m.split(n);
}

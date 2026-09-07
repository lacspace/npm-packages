/**
 * Currency conversion with an *injected* exchange rate — never any network.
 *
 * The rate is expressed in major units of the target per one major unit of the
 * source (e.g. USD→EUR at 0.92). Conversion honours each currency's exponent so
 * integer minor-unit semantics are preserved, with an explicit rounding mode.
 */
import { Money, decimalsFor } from "./index";
import { roundMinor, type RoundingMode } from "./rounding";

/**
 * Convert `m` into `toCurrency` at the given `rate` (target major per source
 * major), rounding to whole target minor units.
 *
 * `convert(money(100, "USD"), "EUR", 0.92)` → €92.00.
 * `convert(money(100, "USD"), "JPY", 150)` → ¥15,000 (0-decimal target).
 */
export function convert(
  m: Money,
  toCurrency: string,
  rate: number,
  mode: RoundingMode = "half-up",
): Money {
  if (!(rate >= 0) || !Number.isFinite(rate)) {
    throw new Error(`convert() needs a finite, non-negative rate, got ${rate}`);
  }
  const fromFactor = Math.pow(10, decimalsFor(m.currency));
  const toFactor = Math.pow(10, decimalsFor(toCurrency));
  // minorTo = (minorFrom / fromFactor) * rate * toFactor
  const target = (m.toMinor() * rate * toFactor) / fromFactor;
  return Money.fromMinor(roundMinor(target, mode), toCurrency);
}

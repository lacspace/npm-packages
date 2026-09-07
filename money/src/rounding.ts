/**
 * Explicit rounding modes for the (rare) operations that produce a fractional
 * number of minor units — scalar multiply/divide, percentages and conversion.
 *
 * All money *storage* stays integer; these modes only decide how a fractional
 * intermediate collapses back to a whole minor unit. `"half-up"` matches the
 * package's historical default (round half away from zero).
 */
export type RoundingMode =
  | "half-up"
  | "half-down"
  | "half-even"
  | "bankers"
  | "floor"
  | "ceil"
  | "trunc";

/**
 * Round a (possibly fractional) minor-unit value to a whole integer using an
 * explicit rounding mode. Returns an integer.
 *
 * - `half-up` — .5 rounds away from zero (the intuitive money rule, default)
 * - `half-down` — .5 rounds toward zero
 * - `half-even` / `bankers` — .5 rounds to the nearest even integer
 * - `floor` — toward −∞ · `ceil` — toward +∞ · `trunc` — toward zero
 */
export function roundMinor(value: number, mode: RoundingMode = "half-up"): number {
  switch (mode) {
    case "floor":
      return Math.floor(value);
    case "ceil":
      return Math.ceil(value);
    case "trunc":
      return Math.trunc(value);
  }
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const low = Math.floor(abs);
  const frac = abs - low;
  let rounded: number;
  if (frac < 0.5) rounded = low;
  else if (frac > 0.5) rounded = low + 1;
  else {
    // Exactly halfway.
    switch (mode) {
      case "half-down":
        rounded = low;
        break;
      case "half-even":
      case "bankers":
        rounded = low % 2 === 0 ? low : low + 1;
        break;
      case "half-up":
      default:
        rounded = low + 1;
        break;
    }
  }
  return sign * rounded;
}

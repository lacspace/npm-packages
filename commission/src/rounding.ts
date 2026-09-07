/**
 * Explicit rounding of a fractional value to an integer number of minor units.
 *
 * The existing {@link commission} / {@link split} helpers use `Math.round`
 * (ties toward +∞) and keep doing so, unchanged. The additive helpers in this
 * package (slabs, composite rules, tax, marketplace splits) instead accept a
 * {@link RoundingMode} so callers can pin the exact tie-breaking rule their
 * jurisdiction or ledger requires — and it is applied *consistently* wherever
 * a fractional money value has to collapse to a whole minor unit.
 *
 * Everything here is integer-safe: inputs may be fractional (e.g. `amt * rate`)
 * but the output is always an integer number of minor units.
 */

/** How a fractional minor-unit value is collapsed to a whole minor unit. */
export type RoundingMode =
  /** Ties round away from zero: `0.5 → 1`, `-0.5 → -1`, `2.5 → 3`. (default) */
  | "half-up"
  /** Ties round toward zero: `0.5 → 0`, `-0.5 → 0`, `2.5 → 2`. */
  | "half-down"
  /** Banker's rounding — ties round to the nearest even: `0.5 → 0`, `2.5 → 2`. */
  | "half-even"
  /** Ties round to the nearest odd: `0.5 → 1`, `2.5 → 3`, `1.5 → 1`. */
  | "half-odd"
  /** Ties round toward +∞: `0.5 → 1`, `-0.5 → 0`. */
  | "half-ceil"
  /** Ties round toward -∞: `0.5 → 0`, `-0.5 → -1`. */
  | "half-floor"
  /** Always toward +∞ (`Math.ceil`). */
  | "ceil"
  /** Always toward -∞ (`Math.floor`). */
  | "floor"
  /** Always toward zero (`Math.trunc`). */
  | "trunc";

/** The default rounding mode used by every additive helper in this package. */
export const DEFAULT_ROUNDING: RoundingMode = "half-up";

// Ties are detected with a small tolerance so that float artefacts like
// `0.1 * 335 === 33.499999…` still count as a clean `.5` boundary.
const TIE_EPS = 1e-9;

/**
 * Round `value` (a fractional minor-unit amount) to a whole minor unit using
 * the given {@link RoundingMode}. Works for negative values too.
 */
export function roundMinor(value: number, mode: RoundingMode = DEFAULT_ROUNDING): number {
  if (!Number.isFinite(value)) return value;

  switch (mode) {
    case "ceil":
      return Math.ceil(value);
    case "floor":
      return Math.floor(value);
    case "trunc":
      return Math.trunc(value);
    default:
      break;
  }

  const lo = Math.floor(value);
  const hi = lo + 1;
  const frac = value - lo; // always in [0, 1)
  const diff = frac - 0.5;

  if (diff < -TIE_EPS) return lo; // clearly below .5
  if (diff > TIE_EPS) return hi; // clearly above .5

  // Exact tie — resolve per mode.
  switch (mode) {
    case "half-up":
      return value >= 0 ? hi : lo; // away from zero
    case "half-down":
      return value >= 0 ? lo : hi; // toward zero
    case "half-ceil":
      return hi;
    case "half-floor":
      return lo;
    case "half-even":
      return lo % 2 === 0 ? lo : hi;
    case "half-odd":
      return lo % 2 === 0 ? hi : lo;
    default:
      return hi;
  }
}

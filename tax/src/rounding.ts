/**
 * Extended rounding modes for tax arithmetic.
 *
 * The core {@link tax}/{@link addTax}/{@link extractTax}/{@link compound}
 * helpers accept the original {@link Rounding} set (`"half-up" | "bankers" |
 * "none"`). The newer multi-tax, invoice and VAT helpers accept this richer
 * {@link RoundingMode} superset so you can match a jurisdiction's exact rule.
 *
 * All modes operate on a value already expressed in minor units (so we are only
 * ever deciding how to treat the fractional minor unit produced by
 * `base * rate`), and every mode is deterministic and float-drift free.
 */

/**
 * A rounding rule for the tax portion. Superset of the original `Rounding`
 * type, so every `Rounding` value is also a valid `RoundingMode`.
 *
 * - `"half-up"` — round half away from zero (2.5 → 3, -2.5 → -3). The default.
 * - `"half-down"` — round half toward zero (2.5 → 2, -2.5 → -2).
 * - `"half-even"` / `"bankers"` — round half to the even neighbour (2.5 → 2, 3.5 → 4).
 * - `"ceil"` — always round toward +∞.
 * - `"floor"` — always round toward -∞.
 * - `"trunc"` — drop the fraction toward zero.
 * - `"none"` — no rounding; keep the exact (possibly fractional) value.
 */
export type RoundingMode =
  | "half-up"
  | "half-down"
  | "half-even"
  | "bankers"
  | "ceil"
  | "floor"
  | "trunc"
  | "none";

/** Round half away from zero — the intuitive rule (2.5 → 3, -2.5 → -3). */
function halfUp(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** Round half toward zero (2.5 → 2, -2.5 → -2). */
function halfDown(n: number): number {
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const floor = Math.floor(abs);
  const diff = abs - floor;
  const rounded = diff <= 0.5 ? floor : floor + 1;
  return sign * rounded;
}

/** Round half to even ("bankers' rounding": 2.5 → 2, 3.5 → 4). */
function halfEven(n: number): number {
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const floor = Math.floor(abs);
  const diff = abs - floor;
  let rounded: number;
  if (diff < 0.5) rounded = floor;
  else if (diff > 0.5) rounded = floor + 1;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  return sign * rounded;
}

/**
 * Round a minor-unit value according to `mode`. Defaults to `"half-up"`.
 *
 * This is the shared rounder used by the multi-tax, invoice and VAT helpers;
 * the classic `tax()` family keeps its own (identical for the shared modes)
 * behaviour for byte-for-byte backward compatibility.
 */
export function roundMinor(n: number, mode: RoundingMode = "half-up"): number {
  switch (mode) {
    case "none":
      return n;
    case "half-down":
      return halfDown(n);
    case "half-even":
    case "bankers":
      return halfEven(n);
    case "ceil":
      return Math.ceil(n);
    case "floor":
      return Math.floor(n);
    case "trunc":
      return Math.trunc(n);
    case "half-up":
    default:
      return halfUp(n);
  }
}

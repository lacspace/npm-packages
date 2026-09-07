/**
 * Dimensional (volumetric) weight.
 *
 * Carriers bill the greater of a parcel's *actual* weight and its *volumetric*
 * weight — bulky-but-light parcels take up space, so they cost more than their
 * scale weight suggests. Volumetric weight is `length × width × height ÷ divisor`
 * in whatever unit the divisor targets.
 *
 * Everything here is integer-safe: weights round **up** (billing never rounds a
 * customer's parcel down) and stay whole numbers, matching the grams used by the
 * rest of the package.
 */

import { ShippingError } from "./index";

/** Parcel dimensions. Any consistent linear unit (cm by default). */
export interface Dimensions {
  length: number;
  width: number;
  height: number;
}

/** Options controlling how volumetric weight is derived. */
export interface DimWeightOptions {
  /**
   * Volumetric divisor. `length × width × height` is divided by this. The
   * default `5000` yields kilograms for centimetre dimensions (IATA air). To
   * work in **grams** — the unit the rate bands use — pass `divisor: 5` (or set
   * `scale: 1000` and keep `5000`).
   */
  divisor?: number;
  /** Multiplier applied to the volume before dividing (e.g. `1000` cm³→g). Default `1`. */
  scale?: number;
}

const DEFAULT_DIVISOR = 5000;

/**
 * Volumetric weight of a parcel, rounded **up** to a whole unit.
 *
 * `ceil(length × width × height × scale ÷ divisor)`.
 *
 * @throws {ShippingError} when the divisor is not a positive number.
 */
export function volumetricWeight(
  dims: Dimensions,
  opts: DimWeightOptions = {},
): number {
  const divisor = opts.divisor ?? DEFAULT_DIVISOR;
  const scale = opts.scale ?? 1;
  if (!(divisor > 0)) {
    throw new ShippingError("volumetric divisor must be positive", "DIM_DIVISOR");
  }
  const volume =
    Math.max(0, dims.length) *
    Math.max(0, dims.width) *
    Math.max(0, dims.height);
  return Math.ceil((volume * scale) / divisor);
}

/**
 * Billable weight = `max(actual, volumetric)`, as a whole number.
 *
 * Use this as the `weight` metric when selecting a rate band so bulky parcels
 * are charged by the space they occupy.
 */
export function billableWeight(
  actualWeight: number,
  dims: Dimensions,
  opts: DimWeightOptions = {},
): number {
  const actual = Math.max(0, Math.trunc(actualWeight));
  return Math.max(actual, volumetricWeight(dims, opts));
}

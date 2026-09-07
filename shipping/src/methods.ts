/**
 * Multi-method quoting with ETA / estimated-days and optional dimensional
 * pricing.
 *
 * `quoteMethods` quotes every applicable method at once — like `quoteShipping`
 * but each quote also carries an `estimatedDays` midpoint, the result can be
 * sorted by **cost** or by **speed**, and passing parcel `dimensions` makes it
 * rate on billable (dimensional) weight automatically.
 */

import {
  rateForMethod,
  type ShippingMethod,
  type ShipmentInput,
  type ShippingQuote,
} from "./index";
import { billableWeight, type Dimensions } from "./dim-weight";

/** A method quote augmented with a single estimated-days figure. */
export interface MethodQuote extends ShippingQuote {
  /** Midpoint of `etaDays`, rounded; `undefined` when the method has no ETA. */
  estimatedDays?: number;
}

/** Options for {@link quoteMethods}. */
export interface QuoteMethodsOptions {
  /** Skip zero-cost quotes (store pickup / hit free-shipping threshold). */
  excludeFree?: boolean;
  /** Sort order. `"cost"` (default) ascending by price; `"speed"` by fastest ETA. */
  sortBy?: "cost" | "speed";
  /** Parcel dimensions — when set, methods rate on billable weight. */
  dimensions?: Dimensions;
  /** Volumetric divisor for `dimensions` (see {@link billableWeight}). */
  divisor?: number;
  /** Volume scale for `dimensions` (see {@link billableWeight}). */
  scale?: number;
}

/** Midpoint of an `[min, max]` ETA window, rounded; `undefined` when absent. */
export function estimatedDays(eta?: [number, number]): number | undefined {
  if (!eta) return undefined;
  return Math.round((eta[0] + eta[1]) / 2);
}

/**
 * Quote every applicable method for a shipment, each with `estimatedDays`,
 * returned as a sorted list.
 *
 * A method with no `zoneId` applies everywhere; a zoned method matches only when
 * its `zoneId` equals `input.zoneId`. When `opts.dimensions` is given the
 * effective weight becomes `billableWeight(input.weight, dimensions)` so bulky
 * parcels are rated by volume. Sorted by cost ascending, or by fastest ETA when
 * `sortBy: "speed"` (methods without an ETA sort last).
 */
export function quoteMethods(
  methods: ShippingMethod[],
  input: ShipmentInput,
  opts: QuoteMethodsOptions = {},
): MethodQuote[] {
  let effective = input;
  if (opts.dimensions) {
    effective = {
      ...input,
      weight: billableWeight(input.weight ?? 0, opts.dimensions, {
        divisor: opts.divisor,
        scale: opts.scale,
      }),
    };
  }

  const quotes: MethodQuote[] = methods
    .filter((m) => m.zoneId === undefined || m.zoneId === input.zoneId)
    .map((m) => {
      const q = rateForMethod(m, effective) as MethodQuote;
      const days = estimatedDays(q.etaDays);
      return days === undefined ? q : { ...q, estimatedDays: days };
    });

  const filtered = opts.excludeFree
    ? quotes.filter((q) => q.cost > 0)
    : quotes;

  if (opts.sortBy === "speed") {
    return filtered.sort(
      (a, b) =>
        (a.estimatedDays ?? Infinity) - (b.estimatedDays ?? Infinity) ||
        a.cost - b.cost,
    );
  }
  return filtered.sort((a, b) => a.cost - b.cost);
}

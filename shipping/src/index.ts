/**
 * @lacspace/shipping — a checkout-time shipping-**rate** calculator.
 *
 * Given a destination zone, a cart's weight / subtotal / item-count, and a set
 * of merchant rate rules, it returns the available shipping methods with their
 * computed costs — applying free-shipping thresholds, surcharges and handling.
 *
 * This is **rate calculation only**, not carrier tracking (that lives in
 * `@lacspace/courier`). Everything here is a pure function, isomorphic across
 * Node, edge runtimes and browsers, with zero dependencies.
 *
 * All money is expressed in **integer minor units** (cents, paise, satoshi…),
 * weight in grams. There are no floats representing money anywhere, so you
 * never lose a penny to rounding.
 */

/* ------------------------------------------------------------------ *
 * Zones
 * ------------------------------------------------------------------ */

/** A shipping zone — a named grouping of destinations. */
export interface ShippingZone {
  /** Stable identifier, referenced by {@link ShippingMethod.zoneId}. */
  id: string;
  /** Human-readable name (optional). */
  name?: string;
  /** ISO country codes this zone covers (case-insensitive). */
  countries?: string[];
  /** Region / state / province codes this zone covers (case-insensitive). */
  regions?: string[];
}

/**
 * Resolve the zone a destination belongs to.
 *
 * Matches by **region first** (the more specific signal) and then by country,
 * case-insensitively. Returns `undefined` when nothing matches.
 */
export function resolveZone(
  dest: { country?: string; region?: string },
  zones: ShippingZone[],
): ShippingZone | undefined {
  const region = norm(dest.region);
  const country = norm(dest.country);

  if (region) {
    const byRegion = zones.find((z) =>
      (z.regions ?? []).some((r) => norm(r) === region),
    );
    if (byRegion) return byRegion;
  }

  if (country) {
    const byCountry = zones.find((z) =>
      (z.countries ?? []).some((c) => norm(c) === country),
    );
    if (byCountry) return byCountry;
  }

  return undefined;
}

/* ------------------------------------------------------------------ *
 * Rate rules
 * ------------------------------------------------------------------ */

/** How a method's cost is derived from the shipment. */
export type RateStrategy = "flat" | "weight" | "price" | "item";

/**
 * A single band of a rate table. `min` is inclusive; `max` is inclusive; an
 * undefined `max` makes the band open-ended (the top tier). The band's metric
 * is weight (grams), price (minor units) or item count, per the strategy.
 */
export interface RateBand {
  /** Lower bound of the band, inclusive. */
  min: number;
  /** Upper bound of the band, inclusive. `undefined` = open-ended. */
  max?: number;
  /** Cost for shipments in this band, in integer minor units. */
  cost: number;
}

/** A shipping method — one selectable rate rule. */
export interface ShippingMethod {
  /** Stable identifier. */
  id: string;
  /** Human-readable label shown at checkout. */
  label: string;
  /** Zone this method is limited to. Omit to apply everywhere. */
  zoneId?: string;
  /** How the base cost is computed. */
  strategy: RateStrategy;
  /** Base cost for the `"flat"` strategy, in minor units. */
  flat?: number;
  /** Rate table for `"weight" | "price" | "item"` strategies. */
  bands?: RateBand[];
  /** Subtotal (minor units) at/above which shipping becomes free. */
  freeOver?: number;
  /** Flat surcharge added to the base cost, in minor units. */
  surcharge?: number;
  /** Flat handling fee added to the base cost, in minor units. */
  handling?: number;
  /** Floor for the final cost, in minor units. */
  minCost?: number;
  /** Ceiling for the final cost, in minor units. */
  maxCost?: number;
  /** Estimated delivery window `[minDays, maxDays]`. */
  etaDays?: [number, number];
}

/** The shipment being rated. */
export interface ShipmentInput {
  /** Destination zone id, matched against {@link ShippingMethod.zoneId}. */
  zoneId?: string;
  /** Total shippable weight, in grams. */
  weight?: number;
  /** Cart subtotal, in integer minor units. */
  subtotal?: number;
  /** Total number of items in the cart. */
  itemCount?: number;
}

/** A computed quote for one method. */
export interface ShippingQuote {
  methodId: string;
  label: string;
  /** Final cost, in integer minor units. */
  cost: number;
  /** True when the free-shipping threshold applied. */
  free: boolean;
  etaDays?: [number, number];
}

/** Thrown when a method cannot be rated (e.g. no band matches the metric). */
export class ShippingError extends Error {
  /** Optional machine-readable code, e.g. `"NO_BAND"` / `"NO_METRIC"`. */
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ShippingError";
    if (code !== undefined) this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * Calculation
 * ------------------------------------------------------------------ */

/**
 * Compute the quote for a single method against a shipment.
 *
 * The metric is chosen by strategy: `flat` uses `method.flat`, `weight` uses
 * `input.weight`, `price` uses `input.subtotal`, `item` uses `input.itemCount`.
 * The matching band (`min ≤ metric` and `metric ≤ max`, or an open-ended top
 * band) supplies the base cost; `surcharge` and `handling` are added, the
 * result is clamped to `[minCost, maxCost]` when set, and if `freeOver` is set
 * and `subtotal ≥ freeOver` the cost is `0` and `free` is `true`.
 *
 * @throws {ShippingError} when a band-based strategy has no matching band, the
 * required metric is missing, or a flat method has no `flat` value.
 */
export function rateForMethod(
  method: ShippingMethod,
  input: ShipmentInput,
): ShippingQuote {
  let base: number;

  if (method.strategy === "flat") {
    if (method.flat === undefined) {
      throw new ShippingError(
        `Method "${method.id}" is flat but has no flat cost`,
        "NO_FLAT",
      );
    }
    base = toInt(method.flat);
  } else {
    const metric = metricFor(method.strategy, input);
    base = bandCost(method, metric);
  }

  let cost = base + toInt(method.surcharge ?? 0) + toInt(method.handling ?? 0);

  if (method.minCost !== undefined) cost = Math.max(toInt(method.minCost), cost);
  if (method.maxCost !== undefined) cost = Math.min(toInt(method.maxCost), cost);

  cost = Math.max(0, cost);

  let free = false;
  if (
    method.freeOver !== undefined &&
    input.subtotal !== undefined &&
    input.subtotal >= method.freeOver
  ) {
    cost = 0;
    free = true;
  }

  const quote: ShippingQuote = {
    methodId: method.id,
    label: method.label,
    cost,
    free,
  };
  if (method.etaDays !== undefined) quote.etaDays = method.etaDays;
  return quote;
}

/**
 * Quote every applicable method for a shipment, sorted by cost ascending.
 *
 * A method with no `zoneId` applies everywhere; a method with a `zoneId` is
 * only included when it equals `input.zoneId`.
 */
export function quoteShipping(
  methods: ShippingMethod[],
  input: ShipmentInput,
): ShippingQuote[] {
  return methods
    .filter((m) => m.zoneId === undefined || m.zoneId === input.zoneId)
    .map((m) => rateForMethod(m, input))
    .sort((a, b) => a.cost - b.cost);
}

/** The single cheapest applicable quote, or `undefined` when none apply. */
export function cheapestQuote(
  methods: ShippingMethod[],
  input: ShipmentInput,
): ShippingQuote | undefined {
  return quoteShipping(methods, input)[0];
}

/**
 * Minor units still needed to reach a method's free-shipping threshold.
 *
 * Returns `0` when the method has no `freeOver` or the subtotal already meets
 * it. Never negative.
 */
export function freeShippingRemaining(
  method: ShippingMethod,
  subtotal: number,
): number {
  if (method.freeOver === undefined) return 0;
  return Math.max(0, toInt(method.freeOver) - toInt(subtotal));
}

/* ------------------------------------------------------------------ *
 * Internals
 * ------------------------------------------------------------------ */

function toInt(n: number): number {
  return Math.trunc(n);
}

function norm(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Pick the metric value for a band-based strategy, or throw if absent. */
function metricFor(strategy: RateStrategy, input: ShipmentInput): number {
  const value =
    strategy === "weight"
      ? input.weight
      : strategy === "price"
        ? input.subtotal
        : input.itemCount; // "item"
  if (value === undefined) {
    throw new ShippingError(
      `Shipment is missing the "${strategy}" metric required to rate this method`,
      "NO_METRIC",
    );
  }
  return value;
}

/** Find the band covering `metric` and return its cost, or throw. */
function bandCost(method: ShippingMethod, metric: number): number {
  const bands = method.bands ?? [];
  const band = bands.find(
    (b) => metric >= b.min && (b.max === undefined || metric <= b.max),
  );
  if (!band) {
    throw new ShippingError(
      `Method "${method.id}" has no band matching ${method.strategy} = ${metric}`,
      "NO_BAND",
    );
  }
  return toInt(band.cost);
}

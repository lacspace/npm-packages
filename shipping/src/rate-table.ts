/**
 * Zone-based rate tables and the shared band/base-cost primitives.
 *
 * A rate table maps an **origin → destination lane** to a rate rule (a
 * weight-break bracket table, a flat rate, or a per-item rate). This is the
 * classic carrier "zone chart": pick the lane for where the parcel is going,
 * then read the cost off the applicable weight bracket.
 *
 * Bracket selection matches the core package exactly — `min` inclusive, `max`
 * inclusive, an undefined `max` is the open-ended top bracket — so boundaries
 * resolve identically here. All costs are integer minor units.
 */

import {
  ShippingError,
  type RateBand,
  type RateStrategy,
  type ShippingMethod,
  type ShipmentInput,
} from "./index";

function toInt(n: number): number {
  return Math.trunc(n);
}

/**
 * The band whose range covers `value`, or `undefined` when none does.
 *
 * `min` inclusive, `max` inclusive, undefined `max` = open-ended top band. The
 * first matching band wins (declaration order), so overlapping bands resolve to
 * the earliest — identical to the core rating engine.
 */
export function selectBand(
  bands: RateBand[],
  value: number,
): RateBand | undefined {
  return bands.find(
    (b) => value >= b.min && (b.max === undefined || value <= b.max),
  );
}

/** Pick the metric a strategy rates on. Throws when it is absent. */
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

/**
 * The **base** cost of a method against a shipment — the strategy result before
 * surcharge, handling, clamping and free-shipping are applied.
 *
 * `flat` → `method.flat`; `weight | price | item` → the matching band's cost.
 * This is the same computation `rateForMethod` performs internally, exposed for
 * building breakdowns and custom pipelines.
 *
 * @throws {ShippingError} `NO_FLAT` / `NO_METRIC` / `NO_BAND`.
 */
export function baseCost(method: ShippingMethod, input: ShipmentInput): number {
  if (method.strategy === "flat") {
    if (method.flat === undefined) {
      throw new ShippingError(
        `Method "${method.id}" is flat but has no flat cost`,
        "NO_FLAT",
      );
    }
    return toInt(method.flat);
  }
  const metric = metricFor(method.strategy, input);
  const band = selectBand(method.bands ?? [], metric);
  if (!band) {
    throw new ShippingError(
      `Method "${method.id}" has no band matching ${method.strategy} = ${metric}`,
      "NO_BAND",
    );
  }
  return toInt(band.cost);
}

/** One origin → destination lane of a zone rate table. */
export interface ZoneLane {
  /** Origin zone id. Omit to match any origin. */
  from?: string;
  /** Destination zone id (matched against the shipment's `toZone`). */
  to: string;
  /** Rate strategy for this lane. Defaults to `"weight"`. */
  strategy?: RateStrategy;
  /** Base cost for a `"flat"` lane, in minor units. */
  flat?: number;
  /** Weight-break / price / item brackets for a banded lane. */
  bands?: RateBand[];
}

/** A shipment addressed against a zone rate table. */
export interface LaneInput {
  /** Origin zone id (optional; lanes with no `from` still match). */
  fromZone?: string;
  /** Destination zone id. */
  toZone: string;
  /** Weight (grams) for weight lanes — pass billable weight for dim pricing. */
  weight?: number;
  /** Subtotal (minor units) for price lanes. */
  subtotal?: number;
  /** Item count for item lanes. */
  itemCount?: number;
}

/**
 * Resolve the lane serving a shipment, most specific first.
 *
 * A lane whose `from` equals `fromZone` beats a lane with no `from` (a wildcard
 * origin). Both must match `to === toZone`. Returns `undefined` when no lane
 * serves the destination.
 */
export function resolveLane(
  lanes: ZoneLane[],
  input: LaneInput,
): ZoneLane | undefined {
  const to = input.toZone;
  const from = input.fromZone;
  const forDest = lanes.filter((l) => l.to === to);
  if (from !== undefined) {
    const specific = forDest.find((l) => l.from === from);
    if (specific) return specific;
  }
  return forDest.find((l) => l.from === undefined);
}

/**
 * Look up a rate from a zone table: resolve the lane, then read the cost off its
 * strategy (weight-break bracket, flat, or per-item), in minor units.
 *
 * @throws {ShippingError} `NO_LANE` when no lane serves the destination, or the
 * usual `NO_BAND` / `NO_METRIC` when the lane's bracket can't be resolved.
 */
export function rateFromZoneTable(lanes: ZoneLane[], input: LaneInput): number {
  const lane = resolveLane(lanes, input);
  if (!lane) {
    throw new ShippingError(
      `No lane in the rate table serves ${input.fromZone ?? "*"} → ${input.toZone}`,
      "NO_LANE",
    );
  }
  const method: ShippingMethod = {
    id: `${lane.from ?? "*"}->${lane.to}`,
    label: "",
    strategy: lane.strategy ?? "weight",
    flat: lane.flat,
    bands: lane.bands,
  };
  return baseCost(method, {
    weight: input.weight,
    subtotal: input.subtotal,
    itemCount: input.itemCount,
  });
}

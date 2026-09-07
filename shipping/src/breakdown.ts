/**
 * Itemised quote breakdown — `base + handling + surcharges = total`.
 *
 * `rateForMethod` returns just the final number; this returns the same number
 * **with its parts shown**: the strategy base, handling, each surcharge (fuel,
 * remote-area or custom), any threshold discount, and the clamped total. Every
 * line is an integer and the parts sum to the total exactly, so a receipt never
 * drifts by a penny.
 *
 * With no extra options the `total` equals `rateForMethod(method, input).cost`
 * for the same inputs — this is a faithful, additive decomposition.
 */

import { type ShippingMethod, type ShipmentInput } from "./index";
import { baseCost } from "./rate-table";
import { applyThreshold, type ThresholdRule } from "./threshold";

function toInt(n: number): number {
  return Math.trunc(n);
}

/** A named surcharge — a fixed amount and/or a percentage (bps) of the base. */
export interface SurchargeItem {
  label: string;
  /** Fixed amount in minor units. */
  amount?: number;
  /** Percentage of the base cost in basis points (e.g. `1500` = 15%). */
  bps?: number;
}

/** Extra inputs layered on top of the method's own surcharge/handling/freeOver. */
export interface BreakdownOptions {
  /** Fuel surcharge as basis points of the base cost. */
  fuelBps?: number;
  /** Flat remote-area surcharge, in minor units. */
  remoteAreaFee?: number;
  /** Additional named surcharges (fixed and/or bps of base). */
  surcharges?: SurchargeItem[];
  /**
   * Free / discounted threshold rule. Defaults to `{ freeOver: method.freeOver }`,
   * so omitting it reproduces the method's built-in free-shipping behaviour.
   */
  threshold?: ThresholdRule;
}

/** A resolved surcharge line. */
export interface SurchargeLine {
  label: string;
  amount: number;
}

/** A full, integer-exact decomposition of a method's cost. */
export interface QuoteBreakdown {
  methodId: string;
  label: string;
  /** Strategy base cost. */
  base: number;
  /** Handling fee. */
  handling: number;
  /** Every surcharge line (method surcharge, fuel, remote-area, custom). */
  surcharges: SurchargeLine[];
  /** Sum of every surcharge line. */
  surchargeTotal: number;
  /** Amount removed by a (non-free) threshold discount. */
  discount: number;
  /** Final payable cost — `base + handling + surchargeTotal`, clamped, then threshold-adjusted. */
  total: number;
  /** True when the free threshold applied. */
  free: boolean;
}

/**
 * Compute an itemised {@link QuoteBreakdown} for a method.
 *
 * Order of operations mirrors `rateForMethod`: `base + handling + surcharges`,
 * clamp to `[minCost, maxCost]`, floor at `0`, then apply the free/discount
 * threshold. `method.surcharge` and `method.handling` are included automatically;
 * `opts` adds fuel, remote-area and custom surcharges on top.
 */
export function rateBreakdown(
  method: ShippingMethod,
  input: ShipmentInput,
  opts: BreakdownOptions = {},
): QuoteBreakdown {
  const base = baseCost(method, input);
  const handling = toInt(method.handling ?? 0);

  const surcharges: SurchargeLine[] = [];
  if (method.surcharge !== undefined && method.surcharge !== 0) {
    surcharges.push({ label: "surcharge", amount: toInt(method.surcharge) });
  }
  if (opts.fuelBps !== undefined) {
    surcharges.push({
      label: "fuel",
      amount: toInt((base * toInt(opts.fuelBps)) / 10000),
    });
  }
  if (opts.remoteAreaFee !== undefined) {
    surcharges.push({ label: "remote area", amount: toInt(opts.remoteAreaFee) });
  }
  for (const s of opts.surcharges ?? []) {
    let amount = toInt(s.amount ?? 0);
    if (s.bps !== undefined) amount += toInt((base * toInt(s.bps)) / 10000);
    surcharges.push({ label: s.label, amount });
  }

  const surchargeTotal = surcharges.reduce((sum, s) => sum + s.amount, 0);

  let gross = base + handling + surchargeTotal;
  if (method.minCost !== undefined) gross = Math.max(toInt(method.minCost), gross);
  if (method.maxCost !== undefined) gross = Math.min(toInt(method.maxCost), gross);
  gross = Math.max(0, gross);

  const rule: ThresholdRule = opts.threshold ?? { freeOver: method.freeOver };
  const t = applyThreshold(gross, input.subtotal ?? -Infinity, rule);

  return {
    methodId: method.id,
    label: method.label,
    base,
    handling,
    surcharges,
    surchargeTotal,
    discount: t.free ? 0 : gross - t.cost,
    total: t.cost,
    free: t.free,
  };
}

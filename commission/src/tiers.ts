/**
 * Tiered / slab commission with a per-slab breakdown.
 *
 * The existing {@link commission} `"tiered"` rule computes a marginal total but
 * hides *how* it was built up. {@link slabCommission} exposes the same marginal
 * maths with a clear line item per slab (the portion of the amount that fell in
 * the slab, its rate and the minor units it contributed), which is exactly what
 * an invoice or statement needs to show.
 *
 * {@link volumeTierRate} / {@link volumeCommission} instead pick ONE rate for
 * the whole amount based on which volume threshold it reaches (a "spend ≥ X gets
 * rate R" ladder), rather than charging each band marginally.
 *
 * All money is integer minor units; the raw per-slab value is rounded with an
 * explicit {@link RoundingMode} (default `half-up`).
 */

import { roundMinor, DEFAULT_ROUNDING, type RoundingMode } from "./rounding";

/** A single progressive slab (marginal bracket). */
export interface Slab {
  /** Upper boundary of this slab, in minor units, or `null` for infinity. */
  upTo: number | null;
  /** Marginal rate applied to the portion of the amount inside this slab (0..1). */
  rate: number;
  /** Optional label for statements/invoices. */
  label?: string;
}

/** One line item in a {@link SlabResult} breakdown. */
export interface SlabLine {
  label?: string;
  /** Lower boundary of the slab actually used, in minor units. */
  from: number;
  /** Upper boundary of the slab actually used, in minor units. */
  to: number;
  /** Portion of the amount that fell inside this slab (`to - from`). */
  portion: number;
  /** The slab's marginal rate (0..1). */
  rate: number;
  /** Rounded commission contributed by this slab, in minor units. */
  commission: number;
}

/** Result of {@link slabCommission}. */
export interface SlabResult {
  /** Total commission across all slabs, in minor units. */
  commission: number;
  /** Amount left after commission (`amount - commission`), in minor units. */
  net: number;
  /** Effective rate = `commission / amount` (0..1); `0` when amount is `0`. */
  effectiveRate: number;
  /** Per-slab line items, in order. */
  breakdown: SlabLine[];
}

/** Options for {@link slabCommission} / {@link volumeCommission}. */
export interface TierOptions {
  /** Rounding mode for each slab / the total (default `half-up`). */
  rounding?: RoundingMode;
  /** Optional floor on the total commission, in minor units. */
  min?: number;
  /** Optional cap on the total commission, in minor units. */
  max?: number;
}

/**
 * Progressive slab commission with a per-slab breakdown. Each slab is charged
 * marginally on the portion of `amount` that falls inside it; each portion is
 * rounded independently so the line items sum to the returned total exactly.
 */
export function slabCommission(slabs: Slab[], amount: number, opts: TierOptions = {}): SlabResult {
  const mode = opts.rounding ?? DEFAULT_ROUNDING;
  const amt = Math.trunc(amount);
  const breakdown: SlabLine[] = [];
  let lower = 0;
  let total = 0;

  for (const slab of slabs) {
    const upper = slab.upTo === null ? amt : Math.min(slab.upTo, amt);
    if (upper > lower) {
      const portion = upper - lower;
      const c = roundMinor(portion * slab.rate, mode);
      total += c;
      breakdown.push({
        ...(slab.label !== undefined ? { label: slab.label } : {}),
        from: lower,
        to: upper,
        portion,
        rate: slab.rate,
        commission: c,
      });
      lower = upper;
    }
    if (slab.upTo !== null && amt <= slab.upTo) break;
  }

  total = clamp(total, opts.min, opts.max);
  const net = amt - total;
  const effectiveRate = amt === 0 ? 0 : total / amt;
  return { commission: total, net, effectiveRate, breakdown };
}

/** A volume/threshold tier: whenever `amount >= from`, use `rate` for the whole amount. */
export interface VolumeTier {
  /** Inclusive lower threshold (minor units) at which this tier's rate applies. */
  from: number;
  /** Rate applied to the WHOLE amount when this tier is reached (0..1). */
  rate: number;
  /** Optional label. */
  label?: string;
}

/**
 * Pick the applicable {@link VolumeTier} for `amount` — the highest `from`
 * threshold that `amount` reaches. Returns `undefined` when no tier qualifies.
 * Tiers may be given in any order.
 */
export function volumeTier(tiers: VolumeTier[], amount: number): VolumeTier | undefined {
  const amt = Math.trunc(amount);
  let best: VolumeTier | undefined;
  for (const t of tiers) {
    if (amt >= t.from && (best === undefined || t.from > best.from)) best = t;
  }
  return best;
}

/**
 * Volume-tier commission: select the single rate whose threshold `amount`
 * reaches and apply it to the whole amount (non-marginal). When no tier
 * qualifies the commission is `0`.
 */
export function volumeCommission(tiers: VolumeTier[], amount: number, opts: TierOptions = {}): SlabResult {
  const mode = opts.rounding ?? DEFAULT_ROUNDING;
  const amt = Math.trunc(amount);
  const tier = volumeTier(tiers, amt);
  const rate = tier?.rate ?? 0;
  let total = roundMinor(amt * rate, mode);
  total = clamp(total, opts.min, opts.max);

  const breakdown: SlabLine[] =
    tier === undefined
      ? []
      : [
          {
            ...(tier.label !== undefined ? { label: tier.label } : {}),
            from: 0,
            to: amt,
            portion: amt,
            rate,
            commission: total,
          },
        ];

  const net = amt - total;
  const effectiveRate = amt === 0 ? 0 : total / amt;
  return { commission: total, net, effectiveRate, breakdown };
}

function clamp(value: number, min?: number, max?: number): number {
  let v = value;
  if (max !== undefined && v > max) v = max;
  if (min !== undefined && v < min) v = min;
  return v;
}

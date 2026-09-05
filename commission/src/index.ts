/**
 * @lacspace/commission — commission & payout calculation engine.
 *
 * All money is expressed in **integer minor units** (e.g. cents, paisa).
 * There are no floating-point money values anywhere in this package.
 *
 * Isomorphic, dependency-free, side-effect-free.
 */

/** Optional floor / cap applied to a computed commission (minor units). */
export interface CommissionBounds {
  /** Minimum commission (floor), in minor units. */
  min?: number;
  /** Maximum commission (cap), in minor units. */
  max?: number;
}

/** A single marginal bracket in a tiered rule. */
export interface Tier {
  /**
   * Upper boundary of this bracket, in minor units, or `null` for infinity.
   * The last tier in a list should use `upTo: null`.
   */
  upTo: number | null;
  /** Marginal rate applied to the portion of `amount` inside this bracket (0..1). */
  rate: number;
}

/** A commission rule: flat fee, percentage, or marginal tiers. */
export type CommissionRule =
  | ({ type: "flat"; amount: number } & CommissionBounds)
  | ({ type: "percent"; rate: number } & CommissionBounds)
  | ({ type: "tiered"; tiers: Tier[] } & CommissionBounds);

/** Result of a commission computation (all money in minor units). */
export interface CommissionResult {
  /** Commission charged, in minor units. */
  commission: number;
  /** Amount left after commission (`amount - commission`), in minor units. */
  net: number;
  /** Effective rate = `commission / amount` (0..1); `0` when amount is `0`. */
  effectiveRate: number;
}

/** A payout share used by {@link split}. */
export interface Share {
  party: string;
  /** Relative weight of this share. Shares need not sum to 1. */
  rate: number;
}

/** One allocated slice returned by {@link split}. */
export interface SplitPart {
  party: string;
  /** Allocated amount, in minor units. */
  amount: number;
}

/**
 * Compute the commission for `amount` under `rule`.
 *
 * `amount` is truncated to an integer number of minor units. The raw
 * commission is rounded to the nearest minor unit, then clamped into
 * `[min, max]` when those bounds are present.
 */
export function commission(rule: CommissionRule, amount: number): CommissionResult {
  const amt = Math.trunc(amount);

  let raw: number;
  switch (rule.type) {
    case "flat":
      raw = rule.amount;
      break;
    case "percent":
      raw = amt * rule.rate;
      break;
    case "tiered": {
      let acc = 0;
      let lower = 0;
      for (const tier of rule.tiers) {
        const upper = tier.upTo === null ? amt : Math.min(tier.upTo, amt);
        if (upper > lower) {
          acc += (upper - lower) * tier.rate;
          lower = upper;
        }
        if (tier.upTo !== null && amt <= tier.upTo) break;
      }
      raw = acc;
      break;
    }
  }

  let c = Math.round(raw);
  if (rule.max !== undefined && c > rule.max) c = rule.max;
  if (rule.min !== undefined && c < rule.min) c = rule.min;

  const net = amt - c;
  const effectiveRate = amt === 0 ? 0 : c / amt;
  return { commission: c, net, effectiveRate };
}

/**
 * Split `amount` (minor units) proportionally across `shares`.
 *
 * Uses the largest-remainder method so the returned amounts always sum to
 * `amount` **exactly** — no minor units are lost or invented. When the shares'
 * rates sum to zero, `amount` is distributed as evenly as possible instead.
 */
export function split(amount: number, shares: Share[]): SplitPart[] {
  const n = shares.length;
  if (n === 0) return [];

  const amt = Math.trunc(amount);
  const total = shares.reduce((s, x) => s + x.rate, 0);

  // Degenerate weights: fall back to an even distribution.
  if (total <= 0) {
    const base = Math.trunc(amt / n);
    const rem = amt - base * n;
    return shares.map((s, i) => ({ party: s.party, amount: base + (i < rem ? 1 : 0) }));
  }

  const ideals = shares.map((s) => (amt * s.rate) / total);
  const parts: SplitPart[] = shares.map((s, i) => {
    const ideal = ideals[i] ?? 0;
    return { party: s.party, amount: Math.floor(ideal) };
  });

  const allocated = parts.reduce((a, p) => a + p.amount, 0);
  let remainder = amt - allocated;

  // Hand out the leftover minor units to the largest fractional parts first.
  const order = ideals
    .map((ideal, i) => ({ i, frac: ideal - Math.floor(ideal) }))
    .sort((a, b) => b.frac - a.frac);

  let k = 0;
  while (remainder > 0 && order.length > 0) {
    const target = order[k % order.length];
    if (target) {
      const part = parts[target.i];
      if (part) part.amount += 1;
    }
    remainder--;
    k++;
  }

  return parts;
}

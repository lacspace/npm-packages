/**
 * Composite commission structures: flat + percentage (+ optional marginal
 * slabs) combined into one charge, with min/max caps and floors, plus
 * per-category rates.
 *
 * All money is integer minor units; the combined raw value is rounded once
 * with an explicit {@link RoundingMode} (default `half-up`) then clamped into
 * `[floor, cap]`.
 */

import { roundMinor, DEFAULT_ROUNDING, type RoundingMode } from "./rounding";
import { slabCommission, type Slab } from "./tiers";

/** A composite rule combining a flat fee, a percentage and/or marginal slabs. */
export interface CompositeRule {
  /** Fixed component added to the commission, in minor units. */
  flat?: number;
  /** Percentage component applied to the amount (0..1). */
  percent?: number;
  /** Optional marginal slabs added on top (see {@link Slab}). */
  slabs?: Slab[];
  /** Floor on the FINAL commission, in minor units. */
  floor?: number;
  /** Cap on the FINAL commission, in minor units. */
  cap?: number;
  /** Rounding mode (default `half-up`). */
  rounding?: RoundingMode;
}

/** One component contributing to a {@link CompositeResult}. */
export interface CompositeComponent {
  kind: "flat" | "percent" | "slabs";
  /** Rounded minor units this component contributed (before the final clamp). */
  commission: number;
}

/** Result of {@link compositeCommission}. */
export interface CompositeResult {
  /** Final commission after combining components and clamping, in minor units. */
  commission: number;
  /** Amount left after commission (`amount - commission`), in minor units. */
  net: number;
  /** Effective rate = `commission / amount` (0..1); `0` when amount is `0`. */
  effectiveRate: number;
  /** Per-component breakdown (before the floor/cap clamp). */
  components: CompositeComponent[];
  /** `true` when the floor or cap changed the combined total. */
  clamped: boolean;
}

/**
 * Compute a composite commission for `amount`. The flat, percentage and slab
 * components are each rounded to minor units, summed, then the total is clamped
 * into `[floor, cap]` when those are present.
 */
export function compositeCommission(rule: CompositeRule, amount: number): CompositeResult {
  const mode = rule.rounding ?? DEFAULT_ROUNDING;
  const amt = Math.trunc(amount);
  const components: CompositeComponent[] = [];

  if (rule.flat !== undefined) {
    const c = Math.trunc(rule.flat);
    components.push({ kind: "flat", commission: c });
  }
  if (rule.percent !== undefined) {
    const c = roundMinor(amt * rule.percent, mode);
    components.push({ kind: "percent", commission: c });
  }
  if (rule.slabs !== undefined && rule.slabs.length > 0) {
    const c = slabCommission(rule.slabs, amt, { rounding: mode }).commission;
    components.push({ kind: "slabs", commission: c });
  }

  const combined = components.reduce((s, c) => s + c.commission, 0);
  let final = combined;
  if (rule.cap !== undefined && final > rule.cap) final = rule.cap;
  if (rule.floor !== undefined && final < rule.floor) final = rule.floor;

  const net = amt - final;
  const effectiveRate = amt === 0 ? 0 : final / amt;
  return { commission: final, net, effectiveRate, components, clamped: final !== combined };
}

/** An item priced under a named category. */
export interface CategoryItem {
  category: string;
  /** Amount for this item, in minor units. */
  amount: number;
}

/** One category's rolled-up commission. */
export interface CategoryLine {
  category: string;
  /** Sum of item amounts in this category, in minor units. */
  amount: number;
  /** Commission for this category, in minor units. */
  commission: number;
}

/** Result of {@link categoryCommission}. */
export interface CategoryResult {
  /** Total commission across all categories, in minor units. */
  commission: number;
  /** Per-category breakdown. */
  breakdown: CategoryLine[];
}

/**
 * Apply a per-category {@link CompositeRule} to a list of items. Items are
 * grouped by category, each group's total amount is charged under its category
 * rule, and the category commissions are summed. Categories with no matching
 * rule fall back to `rules.default` when present, otherwise contribute `0`.
 */
export function categoryCommission(
  rules: Record<string, CompositeRule>,
  items: CategoryItem[],
): CategoryResult {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.category, (totals.get(item.category) ?? 0) + Math.trunc(item.amount));
  }

  const breakdown: CategoryLine[] = [];
  let total = 0;
  for (const [category, amount] of totals) {
    const rule = rules[category] ?? rules["default"];
    const c = rule === undefined ? 0 : compositeCommission(rule, amount).commission;
    total += c;
    breakdown.push({ category, amount, commission: c });
  }
  return { commission: total, breakdown };
}

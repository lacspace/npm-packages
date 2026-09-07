/**
 * Cost models for @lacspace/paper-trade.
 *
 * Pure, zero-dependency factory functions that build the `charges` and
 * `slippage` callbacks a {@link PaperAccount} applies on every fill. They keep
 * the same money convention as the engine — raw numbers, rounded at the read
 * surface — so they compose cleanly and never introduce hidden rounding.
 *
 * ```ts
 * import { PaperAccount, percentCommission, percentSlippage } from "@lacspace/paper-trade";
 *
 * const acct = new PaperAccount({
 *   cash: 100_000,
 *   charges: percentCommission(0.03, { min: 1 }), // 0.03% of turnover, min ₹1
 *   slippage: percentSlippage(0.05),              // fills 0.05% worse than mid
 * });
 * ```
 */
import type { FillInfo } from "./index";

/** A per-fill cost/slippage callback (matches `charges` / `slippage` options). */
export type CostFn = (info: FillInfo) => number;

function clamp(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) n = min;
  if (max !== undefined && n > max) n = max;
  return n;
}

/** Flat commission — a fixed amount per fill, regardless of size. */
export function flatCommission(amount: number): CostFn {
  return () => (amount > 0 ? amount : 0);
}

/**
 * Percent-of-turnover commission. `pct` is a PERCENT (e.g. `0.03` = 0.03%).
 * Optional `min`/`max` clamp the resulting amount.
 */
export function percentCommission(pct: number, opts: { min?: number; max?: number } = {}): CostFn {
  return (info) => clamp((info.value * pct) / 100, opts.min, opts.max);
}

/** Per-share commission — `perShare × qty`, optionally floored/capped. */
export function perShareCommission(perShare: number, opts: { min?: number; max?: number } = {}): CostFn {
  return (info) => clamp(perShare * info.qty, opts.min, opts.max);
}

/** Sum several cost functions into one (e.g. flat brokerage + percent tax). */
export function composeCosts(...fns: CostFn[]): CostFn {
  return (info) => fns.reduce((s, fn) => s + fn(info), 0);
}

/** Fixed slippage — the fill is `amount` price-units worse for the taker. */
export function fixedSlippage(amount: number): CostFn {
  return () => (amount > 0 ? amount : 0);
}

/** Percent slippage — the fill is `pct`% of price worse for the taker (`0.05` = 0.05%). */
export function percentSlippage(pct: number): CostFn {
  return (info) => (info.price * pct) / 100;
}

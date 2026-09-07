/**
 * Totals recompute — derive an order's monetary totals from its lines.
 *
 * {@link orderTotals} is a pure, additive re-projection of {@link OrderTotals}
 * from `order.lines` plus the order-level `discount`/`shipping` already stored
 * on the order. It never mutates the order and never changes how `createOrder`
 * computes `order.totals`; it simply lets you recompute on demand (e.g. after
 * hand-editing lines) with the exact same integer, remainder-safe arithmetic.
 *
 * {@link allocate} splits an integer amount of minor units across weights using
 * the largest-remainder method, so distributing an order-level discount or tax
 * over lines never loses or invents a single unit.
 */

import type { Order, OrderTotals } from "./index";

/**
 * Recompute an order's totals purely from its lines. `subtotal` is the sum of
 * line totals; `tax` is the per-line `round(total * taxRate)` sum; `discount`
 * and `shipping` are carried from the order's existing totals; `total` is
 * `subtotal - discount + tax + shipping`, clamped at `0`. All integer minor
 * units. (An explicit `tax` override that was passed to `createOrder` is not
 * re-derivable from lines, so this mirrors the default per-line tax path.)
 */
export function orderTotals(order: Order): OrderTotals {
  const subtotal = order.lines.reduce((s, l) => s + l.total, 0);
  const discount = Math.max(0, Math.trunc(order.totals?.discount ?? 0));
  const shipping = Math.max(0, Math.trunc(order.totals?.shipping ?? 0));
  const tax = order.lines.reduce(
    (s, l) => s + Math.round(l.total * (l.taxRate ?? 0)),
    0,
  );
  const total = Math.max(0, subtotal - discount + tax + shipping);
  return { subtotal, discount, tax, shipping, total };
}

/**
 * Distribute an integer `amount` (minor units) across `weights` so the parts
 * sum **exactly** to `amount`, with no rounding drift. Uses the largest-
 * remainder method; when all weights are zero the amount is split as evenly as
 * possible with the remainder going to the earliest buckets.
 *
 * @example
 * allocate(100, [1, 1, 1]); // [34, 33, 33]
 */
export function allocate(amount: number, weights: number[]): number[] {
  const amt = Math.trunc(amount);
  const n = weights.length;
  if (n === 0) return [];
  const clean = weights.map((w) => Math.max(0, w));
  const totalW = clean.reduce((s, w) => s + w, 0);

  if (totalW <= 0) {
    const base = Math.trunc(amt / n);
    const out = new Array<number>(n).fill(base);
    let rem = amt - base * n;
    for (let i = 0; rem > 0; i = (i + 1) % n, rem--) out[i]! += 1;
    return out;
  }

  const raw = clean.map((w) => (w / totalW) * amt);
  const out = raw.map((r) => Math.floor(r));
  let rem = amt - out.reduce((s, f) => s + f, 0);
  const byFrac = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < byFrac.length && rem > 0; k++, rem--) {
    out[byFrac[k]!.i]! += 1;
  }
  return out;
}

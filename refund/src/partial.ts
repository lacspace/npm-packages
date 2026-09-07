/**
 * Partial & line-level refunds, proportional tax/shipping apportionment and
 * multi-tender split — all in **integer minor units**, with remainder-safe
 * allocation that conserves every penny.
 *
 * Pure and immutable, like the rest of `@lacspace/refund`: nothing here mutates
 * its input and there are no floats stored in any result.
 */

import { RefundError } from "./index";

/* -------------------------------------------------------------------------- */
/*  Remainder-safe integer allocation                                          */
/* -------------------------------------------------------------------------- */

function toInt(n: number): number {
  return Math.trunc(n);
}

/**
 * Split an integer `total` (minor units) across `weights`, remainder-safe
 * (largest-remainder / Hamilton method). The result is guaranteed to:
 *
 * - contain one non-negative integer per weight, and
 * - **sum back to `total` exactly** — no penny is created or lost.
 *
 * Left-over units from flooring are handed out one at a time to the parts with
 * the largest fractional remainder (ties broken by original order). Non-positive
 * totals, and the all-zero-weights case, yield an all-zero array.
 *
 * This is the primitive behind proportional tax/shipping refunds and the
 * multi-tender split, but it is exported because it is useful on its own.
 */
export function allocateProportional(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const t = toInt(total);
  const w = weights.map((x) => Math.max(0, toInt(x)));
  const sum = w.reduce((a, b) => a + b, 0);
  const out = new Array<number>(n).fill(0);
  if (t <= 0 || sum === 0) return out;

  const fracs: { i: number; frac: number }[] = [];
  let used = 0;
  for (let i = 0; i < n; i++) {
    const raw = (t * (w[i] ?? 0)) / sum;
    const floor = Math.floor(raw);
    out[i] = floor;
    used += floor;
    fracs.push({ i, frac: raw - floor });
  }

  let remaining = t - used;
  fracs.sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < fracs.length && remaining > 0; k++) {
    const idx = fracs[k]!.i;
    out[idx] = (out[idx] ?? 0) + 1;
    remaining--;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Line-level partial refunds                                                 */
/* -------------------------------------------------------------------------- */

/** A captured order line the refund draws down from. Money = minor units. */
export interface OrderLine {
  /** Identifies the order line. */
  lineId: string;
  /** Stock-keeping unit (optional; carried through to the result). */
  sku?: string;
  /** Price per unit, in integer minor units. */
  unitPrice: number;
  /** Quantity originally captured on this line. */
  qty: number;
  /** Per-line tax rate `0..1`; only used when no order-level `tax` pool is given. */
  taxRate?: number;
  /** Quantity already refunded on this line by prior partial refunds. Default `0`. */
  refundedQty?: number;
}

/** Order-level captured pools to apportion proportionally when refunding part. */
export interface OrderTotals {
  /** Total tax captured for the whole order, minor units. Apportioned by subtotal. */
  tax?: number;
  /** Total shipping captured for the whole order, minor units. */
  shipping?: number;
}

/** A request to refund `qty` units of a specific line. */
export interface RefundLineInput {
  /** The order line to draw from. */
  lineId: string;
  /** Units to refund now (must be ≤ the line's remaining refundable qty). */
  qty: number;
}

/** Options for {@link refundLines}. */
export interface PartialRefundOptions {
  /** Order-level tax/shipping pools; when given, they are apportioned proportionally. */
  order?: OrderTotals;
  /** Also refund the proportional shipping share. Default `false`. */
  refundShipping?: boolean;
  /** Flat restocking fee, minor units. Takes precedence over `restockingPct`. */
  restockingFee?: number;
  /** Restocking fee as a fraction `0..1` of the refunded subtotal. */
  restockingPct?: number;
}

/** Per-line portion of a partial refund. Every field is an integer, minor units. */
export interface RefundLineBreakdown {
  lineId: string;
  sku?: string;
  /** Units refunded in this call. */
  qty: number;
  /** `unitPrice * qty`. */
  subtotal: number;
  /** This line's share of the refunded tax. */
  tax: number;
  /** `subtotal + tax` (before order-level shipping and restocking fee). */
  total: number;
  /** Cumulative refunded qty on the line after this call. */
  refundedQtyAfter: number;
}

/** The result of a partial, line-level refund. Every money field is minor units. */
export interface PartialRefundResult {
  lines: RefundLineBreakdown[];
  subtotal: number;
  tax: number;
  shipping: number;
  restockingFee: number;
  /** `subtotal + tax + shipping - restockingFee`, clamped to never go below `0`. */
  total: number;
}

/**
 * Compute a partial, line-level refund. For each requested line it charges the
 * exact per-unit price for the units refunded, apportions the order's tax (and
 * optionally shipping) **proportionally** to the refunded subtotal — remainder
 * safe — and deducts an optional restocking fee. Prior refunds are honoured via
 * each line's `refundedQty`, so the running total can **never exceed what was
 * captured**.
 *
 * @throws {RefundError} `"UNKNOWN_LINE"` if a request names a line not on the order.
 * @throws {RefundError} `"OVER_REFUND"` if a requested qty exceeds the line's
 *         remaining refundable quantity (`qty - refundedQty`).
 */
export function refundLines(
  order: { lines: OrderLine[] } | OrderLine[],
  requests: RefundLineInput[],
  opts: PartialRefundOptions = {},
): PartialRefundResult {
  const lines = Array.isArray(order) ? order : order.lines;
  const byId = new Map<string, OrderLine>();
  for (const line of lines) byId.set(String(line.lineId), line);

  // The whole order's subtotal — the denominator for proportional pools.
  let orderSubtotal = 0;
  for (const line of lines) orderSubtotal += toInt(line.unitPrice) * toInt(line.qty);

  // Draw down each requested line, guarding against over-refund.
  const drawn: { line: OrderLine; qty: number; subtotal: number }[] = [];
  for (const req of requests) {
    const key = String(req.lineId);
    const line = byId.get(key);
    if (!line) {
      throw new RefundError(`Unknown lineId "${req.lineId}"`, "UNKNOWN_LINE");
    }
    const qty = toInt(req.qty);
    if (qty <= 0) {
      throw new RefundError(`Line "${key}" has non-positive qty ${qty}`, "OVER_REFUND");
    }
    const already = Math.max(0, toInt(line.refundedQty ?? 0));
    const remaining = toInt(line.qty) - already;
    if (qty > remaining) {
      throw new RefundError(
        `Line "${key}" refunds ${qty} but only ${Math.max(0, remaining)} remain refundable`,
        "OVER_REFUND",
      );
    }
    drawn.push({ line, qty, subtotal: toInt(line.unitPrice) * qty });
  }

  const refundSubtotal = drawn.reduce((a, d) => a + d.subtotal, 0);
  const weights = drawn.map((d) => d.subtotal);

  // --- Tax -----------------------------------------------------------------
  // With an order-level pool: refund its proportional share, then split that
  // share across lines. Otherwise fall back to each line's own taxRate.
  let lineTaxes: number[];
  let taxTotal: number;
  if (opts.order?.tax !== undefined) {
    const pool = Math.max(0, toInt(opts.order.tax));
    const rest = Math.max(0, orderSubtotal - refundSubtotal);
    taxTotal = allocateProportional(pool, [refundSubtotal, rest])[0] ?? 0;
    lineTaxes = allocateProportional(taxTotal, weights);
  } else {
    lineTaxes = drawn.map((d) => {
      const rate = d.line.taxRate ?? 0;
      return rate > 0 ? Math.round(d.subtotal * rate) : 0;
    });
    taxTotal = lineTaxes.reduce((a, b) => a + b, 0);
  }

  // --- Shipping ------------------------------------------------------------
  let shipping = 0;
  if (opts.refundShipping && opts.order?.shipping !== undefined) {
    const pool = Math.max(0, toInt(opts.order.shipping));
    const rest = Math.max(0, orderSubtotal - refundSubtotal);
    shipping = allocateProportional(pool, [refundSubtotal, rest])[0] ?? 0;
  }

  // --- Restocking fee ------------------------------------------------------
  let restockingFee: number;
  if (opts.restockingFee !== undefined) {
    restockingFee = Math.max(0, toInt(opts.restockingFee));
  } else if (opts.restockingPct !== undefined && opts.restockingPct > 0) {
    restockingFee = Math.max(0, Math.round(refundSubtotal * opts.restockingPct));
  } else {
    restockingFee = 0;
  }

  const resultLines: RefundLineBreakdown[] = drawn.map((d, i) => {
    const tax = lineTaxes[i] ?? 0;
    const entry: RefundLineBreakdown = {
      lineId: String(d.line.lineId),
      qty: d.qty,
      subtotal: d.subtotal,
      tax,
      total: d.subtotal + tax,
      refundedQtyAfter: Math.max(0, toInt(d.line.refundedQty ?? 0)) + d.qty,
    };
    if (d.line.sku !== undefined) entry.sku = String(d.line.sku);
    return entry;
  });

  const total = Math.max(0, refundSubtotal + taxTotal + shipping - restockingFee);

  return {
    lines: resultLines,
    subtotal: refundSubtotal,
    tax: taxTotal,
    shipping,
    restockingFee,
    total,
  };
}

/* -------------------------------------------------------------------------- */
/*  Multi-tender split                                                         */
/* -------------------------------------------------------------------------- */

/** A payment method the order was captured on. Money = integer minor units. */
export interface Tender {
  /** Payment method / id, e.g. `"card"`, `"wallet"`. */
  method: string;
  /** Amount captured on this tender, minor units. */
  amount: number;
  /** Amount already refunded to this tender by prior refunds. Default `0`. */
  refunded?: number;
}

/** One slice of a multi-tender refund. */
export interface TenderRefund {
  method: string;
  /** Amount to refund back to this tender, minor units. */
  amount: number;
}

/**
 * Split a refund `amount` back across the original tenders, **proportionally to
 * each tender's remaining refundable capacity** (`amount - refunded`), remainder
 * preserving so the slices sum back to `amount` exactly. No tender is ever
 * refunded more than it has left, and the whole refund can never exceed the
 * total remaining capacity.
 *
 * @throws {RefundError} `"OVER_REFUND"` if `amount` exceeds the tenders' total
 *         remaining refundable capacity.
 */
export function splitRefundAcrossTenders(
  amount: number,
  tenders: Tender[],
): TenderRefund[] {
  const amt = toInt(amount);
  const capacities = tenders.map((t) =>
    Math.max(0, toInt(t.amount) - Math.max(0, toInt(t.refunded ?? 0))),
  );
  const totalCapacity = capacities.reduce((a, b) => a + b, 0);
  if (amt < 0) {
    throw new RefundError(`Refund amount ${amt} is negative`, "OVER_REFUND");
  }
  if (amt > totalCapacity) {
    throw new RefundError(
      `Refund of ${amt} exceeds remaining tender capacity of ${totalCapacity}`,
      "OVER_REFUND",
    );
  }
  const parts = allocateProportional(amt, capacities);
  return tenders.map((t, i) => ({ method: String(t.method), amount: parts[i] ?? 0 }));
}

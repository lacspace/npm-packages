/**
 * Batch settlement — settle many transactions into one payout per payee.
 *
 * Feed a flat list of marketplace transactions (captures, refunds, chargebacks,
 * fees, commissions, adjustments) and get back a per-payee settlement that nets
 * captures against everything taken away, with a per-kind line breakdown and a
 * `gross → deductions → net` total. All money is integer minor units; the net
 * is clamped at zero unless negative carry-forward is explicitly allowed. Pure —
 * inputs are never mutated.
 */

/** Transaction classifier. Sign is derived from the kind (see below). */
export type TxnKind =
  | "capture"
  | "refund"
  | "chargeback"
  | "fee"
  | "commission"
  | "adjustment";

/**
 * One transaction to settle.
 *
 * For every kind except `adjustment`, `amount` is a **magnitude** (`>= 0`) and
 * the sign is fixed: `capture` credits the payee (`+`), while `refund`,
 * `chargeback`, `fee` and `commission` debit it (`-`). An `adjustment` uses
 * `amount` **as-is** (may be signed) so it can correct in either direction.
 */
export interface Transaction {
  payee: string;
  kind: TxnKind;
  /** Minor units. Magnitude for fixed-sign kinds; signed for `adjustment`. */
  amount: number;
  ref?: string;
  /** Optional currency tag, carried through to the settlement. */
  currency?: string;
}

/** A per-kind roll-up line inside a payee settlement. */
export interface SettlementLine {
  kind: TxnKind;
  /** Signed contribution to the net, in minor units. */
  amount: number;
  /** How many transactions of this kind were folded in. */
  count: number;
}

/** The netted settlement for one payee. */
export interface PayeeSettlement {
  payee: string;
  currency?: string;
  /** Sum of positive contributions (captures + positive adjustments). */
  gross: number;
  /** Sum of negative contributions as a positive number. */
  deductions: number;
  /** `gross - deductions`, clamped at `0` unless `allowNegative`. */
  net: number;
  /** Per-kind breakdown, sorted by kind. */
  lines: SettlementLine[];
}

/** A whole settlement run across many payees. */
export interface SettlementBatch {
  /** One entry per payee, sorted by payee name. */
  settlements: PayeeSettlement[];
  /** Sum of every payee's `net`, in minor units. */
  totalNet: number;
}

/** Options for {@link settleBatch}. */
export interface BatchOptions {
  /** Let a payee's `net` go below zero (carry-forward). Defaults to `false`. */
  allowNegative?: boolean;
}

const KIND_ORDER: Record<TxnKind, number> = {
  capture: 0,
  refund: 1,
  chargeback: 2,
  fee: 3,
  commission: 4,
  adjustment: 5,
};

/** Signed contribution of one transaction to its payee's net. */
function signedAmount(txn: Transaction): number {
  const mag = Math.trunc(txn.amount);
  switch (txn.kind) {
    case "capture":
      return Math.abs(mag);
    case "refund":
    case "chargeback":
    case "fee":
    case "commission":
      return -Math.abs(mag);
    case "adjustment":
      return mag;
  }
}

/**
 * Net a flat list of transactions into one {@link PayeeSettlement} per payee.
 *
 * ```ts
 * settleBatch([
 *   { payee: "shop_a", kind: "capture", amount: 10_000 },
 *   { payee: "shop_a", kind: "commission", amount: 1_500 },
 *   { payee: "shop_a", kind: "refund", amount: 2_000 },
 *   { payee: "shop_b", kind: "capture", amount: 5_000 },
 * ]);
 * // shop_a → gross 10000, deductions 3500, net 6500
 * // shop_b → gross 5000,  deductions 0,    net 5000
 * ```
 */
export function settleBatch(
  txns: Transaction[],
  opts: BatchOptions = {},
): SettlementBatch {
  const byPayee = new Map<
    string,
    { currency?: string; lines: Map<TxnKind, { amount: number; count: number }> }
  >();

  for (const txn of txns) {
    let bucket = byPayee.get(txn.payee);
    if (!bucket) {
      bucket = { currency: txn.currency, lines: new Map() };
      byPayee.set(txn.payee, bucket);
    }
    if (bucket.currency === undefined && txn.currency !== undefined) {
      bucket.currency = txn.currency;
    }
    const signed = signedAmount(txn);
    const line = bucket.lines.get(txn.kind) ?? { amount: 0, count: 0 };
    line.amount += signed;
    line.count += 1;
    bucket.lines.set(txn.kind, line);
  }

  const settlements: PayeeSettlement[] = [];
  let totalNet = 0;

  for (const [payee, bucket] of byPayee) {
    let gross = 0;
    let deductions = 0;
    const lines: SettlementLine[] = [];
    for (const [kind, line] of bucket.lines) {
      lines.push({ kind, amount: line.amount, count: line.count });
      if (line.amount >= 0) gross += line.amount;
      else deductions += -line.amount;
    }
    lines.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    const rawNet = gross - deductions;
    const net = opts.allowNegative ? rawNet : Math.max(0, rawNet);
    const settlement: PayeeSettlement = { payee, gross, deductions, net, lines };
    if (bucket.currency !== undefined) settlement.currency = bucket.currency;
    settlements.push(settlement);
    totalNet += net;
  }

  settlements.sort((a, b) =>
    a.payee < b.payee ? -1 : a.payee > b.payee ? 1 : 0,
  );
  return { settlements, totalNet };
}

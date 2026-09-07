/**
 * Reconciliation of settled amounts & a render-ready statement structure.
 *
 * Two things sit here: `reconcileSettlement` compares what you expected to
 * settle against what actually settled (per payee) and flags mismatches; and
 * `buildStatement` turns one {@link PayeeSettlement} into a flat, render-ready
 * structure (opening → lines → reserve → net → closing) that any UI or PDF
 * layer can map to rows — no rendering dependency here. All money is integer
 * minor units. Pure — inputs are never mutated.
 */

import { reconcile, type Discrepancy, type ReconcileOptions } from "./index";
import type { PayeeSettlement } from "./batch";

/** Outcome of reconciling expected vs actual settled amounts. */
export interface SettlementReconciliation {
  /** One line per payee, `diff = actual - expected` (mismatches by default). */
  discrepancies: Discrepancy[];
  /** `true` when every settled amount matched its expectation. */
  matched: boolean;
}

/**
 * Reconcile expected vs actual settled amounts per payee and flag mismatches.
 * Thin, integer-safe wrapper over {@link reconcile} that also reports whether
 * everything matched.
 *
 * ```ts
 * reconcileSettlement({ shop_a: 6500 }, { shop_a: 6400 });
 * // → { matched: false, discrepancies: [{ account: "shop_a", …, diff: -100 }] }
 * ```
 */
export function reconcileSettlement(
  expected: Record<string, number>,
  actual: Record<string, number>,
  opts?: ReconcileOptions,
): SettlementReconciliation {
  const discrepancies = reconcile(expected, actual, opts);
  const matched = discrepancies.every((d) => d.diff === 0);
  return { discrepancies, matched };
}

/** A single render-ready statement row. */
export interface StatementLine {
  label: string;
  /** Signed amount in minor units: `+` adds to the payee, `-` takes away. */
  amount: number;
  /** Optional classifier for styling/grouping. */
  kind?: string;
}

/** A render-ready statement for one payee over a period. */
export interface Statement {
  payee: string;
  currency?: string;
  /** Optional statement period, as `"YYYY-MM-DD"` strings. */
  period?: { from?: string; to?: string };
  /** Carried-forward opening balance, in minor units. */
  opening: number;
  /** Ordered rows: settlement lines then an optional reserve withholding. */
  lines: StatementLine[];
  /** Sum of positive contributions, in minor units. */
  gross: number;
  /** Sum of negative contributions as a positive number, in minor units. */
  deductions: number;
  /** Reserve withheld this period, in minor units. */
  reserve: number;
  /** Payable this period: `settlement.net - reserve` (clamped like the batch). */
  net: number;
  /** `opening + net`, in minor units. */
  closing: number;
  /** When the statement was built, epoch ms (from the injected clock). */
  generatedAt: number;
}

/** Options for {@link buildStatement}. */
export interface StatementOptions {
  /** Statement period labels. */
  period?: { from?: string; to?: string };
  /** Carried-forward opening balance, in minor units. Defaults to `0`. */
  opening?: number;
  /** Reserve to withhold from this period's net, in minor units. Defaults `0`. */
  reserve?: number;
  /** Let `net`/`closing` go negative (carry-forward). Defaults to `false`. */
  allowNegative?: boolean;
  /** Injectable clock for `generatedAt`. Defaults to `Date.now`. */
  clock?: () => number;
}

/** Human labels for the batch line kinds. */
const KIND_LABEL: Record<string, string> = {
  capture: "Sales",
  refund: "Refunds",
  chargeback: "Chargebacks",
  fee: "Fees",
  commission: "Commission",
  adjustment: "Adjustments",
};

/**
 * Turn a {@link PayeeSettlement} into a flat, render-ready {@link Statement}.
 * Adds an opening carry-forward, one row per settlement line, an optional
 * reserve withholding row, and a closing balance — all integer minor units.
 *
 * ```ts
 * buildStatement(settlement, { opening: 0, reserve: 500, period: { from, to } });
 * ```
 */
export function buildStatement(
  settlement: PayeeSettlement,
  opts: StatementOptions = {},
): Statement {
  const opening = Math.trunc(opts.opening ?? 0);
  const reserve = Math.max(0, Math.trunc(opts.reserve ?? 0));
  const clock = opts.clock ?? Date.now;

  const lines: StatementLine[] = settlement.lines.map((l) => ({
    label: KIND_LABEL[l.kind] ?? l.kind,
    amount: l.amount,
    kind: l.kind,
  }));
  if (reserve > 0) {
    lines.push({ label: "Reserve withheld", amount: -reserve, kind: "reserve" });
  }

  const rawNet = settlement.net - reserve;
  const net = opts.allowNegative ? rawNet : Math.max(0, rawNet);
  const closing = opening + net;

  const statement: Statement = {
    payee: settlement.payee,
    opening,
    lines,
    gross: settlement.gross,
    deductions: settlement.deductions,
    reserve,
    net,
    closing,
    generatedAt: clock(),
  };
  if (settlement.currency !== undefined) statement.currency = settlement.currency;
  if (opts.period !== undefined) statement.period = opts.period;
  return statement;
}

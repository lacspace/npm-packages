/**
 * Payment ledger — batch and inspect partial payments against an invoice.
 *
 * Builds on the existing {@link recordPayment} (same integer-minor-unit math,
 * same overpayment guard) to apply a *list* of payments immutably, and to
 * summarise settlement (`amountPaid` / `amountDue` / derived status incl.
 * `overdue`). Pure and zero-dependency.
 */

import { Invoice, InvoiceStatus, recordPayment } from "./index";
import { deriveStatus } from "./lifecycle";

/** A single payment against an invoice. `amount` is integer minor units. */
export interface Payment {
  amount: number;
  /** When the payment was made (ms since epoch), for the injectable clock. */
  at?: number;
  /** Free-form method label, e.g. `"card"`, `"bank"`, `"esewa"`. */
  method?: string;
  /** Provider/transaction reference. */
  reference?: string;
  meta?: Record<string, unknown>;
}

/** Outstanding amount still owed on an invoice, integer minor units. */
export function amountDue(inv: Invoice): number {
  return inv.totals.balanceDue;
}

/** Amount paid so far on an invoice, integer minor units. */
export function amountPaid(inv: Invoice): number {
  return inv.totals.amountPaid;
}

/**
 * Apply a list of payments in order, immutably. Each payment is validated and
 * summed via {@link recordPayment}, so the same rules apply: positive amounts
 * only, no payments on a void invoice, and no overpayment past the total.
 *
 * @throws InvoiceError on the first invalid payment ("invalid_amount",
 *   "overpayment", or "void").
 */
export function recordPayments(inv: Invoice, payments: Payment[]): Invoice {
  let cur = inv;
  for (const p of payments) {
    cur = recordPayment(
      cur,
      p.amount,
      p.at !== undefined ? { at: p.at } : undefined,
    );
  }
  return cur;
}

/** Settlement snapshot: how much is paid, how much is due, and the status. */
export interface Settlement {
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
}

/**
 * Summarise settlement without mutating the invoice: `amountPaid`, `amountDue`
 * and the {@link deriveStatus} status (which resolves `paid` / `partial` /
 * `overdue`) at the given clock.
 *
 * @param now injectable clock (ms since epoch) — defaults to `Date.now()`.
 */
export function settlement(
  inv: Invoice,
  now: number = Date.now(),
): Settlement {
  return {
    amountPaid: inv.totals.amountPaid,
    amountDue: inv.totals.balanceDue,
    status: deriveStatus(inv, now),
  };
}

/** Whether an invoice is fully settled (nothing left to pay). */
export function isSettled(inv: Invoice): boolean {
  return inv.totals.balanceDue <= 0;
}

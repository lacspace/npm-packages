/**
 * Invoice status lifecycle — a tiny, pure state machine over the existing
 * {@link InvoiceStatus} vocabulary, plus a status-derivation helper.
 *
 * The canonical happy path is `draft → issued → (partial) → paid`, with
 * `overdue` reachable from any open state and `void` a terminal escape. All
 * functions are pure and immutable — `transition` / `withDerivedStatus` return
 * a brand-new invoice and never mutate their input. Zero dependencies.
 */

import { Invoice, InvoiceStatus, InvoiceError, isOverdue } from "./index";

/**
 * Allowed forward transitions, keyed by current status. `paid` and `void` are
 * terminal (no outgoing edges). Note: in this package `issued` is the "sent"
 * state and `partial` is "partially paid".
 */
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["issued", "void"],
  issued: ["partial", "paid", "overdue", "void"],
  partial: ["paid", "overdue", "void"],
  overdue: ["partial", "paid", "void"],
  paid: [],
  void: [],
};

/**
 * Whether `to` is a legal next status from `from`. A no-op (`from === to`) is
 * always allowed. Unknown statuses are rejected.
 */
export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return true;
  return INVOICE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Move an invoice to `to`, validating against {@link INVOICE_TRANSITIONS}.
 * Immutable — returns a new invoice.
 *
 * @throws InvoiceError ("invalid_transition") when the move is not allowed.
 */
export function transition(inv: Invoice, to: InvoiceStatus): Invoice {
  if (!canTransition(inv.status, to)) {
    throw new InvoiceError(
      `Cannot transition invoice from "${inv.status}" to "${to}"`,
      "invalid_transition",
    );
  }
  if (inv.status === to) return inv;
  return { ...inv, status: to };
}

/**
 * Derive the *effective* status of an invoice from its money and due date,
 * without mutating it. Terminal (`void`) and unstarted (`draft`) statuses are
 * returned unchanged; otherwise:
 *   - `balanceDue <= 0`  → `"paid"`
 *   - past `dueAt` with a balance → `"overdue"`
 *   - some money paid   → `"partial"`
 *   - else the current status (typically `"issued"`).
 *
 * @param now injectable clock (ms since epoch) — defaults to `Date.now()`.
 */
export function deriveStatus(
  inv: Invoice,
  now: number = Date.now(),
): InvoiceStatus {
  if (inv.status === "void" || inv.status === "draft") return inv.status;
  if (inv.totals.balanceDue <= 0) return "paid";
  if (isOverdue(inv, now)) return "overdue";
  if (inv.totals.amountPaid > 0) return "partial";
  return inv.status;
}

/**
 * Return a new invoice whose `status` is set to {@link deriveStatus}. Immutable;
 * returns the same reference when the derived status is unchanged.
 */
export function withDerivedStatus(
  inv: Invoice,
  now: number = Date.now(),
): Invoice {
  const status = deriveStatus(inv, now);
  return status === inv.status ? inv : { ...inv, status };
}

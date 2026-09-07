/**
 * Credit notes — represent a full or partial credit against an invoice and
 * apply it to reduce the amount due.
 *
 * A {@link CreditNote} is plain, serializable data (safe to `JSON.stringify`
 * and persist), and {@link creditNoteRows} emits a render-ready table just like
 * `renderRows` on the invoice side — so a renderer such as `@lacspace/pdf` or
 * `@lacspace/xlsx` can lay it out. No renderer is imported. Integer minor units
 * throughout; pure and immutable.
 */

import {
  Invoice,
  InvoiceLine,
  InvoiceLineInput,
  InvoiceError,
} from "./index";

/** Round to the nearest integer minor unit (half away from zero). */
function roundMinor(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** Compute a single credit-note line using the same math as an invoice line. */
function computeCreditLine(input: InvoiceLineInput): InvoiceLine {
  if (!Number.isFinite(input.qty) || input.qty < 0) {
    throw new InvoiceError(
      `Credit line "${input.description}" has a negative or invalid qty`,
      "invalid_qty",
    );
  }
  const discount = input.discount ?? 0;
  const taxRate = input.taxRate ?? 0;
  const net = input.qty * input.unitPrice - discount;
  const tax = roundMinor(net * taxRate);
  return { ...input, net, tax, total: net + tax };
}

/** A credit note issued against an invoice. All amounts are integer minor units. */
export interface CreditNote {
  /** The credit note's own document number (e.g. `"CN-2026-000004"`). */
  number: string;
  /** The `number` of the invoice this credit note is issued against. */
  invoiceNumber: string;
  currency: string;
  /** Total amount credited back to the buyer, integer minor units, `> 0`. */
  amount: number;
  /** Optional itemised credit lines (present when created from `lines`). */
  lines?: InvoiceLine[];
  /** Human reason, e.g. `"Returned 1 unit"`. */
  reason?: string;
  issuedAt?: number;
  meta?: Record<string, unknown>;
}

/**
 * Create a credit note against an invoice.
 *
 * The credited amount is, in priority order: the explicit `amount`; else the
 * sum of computed `lines`; else the invoice's full current `balanceDue` (a full
 * credit). The amount must be positive and cannot exceed the invoice's current
 * `balanceDue`.
 *
 * @throws InvoiceError "invalid_amount" (non-positive / non-finite),
 *   "credit_exceeds_due" (more than is owed), or "invalid_qty" (bad line).
 */
export function createCreditNote(input: {
  number: string;
  invoice: Invoice;
  amount?: number;
  lines?: InvoiceLineInput[];
  reason?: string;
  issuedAt?: number;
  meta?: Record<string, unknown>;
}): CreditNote {
  const { invoice } = input;
  const lines = input.lines?.map(computeCreditLine);

  let amount: number;
  if (input.amount !== undefined) {
    amount = input.amount;
  } else if (lines) {
    amount = lines.reduce((s, l) => s + l.total, 0);
  } else {
    amount = invoice.totals.balanceDue;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new InvoiceError(
      "Credit note amount must be positive",
      "invalid_amount",
    );
  }
  if (amount > invoice.totals.balanceDue) {
    throw new InvoiceError(
      "Credit note exceeds the amount due",
      "credit_exceeds_due",
    );
  }

  const note: CreditNote = {
    number: input.number,
    invoiceNumber: invoice.number,
    currency: invoice.currency,
    amount,
    issuedAt: input.issuedAt,
  };
  if (lines) note.lines = lines;
  if (input.reason !== undefined) note.reason = input.reason;
  if (input.meta !== undefined) note.meta = input.meta;
  return note;
}

/**
 * Apply a credit note to an invoice, reducing the amount due. Immutable —
 * returns a new invoice with `totals.credited` increased and `balanceDue`
 * recomputed as `total - amountPaid - credited`. When the balance reaches zero
 * the status becomes `"paid"`.
 *
 * @throws InvoiceError "credit_mismatch" (note is for a different invoice),
 *   "void" (invoice is void), or "credit_exceeds_due" (more than is owed).
 */
export function applyCreditNote(inv: Invoice, note: CreditNote): Invoice {
  if (note.invoiceNumber !== inv.number) {
    throw new InvoiceError(
      `Credit note "${note.number}" is for invoice "${note.invoiceNumber}", not "${inv.number}"`,
      "credit_mismatch",
    );
  }
  if (inv.status === "void") {
    throw new InvoiceError(
      "Cannot credit a void invoice",
      "void",
    );
  }
  if (!Number.isFinite(note.amount) || note.amount <= 0) {
    throw new InvoiceError(
      "Credit note amount must be positive",
      "invalid_amount",
    );
  }
  if (note.amount > inv.totals.balanceDue) {
    throw new InvoiceError(
      "Credit note exceeds the amount due",
      "credit_exceeds_due",
    );
  }

  const credited = (inv.totals.credited ?? 0) + note.amount;
  const balanceDue = inv.totals.total - inv.totals.amountPaid - credited;
  const status = balanceDue === 0 ? "paid" : inv.status;
  return {
    ...inv,
    status,
    totals: { ...inv.totals, credited, balanceDue },
  };
}

/**
 * Emit a normalized table for a credit note, ready for a renderer. When the
 * note is itemised, one row per line (mirroring `renderRows`); otherwise a
 * single summary row for the flat credited amount. Amounts stay in integer
 * minor units.
 */
export function creditNoteRows(note: CreditNote): {
  columns: string[];
  rows: (string | number)[][];
} {
  const columns = ["Description", "Qty", "Unit", "Tax %", "Line total"];
  if (note.lines && note.lines.length > 0) {
    const rows = note.lines.map((l) => [
      l.description,
      l.qty,
      l.unitPrice,
      (l.taxRate ?? 0) * 100,
      l.total,
    ]);
    return { columns, rows };
  }
  return {
    columns,
    rows: [[note.reason ?? "Credit", 1, note.amount, 0, note.amount]],
  };
}

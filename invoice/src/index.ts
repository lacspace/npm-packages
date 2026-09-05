/**
 * @lacspace/invoice
 *
 * Invoice MODEL + numbering + tax rollup. Pure, immutable, isomorphic and
 * zero-dependency. All money is expressed in integer **minor units** (e.g.
 * cents / paisa) so nothing is ever lost to floating-point drift.
 *
 * This package is model-only: it computes a structured, serializable invoice
 * and can emit a normalized row table ready to feed a renderer such as
 * `@lacspace/pdf` or `@lacspace/xlsx` — but it imports NEITHER of them.
 */

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** A billing party — the seller or the buyer on an invoice. */
export interface Party {
  name: string;
  address?: string;
  email?: string;
  taxId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Raw input for a single invoice line. Amounts are integer minor units;
 * `taxRate` is a fraction (e.g. `0.13` for 13%).
 */
export interface InvoiceLineInput {
  description: string;
  qty: number;
  unitPrice: number;
  taxRate?: number;
  discount?: number;
  sku?: string;
}

/**
 * A computed invoice line.
 *   net   = qty * unitPrice - discount
 *   tax   = round(net * taxRate)
 *   total = net + tax
 */
export interface InvoiceLine extends InvoiceLineInput {
  net: number;
  tax: number;
  total: number;
}

/** One row of the tax summary: all net/tax that share a single rate. */
export interface TaxSummaryRow {
  rate: number;
  net: number;
  tax: number;
}

/** Invoice-level money rollup, all integer minor units. */
export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
}

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "partial"
  | "void"
  | "overdue";

/** A complete, serializable invoice. */
export interface Invoice {
  number: string;
  status: InvoiceStatus;
  currency: string;
  seller: Party;
  buyer: Party;
  lines: InvoiceLine[];
  totals: InvoiceTotals;
  taxSummary: TaxSummaryRow[];
  issuedAt?: number;
  dueAt?: number;
  notes?: string;
  meta?: Record<string, unknown>;
}

/** Error thrown for any invalid invoice operation. */
export class InvoiceError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "InvoiceError";
    this.code = code;
    // Restore prototype chain for downlevel ES targets.
    Object.setPrototypeOf(this, InvoiceError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Round to the nearest integer minor unit (half away from zero). */
function roundMinor(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

function computeLine(input: InvoiceLineInput): InvoiceLine {
  if (!Number.isFinite(input.qty) || input.qty < 0) {
    throw new InvoiceError(
      `Line "${input.description}" has a negative or invalid qty`,
      "invalid_qty",
    );
  }
  const discount = input.discount ?? 0;
  const taxRate = input.taxRate ?? 0;
  const net = input.qty * input.unitPrice - discount;
  const tax = roundMinor(net * taxRate);
  return {
    ...input,
    net,
    tax,
    total: net + tax,
  };
}

/**
 * Group computed lines into tax-summary rows by rate.
 *
 * Rounding order: each LINE's tax is rounded first (in `computeLine`), then the
 * already-rounded per-line tax amounts are summed into the summary row. Net is
 * likewise summed from per-line nets. This keeps the tax summary consistent
 * with `totals.taxTotal` (both are sums of the same rounded per-line taxes).
 */
function summarizeTax(lines: InvoiceLine[]): TaxSummaryRow[] {
  const byRate = new Map<number, TaxSummaryRow>();
  for (const line of lines) {
    const rate = line.taxRate ?? 0;
    const row = byRate.get(rate) ?? { rate, net: 0, tax: 0 };
    row.net += line.net;
    row.tax += line.tax;
    byRate.set(rate, row);
  }
  // Deterministic ascending order by rate.
  return [...byRate.values()].sort((a, b) => a.rate - b.rate);
}

// ---------------------------------------------------------------------------
// Build & compute
// ---------------------------------------------------------------------------

/**
 * Build a fully computed invoice from raw input.
 *
 * Computes each line (net / tax / total), the invoice totals, and the tax
 * summary grouped by rate. Integer minor units throughout.
 *
 * @throws InvoiceError when there are no lines.
 */
export function createInvoice(input: {
  number: string;
  currency: string;
  seller: Party;
  buyer: Party;
  lines: InvoiceLineInput[];
  status?: InvoiceStatus;
  issuedAt?: number;
  dueAt?: number;
  amountPaid?: number;
  notes?: string;
  meta?: Record<string, unknown>;
}): Invoice {
  if (!input.lines || input.lines.length === 0) {
    throw new InvoiceError("An invoice must have at least one line", "no_lines");
  }

  const lines = input.lines.map(computeLine);

  const subtotal = lines.reduce((s, l) => s + l.net, 0);
  const discount = lines.reduce((s, l) => s + (l.discount ?? 0), 0);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0);
  const total = subtotal + taxTotal;
  const amountPaid = input.amountPaid ?? 0;
  const balanceDue = total - amountPaid;

  const totals: InvoiceTotals = {
    subtotal,
    discount,
    taxTotal,
    total,
    amountPaid,
    balanceDue,
  };

  return {
    number: input.number,
    status: input.status ?? "draft",
    currency: input.currency,
    seller: input.seller,
    buyer: input.buyer,
    lines,
    totals,
    taxSummary: summarizeTax(lines),
    issuedAt: input.issuedAt,
    dueAt: input.dueAt,
    notes: input.notes,
    meta: input.meta,
  };
}

/**
 * Record a payment against an invoice. Immutable — returns a new invoice.
 *
 * Increases `amountPaid`, recomputes `balanceDue`, and sets `status` to
 * `"paid"` (balance 0) or `"partial"` (balance > 0).
 *
 * @throws InvoiceError when `amount <= 0` ("invalid_amount") or the payment
 *   would take total paid past the invoice total ("overpayment").
 */
export function recordPayment(
  inv: Invoice,
  amount: number,
  opts?: { at?: number },
): Invoice {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new InvoiceError("Payment amount must be positive", "invalid_amount");
  }
  const amountPaid = inv.totals.amountPaid + amount;
  if (amountPaid > inv.totals.total) {
    throw new InvoiceError(
      "Payment exceeds the amount due",
      "overpayment",
    );
  }
  const balanceDue = inv.totals.total - amountPaid;
  const status: InvoiceStatus = balanceDue === 0 ? "paid" : "partial";
  return {
    ...inv,
    status,
    totals: { ...inv.totals, amountPaid, balanceDue },
    meta:
      opts?.at !== undefined
        ? { ...(inv.meta ?? {}), lastPaymentAt: opts.at }
        : inv.meta,
  };
}

/**
 * Transition an invoice to `"void"`. Immutable.
 *
 * @throws InvoiceError when the invoice is already paid ("already_paid").
 */
export function markVoid(inv: Invoice): Invoice {
  if (inv.status === "paid") {
    throw new InvoiceError("Cannot void a paid invoice", "already_paid");
  }
  return { ...inv, status: "void" };
}

/**
 * Transition an invoice to `"issued"` (optionally stamping `issuedAt`).
 * Immutable.
 *
 * @throws InvoiceError when the invoice is already paid ("already_paid") or
 *   void ("void").
 */
export function markIssued(inv: Invoice, at?: number): Invoice {
  if (inv.status === "paid") {
    throw new InvoiceError("Cannot re-issue a paid invoice", "already_paid");
  }
  if (inv.status === "void") {
    throw new InvoiceError("Cannot issue a void invoice", "void");
  }
  return {
    ...inv,
    status: "issued",
    issuedAt: at ?? inv.issuedAt,
  };
}

/**
 * Whether an invoice is overdue: it has a `dueAt` in the past and a positive
 * balance due.
 */
export function isOverdue(inv: Invoice, now: number = Date.now()): boolean {
  return (
    inv.dueAt !== undefined &&
    inv.dueAt < now &&
    inv.totals.balanceDue > 0
  );
}

// ---------------------------------------------------------------------------
// Numbering & render helper
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic sequential invoice number.
 *
 * Default shape: `"INV-2026-000123"` (prefix `"INV"`, current year, pad 6).
 */
export function invoiceNumber(
  seq: number,
  opts?: { prefix?: string; year?: number; pad?: number; separator?: string },
): string {
  const prefix = opts?.prefix ?? "INV";
  const year = opts?.year ?? new Date().getFullYear();
  const pad = opts?.pad ?? 6;
  const sep = opts?.separator ?? "-";
  const num = String(Math.trunc(seq)).padStart(pad, "0");
  return `${prefix}${sep}${year}${sep}${num}`;
}

/**
 * Emit a normalized table from an invoice's lines, ready to hand to a renderer
 * such as `@lacspace/xlsx` or a PDF table builder. Amounts stay in integer
 * minor units — formatting is the renderer's job. No renderer is imported.
 *
 * Columns: `Description`, `Qty`, `Unit`, `Tax %`, `Line total`.
 */
export function renderRows(inv: Invoice): {
  columns: string[];
  rows: (string | number)[][];
} {
  const columns = ["Description", "Qty", "Unit", "Tax %", "Line total"];
  const rows = inv.lines.map((l) => [
    l.description,
    l.qty,
    l.unitPrice,
    (l.taxRate ?? 0) * 100,
    l.total,
  ]);
  return { columns, rows };
}

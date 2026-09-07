/* ------------------------------------------------------------------ *
 * Amount validation
 *
 * eSewa signs `total_amount` but posts the constituent amount fields
 * (`amount`, `tax_amount`, `product_service_charge`, `product_delivery_charge`)
 * alongside it. If they don't add up — or a field is negative or non-numeric —
 * eSewa rejects the form (or, worse, the numbers silently disagree with what you
 * signed). `validateAmounts` catches that BEFORE you build the form, purely and
 * offline. It is deliberately NOT called by `buildForm` so existing behaviour is
 * unchanged; call it yourself when you want the guard.
 * ------------------------------------------------------------------ */

/** The amount fields eSewa expects, all in **rupees** (not paisa). */
export interface AmountFields {
  /** Base product amount. */
  amount: number;
  /** Tax amount. Default 0. */
  taxAmount?: number;
  /** Product service charge. Default 0. */
  productServiceCharge?: number;
  /** Product delivery charge. Default 0. */
  productDeliveryCharge?: number;
  /**
   * Grand total. If omitted, no equality check is performed and only the
   * component fields are range-checked (mirrors `buildForm`, which derives the
   * total when it isn't given).
   */
  totalAmount?: number;
}

/** Result of {@link validateAmounts}. */
export interface AmountValidation {
  ok: boolean;
  /** Human-readable reason when `ok` is `false`. */
  reason?: string;
}

/** A finite, non-negative number (NaN/Infinity/negatives rejected). */
function isNonNegNumber(v: number): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * Validate that the eSewa amount fields are internally consistent: every
 * component is a finite non-negative number, and — when `totalAmount` is given —
 * `amount + taxAmount + productServiceCharge + productDeliveryCharge` equals it.
 * Pure, offline, never throws.
 *
 * A tiny epsilon (1e-6) absorbs binary floating-point drift (e.g. `0.1 + 0.2`).
 *
 * @example
 * validateAmounts({ amount: 100, taxAmount: 13, totalAmount: 113 }); // { ok: true }
 * validateAmounts({ amount: 100, taxAmount: 13, totalAmount: 120 });
 * // { ok: false, reason: "total_amount 120 ≠ amount+tax+service+delivery (113)" }
 */
export function validateAmounts(fields: AmountFields): AmountValidation {
  const amount = fields.amount;
  const tax = fields.taxAmount ?? 0;
  const service = fields.productServiceCharge ?? 0;
  const delivery = fields.productDeliveryCharge ?? 0;

  const named: Array<[string, number]> = [
    ["amount", amount],
    ["tax_amount", tax],
    ["product_service_charge", service],
    ["product_delivery_charge", delivery],
  ];
  for (const [name, value] of named) {
    if (!isNonNegNumber(value)) {
      return { ok: false, reason: `${name} must be a finite non-negative number (got ${String(value)})` };
    }
  }

  if (fields.totalAmount !== undefined) {
    if (!isNonNegNumber(fields.totalAmount)) {
      return { ok: false, reason: `total_amount must be a finite non-negative number (got ${String(fields.totalAmount)})` };
    }
    const sum = amount + tax + service + delivery;
    if (Math.abs(sum - fields.totalAmount) > 1e-6) {
      return {
        ok: false,
        reason: `total_amount ${fields.totalAmount} ≠ amount+tax+service+delivery (${sum})`,
      };
    }
  }

  return { ok: true };
}

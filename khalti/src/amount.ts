/**
 * Amount validation for KPG-2 — amounts are always integers in **paisa**.
 *
 * Pure, allocation-light checks you can run before {@link initiate} so a bad
 * amount fails fast on your side instead of round-tripping to Khalti. This does
 * NOT change how `initiate`/`lookup` send amounts — it only inspects a value.
 */

import type { KhaltiAmountBreakdown } from "./index";

/**
 * Khalti's documented minimum transaction amount: **Rs. 10 = 1000 paisa**.
 * Override per-call via {@link ValidateAmountOptions.min} if your account or a
 * specific product differs.
 */
export const KHALTI_MIN_AMOUNT_PAISA = 1000;

export interface ValidateAmountOptions {
  /** Minimum acceptable amount in paisa. Defaults to {@link KHALTI_MIN_AMOUNT_PAISA}. */
  min?: number;
  /** Optional maximum acceptable amount in paisa (inclusive). */
  max?: number;
  /**
   * If given, verifies the breakdown's `amount` fields sum to exactly `amount`
   * (as Khalti requires when an `amount_breakdown` is supplied).
   */
  breakdown?: KhaltiAmountBreakdown[];
}

export interface AmountValidationResult {
  /** True only when there are no errors. */
  valid: boolean;
  /** Human-readable reasons the amount is invalid (empty when valid). */
  errors: string[];
}

/**
 * Validate a Khalti amount (in paisa). Checks that it is a finite integer,
 * meets the minimum (and optional maximum), and — when a breakdown is given —
 * that the breakdown sums exactly to the amount.
 *
 * @example
 * validateAmount(1000);                 // { valid: true, errors: [] }
 * validateAmount(999);                  // { valid: false, errors: ["amount 999 is below the minimum 1000 paisa"] }
 * validateAmount(10.5);                 // { valid: false, ... "must be an integer" }
 * validateAmount(1000, { breakdown: [{ label: "Item", amount: 600 }, { label: "Tax", amount: 400 }] }); // valid
 */
export function validateAmount(
  amount: number,
  opts: ValidateAmountOptions = {},
): AmountValidationResult {
  const min = opts.min ?? KHALTI_MIN_AMOUNT_PAISA;
  const errors: string[] = [];

  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    errors.push("amount must be a finite number of paisa");
    return { valid: false, errors };
  }
  if (!Number.isInteger(amount)) {
    errors.push(`amount ${amount} must be an integer number of paisa`);
  }
  if (amount < min) {
    errors.push(`amount ${amount} is below the minimum ${min} paisa`);
  }
  if (opts.max !== undefined && amount > opts.max) {
    errors.push(`amount ${amount} is above the maximum ${opts.max} paisa`);
  }

  if (opts.breakdown !== undefined) {
    let sum = 0;
    for (const part of opts.breakdown) {
      if (typeof part.amount !== "number" || !Number.isInteger(part.amount)) {
        errors.push(`amount_breakdown item "${part.label}" must be an integer number of paisa`);
      } else {
        sum += part.amount;
      }
    }
    if (sum !== amount) {
      errors.push(`amount_breakdown sums to ${sum} paisa but amount is ${amount} paisa`);
    }
  }

  return { valid: errors.length === 0, errors };
}

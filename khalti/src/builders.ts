/**
 * Pure request builders for the KPG-2 e-Payment endpoints.
 *
 * These assemble the exact JSON bodies Khalti expects for `epayment/initiate/`
 * and `epayment/lookup/` — with no network, no side effects, and no dependency
 * on how you eventually send them (use {@link initiate}/{@link lookup}, or POST
 * yourself with {@link buildAuthHeader}). Undefined optional fields are dropped
 * so the produced body is stable and minimal.
 *
 * Amounts stay in **paisa** (integer) exactly as the rest of the package.
 */

import type {
  InitiatePayload,
  KhaltiAmountBreakdown,
  KhaltiCustomerInfo,
} from "./index";

/** Input to {@link buildInitiateBody}. Mirrors {@link InitiatePayload}. */
export interface BuildInitiateBodyInput {
  return_url: string;
  website_url: string;
  /** Total payable amount in **paisa** (integer). */
  amount: number;
  purchase_order_id: string;
  purchase_order_name: string;
  customer_info?: KhaltiCustomerInfo;
  amount_breakdown?: KhaltiAmountBreakdown[];
  product_details?: unknown[];
}

/**
 * Build the `epayment/initiate/` request body. Pure: returns a fresh
 * {@link InitiatePayload} with any `undefined` optional fields omitted.
 *
 * @example
 * const body = buildInitiateBody({
 *   return_url: "https://myshop.np/return",
 *   website_url: "https://myshop.np",
 *   amount: 1000,
 *   purchase_order_id: "order-42",
 *   purchase_order_name: "Test order",
 * });
 */
export function buildInitiateBody(input: BuildInitiateBodyInput): InitiatePayload {
  const body: InitiatePayload = {
    return_url: input.return_url,
    website_url: input.website_url,
    amount: input.amount,
    purchase_order_id: input.purchase_order_id,
    purchase_order_name: input.purchase_order_name,
  };
  if (input.customer_info !== undefined) body.customer_info = input.customer_info;
  if (input.amount_breakdown !== undefined) body.amount_breakdown = input.amount_breakdown;
  if (input.product_details !== undefined) body.product_details = input.product_details;
  return body;
}

/**
 * Build the `epayment/lookup/` request body: `{ pidx }`. Pure.
 *
 * @example
 * const body = buildLookupBody("abc123"); // → { pidx: "abc123" }
 */
export function buildLookupBody(pidx: string): { pidx: string } {
  return { pidx };
}

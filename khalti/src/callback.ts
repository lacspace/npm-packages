/**
 * Callback verification for the redirect Khalti sends the customer back with.
 *
 * After payment, Khalti redirects the browser to your `return_url` with query
 * params like `pidx`, `status`, `transaction_id`, `amount`, `purchase_order_id`.
 * These are **not** authoritative on their own — you must still confirm with
 * {@link lookup}. This module shapes those params into a typed object and flags
 * amount/status mismatches so you know whether (and against what) to look up.
 * It performs NO network calls.
 */

import type { KhaltiStatus } from "./index";

/** Normalised Khalti callback query params. */
export interface KhaltiCallbackParams {
  pidx?: string;
  status?: KhaltiStatus | string;
  transaction_id?: string;
  /** Khalti also sends this alias in some flows. */
  txnId?: string;
  /** Amount in **paisa**, parsed to a number when numeric. */
  amount?: number;
  /** Total amount in **paisa**, parsed to a number when numeric. */
  total_amount?: number;
  mobile?: string;
  purchase_order_id?: string;
  purchase_order_name?: string;
  /** Any params not recognised above, left as strings. */
  [key: string]: string | number | undefined;
}

type QueryInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function firstString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v.length ? v[0] : undefined;
  return v;
}

/**
 * Parse a callback query (a `URLSearchParams`, or a plain object such as
 * Express `req.query` / a Next.js `searchParams`) into typed
 * {@link KhaltiCallbackParams}. `amount`/`total_amount` are coerced to numbers
 * when they look numeric; everything else stays a string. Pure.
 *
 * @example
 * const p = parseCallbackParams(new URL(req.url).searchParams);
 * // { pidx, status, transaction_id, amount, purchase_order_id, ... }
 */
export function parseCallbackParams(query: QueryInput): KhaltiCallbackParams {
  const raw: Record<string, string | undefined> = {};
  if (query instanceof URLSearchParams) {
    for (const [k, v] of query.entries()) raw[k] = v;
  } else {
    for (const k of Object.keys(query)) raw[k] = firstString(query[k]);
  }

  const out: Record<string, string | number | undefined> = {};
  for (const k of Object.keys(raw)) {
    const val = raw[k];
    if (val === undefined) continue;
    if (k === "amount" || k === "total_amount") {
      const n = Number(val);
      out[k] = val !== "" && Number.isFinite(n) ? n : val;
    } else {
      out[k] = val;
    }
  }
  return out as KhaltiCallbackParams;
}

export interface VerifyCallbackExpectation {
  /** Expected amount in **paisa** — flagged if the callback amount differs. */
  amount?: number;
  /** Expected `purchase_order_id` — flagged if the callback's differs. */
  purchase_order_id?: string;
  /**
   * Statuses treated as a successful, order-fulfilling outcome. Defaults to
   * `["Completed"]`.
   */
  successStatuses?: (KhaltiStatus | string)[];
}

export interface CallbackVerification {
  pidx?: string;
  status?: KhaltiStatus | string;
  transaction_id?: string;
  /** True when no expectation was violated (missing `pidx` still fails). */
  matches: boolean;
  /** True when `status` is one of the success statuses. */
  completed: boolean;
  /** Reasons the callback failed verification (empty when `matches`). */
  mismatches: string[];
  /**
   * Always true — the callback is never authoritative; you should confirm with
   * {@link lookup} using {@link CallbackVerification.pidx}.
   */
  shouldLookup: boolean;
}

/**
 * Verify a parsed callback against what you expected when you initiated the
 * payment. Flags a missing `pidx`, an amount mismatch, and an order-id mismatch,
 * and reports whether the status counts as completed. It does **not** call
 * lookup — it shapes the data so you can (`shouldLookup` is always true).
 *
 * @example
 * const v = verifyCallback(parseCallbackParams(searchParams), {
 *   amount: 1000,
 *   purchase_order_id: "order-42",
 * });
 * if (v.matches && v.shouldLookup) {
 *   const r = await lookup(v.pidx!, { secretKey });
 *   if (r.status === "Completed") fulfilOrder();
 * }
 */
export function verifyCallback(
  params: KhaltiCallbackParams,
  expected: VerifyCallbackExpectation = {},
): CallbackVerification {
  const successStatuses = expected.successStatuses ?? ["Completed"];
  const mismatches: string[] = [];

  if (!params.pidx) {
    mismatches.push("callback is missing pidx");
  }
  if (expected.amount !== undefined) {
    const got = params.total_amount ?? params.amount;
    if (got !== expected.amount) {
      mismatches.push(`amount mismatch: callback ${String(got)} paisa, expected ${expected.amount} paisa`);
    }
  }
  if (
    expected.purchase_order_id !== undefined &&
    params.purchase_order_id !== expected.purchase_order_id
  ) {
    mismatches.push(
      `purchase_order_id mismatch: callback "${String(params.purchase_order_id)}", expected "${expected.purchase_order_id}"`,
    );
  }

  const completed =
    params.status !== undefined && successStatuses.includes(params.status);

  return {
    pidx: params.pidx,
    status: params.status,
    transaction_id: params.transaction_id ?? params.txnId,
    matches: mismatches.length === 0,
    completed,
    mismatches,
    shouldLookup: true,
  };
}

/**
 * @lacspace/khalti
 *
 * Khalti KPG-2 (ePayment API v2, Nepal) — a tiny, typed client for the two calls
 * every integration needs:
 *
 *   1. **initiate** — create a payment and get back a `payment_url` to redirect
 *      the customer to, plus a `pidx` to track it.
 *   2. **lookup**   — the source of truth: check a payment's real status by
 *      `pidx` after the customer returns (never trust the callback alone).
 *
 * Amounts are always in **paisa** (integer): NPR 10 → `1000`. Authentication is
 * a server-side `Authorization: Key <secretKey>` header. Non-2xx responses throw
 * a {@link KhaltiError} carrying Khalti's parsed `detail`.
 *
 * Isomorphic: Node 20+, edge runtimes and browsers via global `fetch`
 * (injectable). Zero dependencies.
 */

/* ------------------------------------------------------------------ *
 * Endpoints & types
 * ------------------------------------------------------------------ */

export type KhaltiEnv = "test" | "prod";

/** Khalti API base URLs. */
export const KHALTI_BASE_URLS: Record<KhaltiEnv, string> = {
  test: "https://a.khalti.com/api/v2",
  prod: "https://khalti.com/api/v2",
};

/** Possible values of a Khalti payment `status`. */
export type KhaltiStatus =
  | "Completed"
  | "Pending"
  | "Initiated"
  | "Refunded"
  | "Expired"
  | "User canceled"
  | "Partially Refunded";

export interface KhaltiCustomerInfo {
  name?: string;
  email?: string;
  phone?: string;
}

export interface KhaltiAmountBreakdown {
  label: string;
  /** In paisa. */
  amount: number;
}

export interface InitiatePayload {
  /** Where Khalti redirects the customer after payment. */
  return_url: string;
  /** Your site's base URL. */
  website_url: string;
  /** Total payable amount in **paisa** (integer). */
  amount: number;
  /** Your unique order id. */
  purchase_order_id: string;
  /** Human-readable order name. */
  purchase_order_name: string;
  customer_info?: KhaltiCustomerInfo;
  amount_breakdown?: KhaltiAmountBreakdown[];
  product_details?: unknown[];
}

export interface InitiateResponse {
  pidx: string;
  payment_url: string;
  expires_at: string;
  expires_in: number;
}

export interface LookupResponse {
  pidx: string;
  /** In paisa. */
  total_amount: number;
  status: KhaltiStatus | string;
  transaction_id: string | null;
  /** In paisa. */
  fee: number;
  refunded: boolean;
}

export interface KhaltiClientOpts {
  secretKey: string;
  env?: KhaltiEnv;
  fetch?: typeof fetch;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/** Thrown on any non-2xx Khalti response, carrying the parsed error body. */
export class KhaltiError extends Error {
  /** HTTP status code. */
  readonly status: number;
  /** Khalti's `detail` field (or the raw error payload). */
  readonly detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "KhaltiError";
    this.status = status;
    this.detail = detail;
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, KhaltiError.prototype);
  }
}

/* ------------------------------------------------------------------ *
 * Internal request helper
 * ------------------------------------------------------------------ */

async function post<T>(path: string, body: unknown, opts: KhaltiClientOpts): Promise<T> {
  const base = KHALTI_BASE_URLS[opts.env ?? "test"];
  const doFetch = opts.fetch ?? globalThis.fetch;
  if (!doFetch) throw new Error("@lacspace/khalti: global fetch is unavailable; pass opts.fetch.");

  const res = await doFetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${opts.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let parsed: unknown = undefined;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const detail =
      parsed && typeof parsed === "object" && "detail" in (parsed as Record<string, unknown>)
        ? (parsed as Record<string, unknown>).detail
        : parsed;
    const message =
      typeof detail === "string" ? detail : `Khalti request failed with status ${res.status}`;
    throw new KhaltiError(message, res.status, detail);
  }

  return parsed as T;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Initiate a Khalti payment. POSTs to `/epayment/initiate/` and returns the
 * `pidx` and `payment_url` to redirect the customer to.
 *
 * @example
 * const { payment_url, pidx } = await initiate(
 *   {
 *     return_url: "https://myshop.np/khalti/return",
 *     website_url: "https://myshop.np",
 *     amount: 1000, // NPR 10, in paisa
 *     purchase_order_id: "order-42",
 *     purchase_order_name: "Test order",
 *   },
 *   { secretKey: process.env.KHALTI_SECRET!, env: "test" },
 * );
 */
export async function initiate(
  payload: InitiatePayload,
  opts: KhaltiClientOpts,
): Promise<InitiateResponse> {
  return post<InitiateResponse>("/epayment/initiate/", payload, opts);
}

/**
 * Look up a payment's real status by `pidx` — the authoritative check to run
 * after the customer returns. POSTs `{ pidx }` to `/epayment/lookup/`.
 *
 * @example
 * const r = await lookup(pidx, { secretKey, env: "test" });
 * if (r.status === "Completed") fulfilOrder();
 */
export async function lookup(pidx: string, opts: KhaltiClientOpts): Promise<LookupResponse> {
  return post<LookupResponse>("/epayment/lookup/", { pidx }, opts);
}

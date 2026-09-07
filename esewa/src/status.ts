/* ------------------------------------------------------------------ *
 * Transaction status — pure request builder + response parser
 *
 * `checkStatus` (in index) performs the network GET. These helpers are the pure
 * halves for callers who fetch themselves (edge caches, retries, logging, tests):
 *   - `buildStatusRequest` — the exact URL + query params, no I/O.
 *   - `parseStatusResponse` — narrow the untyped JSON into a typed shape.
 * ------------------------------------------------------------------ */

import type { EsewaEnv } from "./index";
import { ESEWA_STATUS_URLS } from "./index";

/** The status values eSewa's transaction-status API can return. */
export type EsewaStatus =
  | "COMPLETE"
  | "PENDING"
  | "FULL_REFUND"
  | "PARTIAL_REFUND"
  | "AMBIGUOUS"
  | "NOT_FOUND"
  | "CANCELED"
  | "ERROR";

/** Params for a transaction-status lookup. */
export interface StatusRequestParams {
  product_code: string;
  total_amount: string | number;
  transaction_uuid: string;
}

/** A fully-built status request, ready to hand to any `fetch`. */
export interface StatusRequest {
  url: string;
  method: "GET";
  /** The query params, pre-stringified, in eSewa's order. */
  params: Record<string, string>;
}

/**
 * Build the eSewa transaction-status-check request purely — the status endpoint
 * URL with `product_code`, `total_amount` and `transaction_uuid` as query
 * params. No network. Feed `request.url` to your own `fetch`/cache.
 *
 * @example
 * const { url } = buildStatusRequest(
 *   { product_code: "EPAYTEST", total_amount: 100, transaction_uuid: "tx-1" },
 *   { env: "test" },
 * );
 */
export function buildStatusRequest(
  params: StatusRequestParams,
  opts?: { env?: EsewaEnv },
): StatusRequest {
  const fields: Record<string, string> = {
    product_code: params.product_code,
    total_amount: String(params.total_amount),
    transaction_uuid: params.transaction_uuid,
  };
  const qs = new URLSearchParams(fields).toString();
  return {
    url: `${ESEWA_STATUS_URLS[opts?.env ?? "test"]}?${qs}`,
    method: "GET",
    params: fields,
  };
}

/** The parsed, typed shape of an eSewa transaction-status response. */
export interface StatusResponse {
  product_code?: string;
  transaction_uuid?: string;
  total_amount?: number;
  /** Normalised to an {@link EsewaStatus} when recognised, else the raw string. */
  status: EsewaStatus | string;
  /** eSewa reference id (present once settled). */
  ref_id?: string;
  /** The original, untouched payload. */
  raw: Record<string, unknown>;
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set<EsewaStatus>([
  "COMPLETE",
  "PENDING",
  "FULL_REFUND",
  "PARTIAL_REFUND",
  "AMBIGUOUS",
  "NOT_FOUND",
  "CANCELED",
  "ERROR",
]);

/** `true` if `status` is one of eSewa's documented status values. */
export function isEsewaStatus(status: unknown): status is EsewaStatus {
  return typeof status === "string" && KNOWN_STATUSES.has(status);
}

/**
 * Parse/narrow the untyped JSON returned by the status API (or `checkStatus`)
 * into a typed {@link StatusResponse}. Tolerant: unknown/missing `status`
 * becomes `"ERROR"`, `total_amount` is coerced to a number when it parses, and
 * the original payload is preserved on `.raw`. Pure, never throws.
 *
 * @example
 * const parsed = parseStatusResponse(await res.json());
 * if (parsed.status === "COMPLETE") fulfilOrder(parsed.transaction_uuid!);
 */
export function parseStatusResponse(input: unknown): StatusResponse {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rawStatus = raw.status;
  const status: EsewaStatus | string = isEsewaStatus(rawStatus)
    ? rawStatus
    : typeof rawStatus === "string"
      ? rawStatus
      : "ERROR";

  const out: StatusResponse = { status, raw };
  if (typeof raw.product_code === "string") out.product_code = raw.product_code;
  if (typeof raw.transaction_uuid === "string") out.transaction_uuid = raw.transaction_uuid;
  if (typeof raw.ref_id === "string") out.ref_id = raw.ref_id;

  if (typeof raw.total_amount === "number" && Number.isFinite(raw.total_amount)) {
    out.total_amount = raw.total_amount;
  } else if (typeof raw.total_amount === "string") {
    const n = Number(raw.total_amount.replace(/,/g, ""));
    if (Number.isFinite(n)) out.total_amount = n;
  }

  return out;
}

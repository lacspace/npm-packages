/**
 * @lacspace/fonepay — response result, form-post & QR builders (added 1.1.0)
 *
 * Purely additive helpers that COMPOSE the package's existing, unchanged DV
 * primitives (`signRequest`, `verifyResponse`, `buildRedirect`, `dvHash`).
 * They add no dependencies, do no network I/O and never re-implement the hash.
 */

import { buildRedirect, dvHash, verifyResponse, GATEWAY_URL } from "./index";
import type { Env, RequestParams, ResponseParams } from "./index";

/* ------------------------------------------------------------------ *
 * Response verification result
 * ------------------------------------------------------------------ */

export interface VerifyResult {
  /** `true` when the response `DV` verified. */
  ok: boolean;
  /** Why it failed, when `ok` is `false`. */
  reason?: "missing-response" | "missing-dv" | "signature-mismatch";
}

/**
 * Verify a Fonepay response and get a reason on failure. Thin wrapper over the
 * existing {@link verifyResponse} (which does the HMAC-SHA512 recompute + the
 * constant-time compare) that also guards the trivially-missing cases.
 *
 * @example
 * const { ok, reason } = await verifyResponseResult(query, secret);
 * if (!ok) return new Response(`Invalid Fonepay response: ${reason}`, { status: 400 });
 */
export async function verifyResponseResult(resp: ResponseParams, secret: string): Promise<VerifyResult> {
  if (resp == null) return { ok: false, reason: "missing-response" };
  if (resp.DV == null || String(resp.DV).trim() === "") return { ok: false, reason: "missing-dv" };
  const { valid } = await verifyResponse(resp, secret);
  return valid ? { ok: true } : { ok: false, reason: "signature-mismatch" };
}

/* ------------------------------------------------------------------ *
 * Form-POST builder
 * ------------------------------------------------------------------ */

export interface FormPost {
  /** The gateway URL to use as the `<form action>`. */
  action: string;
  /** All request fields (incl. `DV`) to render as hidden inputs. */
  fields: Record<string, string>;
  /** The request signature. */
  dv: string;
}

export interface BuildFormPostOptions {
  secret: string;
  /** Which gateway to target. Default `"test"` (dev). */
  env?: Env;
}

/**
 * Build the pieces for an auto-submitting HTML form POST to Fonepay: the same
 * signed fields {@link buildRedirect} produces, shaped for a `<form>` instead
 * of a URL redirect. Composes {@link buildRedirect} (no new signing logic).
 *
 * @example
 * const { action, fields } = await buildFormPost(params, { secret, env: "prod" });
 * // render <form method="POST" action={action}> with a hidden input per field
 */
export async function buildFormPost(params: RequestParams, opts: BuildFormPostOptions): Promise<FormPost> {
  const { params: fields, dv } = await buildRedirect(params, { secret: opts.secret, env: opts.env });
  return { action: GATEWAY_URL[opts.env ?? "test"], fields, dv };
}

/* ------------------------------------------------------------------ *
 * Dynamic QR (thirdparty) request builder
 * ------------------------------------------------------------------ */

export interface QrRequestParams {
  /** Merchant code. */
  merchantCode: string;
  /** Amount. */
  amount: string | number;
  /** Product/reference number — unique per transaction. */
  prn: string;
  /** Remarks 1. Default "". */
  remarks1?: string;
  /** Remarks 2. Default "". */
  remarks2?: string;
}

export interface QrRequest {
  /** The QR request fields plus the computed `dataValidation`. */
  params: Record<string, string>;
  /** The DV / `dataValidation` HMAC-SHA512 hex over the fields. */
  dv: string;
}

/**
 * Build a Fonepay dynamic-QR ("thirdparty QR") request payload and its
 * `dataValidation` HMAC-SHA512, using the SAME {@link dvHash} primitive as the
 * redirect flow. The DV is computed over the fields joined by "," in the order
 * `merchantCode,amount,prn,remarks1,remarks2`.
 *
 * NOTE: Fonepay's thirdparty-QR contract varies by onboarding; confirm the
 * exact field order for your merchant against your QR API document before going
 * live. This builder is pure and does not call Fonepay.
 *
 * @example
 * const { params, dv } = await buildQrRequest(
 *   { merchantCode: "MERCHANT", amount: 1000, prn: "prn-1", remarks1: "coffee" },
 *   secret,
 * );
 */
export async function buildQrRequest(p: QrRequestParams, secret: string): Promise<QrRequest> {
  const merchantCode = String(p.merchantCode);
  const amount = String(p.amount);
  const prn = String(p.prn);
  const remarks1 = String(p.remarks1 ?? "");
  const remarks2 = String(p.remarks2 ?? "");
  const message = [merchantCode, amount, prn, remarks1, remarks2].join(",");
  const dv = await dvHash(secret, message);
  return {
    params: { merchantCode, amount, prn, remarks1, remarks2, dataValidation: dv },
    dv,
  };
}

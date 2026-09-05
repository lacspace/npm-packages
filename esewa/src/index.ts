/**
 * @lacspace/esewa
 *
 * eSewa ePay v2 (Nepal) — the correct, tiny way to integrate Nepal's most-used
 * payment gateway. Handles the three things every integration re-implements:
 *
 *   1. **Signing** — the HMAC-SHA256 signature eSewa requires on the checkout
 *      form, computed over `total_amount,transaction_uuid,product_code` in the
 *      exact order of `signed_field_names`, base64-encoded.
 *   2. **Form building** — a ready-to-POST `{ action, method, fields }` object
 *      with every field eSewa expects, including a valid `signature`.
 *   3. **Verification & status** — decode and verify the signed base64 `data`
 *      payload eSewa returns on success (timing-safe), and query the
 *      transaction-status API.
 *
 * Built on Web Crypto (`globalThis.crypto.subtle`) — never hand-rolled
 * cryptography. Isomorphic: Node 20+, edge runtimes and browsers. Zero deps.
 */

/* ------------------------------------------------------------------ *
 * Endpoints & test credentials
 * ------------------------------------------------------------------ */

export type EsewaEnv = "test" | "prod";

/** eSewa checkout form endpoints (the URL you POST the form to). */
export const ESEWA_FORM_URLS: Record<EsewaEnv, string> = {
  test: "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
  prod: "https://epay.esewa.com.np/api/epay/main/v2/form",
};

/** eSewa transaction-status API endpoints. */
export const ESEWA_STATUS_URLS: Record<EsewaEnv, string> = {
  test: "https://rc.esewa.com.np/api/epay/transaction/status/",
  prod: "https://epay.esewa.com.np/api/epay/transaction/status/",
};

/** eSewa-published sandbox secret key (test environment only). */
export const ESEWA_TEST_SECRET = "8gBm/:&EnhH.1/q@K@";

/** eSewa-published sandbox merchant/product code (test environment only). */
export const ESEWA_TEST_PRODUCT_CODE = "EPAYTEST";

/** The fields eSewa signs, in the required order. */
export const ESEWA_SIGNED_FIELD_NAMES = "total_amount,transaction_uuid,product_code";

/* ------------------------------------------------------------------ *
 * Web Crypto + base64 helpers (isomorphic, zero-dependency)
 * ------------------------------------------------------------------ */

const enc = new TextEncoder();
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard base64 (NOT url-safe) encode of raw bytes. */
function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
  }
  return out;
}

/** Standard base64 decode to raw bytes. */
function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64.indexOf(clean[i]!);
    const c1 = B64.indexOf(clean[i + 1]!);
    const c2 = i + 2 < clean.length ? B64.indexOf(clean[i + 2]!) : -1;
    const c3 = i + 3 < clean.length ? B64.indexOf(clean[i + 3]!) : -1;
    if (p < len) bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0 && p < len) bytes[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 >= 0 && p < len) bytes[p++] = ((c2 & 3) << 6) | c3;
  }
  return bytes;
}

/** HMAC-SHA256 over `message` with `secret`, returned as standard base64. */
async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("@lacspace/esewa: Web Crypto (globalThis.crypto.subtle) is unavailable in this runtime.");
  const key = await subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await subtle.sign("HMAC", key, enc.encode(message));
  return toBase64(new Uint8Array(sig));
}

/** Constant-time comparison of two strings (avoids signature-timing leaks). */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Compare a fixed number of bytes; length mismatch still fails.
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/* ------------------------------------------------------------------ *
 * Signing
 * ------------------------------------------------------------------ */

export interface SignFields {
  total_amount: string | number;
  transaction_uuid: string;
  product_code: string;
}

/**
 * Compute the eSewa signature for the required signed fields. The message is
 * `total_amount=<v>,transaction_uuid=<v>,product_code=<v>` (the exact order of
 * `signed_field_names`), HMAC-SHA256'd with the merchant secret and returned as
 * standard base64.
 *
 * @example
 * const sig = await signPayment(
 *   { total_amount: 100, transaction_uuid: "11-201", product_code: "EPAYTEST" },
 *   ESEWA_TEST_SECRET,
 * );
 */
export async function signPayment(fields: SignFields, secret: string): Promise<string> {
  const message =
    `total_amount=${fields.total_amount},` +
    `transaction_uuid=${fields.transaction_uuid},` +
    `product_code=${fields.product_code}`;
  return hmacSha256Base64(secret, message);
}

/* ------------------------------------------------------------------ *
 * Form building
 * ------------------------------------------------------------------ */

export interface BuildFormInput {
  /** Base product amount. */
  amount: number;
  /** Tax amount. Default 0. */
  taxAmount?: number;
  /** Grand total. Defaults to amount + tax + service + delivery. */
  totalAmount?: number;
  /** Unique transaction id you generate. */
  transactionUuid: string;
  /** Merchant product code (e.g. "EPAYTEST" in test). */
  productCode: string;
  /** Where eSewa redirects on success. */
  successUrl: string;
  /** Where eSewa redirects on failure. */
  failureUrl: string;
  /** Product service charge. Default 0. */
  productServiceCharge?: number;
  /** Product delivery charge. Default 0. */
  productDeliveryCharge?: number;
}

export interface EsewaForm {
  /** URL to POST the form to. */
  action: string;
  method: "POST";
  /** All fields eSewa expects, as strings ready for form inputs. */
  fields: Record<string, string>;
}

/**
 * Build a ready-to-POST eSewa checkout form: `{ action, method, fields }`. The
 * `total_amount` defaults to `amount + taxAmount + serviceCharge + deliveryCharge`,
 * and a valid `signature` is computed for you.
 *
 * @example
 * const form = await buildForm(
 *   { amount: 100, transactionUuid: "11-201", productCode: ESEWA_TEST_PRODUCT_CODE,
 *     successUrl: "https://me/ok", failureUrl: "https://me/fail" },
 *   { secret: ESEWA_TEST_SECRET, env: "test" },
 * );
 * // render form.fields as hidden inputs and auto-submit to form.action
 */
export async function buildForm(
  input: BuildFormInput,
  opts: { secret: string; env?: EsewaEnv },
): Promise<EsewaForm> {
  const tax = input.taxAmount ?? 0;
  const service = input.productServiceCharge ?? 0;
  const delivery = input.productDeliveryCharge ?? 0;
  const total = input.totalAmount ?? input.amount + tax + service + delivery;

  const signature = await signPayment(
    {
      total_amount: total,
      transaction_uuid: input.transactionUuid,
      product_code: input.productCode,
    },
    opts.secret,
  );

  const fields: Record<string, string> = {
    amount: String(input.amount),
    tax_amount: String(tax),
    total_amount: String(total),
    transaction_uuid: input.transactionUuid,
    product_code: input.productCode,
    product_service_charge: String(service),
    product_delivery_charge: String(delivery),
    success_url: input.successUrl,
    failure_url: input.failureUrl,
    signed_field_names: ESEWA_SIGNED_FIELD_NAMES,
    signature,
  };

  return { action: ESEWA_FORM_URLS[opts.env ?? "test"], method: "POST", fields };
}

/* ------------------------------------------------------------------ *
 * Response verification
 * ------------------------------------------------------------------ */

export interface VerifyResult {
  valid: boolean;
  /** The decoded response fields. */
  data: Record<string, unknown>;
}

/**
 * Verify the signed base64 `data` payload eSewa appends to the success redirect.
 * Decodes the JSON, recomputes the signature over the fields named in its own
 * `signed_field_names`, and compares (timing-safe) against its `signature`.
 * Never throws — returns `{ valid, data }`.
 *
 * @example
 * const { valid, data } = await verifyResponse(url.searchParams.get("data")!, secret);
 * if (valid && data.status === "COMPLETE") fulfilOrder(data.transaction_uuid);
 */
export async function verifyResponse(base64Data: string, secret: string): Promise<VerifyResult> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(new TextDecoder().decode(fromBase64(base64Data))) as Record<string, unknown>;
  } catch {
    return { valid: false, data: {} };
  }

  const names = typeof data.signed_field_names === "string" ? data.signed_field_names : "";
  const provided = typeof data.signature === "string" ? data.signature : "";
  if (!names || !provided) return { valid: false, data };

  const message = names
    .split(",")
    .map((name) => `${name}=${data[name] ?? ""}`)
    .join(",");
  const expected = await hmacSha256Base64(secret, message);

  return { valid: timingSafeEqual(expected, provided), data };
}

/* ------------------------------------------------------------------ *
 * Transaction status
 * ------------------------------------------------------------------ */

export interface StatusParams {
  product_code: string;
  total_amount: string | number;
  transaction_uuid: string;
}

/**
 * Query the eSewa transaction-status API. GETs the status endpoint with
 * `product_code`, `total_amount` and `transaction_uuid` as query params and
 * returns the parsed JSON. Inject a custom `fetch` for tests or non-global
 * runtimes.
 *
 * @example
 * const status = await checkStatus(
 *   { product_code: "EPAYTEST", total_amount: 100, transaction_uuid: "11-201" },
 *   { env: "test" },
 * );
 */
export async function checkStatus(
  params: StatusParams,
  opts?: { env?: EsewaEnv; fetch?: typeof fetch },
): Promise<unknown> {
  const base = ESEWA_STATUS_URLS[opts?.env ?? "test"];
  const qs = new URLSearchParams({
    product_code: params.product_code,
    total_amount: String(params.total_amount),
    transaction_uuid: params.transaction_uuid,
  }).toString();
  const url = `${base}?${qs}`;

  const doFetch = opts?.fetch ?? globalThis.fetch;
  if (!doFetch) throw new Error("@lacspace/esewa: global fetch is unavailable; pass opts.fetch.");
  const res = await doFetch(url, { method: "GET" });
  return res.json();
}

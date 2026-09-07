/* ------------------------------------------------------------------ *
 * Typed success-response decode + verify (composition over the existing verify)
 *
 * eSewa posts back a base64 JSON `data` blob on the success redirect. `index`
 * already exposes `verifyResponse(base64, secret)` which decodes AND checks the
 * signature — this module adds the two things it deliberately does NOT change:
 *   - `decodeResponse` — decode-only, into a typed object (no signature check).
 *   - `verifyDecodedResponse` — COMPOSES the existing `verifyResponse` and
 *     returns the same result with the payload narrowed to `EsewaSuccessData`.
 * The existing `verifyResponse` is untouched and still the source of truth.
 * ------------------------------------------------------------------ */

import { verifyResponse } from "./index";
import type { EsewaStatus } from "./status";

/** The typed shape of the decoded eSewa success `data` payload. */
export interface EsewaSuccessData {
  transaction_code?: string;
  status?: EsewaStatus | string;
  total_amount?: string;
  transaction_uuid?: string;
  product_code?: string;
  signed_field_names?: string;
  signature?: string;
  /** Any other fields eSewa includes. */
  [key: string]: unknown;
}

const B64_LOOKUP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard base64 decode to raw bytes (mirrors index's internal decoder). */
function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_LOOKUP.indexOf(clean[i]!);
    const c1 = B64_LOOKUP.indexOf(clean[i + 1]!);
    const c2 = i + 2 < clean.length ? B64_LOOKUP.indexOf(clean[i + 2]!) : -1;
    const c3 = i + 3 < clean.length ? B64_LOOKUP.indexOf(clean[i + 3]!) : -1;
    if (p < len) bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0 && p < len) bytes[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 >= 0 && p < len) bytes[p++] = ((c2 & 3) << 6) | c3;
  }
  return bytes;
}

/**
 * Decode the base64 `data` payload eSewa posts to your success URL into a typed
 * {@link EsewaSuccessData} — WITHOUT checking the signature. Returns `null` when
 * the blob isn't valid base64 JSON. Pure, never throws.
 *
 * Use this only to read fields; to trust them, use {@link verifyDecodedResponse}
 * or the existing `verifyResponse`.
 *
 * @example
 * const data = decodeResponse(url.searchParams.get("data")!);
 * console.log(data?.status, data?.transaction_uuid); // untrusted until verified
 */
export function decodeResponse(base64Data: string): EsewaSuccessData | null {
  try {
    const json = new TextDecoder().decode(decodeBase64(base64Data));
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as EsewaSuccessData;
  } catch {
    return null;
  }
}

/** Result of {@link verifyDecodedResponse}. */
export interface VerifyDecodedResult {
  valid: boolean;
  /** The decoded payload, typed as {@link EsewaSuccessData}. */
  data: EsewaSuccessData;
}

/**
 * Decode the base64 success payload into a typed object AND verify it, by
 * COMPOSING the existing `verifyResponse` (the signature logic is unchanged —
 * this only narrows the returned `data` type). Never throws.
 *
 * @example
 * const { valid, data } = await verifyDecodedResponse(rawData, secret);
 * if (valid && data.status === "COMPLETE") fulfilOrder(data.transaction_uuid!);
 */
export async function verifyDecodedResponse(
  base64Data: string,
  secret: string,
): Promise<VerifyDecodedResult> {
  const { valid, data } = await verifyResponse(base64Data, secret);
  return { valid, data: data as EsewaSuccessData };
}

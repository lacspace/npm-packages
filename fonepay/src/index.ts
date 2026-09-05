/**
 * @lacspace/fonepay
 *
 * Fonepay (Nepal) merchant redirect — "Request-To-Pay" — over Web Crypto.
 * The merchant redirects the payer to Fonepay with an HMAC-SHA512-signed set
 * of request parameters (the `DV` data-validation field), and verifies the
 * `DV` on the response the same way.
 *
 * This package builds both signatures correctly:
 *
 *   1. Request DV — HMAC-SHA512 over the request fields joined by "," in the
 *      exact Fonepay order, lowercase hex.
 *   2. Response DV — HMAC-SHA512 over the response fields, constant-time
 *      compared to the returned `DV`.
 *
 * Zero dependencies. Isomorphic: Node 20+, edge runtimes and browsers — all
 * cryptography goes through `globalThis.crypto.subtle`, never hand-rolled.
 */

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

export type Env = "test" | "prod";

/** Fonepay merchant-request gateway URLs, by environment. */
export const GATEWAY_URL: Record<Env, string> = {
  test: "https://dev-clientapi.fonepay.com/api/merchantRequest",
  prod: "https://clientapi.fonepay.com/api/merchantRequest",
};

/* ------------------------------------------------------------------ *
 * HMAC-SHA512 (hex) helpers — isomorphic, zero-dep
 * ------------------------------------------------------------------ */

const enc = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return hex;
}

/** HMAC-SHA512 of `message` under `secret`, lowercase hex. */
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(new Uint8Array(sig));
}

/** Constant-time comparison of two hex strings. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------------ *
 * Request signing
 * ------------------------------------------------------------------ */

export interface RequestParams {
  /** Merchant code (PID). */
  PID: string;
  /** Method / mode. Default "P". */
  MD?: string;
  /** Product / reference number — unique per transaction. */
  PRN: string;
  /** Amount. */
  AMT: string | number;
  /** Currency. Default "NPR". */
  CRN?: string;
  /** Date (as required by Fonepay). */
  DT: string;
  /** Free field R1. */
  R1: string;
  /** Free field R2. */
  R2: string;
  /** Return URL. */
  RU: string;
}

interface ResolvedRequest {
  PID: string;
  MD: string;
  PRN: string;
  AMT: string;
  CRN: string;
  DT: string;
  R1: string;
  R2: string;
  RU: string;
}

function resolveRequest(p: RequestParams): ResolvedRequest {
  return {
    PID: String(p.PID),
    MD: String(p.MD ?? "P"),
    PRN: String(p.PRN),
    AMT: String(p.AMT),
    CRN: String(p.CRN ?? "NPR"),
    DT: String(p.DT),
    R1: String(p.R1),
    R2: String(p.R2),
    RU: String(p.RU),
  };
}

/**
 * Sign a Fonepay Request-To-Pay: HMAC-SHA512 over the request values joined by
 * "," in the exact order `PID,MD,PRN,AMT,CRN,DT,R1,R2,RU`. Returns lowercase
 * hex — this is the `DV` field. `MD` defaults to `"P"`, `CRN` to `"NPR"`.
 *
 * @example
 * const dv = await signRequest(
 *   { PID: "MERCHANT", PRN: "prn-1", AMT: 1000, DT: "09/05/2026",
 *     R1: "test", R2: "test", RU: "https://shop.me/return" },
 *   process.env.FONEPAY_SECRET!,
 * );
 */
export async function signRequest(params: RequestParams, secret: string): Promise<string> {
  const r = resolveRequest(params);
  const message = [r.PID, r.MD, r.PRN, r.AMT, r.CRN, r.DT, r.R1, r.R2, r.RU].join(",");
  return hmacHex(secret, message);
}

/* ------------------------------------------------------------------ *
 * Redirect builder
 * ------------------------------------------------------------------ */

export interface BuildRedirectOptions {
  secret: string;
  /** Which gateway to target. Default "test" (dev). */
  env?: Env;
}

export interface Redirect {
  /** The full redirect URL (gateway + urlencoded params, including `DV`). */
  url: string;
  /** All request params plus the computed `DV`. */
  params: Record<string, string>;
  /** The request signature. */
  dv: string;
}

/**
 * Build the full Fonepay redirect: signs the request, assembles all params
 * (including `DV`) and produces the gateway URL with everything urlencoded.
 *
 * @example
 * const { url } = await buildRedirect(params, { secret, env: "prod" });
 * return Response.redirect(url, 302);
 */
export async function buildRedirect(params: RequestParams, opts: BuildRedirectOptions): Promise<Redirect> {
  const r = resolveRequest(params);
  const dv = await signRequest(params, opts.secret);
  const fields: Record<string, string> = {
    PID: r.PID,
    MD: r.MD,
    PRN: r.PRN,
    AMT: r.AMT,
    CRN: r.CRN,
    DT: r.DT,
    R1: r.R1,
    R2: r.R2,
    RU: r.RU,
    DV: dv,
  };
  const qs = new URLSearchParams(fields).toString();
  return { url: `${GATEWAY_URL[opts.env ?? "test"]}?${qs}`, params: fields, dv };
}

/* ------------------------------------------------------------------ *
 * Response verification
 * ------------------------------------------------------------------ */

export interface ResponseParams {
  PRN: string;
  PID: string;
  PS: string;
  RC: string;
  UID: string;
  BC: string;
  INI: string;
  P_AMT: string | number;
  R_AMT: string | number;
  /** The DV returned by Fonepay to verify. */
  DV: string;
}

/**
 * Verify a Fonepay response: recompute HMAC-SHA512 over the response fields
 * joined by "," in the order `PRN,PID,PS,RC,UID,BC,INI,P_AMT,R_AMT`, then
 * constant-time compare it to the returned `DV`.
 *
 * @example
 * const { valid } = await verifyResponse(query, process.env.FONEPAY_SECRET!);
 * if (!valid) return new Response("Invalid Fonepay response", { status: 400 });
 */
export async function verifyResponse(resp: ResponseParams, secret: string): Promise<{ valid: boolean }> {
  const message = [
    String(resp.PRN),
    String(resp.PID),
    String(resp.PS),
    String(resp.RC),
    String(resp.UID),
    String(resp.BC),
    String(resp.INI),
    String(resp.P_AMT),
    String(resp.R_AMT),
  ].join(",");
  const expected = await hmacHex(secret, message);
  return { valid: timingSafeEqual(expected, String(resp.DV).toLowerCase()) };
}

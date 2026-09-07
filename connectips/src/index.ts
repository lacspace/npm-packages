/**
 * @lacspace/connectips
 *
 * Connect IPS (Nepal) merchant integration over Web Crypto. Connect IPS is the
 * inter-bank payment gateway operated by Nepal Clearing House (NCHL): the
 * merchant redirects the payer to the Connect IPS login page with a
 * digitally-signed transaction token, and later validates the completed
 * transaction server-to-server.
 *
 * This package handles the awkward parts correctly:
 *
 *   1. Building the canonical `KEY=VALUE,…,TOKEN=TOKEN` message string.
 *   2. Signing it with the merchant's RSA private key using RSA-SHA256
 *      (RSASSA-PKCS1-v1_5) — imported straight from a PKCS#8 PEM.
 *   3. Emitting the redirect form and calling the validate-txn API.
 *
 * Zero dependencies. Isomorphic: Node 20+, edge runtimes and browsers — all
 * cryptography goes through `globalThis.crypto.subtle`, never hand-rolled.
 */

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

export type Env = "test" | "prod";

/** Connect IPS gateway login (redirect) pages, by environment. */
export const LOGIN_URL: Record<Env, string> = {
  test: "https://uat.connectips.com/connectipswebgw/loginpage",
  prod: "https://login.connectips.com/connectipswebgw/loginpage",
};

/** Connect IPS transaction-validation API endpoints, by environment. */
export const VALIDATE_URL: Record<Env, string> = {
  test: "https://uat.connectips.com/connectipswebws/api/creditor/validatetxn",
  prod: "https://login.connectips.com/connectipswebws/api/creditor/validatetxn",
};

/* ------------------------------------------------------------------ *
 * Base64 + PEM helpers (isomorphic, zero-dep)
 * ------------------------------------------------------------------ */

const enc = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Strip the PEM armour + whitespace and base64-decode the DER body. */
function pemToBytes(pem: string, label: string): Uint8Array {
  const body = pem
    .replace(`-----BEGIN ${label}-----`, "")
    .replace(`-----END ${label}-----`, "")
    .replace(/\s+/g, "");
  return base64ToBytes(body);
}

/** Import a PKCS#8 PEM RSA private key for RSASSA-PKCS1-v1_5 / SHA-256 signing. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = pemToBytes(pem, "PRIVATE KEY");
  return crypto.subtle.importKey(
    "pkcs8",
    der as unknown as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** Import an SPKI PEM RSA public key for RSASSA-PKCS1-v1_5 / SHA-256 verification. */
async function importPublicKey(pem: string): Promise<CryptoKey> {
  const der = pemToBytes(pem, "PUBLIC KEY");
  return crypto.subtle.importKey(
    "spki",
    der as unknown as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/** Sign a message with the merchant RSA private key → base64 signature. */
async function signMessage(message: string, privateKeyPem: string): Promise<string> {
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(message));
  return bytesToBase64(new Uint8Array(sig));
}

/* ------------------------------------------------------------------ *
 * Token signing
 * ------------------------------------------------------------------ */

/** The transaction parameters that go into the redirect token, in order. */
export interface TokenParams {
  MERCHANTID: string;
  APPID: string;
  APPNAME: string;
  TXNID: string;
  TXNDATE: string;
  TXNCRNCY: string;
  TXNAMT: string | number;
  REFERENCEID: string;
  REMARKS: string;
  PARTICULARS: string;
}

/** Build the canonical token message: `KEY=VALUE,…,TOKEN=TOKEN`. */
function tokenMessage(p: TokenParams): string {
  return [
    `MERCHANTID=${p.MERCHANTID}`,
    `APPID=${p.APPID}`,
    `APPNAME=${p.APPNAME}`,
    `TXNID=${p.TXNID}`,
    `TXNDATE=${p.TXNDATE}`,
    `TXNCRNCY=${p.TXNCRNCY}`,
    `TXNAMT=${p.TXNAMT}`,
    `REFERENCEID=${p.REFERENCEID}`,
    `REMARKS=${p.REMARKS}`,
    `PARTICULARS=${p.PARTICULARS}`,
    `TOKEN=TOKEN`,
  ].join(",");
}

/**
 * Sign a Connect IPS transaction token with the merchant RSA private key.
 * Builds the canonical `KEY=VALUE,…,TOKEN=TOKEN` message, signs it with
 * RSA-SHA256, and returns the base64 signature to send as the `TOKEN` field.
 *
 * @example
 * const token = await signToken(
 *   { MERCHANTID: "123", APPID: "APP", APPNAME: "shop", TXNID: "T1",
 *     TXNDATE: "05-09-2026", TXNCRNCY: "NPR", TXNAMT: 1000,
 *     REFERENCEID: "R1", REMARKS: "order", PARTICULARS: "order" },
 *   process.env.CONNECTIPS_PRIVATE_KEY_PEM!,
 * );
 */
export async function signToken(params: TokenParams, privateKeyPem: string): Promise<string> {
  return signMessage(tokenMessage(params), privateKeyPem);
}

/* ------------------------------------------------------------------ *
 * Redirect form
 * ------------------------------------------------------------------ */

export interface BuildFormOptions {
  privateKeyPem: string;
  /** Which gateway to target. Default "test" (UAT). */
  env?: Env;
}

export interface RedirectForm {
  /** The Connect IPS login page URL to POST to. */
  action: string;
  method: "POST";
  /** The transaction params plus the signed `TOKEN`. */
  fields: Record<string, string>;
}

/**
 * Build the auto-submitting redirect form for Connect IPS. Returns the gateway
 * `action` URL and the `fields` (the transaction params plus the signed
 * `TOKEN`) to render as hidden inputs and POST to the login page.
 *
 * @example
 * const form = await buildForm(params, { privateKeyPem, env: "prod" });
 * // render <form action={form.action} method="POST"> … {form.fields} … </form>
 */
export async function buildForm(params: TokenParams, opts: BuildFormOptions): Promise<RedirectForm> {
  const token = await signToken(params, opts.privateKeyPem);
  const fields: Record<string, string> = {
    MERCHANTID: String(params.MERCHANTID),
    APPID: String(params.APPID),
    APPNAME: String(params.APPNAME),
    TXNID: String(params.TXNID),
    TXNDATE: String(params.TXNDATE),
    TXNCRNCY: String(params.TXNCRNCY),
    TXNAMT: String(params.TXNAMT),
    REFERENCEID: String(params.REFERENCEID),
    REMARKS: String(params.REMARKS),
    PARTICULARS: String(params.PARTICULARS),
    TOKEN: token,
  };
  return { action: LOGIN_URL[opts.env ?? "test"], method: "POST", fields };
}

/* ------------------------------------------------------------------ *
 * Transaction validation (server-to-server)
 * ------------------------------------------------------------------ */

export interface ValidateParams {
  merchantId: string;
  appId: string;
  referenceId: string;
  txnAmt: string | number;
}

export interface ValidateOptions {
  /** Connect IPS creditor API username. */
  user: string;
  /** Connect IPS creditor API password. */
  password: string;
  /** Merchant RSA private key PEM (PKCS#8) used to sign the validation token. */
  privateKeyPem: string;
  /** Which gateway to target. Default "test" (UAT). */
  env?: Env;
  /** Inject a `fetch` implementation (defaults to the global `fetch`). */
  fetch?: typeof fetch;
}

/** Canonical validation message: `MERCHANTID=…,APPID=…,REFERENCEID=…,TXNAMT=…`. */
function validateMessage(p: ValidateParams): string {
  return [
    `MERCHANTID=${p.merchantId}`,
    `APPID=${p.appId}`,
    `REFERENCEID=${p.referenceId}`,
    `TXNAMT=${p.txnAmt}`,
  ].join(",");
}

/**
 * Validate a completed Connect IPS transaction, server-to-server. Signs the
 * canonical validation message with the merchant RSA private key and POSTs the
 * JSON payload (with a Basic-auth header) to the validate-txn API.
 *
 * @example
 * const result = await validateTxn(
 *   { merchantId: "123", appId: "APP", referenceId: "R1", txnAmt: 1000 },
 *   { user, password, privateKeyPem, env: "prod" },
 * );
 */
export async function validateTxn(params: ValidateParams, opts: ValidateOptions): Promise<unknown> {
  const token = await signMessage(validateMessage(params), opts.privateKeyPem);
  const doFetch = opts.fetch ?? fetch;
  const basic = bytesToBase64(enc.encode(`${opts.user}:${opts.password}`));
  const res = await doFetch(VALIDATE_URL[opts.env ?? "test"], {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basic}`,
    },
    body: JSON.stringify({
      merchantId: params.merchantId,
      appId: params.appId,
      referenceId: params.referenceId,
      txnAmt: params.txnAmt,
      token,
    }),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/* ------------------------------------------------------------------ *
 * Verification helper
 * ------------------------------------------------------------------ */

/**
 * Verify an RSA-SHA256 signature (base64) against a message using an SPKI PEM
 * public key. Useful for tests and for verifying Connect IPS callbacks.
 */
export async function verifyToken(
  message: string,
  signatureB64: string,
  publicKeyPem: string,
): Promise<boolean> {
  const key = await importPublicKey(publicKeyPem);
  const sig = base64ToBytes(signatureB64);
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    sig as unknown as ArrayBuffer,
    enc.encode(message),
  );
}

/* ------------------------------------------------------------------ *
 * Config presets (added in 1.1.0)
 * ------------------------------------------------------------------ */

/**
 * Gateway endpoint presets, grouped by environment — the login (redirect) page
 * and the validate-txn API together in one place. `test` is the Connect IPS UAT
 * sandbox; `prod` is production. Values are the same URLs as `LOGIN_URL` /
 * `VALIDATE_URL`, exposed as a single preset for convenience.
 *
 * @example
 * const { login, validate } = ENDPOINTS[env]; // env: "test" | "prod"
 */
export const ENDPOINTS: Record<Env, { login: string; validate: string }> = {
  test: { login: LOGIN_URL.test, validate: VALIDATE_URL.test },
  prod: { login: LOGIN_URL.prod, validate: VALIDATE_URL.prod },
};

/* ------------------------------------------------------------------ *
 * Validation request builder (pure — no network) — added in 1.1.0
 * ------------------------------------------------------------------ */

/**
 * The shape of a Connect IPS validate-txn API response. Connect IPS echoes the
 * request identifiers and reports the transaction status. Fields beyond `status`
 * are best-effort/optional — the gateway may add more — so treat unknown keys
 * leniently. `status` is `"SUCCESS"` for a settled, verified transaction.
 */
export interface ValidateTxnResponse {
  merchantId?: string;
  appId?: string;
  referenceId?: string;
  txnAmt?: string | number;
  /** `"SUCCESS"` when the transaction is settled/verified. */
  status?: string;
  statusDesc?: string;
  transactionId?: string;
  [key: string]: unknown;
}

/** The signed, ready-to-POST validate-txn request, built without any network. */
export interface ValidationRequest {
  /** The validate-txn API URL for the chosen environment. */
  url: string;
  method: "POST";
  /** Headers to send — `Content-Type`, plus `Authorization` when credentials given. */
  headers: Record<string, string>;
  /** The exact JSON body (`merchantId`, `appId`, `referenceId`, `txnAmt`, `token`). */
  body: {
    merchantId: string;
    appId: string;
    referenceId: string;
    txnAmt: string | number;
    token: string;
  };
  /** The base64 RSA-SHA256 signature over the canonical validation message. */
  token: string;
}

export interface BuildValidationRequestOptions {
  /** Merchant RSA private key PEM (PKCS#8) used to sign the validation token. */
  privateKeyPem: string;
  /** Which gateway to target. Default "test" (UAT). */
  env?: Env;
  /** Optional creditor API username — when both user+password given, adds Basic auth. */
  user?: string;
  /** Optional creditor API password. */
  password?: string;
}

/**
 * Build (but do NOT send) the Connect IPS validate-txn request. Signs the exact
 * same canonical `MERCHANTID=…,APPID=…,REFERENCEID=…,TXNAMT=…` message that
 * `validateTxn()` signs, using the same RSA-SHA256 signer, and returns the URL,
 * headers and JSON body ready to POST yourself (retries, logging, custom fetch,
 * edge runtimes). Pure: performs cryptography but no network IO.
 *
 * @example
 * const req = await buildValidationRequest(
 *   { merchantId: "123", appId: "APP123", referenceId: "REF001", txnAmt: 100000 },
 *   { privateKeyPem, env: "prod", user, password },
 * );
 * await fetch(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(req.body) });
 */
export async function buildValidationRequest(
  params: ValidateParams,
  opts: BuildValidationRequestOptions,
): Promise<ValidationRequest> {
  const token = await signMessage(validateMessage(params), opts.privateKeyPem);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.user != null && opts.password != null) {
    headers.Authorization = `Basic ${bytesToBase64(enc.encode(`${opts.user}:${opts.password}`))}`;
  }
  return {
    url: VALIDATE_URL[opts.env ?? "test"],
    method: "POST",
    headers,
    body: {
      merchantId: String(params.merchantId),
      appId: String(params.appId),
      referenceId: String(params.referenceId),
      txnAmt: params.txnAmt,
      token,
    },
    token,
  };
}

/* ------------------------------------------------------------------ *
 * Re-exported additive helpers (added in 1.1.0)
 * ------------------------------------------------------------------ */

export { paymentTokenMessage, validationTokenMessage } from "./messages";
export { validateRequest } from "./validation";
export type { ValidationResult } from "./validation";

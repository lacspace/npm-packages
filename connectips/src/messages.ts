/**
 * Canonical Connect IPS message-string builders, exposed as pure functions.
 *
 * These reproduce — byte-for-byte — the exact `KEY=VALUE,…` messages that the
 * package signs internally, so callers and tests can inspect (and re-verify)
 * precisely what was put under the RSA-SHA256 signature. They perform NO
 * cryptography and have NO side effects.
 *
 * IMPORTANT: the field order and separators here are load-bearing. Connect IPS
 * rejects any deviation, and existing signatures depend on it. Do not reorder.
 */

import type { TokenParams, ValidateParams } from "./index";

/**
 * The canonical redirect-token message: the transaction params in Connect IPS's
 * required order, joined by `,`, terminated by the literal `TOKEN=TOKEN`.
 * This is exactly the string that `signToken()` / `buildForm()` sign.
 *
 * @example
 * paymentTokenMessage(params)
 * // "MERCHANTID=123,APPID=APP123,…,PARTICULARS=order-1,TOKEN=TOKEN"
 */
export function paymentTokenMessage(p: TokenParams): string {
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
 * The canonical transaction-validation message:
 * `MERCHANTID=…,APPID=…,REFERENCEID=…,TXNAMT=…`. This is exactly the string that
 * `validateTxn()` / `buildValidationRequest()` sign.
 *
 * @example
 * validationTokenMessage({ merchantId: "123", appId: "APP123", referenceId: "REF001", txnAmt: 100000 })
 * // "MERCHANTID=123,APPID=APP123,REFERENCEID=REF001,TXNAMT=100000"
 */
export function validationTokenMessage(p: ValidateParams): string {
  return [
    `MERCHANTID=${p.merchantId}`,
    `APPID=${p.appId}`,
    `REFERENCEID=${p.referenceId}`,
    `TXNAMT=${p.txnAmt}`,
  ].join(",");
}

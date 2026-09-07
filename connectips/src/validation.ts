/**
 * Pure, offline field validation for Connect IPS transaction requests.
 *
 * Connect IPS rejects malformed fields at the gateway with opaque errors, and a
 * bad TXNAMT (amount must be in **paisa**, as an integer) is a common, costly
 * mistake. `validateRequest()` catches these before you ever redirect the payer
 * or hit the validate-txn API. It performs NO cryptography and NO IO.
 */

import type { TokenParams } from "./index";

/** The outcome of validating a request: `valid` plus a list of human errors. */
export interface ValidationResult {
  /** True when there are zero errors. */
  valid: boolean;
  /** One message per failed rule, in field order. Empty when `valid`. */
  errors: string[];
}

/** Alphanumeric identifier, 1–20 chars (Connect IPS TXNID / REFERENCEID rule). */
const ID_RE = /^[A-Za-z0-9]{1,20}$/;
/** `DD-MM-YYYY` — the Connect IPS transaction-date format. */
const DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;

/** Amount must be a positive integer number of paisa (no decimals, no sign). */
function isPaisaInteger(v: string | number): boolean {
  if (typeof v === "number") return Number.isInteger(v) && v > 0;
  return /^[1-9]\d*$/.test(v);
}

/** Validate `DD-MM-YYYY` is well-formed AND a real calendar date. */
function isValidTxnDate(v: string): boolean {
  const m = DATE_RE.exec(v);
  if (!m) return false;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  return d.getUTCFullYear() === yyyy && d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd;
}

/**
 * Validate a Connect IPS redirect request against the gateway's field rules —
 * TXNAMT is a positive paisa integer, TXNID/REFERENCEID are 1–20 alphanumeric,
 * TXNDATE is a real `DD-MM-YYYY` date, TXNCRNCY is `NPR`, and the mandatory
 * identifiers are present. Pure and synchronous; returns collected errors rather
 * than throwing, so you can surface them all at once.
 *
 * @example
 * const { valid, errors } = validateRequest(params);
 * if (!valid) throw new Error(errors.join("; "));
 */
export function validateRequest(params: TokenParams): ValidationResult {
  const errors: string[] = [];

  if (!params.MERCHANTID || !/^[A-Za-z0-9]+$/.test(String(params.MERCHANTID))) {
    errors.push("MERCHANTID is required and must be alphanumeric");
  }
  if (!params.APPID || !/^[A-Za-z0-9]+$/.test(String(params.APPID))) {
    errors.push("APPID is required and must be alphanumeric");
  }
  if (!params.APPNAME || String(params.APPNAME).length === 0) {
    errors.push("APPNAME is required");
  }
  if (!ID_RE.test(String(params.TXNID))) {
    errors.push("TXNID must be 1–20 alphanumeric characters");
  }
  if (!isValidTxnDate(String(params.TXNDATE))) {
    errors.push("TXNDATE must be a valid date in DD-MM-YYYY format");
  }
  if (String(params.TXNCRNCY) !== "NPR") {
    errors.push('TXNCRNCY must be "NPR"');
  }
  if (!isPaisaInteger(params.TXNAMT)) {
    errors.push("TXNAMT must be a positive integer amount in paisa (no decimals)");
  }
  if (!ID_RE.test(String(params.REFERENCEID))) {
    errors.push("REFERENCEID must be 1–20 alphanumeric characters");
  }

  return { valid: errors.length === 0, errors };
}

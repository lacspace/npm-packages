/**
 * @lacspace/fonepay — validation, config presets & PRN generation (added 1.1.0)
 *
 * Pure, zero-dep, isomorphic helpers. No cryptography and no network — only
 * `crypto.getRandomValues` (Web Crypto CSPRNG, present on Node 20+, edge and
 * browsers) is used, for PRN generation. Nothing here changes or depends on
 * the existing DV/hash computation.
 */

/* ------------------------------------------------------------------ *
 * Config presets
 * ------------------------------------------------------------------ */

/** Fonepay sandbox / dev merchant-request gateway base URL. */
export const SANDBOX_GATEWAY_URL = "https://dev-clientapi.fonepay.com/api/merchantRequest";

/** Fonepay live / production merchant-request gateway base URL. */
export const LIVE_GATEWAY_URL = "https://clientapi.fonepay.com/api/merchantRequest";

/** Documented Fonepay field-length limits used by {@link validateRequest}. */
export const FIELD_LIMITS = {
  /** Max characters for the product/reference number (`PRN`). */
  PRN: 25,
  /** Max characters for free field `R1`. */
  R1: 160,
  /** Max characters for free field `R2`. */
  R2: 50,
} as const;

/* ------------------------------------------------------------------ *
 * Field validators (pure)
 * ------------------------------------------------------------------ */

/**
 * Amount must be a positive number with at most two decimal places (e.g.
 * `1000`, `"1000"`, `"99.50"`). Accepts a string or number.
 */
export function isValidAmount(amt: string | number): boolean {
  const s = String(amt).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return false;
  return Number(s) > 0;
}

/**
 * Fonepay request date must be `MM/DD/YYYY` and a real calendar date
 * (e.g. `09/05/2026`).
 */
export function isValidRequestDate(dt: string): boolean {
  const m = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(\d{4})$/.exec(String(dt));
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * PRN uniqueness-shape check: a non-empty, whitespace-free token no longer
 * than {@link FIELD_LIMITS.PRN}. (It does not — and cannot — prove global
 * uniqueness; use {@link generatePrn} to mint collision-resistant values.)
 */
export function isValidPrn(prn: string): boolean {
  const s = String(prn);
  return s.length > 0 && s.length <= FIELD_LIMITS.PRN && !/\s/.test(s);
}

/* ------------------------------------------------------------------ *
 * Request validation (pure)
 * ------------------------------------------------------------------ */

export interface ValidationIssue {
  /** The offending field name. */
  field: string;
  /** Human-readable reason. */
  message: string;
}

export interface ValidationResult {
  /** `true` when there are no issues. */
  valid: boolean;
  /** All problems found (empty when `valid`). */
  issues: ValidationIssue[];
}

/** The subset of request fields {@link validateRequest} inspects. */
export interface ValidatableRequest {
  PID: string;
  PRN: string;
  AMT: string | number;
  DT: string;
  R1: string;
  R2: string;
  RU: string;
}

/**
 * Validate a Fonepay request against Fonepay's field rules — PRN shape, amount
 * format (≤ 2 decimals), `DT` as `MM/DD/YYYY`, `R1`/`R2` length limits and the
 * presence of `PID`/`RU`. Pure and offline; does not sign or touch the DV.
 *
 * @example
 * const { valid, issues } = validateRequest(params);
 * if (!valid) throw new Error(issues.map(i => `${i.field}: ${i.message}`).join("; "));
 */
export function validateRequest(req: ValidatableRequest): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!req.PID || String(req.PID).trim() === "") {
    issues.push({ field: "PID", message: "merchant code (PID) is required" });
  }

  if (!isValidPrn(String(req.PRN ?? ""))) {
    issues.push({
      field: "PRN",
      message: `PRN must be non-empty, whitespace-free and ≤ ${FIELD_LIMITS.PRN} characters`,
    });
  }

  if (!isValidAmount(req.AMT)) {
    issues.push({ field: "AMT", message: "AMT must be a positive number with at most 2 decimal places" });
  }

  if (!isValidRequestDate(String(req.DT ?? ""))) {
    issues.push({ field: "DT", message: "DT must be a valid MM/DD/YYYY date" });
  }

  if (String(req.R1 ?? "").length > FIELD_LIMITS.R1) {
    issues.push({ field: "R1", message: `R1 must be ≤ ${FIELD_LIMITS.R1} characters` });
  }

  if (String(req.R2 ?? "").length > FIELD_LIMITS.R2) {
    issues.push({ field: "R2", message: `R2 must be ≤ ${FIELD_LIMITS.R2} characters` });
  }

  if (!req.RU || String(req.RU).trim() === "") {
    issues.push({ field: "RU", message: "return URL (RU) is required" });
  }

  return { valid: issues.length === 0, issues };
}

/* ------------------------------------------------------------------ *
 * PRN generator (CSPRNG)
 * ------------------------------------------------------------------ */

/**
 * Generate a collision-resistant product/reference number (`PRN`): an optional
 * `prefix`, a base-36 timestamp and CSPRNG random bytes, kept within
 * {@link FIELD_LIMITS.PRN}. Uses `crypto.getRandomValues` (Web Crypto).
 *
 * @example
 * const prn = generatePrn("ORD-"); // e.g. "ORD-lqe3k9-8f3a1c"
 */
export function generatePrn(prefix = ""): string {
  const time = Date.now().toString(36);
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let rand = "";
  for (let i = 0; i < bytes.length; i++) rand += bytes[i]!.toString(16).padStart(2, "0");
  return `${prefix}${time}-${rand}`.slice(0, FIELD_LIMITS.PRN);
}

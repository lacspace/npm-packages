/**
 * Configurable password policy evaluator.
 *
 * Turns a declarative policy (length, character classes, minimum strength
 * score, disallow common / user info) into a pass/fail result with the exact
 * list of failed rules — handy for both server validation and UI hints.
 *
 * Zero dependencies · isomorphic.
 */

import { estimateStrength } from "./strength";

export interface PasswordPolicy {
  /** Minimum length (default 8). */
  minLength?: number;
  /** Maximum length (default unlimited). */
  maxLength?: number;
  /** Require at least one lowercase letter. */
  requireLowercase?: boolean;
  /** Require at least one uppercase letter. */
  requireUppercase?: boolean;
  /** Require at least one digit. */
  requireDigit?: boolean;
  /** Require at least one symbol (non-alphanumeric). */
  requireSymbol?: boolean;
  /** Minimum number of the four character classes present (1–4). */
  minCharClasses?: number;
  /** Minimum `estimateStrength` score (0–4). */
  minScore?: number;
  /** Reject common/well-known passwords (via `estimateStrength`). */
  disallowCommon?: boolean;
  /** Reject passwords that contain any provided user info (see `userInputs`). */
  disallowUserInfo?: boolean;
}

export interface PolicyContext {
  /** User-specific strings (name, email, username) to forbid inside the password. */
  userInputs?: string[];
}

export interface PolicyResult {
  valid: boolean;
  /** Machine-readable rule keys that failed, e.g. `"minLength"`, `"requireDigit"`. */
  failures: string[];
}

/**
 * Evaluate `password` against `policy`. Returns `{ valid, failures }` where
 * `failures` lists every rule that did not pass (empty when valid).
 *
 * ```ts
 * checkPolicy("hunter2", { minLength: 12, requireSymbol: true });
 * // { valid: false, failures: ["minLength", "requireSymbol"] }
 * ```
 */
export function checkPolicy(
  password: string,
  policy: PasswordPolicy = {},
  ctx: PolicyContext = {},
): PolicyResult {
  const failures: string[] = [];
  const pw = password ?? "";

  const minLength = policy.minLength ?? 8;
  if (pw.length < minLength) failures.push("minLength");
  if (policy.maxLength != null && pw.length > policy.maxLength) failures.push("maxLength");

  if (policy.requireLowercase && !/[a-z]/.test(pw)) failures.push("requireLowercase");
  if (policy.requireUppercase && !/[A-Z]/.test(pw)) failures.push("requireUppercase");
  if (policy.requireDigit && !/[0-9]/.test(pw)) failures.push("requireDigit");
  if (policy.requireSymbol && !/[^a-zA-Z0-9]/.test(pw)) failures.push("requireSymbol");

  if (policy.minCharClasses != null) {
    const classes =
      Number(/[a-z]/.test(pw)) +
      Number(/[A-Z]/.test(pw)) +
      Number(/[0-9]/.test(pw)) +
      Number(/[^a-zA-Z0-9]/.test(pw));
    if (classes < policy.minCharClasses) failures.push("minCharClasses");
  }

  if (policy.minScore != null || policy.disallowCommon) {
    const est = estimateStrength(pw);
    if (policy.minScore != null && est.score < policy.minScore) failures.push("minScore");
    if (policy.disallowCommon && est.patterns.includes("common")) failures.push("disallowCommon");
  }

  if (policy.disallowUserInfo && ctx.userInputs?.length) {
    const lower = pw.toLowerCase();
    for (const raw of ctx.userInputs) {
      const token = String(raw).toLowerCase().trim();
      if (token.length >= 3 && lower.includes(token)) {
        failures.push("disallowUserInfo");
        break;
      }
    }
  }

  return { valid: failures.length === 0, failures };
}

/**
 * Step-up authentication — decide whether a sensitive action needs a FRESH
 * factor challenge on top of the user's current session. Pure and injectable:
 * it reads the session's verified factors (and their timestamps) and compares
 * them against a per-action {@link StepUpPolicy}. It never mutates the session.
 */

import type { AalLevel, FactorType, MfaSession } from "./index";

/** Why a step-up is being required. */
export type StepUpReason =
  | "insufficient-aal"
  | "insufficient-factors"
  | "missing-type"
  | "stale";

/** Requirements a sensitive action places on the CURRENT session. */
export interface StepUpPolicy {
  /** Minimum assurance level the action needs (session below ⇒ step-up). */
  minAAL?: AalLevel;
  /** Minimum distinct verified factors the action needs. */
  minFactors?: number;
  /** Factor types that must have been verified for this action. */
  requireTypes?: FactorType[];
  /** Max age (ms) of the most recent factor verification; older ⇒ step-up. */
  maxAgeMs?: number;
  /** Injectable clock (ms epoch). Defaults to `Date.now`. */
  now?: () => number;
}

/** The step-up decision for an action. */
export interface StepUpDecision {
  /** True when a fresh factor challenge is needed before proceeding. */
  required: boolean;
  /** All unmet requirements (empty when not required). */
  reasons: StepUpReason[];
  /** The session's current assurance level. */
  currentAAL: AalLevel;
  /** ms since the most recent verification (undefined when nothing verified). */
  ageMs?: number;
}

/**
 * Decide whether `session` must step up to satisfy `policy`. Returns
 * `{ required, reasons, currentAAL, ageMs }` — if `required` is true, prompt for
 * a fresh factor, then `markVerified` it on the session and re-check.
 */
export function requireStepUp(session: MfaSession, policy: StepUpPolicy = {}): StepUpDecision {
  const now = (policy.now ?? Date.now)();
  const verified = session.toJSON().verified;
  const reasons: StepUpReason[] = [];
  const currentAAL = session.aal;

  if (policy.minAAL != null && currentAAL < policy.minAAL) reasons.push("insufficient-aal");
  if (policy.minFactors != null && session.verifiedFactors.length < policy.minFactors) {
    reasons.push("insufficient-factors");
  }
  if (policy.requireTypes && policy.requireTypes.length) {
    const present = new Set(verified.map((v) => v.type));
    if (policy.requireTypes.some((t) => !present.has(t))) reasons.push("missing-type");
  }

  const newest = verified.length ? Math.max(...verified.map((v) => v.at)) : undefined;
  const ageMs = newest === undefined ? undefined : Math.max(0, now - newest);
  if (policy.maxAgeMs != null) {
    if (ageMs === undefined || ageMs > policy.maxAgeMs) reasons.push("stale");
  }

  return { required: reasons.length > 0, reasons, currentAAL, ageMs };
}

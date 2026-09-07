/**
 * Confidence scoring for @lacspace/email-verify.
 *
 * A PURE aggregator: it turns the signals collected during verification
 * (syntax, MX presence, disposable, role, catch-all, SMTP verdict) into a
 * single 0–100 confidence score, a coarse risk band and a human-readable list
 * of reasons. No network, no I/O — fully unit-testable on its own.
 */

import type { SmtpVerdict } from "./index";

export type RiskLevel = "low" | "medium" | "high";

/** The signals fed into {@link scoreConfidence}. */
export interface ConfidenceSignals {
  /** Address is syntactically valid. */
  syntax: boolean;
  /** The domain has at least one MX record. */
  mxFound: boolean;
  /** The domain is a disposable / throwaway provider. */
  disposable: boolean;
  /** The local-part is a shared/role mailbox (info@, admin@, …). */
  role: boolean;
  /** The domain accepts every recipient (a positive SMTP result is untrustworthy). */
  catchAll?: boolean;
  /** The live SMTP RCPT verdict, if one was collected. */
  smtp?: SmtpVerdict;
}

/** The output of {@link scoreConfidence}. */
export interface ConfidenceResult {
  /** 0 (definitely bad) … 100 (very likely deliverable). */
  score: number;
  /** Coarse band derived from the score: `low` = safe, `high` = risky. */
  risk: RiskLevel;
  /** Human-readable explanation of what moved the score. */
  reasons: string[];
}

function bandFor(score: number): RiskLevel {
  if (score >= 70) return "low";
  if (score >= 40) return "medium";
  return "high";
}

/**
 * Combine verification signals into a single confidence verdict.
 *
 * Deterministic and side-effect-free — the same signals always produce the same
 * score. Syntax failure and an explicit SMTP rejection are treated as hard
 * negatives; everything else nudges the score up or down from a neutral base.
 */
export function scoreConfidence(signals: ConfidenceSignals): ConfidenceResult {
  // Hard negatives short-circuit.
  if (!signals.syntax) {
    return { score: 0, risk: "high", reasons: ["invalid syntax"] };
  }
  if (signals.smtp === "undeliverable") {
    return { score: 2, risk: "high", reasons: ["mailbox rejected by server"] };
  }

  const reasons: string[] = ["valid syntax"];
  let score = 40;

  if (signals.mxFound) {
    score += 25;
    reasons.push("domain has MX records");
  } else {
    score -= 35;
    reasons.push("no MX records for domain");
  }

  if (signals.smtp === "deliverable") {
    if (signals.catchAll) {
      score += 5;
      reasons.push("SMTP accepted, but domain is catch-all (unreliable)");
    } else {
      score += 30;
      reasons.push("SMTP accepted recipient");
    }
  } else if (signals.smtp === "unknown") {
    reasons.push("SMTP result inconclusive");
  }

  // Catch-all penalty applies whenever we still trusted a non-deliverable path.
  if (signals.catchAll && signals.smtp !== "deliverable") {
    score -= 20;
    reasons.push("catch-all domain (accepts any address)");
  }

  if (signals.disposable) {
    score -= 35;
    reasons.push("disposable / throwaway domain");
  }

  if (signals.role) {
    score -= 10;
    reasons.push("role / shared mailbox");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, risk: bandFor(score), reasons };
}

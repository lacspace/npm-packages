/**
 * Deep verification for @lacspace/email-verify.
 *
 * Ties every signal together: syntax + disposable/role (via
 * `@lacspace/email-validate`), MX resolution (ranked by priority, with fallback
 * across hosts), an optional SMTP RCPT probe, optional catch-all detection, and
 * a final {@link ConfidenceResult}. It exposes the exact MX host that produced
 * the verdict.
 *
 * Both the DNS resolver and the SMTP prober are INJECTABLE, so this whole path
 * can be tested without touching the network.
 */

import { validateEmail } from "@lacspace/email-validate";
import {
  resolveMx as defaultResolveMx,
  smtpCheck as defaultSmtpCheck,
  type MxResolver,
  type SmtpProber,
  type SmtpVerdict,
  type VerifyResult,
} from "./index";
import { detectCatchAll } from "./catch-all";
import { scoreConfidence, type ConfidenceResult } from "./confidence";

export interface DeepVerifyOptions {
  /** Run the live SMTP RCPT probe (default true). */
  checkSmtp?: boolean;
  /** Also probe a random recipient to detect a catch-all domain (default false). */
  detectCatchAll?: boolean;
  /** MAIL FROM address used in the probe. */
  fromAddress?: string;
  /** Per-connection timeout in ms. */
  timeout?: number;
  /** Extra disposable domains. */
  extraDisposable?: string[];
  /** Inject a custom MX resolver. Defaults to {@link resolveMx}. */
  resolveMxImpl?: MxResolver;
  /** Inject a custom SMTP prober. Defaults to {@link smtpCheck}. */
  smtpCheckImpl?: SmtpProber;
  /** Inject the random-local generator used for catch-all probing (tests). */
  randomLocal?: () => string;
}

export interface DeepVerifyResult extends VerifyResult {
  /** The MX host that produced the SMTP verdict (best priority tried), or `null`. */
  mxHost: string | null;
  /** The domain accepts every recipient — a positive SMTP result is untrustworthy. */
  catchAll: boolean;
  /** Aggregated confidence score / risk / reasons over all collected signals. */
  confidence: ConfidenceResult;
}

/**
 * Full deep verification with confidence scoring, MX ranking + fallback, and
 * optional catch-all detection. Backward-compatible superset of the classic
 * {@link verifyEmail} result.
 */
export async function verifyEmailDeep(
  email: string,
  opts: DeepVerifyOptions = {},
): Promise<DeepVerifyResult> {
  const resolveImpl = opts.resolveMxImpl ?? defaultResolveMx;
  const smtpImpl = opts.smtpCheckImpl ?? defaultSmtpCheck;

  const v = validateEmail(email, { extraDisposable: opts.extraDisposable, suggestions: false });

  const base: DeepVerifyResult = {
    email,
    valid: false,
    syntax: v.valid,
    disposable: v.disposable,
    role: v.role,
    mxFound: false,
    mxRecords: [],
    smtp: "unknown",
    mxHost: null,
    catchAll: false,
    confidence: { score: 0, risk: "high", reasons: [] },
  };

  if (!v.valid || !v.domain) {
    return {
      ...base,
      reason: "invalid syntax",
      confidence: scoreConfidence({
        syntax: false,
        mxFound: false,
        disposable: v.disposable,
        role: v.role,
      }),
    };
  }

  // Rank MX by priority (best first) even if the injected resolver did not sort.
  const mx = [...(await resolveImpl(v.domain))].sort((a, b) => a.priority - b.priority);
  base.mxRecords = mx;
  base.mxFound = mx.length > 0;

  if (!base.mxFound) {
    return {
      ...base,
      reason: "no MX records for domain",
      confidence: scoreConfidence({
        syntax: true,
        mxFound: false,
        disposable: v.disposable,
        role: v.role,
      }),
    };
  }

  base.mxHost = mx[0]!.exchange;

  let smtp: SmtpVerdict = "unknown";
  let catchAll = false;

  if (opts.checkSmtp !== false) {
    // Try hosts in priority order; fall back to the next until one is definitive.
    for (const rec of mx) {
      base.mxHost = rec.exchange;
      smtp = await smtpImpl(email, rec.exchange, {
        fromAddress: opts.fromAddress,
        timeout: opts.timeout,
      });
      if (smtp !== "unknown") break;
    }

    if (opts.detectCatchAll && smtp === "deliverable") {
      catchAll = await detectCatchAll(v.domain, base.mxHost!, {
        smtpCheckImpl: smtpImpl,
        randomLocal: opts.randomLocal,
        fromAddress: opts.fromAddress,
        timeout: opts.timeout,
      });
    }
  }

  base.smtp = smtp;
  base.catchAll = catchAll;

  const confidence = scoreConfidence({
    syntax: true,
    mxFound: true,
    disposable: v.disposable,
    role: v.role,
    catchAll,
    smtp,
  });

  return {
    ...base,
    valid: !v.disposable && smtp !== "undeliverable",
    reason: smtp === "undeliverable" ? "mailbox rejected by server" : undefined,
    confidence,
  };
}

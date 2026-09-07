/**
 * Batch verification for @lacspace/email-verify.
 *
 * Verify many addresses at once with a concurrency cap and per-domain de-dupe:
 * the MX lookup and the catch-all probe run at most ONCE per unique domain
 * within a run (results cached), so a list of 500 addresses across 30 domains
 * costs 30 MX lookups, not 500. Per-email SMTP probes still run per address.
 *
 * Resolver and prober are INJECTABLE; the worker pool is Promise-based (no real
 * timers), so the whole thing is testable without network or wall-clock waits.
 */

import { validateEmail } from "@lacspace/email-validate";
import {
  resolveMx as defaultResolveMx,
  smtpCheck as defaultSmtpCheck,
  type MxRecord,
  type MxResolver,
  type SmtpProber,
} from "./index";
import { detectCatchAll } from "./catch-all";
import { scoreConfidence } from "./confidence";
import { verifyEmailDeep, type DeepVerifyResult } from "./verify-deep";

export interface BatchOptions {
  /** Max addresses verified in parallel (default 5). */
  concurrency?: number;
  /** Run the live SMTP RCPT probe per address (default true). */
  checkSmtp?: boolean;
  /** Detect catch-all domains (probed once per domain, cached). Default false. */
  detectCatchAll?: boolean;
  /** MAIL FROM address used in probes. */
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

/** A per-email batch verdict — the same shape as {@link verifyEmailDeep}. */
export type BatchVerdict = DeepVerifyResult;

/**
 * Verify a list of addresses. De-dupes MX (and catch-all) work by domain within
 * the run and caps parallelism at `concurrency`. Verdicts are returned in the
 * same order as the input `emails`.
 */
export async function verifyBatch(
  emails: string[],
  opts: BatchOptions = {},
): Promise<BatchVerdict[]> {
  const concurrency = Math.max(1, Math.floor(opts.concurrency ?? 5));
  const resolveImpl = opts.resolveMxImpl ?? defaultResolveMx;
  const smtpImpl = opts.smtpCheckImpl ?? defaultSmtpCheck;

  // Per-domain caches: one MX lookup and one catch-all probe per unique domain.
  const mxCache = new Map<string, Promise<MxRecord[]>>();
  const catchAllCache = new Map<string, Promise<boolean>>();

  const resolveMemo: MxResolver = (domain) => {
    let p = mxCache.get(domain);
    if (!p) {
      p = resolveImpl(domain);
      mxCache.set(domain, p);
    }
    return p;
  };

  const catchAllMemo = (domain: string, mxHost: string): Promise<boolean> => {
    let p = catchAllCache.get(domain);
    if (!p) {
      p = detectCatchAll(domain, mxHost, {
        smtpCheckImpl: smtpImpl,
        randomLocal: opts.randomLocal,
        fromAddress: opts.fromAddress,
        timeout: opts.timeout,
      });
      catchAllCache.set(domain, p);
    }
    return p;
  };

  const verifyOne = async (email: string): Promise<BatchVerdict> => {
    // Deep verify with the memoized resolver (MX de-duped across the batch), but
    // let the batch own catch-all so it is cached per domain rather than per email.
    const deep = await verifyEmailDeep(email, {
      checkSmtp: opts.checkSmtp,
      detectCatchAll: false,
      fromAddress: opts.fromAddress,
      timeout: opts.timeout,
      extraDisposable: opts.extraDisposable,
      resolveMxImpl: resolveMemo,
      smtpCheckImpl: smtpImpl,
    });

    if (opts.detectCatchAll && deep.smtp === "deliverable" && deep.mxHost) {
      const domain = validateEmail(email, { suggestions: false }).domain;
      if (domain) {
        const catchAll = await catchAllMemo(domain, deep.mxHost);
        if (catchAll !== deep.catchAll) {
          deep.catchAll = catchAll;
          deep.confidence = scoreConfidence({
            syntax: deep.syntax,
            mxFound: deep.mxFound,
            disposable: deep.disposable,
            role: deep.role,
            catchAll,
            smtp: deep.smtp,
          });
        }
      }
    }

    return deep;
  };

  // Promise-based worker pool — preserves input order, no real timers.
  const results = new Array<BatchVerdict>(emails.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= emails.length) return;
      results[i] = await verifyOne(emails[i]!);
    }
  };

  const poolSize = Math.min(concurrency, emails.length || 1);
  await Promise.all(Array.from({ length: poolSize }, () => worker()));

  return results;
}

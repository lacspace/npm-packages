/**
 * Batch sending with a concurrency cap and per-message retry + backoff.
 * Transport-agnostic: pass any {@link Transport} (real SMTP, a pool, or a
 * memory/JSON transport in tests). All timing is injectable, so tests never
 * touch a real clock or socket.
 */

import type { Mail, SendResult, Transport } from "./index";

/** Per-message outcome from {@link sendBatch}. */
export interface BatchItemResult {
  index: number;
  mail: Mail;
  ok: boolean;
  /** The successful send result, if `ok`. */
  result?: SendResult;
  /** The last error, if the message ultimately failed. */
  error?: unknown;
  /** Total attempts made (1 = succeeded first try). */
  attempts: number;
}

/** Summary returned by {@link sendBatch}. */
export interface BatchSummary {
  total: number;
  sent: number;
  failed: number;
  results: BatchItemResult[];
}

export interface BatchOptions {
  /** Maximum messages in flight at once (default 5). */
  concurrency?: number;
  /** Retry attempts after the first failure (default 0 = no retry). */
  retries?: number;
  /**
   * Backoff before retry `attempt` (1-based), in ms. Default: exponential
   * `2^(attempt-1) * 200` capped at 30s.
   */
  backoff?: (attempt: number) => number;
  /** Decide whether an error is retryable. Default: always retry until exhausted. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Injectable sleep (default a real `setTimeout`). Tests pass a fake. */
  sleep?: (ms: number) => Promise<void>;
  /** Called as each message settles (success or final failure). */
  onResult?: (result: BatchItemResult) => void;
}

const defaultBackoff = (attempt: number): number => Math.min(2 ** (attempt - 1) * 200, 30_000);
const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Decide whether another attempt should be made after a failure. Exposed for
 * unit testing the retry decision independently of any I/O.
 */
export function shouldRetrySend(
  error: unknown,
  attempt: number,
  retries: number,
  predicate?: (error: unknown, attempt: number) => boolean,
): boolean {
  if (attempt > retries) return false;
  return predicate ? predicate(error, attempt) : true;
}

/** Send one message with retry + backoff. Timing via the injected `sleep`. */
async function sendWithRetry(
  transport: Transport,
  mail: Mail,
  index: number,
  opts: Required<Pick<BatchOptions, "retries" | "backoff" | "sleep">> &
    Pick<BatchOptions, "shouldRetry">,
): Promise<BatchItemResult> {
  let attempts = 0;
  let lastError: unknown;
  for (;;) {
    attempts++;
    try {
      const result = await transport.send(mail);
      return { index, mail, ok: true, result, attempts };
    } catch (e) {
      lastError = e;
      // `attempts` retries so far; the next attempt would be number `attempts`.
      if (!shouldRetrySend(e, attempts, opts.retries, opts.shouldRetry)) {
        return { index, mail, ok: false, error: e, attempts };
      }
      const wait = opts.backoff(attempts);
      if (wait > 0) await opts.sleep(wait);
    }
  }
}

/**
 * Send many messages through a {@link Transport} with a concurrency cap and
 * per-message retry/backoff. Results preserve input order.
 *
 * ```ts
 * const summary = await sendBatch(transport, mails, { concurrency: 3, retries: 2 });
 * // summary.sent / summary.failed / summary.results[]
 * ```
 */
export async function sendBatch(
  transport: Transport,
  mails: Mail[],
  options: BatchOptions = {},
): Promise<BatchSummary> {
  const concurrency = Math.max(1, options.concurrency ?? 5);
  const opts = {
    retries: options.retries ?? 0,
    backoff: options.backoff ?? defaultBackoff,
    sleep: options.sleep ?? realSleep,
    shouldRetry: options.shouldRetry,
  };

  const results: BatchItemResult[] = new Array(mails.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= mails.length) return;
      const r = await sendWithRetry(transport, mails[i]!, i, opts);
      results[i] = r;
      options.onResult?.(r);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, mails.length) }, () => worker());
  await Promise.all(workers);

  const sent = results.filter((r) => r.ok).length;
  return { total: mails.length, sent, failed: mails.length - sent, results };
}

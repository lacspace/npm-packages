/**
 * Catch-all (accept-all) domain detection for @lacspace/email-verify.
 *
 * A domain is "catch-all" when its mail server accepts *every* recipient — so a
 * positive SMTP RCPT result tells you nothing. We detect it by probing a random
 * local-part that almost certainly does not exist: if the server accepts it, the
 * domain is catch-all.
 *
 * The SMTP probe is INJECTABLE (`smtpCheckImpl`) so tests never open a socket,
 * and the random local-part generator is injectable too for deterministic tests.
 */

import { smtpCheck, type SmtpProber } from "./index";

export interface CatchAllOptions {
  /** Inject a custom SMTP prober. Defaults to the built-in {@link smtpCheck}. */
  smtpCheckImpl?: SmtpProber;
  /** Inject the random-local-part generator (for deterministic tests). */
  randomLocal?: () => string;
  /** MAIL FROM address used in the probe. */
  fromAddress?: string;
  /** Per-connection timeout in ms. */
  timeout?: number;
}

/** A local-part that is overwhelmingly unlikely to be a real mailbox. */
function defaultRandomLocal(): string {
  const rand = Math.random().toString(36).slice(2, 12);
  const stamp = Date.now().toString(36);
  return `no-such-user-${stamp}-${rand}`;
}

/**
 * Probe a random non-existent recipient at `domain` via `mxHost`. Returns
 * `true` when the server accepts it (catch-all), `false` otherwise (including
 * `unknown`, which we treat as "not proven catch-all").
 */
export async function detectCatchAll(
  domain: string,
  mxHost: string,
  opts: CatchAllOptions = {},
): Promise<boolean> {
  const prober = opts.smtpCheckImpl ?? smtpCheck;
  const local = (opts.randomLocal ?? defaultRandomLocal)();
  const probeAddress = `${local}@${domain}`;
  const verdict = await prober(probeAddress, mxHost, {
    fromAddress: opts.fromAddress,
    timeout: opts.timeout,
  });
  return verdict === "deliverable";
}

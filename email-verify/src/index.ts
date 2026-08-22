/**
 * @lacspace/email-verify
 * Does this mailbox actually exist? — best-effort deliverability checks.
 *
 * Combines syntax + disposable checks (@lacspace/email-validate) with a real MX
 * record lookup and an optional SMTP RCPT probe, over Node's built-in `dns` and
 * `net`. No message is ever sent.
 *
 * ⚠️ Live SMTP verification is inherently unreliable: many servers greylist,
 * accept-all (catch-all), or block probes — expect "unknown" often. Treat a
 * positive as "likely deliverable", never as a guarantee.
 *
 * Node.js only · zero npm dependencies · fully typed.
 */

import net from "node:net";
import { resolveMx as dnsResolveMx } from "node:dns/promises";
import { hostname } from "node:os";
import { validateEmail } from "@lacspace/email-validate";

export interface MxRecord {
  exchange: string;
  priority: number;
}

export type SmtpVerdict = "deliverable" | "undeliverable" | "unknown";

export interface VerifyOptions {
  /** Also run the live SMTP RCPT probe (default true). */
  checkSmtp?: boolean;
  /** MAIL FROM address used in the probe. Default `verify@<your hostname>`. */
  fromAddress?: string;
  /** Per-connection timeout in ms (default 10000). */
  timeout?: number;
  /** Extra disposable domains. */
  extraDisposable?: string[];
}

export interface VerifyResult {
  email: string;
  /** Overall best-effort verdict: syntax ok, MX present, and SMTP not undeliverable. */
  valid: boolean;
  syntax: boolean;
  disposable: boolean;
  role: boolean;
  mxFound: boolean;
  mxRecords: MxRecord[];
  smtp: SmtpVerdict;
  reason?: string;
}

/** Look up and sort a domain's MX records (best priority first). */
export async function resolveMx(domain: string): Promise<MxRecord[]> {
  try {
    const records = await dnsResolveMx(domain);
    return records.sort((a, b) => a.priority - b.priority);
  } catch {
    return [];
  }
}

/**
 * Probe a mailbox with SMTP MAIL FROM / RCPT TO (no DATA, nothing sent).
 * Returns "deliverable" (250), "undeliverable" (550-class), or "unknown".
 */
export function smtpCheck(
  email: string,
  mxHost: string,
  opts: { fromAddress?: string; timeout?: number } = {},
): Promise<SmtpVerdict> {
  const timeout = opts.timeout ?? 10000;
  const from = opts.fromAddress ?? `verify@${hostname() || "localhost"}`;

  return new Promise((resolve) => {
    const socket = net.connect({ host: mxHost, port: 25 });
    socket.setEncoding("utf8");
    socket.setTimeout(timeout);

    let buffer = "";
    let step = 0;
    let verdict: SmtpVerdict = "unknown";
    const steps = [
      `EHLO ${hostname() || "localhost"}`,
      `MAIL FROM:<${from}>`,
      `RCPT TO:<${email}>`,
      "QUIT",
    ];

    const finish = (v: SmtpVerdict) => {
      verdict = v;
      try {
        socket.write("QUIT\r\n");
      } catch {
        /* ignore */
      }
      socket.destroy();
      resolve(verdict);
    };

    const send = () => {
      if (step < steps.length) socket.write(steps[step]! + "\r\n");
    };

    socket.on("connect", () => {
      /* wait for 220 greeting before first command */
    });

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!/^\d{3} /.test(line)) continue; // wait for final line of a reply
        const code = parseInt(line.slice(0, 3), 10);

        if (step === 0) {
          if (code !== 220) return finish("unknown");
          send(); // EHLO
          step = 1;
        } else if (step === 1) {
          send(); // MAIL FROM
          step = 2;
        } else if (step === 2) {
          if (code >= 400) return finish("unknown");
          send(); // RCPT TO
          step = 3;
        } else if (step === 3) {
          if (code === 250 || code === 251) return finish("deliverable");
          if (code === 550 || code === 551 || code === 553) return finish("undeliverable");
          return finish("unknown");
        }
      }
    });

    socket.on("timeout", () => finish("unknown"));
    socket.on("error", () => finish("unknown"));
    socket.on("close", () => resolve(verdict));
  });
}

/** Full verification: syntax → disposable → MX → (optional) SMTP probe. */
export async function verifyEmail(email: string, opts: VerifyOptions = {}): Promise<VerifyResult> {
  const v = validateEmail(email, { extraDisposable: opts.extraDisposable, suggestions: false });
  const base: VerifyResult = {
    email,
    valid: false,
    syntax: v.valid,
    disposable: v.disposable,
    role: v.role,
    mxFound: false,
    mxRecords: [],
    smtp: "unknown",
  };

  if (!v.valid || !v.domain) return { ...base, reason: "invalid syntax" };

  const mx = await resolveMx(v.domain);
  base.mxRecords = mx;
  base.mxFound = mx.length > 0;
  if (!base.mxFound) return { ...base, reason: "no MX records for domain" };

  if (opts.checkSmtp === false) {
    return { ...base, valid: !v.disposable };
  }

  const verdict = await smtpCheck(email, mx[0]!.exchange, {
    fromAddress: opts.fromAddress,
    timeout: opts.timeout,
  });
  base.smtp = verdict;

  return {
    ...base,
    valid: !v.disposable && verdict !== "undeliverable",
    reason: verdict === "undeliverable" ? "mailbox rejected by server" : undefined,
  };
}

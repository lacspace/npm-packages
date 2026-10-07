/**
 * RFC 8058 one-click unsubscribe POST.
 */

import { isIpLiteral, isPrivateHost, isPrivateIp } from "./guard";
import type { MailtoEntry } from "./parse";

export interface OneClickOptions {
  /** fetch implementation (defaults to the global fetch). */
  fetch?: typeof fetch;
  /** Whole-request budget including redirects. Default 10000 ms. */
  timeoutMs?: number;
  /** Sent as User-Agent where the runtime allows it (browsers ignore it). */
  userAgent?: string;
  /** Abort from outside (reported as `error: "timeout"`, `detail: "aborted"`). */
  signal?: AbortSignal;
  /** Skip the host checks (tests, intranets). Default false. */
  allowPrivateHosts?: boolean;
  /**
   * Optional DNS hook: return the IPs a hostname resolves to. Every IP is
   * checked against the private ranges before the request (and before each
   * redirect hop). Without it, a public name pointing at a private IP — or DNS
   * rebinding between this check and the connection — cannot be detected.
   */
  resolveHost?: (host: string) => Promise<string[]>;
  /** Maximum redirects to follow (https only, POST preserved). Default 3. */
  maxRedirects?: number;
}

export type OneClickError = "not_https" | "private_host" | "timeout" | "network" | "http_error";

export interface OneClickResult {
  ok: boolean;
  status?: number;
  error?: OneClickError;
  detail?: string;
}

/** The exact RFC 8058 request body. */
export const ONE_CLICK_BODY = "List-Unsubscribe=One-Click";

const fail = (error: OneClickError, detail?: string, status?: number): OneClickResult => {
  const r: OneClickResult = { ok: false, error };
  if (status !== undefined) r.status = status;
  if (detail !== undefined) r.detail = detail;
  return r;
};

async function checkUrl(raw: string, base: string | undefined, opts: OneClickOptions): Promise<URL | OneClickResult> {
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return fail("not_https", "invalid URL");
  }
  if (u.protocol !== "https:") return fail("not_https", `protocol ${u.protocol}`);
  // Credentials in the URL are never legitimate for an unsubscribe link.
  if (u.username || u.password) return fail("private_host", "URL contains userinfo");
  if (opts.allowPrivateHosts) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isPrivateHost(host)) return fail("private_host", host);
  if (opts.resolveHost && !isIpLiteral(host)) {
    let ips: string[];
    try {
      ips = await opts.resolveHost(host);
    } catch (e) {
      return fail("network", `resolve failed: ${(e as Error)?.message ?? String(e)}`);
    }
    if (!ips.length) return fail("network", `no addresses for ${host}`);
    const bad = ips.find((ip) => isPrivateIp(ip));
    if (bad) return fail("private_host", `${host} resolves to ${bad}`);
  }
  return u;
}

function isAbort(e: unknown): boolean {
  const n = (e as { name?: string } | null)?.name;
  return n === "AbortError" || n === "TimeoutError";
}

/**
 * Send the RFC 8058 one-click POST (`List-Unsubscribe=One-Click`, form-encoded)
 * to an https List-Unsubscribe URL. No cookies or credentials are sent.
 * Redirects are followed manually, at most `maxRedirects` (3) times, only to
 * https URLs that pass the same host checks, and always re-sent as POST with
 * the same body — RFC 8058 requires the POST semantics to survive, so a
 * 301/302/303 is NOT downgraded to GET the way browsers do. 2xx = ok.
 *
 * Run it from your server: in a browser, CORS hides the response and
 * `redirect: "manual"` yields an opaque redirect that cannot be followed.
 */
export async function oneClickUnsubscribe(url: string, opts: OneClickOptions = {}): Promise<OneClickResult> {
  const doFetch = opts.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
  const maxRedirects = opts.maxRedirects ?? 3;
  const timeoutMs = opts.timeoutMs ?? 10000;

  let current = await checkUrl(url, undefined, opts);
  if (!(current instanceof URL)) return current;
  if (!doFetch) return fail("network", "no fetch implementation available");
  if (opts.signal?.aborted) return fail("timeout", "aborted");

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (opts.userAgent) headers["User-Agent"] = opts.userAgent;

  try {
    for (let hop = 0; ; hop++) {
      let res: Response;
      try {
        res = await doFetch(current.href, {
          method: "POST",
          headers,
          body: ONE_CLICK_BODY,
          credentials: "omit",
          redirect: "manual",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: ctrl.signal,
        });
      } catch (e) {
        if (timedOut) return fail("timeout", `no response within ${timeoutMs} ms`);
        if (opts.signal?.aborted || isAbort(e)) return fail("timeout", "aborted");
        return fail("network", (e as Error)?.message ?? String(e));
      }
      try {
        void res.body?.cancel?.().catch(() => undefined);
      } catch {
        /* ignore */
      }
      const status = res.status;
      if (status >= 200 && status < 300) return { ok: true, status };
      if (res.type === "opaqueredirect" || status === 0) {
        return fail("http_error", "opaque redirect (browser): run oneClickUnsubscribe from the server", status);
      }
      if (status >= 300 && status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return fail("http_error", "redirect without Location", status);
        if (hop >= maxRedirects) return fail("http_error", `too many redirects (> ${maxRedirects})`, status);
        const next = await checkUrl(loc, current.href, opts);
        if (!(next instanceof URL)) return { ...next, detail: `redirect: ${next.detail ?? ""}`.trim() };
        current = next;
        continue;
      }
      return fail("http_error", `HTTP ${status}`, status);
    }
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

export interface MailtoMessage {
  to: string;
  /** Default "unsubscribe". */
  subject: string;
  /** Plain-text body. Default "unsubscribe". */
  text: string;
  cc?: string;
}

/** Turn a parsed mailto entry into a message ready for any mailer. */
export function mailtoUnsubscribe(entry: MailtoEntry): MailtoMessage {
  const out: MailtoMessage = {
    to: entry.to,
    subject: entry.subject?.trim() ? entry.subject : "unsubscribe",
    text: entry.body?.trim() ? entry.body : "unsubscribe",
  };
  if (entry.cc) out.cc = entry.cc;
  return out;
}

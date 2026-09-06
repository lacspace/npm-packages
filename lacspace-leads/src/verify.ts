/**
 * Email verification — check that an address is well-formed and its domain
 * actually accepts mail (has DNS MX records). No message is ever sent; this is
 * a deliverability signal, not a guarantee. Uses `node:dns`, so it's Node-only.
 */
import { resolveMx } from "node:dns/promises";
import type { EmailStatus, Lead } from "./types.js";

// RFC-pragmatic address shape — good enough to reject obvious junk.
const EMAIL_SHAPE = /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/;

/** True when `email` is a plausibly-valid address shape. Pure. */
export function emailFormatValid(email: string | undefined): boolean {
  return !!email && EMAIL_SHAPE.test(email.trim());
}

/** The domain part of an email, lower-cased, or undefined. Pure. */
export function emailDomain(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() || undefined : undefined;
}

/** Resolve a domain's MX (or A-record fallback). Cached; never throws. */
async function domainHasMail(
  domain: string,
  cache: Map<string, boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const cached = cache.get(domain);
  if (cached !== undefined) return cached;
  const timer = new Promise<boolean>((res) => setTimeout(() => res(false), timeoutMs));
  const lookup = resolveMx(domain)
    .then((records) => Array.isArray(records) && records.length > 0)
    .catch(() => false);
  const ok = await Promise.race([lookup, timer]);
  cache.set(domain, ok);
  return ok;
}

/**
 * Classify a single email: `invalid-format` → `no-mx` → `valid`. `unknown` is
 * reserved for a missing address. Never throws.
 */
export async function verifyEmail(
  email: string | undefined,
  opts: { cache?: Map<string, boolean>; timeoutMs?: number } = {},
): Promise<EmailStatus> {
  if (!email) return "unknown";
  if (!emailFormatValid(email)) return "invalid-format";
  const domain = emailDomain(email);
  if (!domain) return "invalid-format";
  const has = await domainHasMail(domain, opts.cache ?? new Map(), opts.timeoutMs ?? 5000);
  return has ? "valid" : "no-mx";
}

/**
 * Verify the `email` on each lead in place, setting `emailStatus`. Domains are
 * looked up once (shared cache) and checked a few in parallel. Leads without an
 * email are left untouched. Node-only; never throws.
 */
export async function verifyEmails(
  leads: Lead[],
  opts: { concurrency?: number; timeoutMs?: number; onProgress?: (m: string) => void } = {},
): Promise<Lead[]> {
  const cache = new Map<string, boolean>();
  const targets = leads.filter((l) => l.email);
  const n = Math.max(1, Math.min(opts.concurrency ?? 5, targets.length || 1));
  let next = 0;
  let done = 0;
  const verifyOpts: { cache: Map<string, boolean>; timeoutMs?: number } = { cache };
  if (opts.timeoutMs !== undefined) verifyOpts.timeoutMs = opts.timeoutMs;
  const workers = Array.from({ length: n }, async () => {
    for (;;) {
      const i = next++;
      if (i >= targets.length) return;
      const lead = targets[i]!;
      lead.emailStatus = await verifyEmail(lead.email, verifyOpts);
      opts.onProgress?.(`verifying email ${++done}/${targets.length}: ${lead.email}…`);
    }
  });
  await Promise.all(workers);
  return leads;
}

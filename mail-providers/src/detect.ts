import { PRESETS, isProviderKey } from "./presets";
import type { ProviderKey, SendLimits } from "./presets";

/** An MX host name, or a record shaped like Node's `dns.resolveMx()` output. */
export type MxInput = string | { exchange?: string | null; priority?: number | null } | null | undefined;

/** MX host patterns → provider. Each matches on a domain-label boundary. */
export const MX_HINTS: ReadonlyArray<readonly [RegExp, ProviderKey]> = Object.freeze([
  [/(^|\.)hostinger\.com$/, "hostinger"],
  [/(^|\.)titan\.email$/, "titan"],
  [/(^|\.)secureserver\.net$/, "godaddy"],
  [/(^|\.)(google|googlemail)\.com$/, "gmail"],
  [/(^|\.)outlook\.com$/, "outlook"],
  [/(^|\.)zoho\.[a-z]{2,3}(\.[a-z]{2})?$/, "zoho"],
  [/(^|\.)yahoodns\.net$/, "yahoo"],
  [/(^|\.)(icloud|apple)\.com$/, "icloud"],
] as Array<readonly [RegExp, ProviderKey]>);

/** Consumer mail domains whose provider is known without an MX lookup. */
export const DOMAIN_HINTS: Readonly<Record<string, ProviderKey>> = Object.freeze({
  "gmail.com": "gmail",
  "googlemail.com": "gmail",
  "outlook.com": "outlook",
  "hotmail.com": "outlook",
  "live.com": "outlook",
  "msn.com": "outlook",
  "yahoo.com": "yahoo",
  "ymail.com": "yahoo",
  "icloud.com": "icloud",
  "me.com": "icloud",
  "mac.com": "icloud",
  "zoho.com": "zoho",
  "zohomail.com": "zoho",
});

/** Lowercase, trim and drop the trailing root dot from MX hosts; sorts records by priority. Never throws. */
export function normalizeMx(mx: readonly MxInput[] | MxInput | null | undefined): string[] {
  const list = Array.isArray(mx) ? mx : mx == null ? [] : [mx];
  const rows: Array<{ host: string; prio: number; i: number }> = [];
  list.forEach((m, i) => {
    let host = "";
    let prio = Number.POSITIVE_INFINITY;
    if (typeof m === "string") host = m;
    else if (m && typeof m === "object" && typeof m.exchange === "string") {
      host = m.exchange;
      if (typeof m.priority === "number" && Number.isFinite(m.priority)) prio = m.priority;
    }
    host = host.trim().toLowerCase().replace(/\.+$/, "");
    if (host) rows.push({ host, prio, i });
  });
  rows.sort((a, b) => (a.prio === b.prio ? a.i - b.i : a.prio - b.prio));
  return rows.map((r) => r.host);
}

/** The provider for one MX host, or null. */
export function providerFromMxHost(host: string): ProviderKey | null {
  const h = normalizeMx(host)[0];
  if (!h) return null;
  for (const [re, key] of MX_HINTS) if (re.test(h)) return key;
  return null;
}

/** The provider for a domain's MX hosts (first recognised host wins), or null. */
export function providerFromMx(mxHosts: readonly MxInput[] | null | undefined): ProviderKey | null {
  for (const h of normalizeMx(mxHosts ?? [])) {
    const k = providerFromMxHost(h);
    if (k) return k;
  }
  return null;
}

/** The domain part of an address, lowercased, or "" when there isn't one. */
export function domainOf(email: unknown): string {
  if (typeof email !== "string") return "";
  const s = email.trim().replace(/^.*<([^>]*)>.*$/, "$1").trim();
  const at = s.lastIndexOf("@");
  if (at <= 0) return "";
  const d = s.slice(at + 1).toLowerCase().replace(/\.+$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : "";
}

/** The provider of a well-known consumer domain (gmail.com, outlook.com …), or null. */
export function providerFromDomain(domain: string): ProviderKey | null {
  const d = typeof domain === "string" ? domain.trim().toLowerCase() : "";
  return Object.prototype.hasOwnProperty.call(DOMAIN_HINTS, d) ? (DOMAIN_HINTS[d] ?? null) : null;
}

export interface CandidateServer {
  host: string;
  port: number;
  secure: boolean;
  user: string;
}

export interface ServerCandidate {
  provider: ProviderKey | "custom";
  name: string;
  imap: CandidateServer;
  smtp: CandidateServer;
  limits: SendLimits;
  /** Why this candidate is in the list. */
  reason: "preferred" | "mx" | "paired" | "domain" | "fallback";
}

export interface CandidateOptions {
  /** Providers to try first, in this order (e.g. the hosts you resell). */
  prefer?: readonly ProviderKey[];
  /** Add imap./smtp./mail.<domain> guesses even when a provider was recognised. Default false. */
  alwaysFallback?: boolean;
}

/** Hostinger and Titan share customers, so when either is hinted both are tried. */
const PAIRS: Partial<Record<ProviderKey, ProviderKey>> = { hostinger: "titan", titan: "hostinger" };

/**
 * Ordered IMAP/SMTP settings to try for an address. Order: `prefer`, then providers
 * recognised from the MX hosts (in MX priority order, with Hostinger/Titan paired),
 * then a well-known consumer domain when no MX was given, then generic guesses
 * (imap./smtp.<domain>, then mail.<domain>) when nothing was recognised.
 * Returns [] for an address without a valid domain. Never throws.
 */
export function serverCandidates(
  email: string,
  mxHosts?: readonly MxInput[] | null,
  options: CandidateOptions = {},
): ServerCandidate[] {
  const domain = domainOf(email);
  if (!domain) return [];
  const user = String(email).trim().replace(/^.*<([^>]*)>.*$/, "$1").trim();
  const out: ServerCandidate[] = [];
  const add = (key: ProviderKey, reason: ServerCandidate["reason"]) => {
    if (out.some((o) => o.provider === key)) return;
    const p = PRESETS[key];
    out.push({ provider: key, name: p.name, imap: { ...p.imap, user }, smtp: { ...p.smtp, user }, limits: { ...p.limits }, reason });
  };
  const o = options && typeof options === "object" ? options : {};
  for (const k of Array.isArray(o.prefer) ? o.prefer : []) if (isProviderKey(k)) add(k, "preferred");
  const hosts = normalizeMx(mxHosts ?? []);
  for (const h of hosts) {
    const k = providerFromMxHost(h);
    if (!k) continue;
    add(k, "mx");
    const pair = PAIRS[k];
    if (pair) add(pair, "paired");
  }
  if (!hosts.length) {
    const k = providerFromDomain(domain);
    if (k) add(k, "domain");
  }
  if (!out.length || o.alwaysFallback === true) {
    const custom = (imap: string, smtp: string): ServerCandidate => ({
      provider: "custom",
      name: "Custom IMAP/SMTP",
      imap: { host: imap, port: 993, secure: true, user },
      smtp: { host: smtp, port: 465, secure: true, user },
      limits: { perHour: "unknown", perDay: "unknown" },
      reason: "fallback",
    });
    out.push(custom(`imap.${domain}`, `smtp.${domain}`));
    out.push(custom(`mail.${domain}`, `mail.${domain}`));
  }
  return out;
}

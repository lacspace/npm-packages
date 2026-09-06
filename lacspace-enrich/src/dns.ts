/**
 * DNS + email-deliverability signals from `node:dns` — MX, SPF (TXT), DMARC
 * (`_dmarc`), DKIM presence, an inferred mail provider and a catch-all hint.
 * Also MX-verifies discovered emails (like lacspace-leads). Node-only. The
 * record PARSERS are pure and unit-tested; the lookups never throw.
 */
import { resolveMx, resolveTxt } from "node:dns/promises";
import type { DnsSignals, MxRecord } from "./types.js";

const EMAIL_SHAPE = /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/;

/** True when `email` is a plausibly-valid address shape. Pure. */
export function emailFormatValid(email: string | undefined): boolean {
  return !!email && EMAIL_SHAPE.test(email.trim());
}

/** The lower-cased domain part of an email, or undefined. Pure. */
export function emailDomain(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() || undefined : undefined;
}

/**
 * Pull the SPF record and its `all` policy out of a domain's TXT records. Pure.
 * Accepts the array of TXT strings you'd get from `dns.resolveTxt` (flattened).
 */
export function parseSpf(txtRecords: string[]): { spf?: string; spfPolicy?: DnsSignals["spfPolicy"] } {
  const spf = txtRecords.map((t) => t.trim()).find((t) => /^v=spf1\b/i.test(t));
  if (!spf) return {};
  const m = spf.match(/([-+~?])all\b/i);
  const q = m?.[1];
  const spfPolicy: DnsSignals["spfPolicy"] | undefined =
    q === "-" ? "fail" : q === "~" ? "softfail" : q === "?" ? "neutral" : q === "+" ? "pass" : undefined;
  return spfPolicy ? { spf, spfPolicy } : { spf };
}

/**
 * Pull the DMARC policy out of the TXT records at `_dmarc.<domain>`. Pure.
 * Returns the raw record and the enforcement policy from the `p=` tag.
 */
export function parseDmarc(txtRecords: string[]): { dmarc?: string; dmarcPolicy?: DnsSignals["dmarcPolicy"] } {
  const dmarc = txtRecords.map((t) => t.trim()).find((t) => /^v=dmarc1\b/i.test(t));
  if (!dmarc) return {};
  const m = dmarc.match(/\bp\s*=\s*(none|quarantine|reject)\b/i);
  const p = m?.[1]?.toLowerCase() as DnsSignals["dmarcPolicy"] | undefined;
  return p ? { dmarc, dmarcPolicy: p } : { dmarc };
}

/** Infer the mail provider from a set of MX exchange hostnames. Pure. */
export function mailProviderFromMx(exchanges: string[]): string | undefined {
  const hay = exchanges.join(" ").toLowerCase();
  const table: [RegExp, string][] = [
    [/aspmx\.l\.google\.com|googlemail\.com|google\.com$/, "Google Workspace"],
    [/outlook\.com|office365\.com|microsoft\.com|protection\.outlook/, "Microsoft 365"],
    [/zoho\./, "Zoho Mail"],
    [/protonmail|proton\.me|protonmail\.ch/, "Proton Mail"],
    [/mx\.yandex|yandex\./, "Yandex"],
    [/messagingengine\.com/, "Fastmail"],
    [/mailgun\.org/, "Mailgun"],
    [/amazonaws\.com|amazonses/, "Amazon SES"],
    [/pphosted\.com|proofpoint/, "Proofpoint"],
    [/mimecast\.com/, "Mimecast"],
    [/secureserver\.net/, "GoDaddy"],
    [/improvmx\.com/, "ImprovMX"],
    [/mx\.cloudflare|cloudflare\.net/, "Cloudflare Email"],
    [/emailsrvr\.com/, "Rackspace"],
    [/hostinger|titan\.email/, "Hostinger / Titan"],
    [/one\.com/, "one.com"],
  ];
  for (const [re, name] of table) if (re.test(hay)) return name;
  return undefined;
}

/** A permissive SPF `all` plus a big-provider MX hints at a catch-all-ish setup. Pure. */
export function catchAllHint(spfPolicy: DnsSignals["spfPolicy"], provider: string | undefined): boolean {
  // A "+all"/"?all" SPF is very permissive; some providers default to accepting
  // then bouncing. We can only HINT — real catch-all detection needs SMTP.
  if (spfPolicy === "pass" || spfPolicy === "neutral") return true;
  return provider === "ImprovMX"; // forwarders are typically catch-all
}

const DKIM_SELECTORS = ["default", "google", "selector1", "selector2", "k1", "dkim", "mail", "s1", "s2"];

/** Race a promise against a timeout that resolves to `fallback`. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);
}

async function txtOf(name: string, ms: number): Promise<string[]> {
  return withTimeout(
    resolveTxt(name).then((r) => r.map((chunks) => chunks.join(""))).catch(() => [] as string[]),
    ms,
    [] as string[],
  );
}

/** Gather DNS + deliverability signals for a domain. Node-only; never throws. */
export async function dnsSignals(domain: string, opts: { timeoutMs?: number } = {}): Promise<DnsSignals> {
  const ms = opts.timeoutMs ?? 5000;
  const out: DnsSignals = {};

  const [mxRaw, rootTxt, dmarcTxt, ...dkimTxts] = await Promise.all([
    withTimeout(resolveMx(domain).catch(() => [] as { exchange: string; priority: number }[]), ms, []),
    txtOf(domain, ms),
    txtOf(`_dmarc.${domain}`, ms),
    ...DKIM_SELECTORS.map((sel) => txtOf(`${sel}._domainkey.${domain}`, ms)),
  ]);

  const mx: MxRecord[] = [...mxRaw]
    .map((r) => ({ exchange: String(r.exchange).toLowerCase().replace(/\.$/, ""), priority: r.priority }))
    .sort((a, b) => a.priority - b.priority);
  if (mx.length) { out.mx = mx; out.hasMx = true; } else out.hasMx = false;
  const provider = mailProviderFromMx(mx.map((m) => m.exchange));
  if (provider) out.mailProvider = provider;

  const spf = parseSpf(rootTxt);
  if (spf.spf) out.spf = spf.spf;
  if (spf.spfPolicy) out.spfPolicy = spf.spfPolicy;

  const dmarc = parseDmarc(dmarcTxt);
  if (dmarc.dmarc) out.dmarc = dmarc.dmarc;
  if (dmarc.dmarcPolicy) out.dmarcPolicy = dmarc.dmarcPolicy;

  const foundSelectors = DKIM_SELECTORS.filter((_, i) =>
    (dkimTxts[i] ?? []).some((t) => /v=dkim1|p=[A-Za-z0-9+/]/i.test(t)),
  );
  out.dkim = foundSelectors.length > 0;
  if (foundSelectors.length) out.dkimSelectors = foundSelectors;

  const notable = rootTxt.filter((t) => !/^v=spf1\b/i.test(t.trim()) && /verification|verify|=/.test(t)).slice(0, 6);
  if (notable.length) out.txt = notable;

  out.catchAllLikely = catchAllHint(out.spfPolicy, provider);
  return out;
}

/**
 * MX-verify a set of email addresses: classify each `invalid-format` → `no-mx`
 * → `valid` by checking its domain has MX. Domains are looked up once (shared
 * cache). Node-only; never throws.
 */
export async function verifyEmailDomains(
  emails: string[],
  opts: { timeoutMs?: number; cache?: Map<string, boolean> } = {},
): Promise<Record<string, "valid" | "no-mx" | "invalid-format">> {
  const ms = opts.timeoutMs ?? 5000;
  const cache = opts.cache ?? new Map<string, boolean>();
  const out: Record<string, "valid" | "no-mx" | "invalid-format"> = {};
  for (const email of emails) {
    if (!emailFormatValid(email)) { out[email] = "invalid-format"; continue; }
    const dom = emailDomain(email);
    if (!dom) { out[email] = "invalid-format"; continue; }
    let has = cache.get(dom);
    if (has === undefined) {
      has = await withTimeout(
        resolveMx(dom).then((r) => Array.isArray(r) && r.length > 0).catch(() => false),
        ms,
        false,
      );
      cache.set(dom, has);
    }
    out[email] = has ? "valid" : "no-mx";
  }
  return out;
}

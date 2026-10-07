/**
 * Known mail providers: SPF includes, MX hosts and DKIM selectors, so a wizard
 * can say "detected: Hostinger". `verified` records where each value was
 * checked (on 2026-10-07): "docs" = the provider's public documentation,
 * "dns" = the live DNS record exists and resolves, "unverified" = from
 * common knowledge only; double-check before relying on it.
 */
import type { MxHost } from "./types.js";

export type Verification = "docs" | "dns" | "docs+dns" | "unverified";

export interface MailProvider {
  id: string;
  name: string;
  /** What the provider is used for. */
  role: "mailbox" | "sending" | "both";
  spfInclude: string[];
  /** Recommended MX records. `{domainDashed}` = your domain with dots as dashes (Microsoft 365). */
  mx: MxHost[];
  /** Matches MX hosts that belong to this provider. */
  mxPattern?: RegExp;
  /** DKIM selectors the provider uses (some are chosen per account). */
  dkimSelectors: string[];
  /** DKIM published as a CNAME to the provider (true) or as a TXT key you paste (false). */
  dkimCname: boolean;
  docs?: string;
  notes?: string;
  verified: { spf: Verification; mx: Verification; dkim: Verification };
}

export const PROVIDERS: Record<string, MailProvider> = {
  hostinger: {
    id: "hostinger",
    name: "Hostinger Email",
    role: "mailbox",
    spfInclude: ["_spf.mail.hostinger.com"],
    mx: [{ host: "mx1.hostinger.com", priority: 5 }, { host: "mx2.hostinger.com", priority: 10 }],
    mxPattern: /(^|\.)hostinger\.com$/,
    dkimSelectors: ["hostingermail-a", "hostingermail-b", "hostingermail-c"],
    dkimCname: true,
    docs: "https://support.hostinger.com/en/articles/1583673-what-are-the-dns-records-for-hostinger-email",
    notes: "DKIM selectors are CNAMEs to <selector>.dkim.mail.hostinger.com; only one is active at a time, the others are revoked spares for rotation.",
    verified: { spf: "docs+dns", mx: "dns", dkim: "dns" },
  },
  google: {
    id: "google",
    name: "Google Workspace",
    role: "mailbox",
    spfInclude: ["_spf.google.com"],
    mx: [{ host: "smtp.google.com", priority: 1 }],
    mxPattern: /(^|\.)(google|googlemail)\.com$/,
    dkimSelectors: ["google"],
    dkimCname: false,
    docs: "https://support.google.com/a/answer/174125",
    notes: "Older setups use five MX records (aspmx.l.google.com, alt1-alt4); both are valid.",
    verified: { spf: "docs+dns", mx: "docs+dns", dkim: "unverified" },
  },
  microsoft365: {
    id: "microsoft365",
    name: "Microsoft 365",
    role: "mailbox",
    spfInclude: ["spf.protection.outlook.com"],
    mx: [{ host: "{domainDashed}.mail.protection.outlook.com", priority: 0 }],
    mxPattern: /\.mail\.protection\.outlook\.com$/,
    dkimSelectors: ["selector1", "selector2"],
    dkimCname: true,
    docs: "https://learn.microsoft.com/en-us/microsoft-365/enterprise/external-domain-name-system-records",
    verified: { spf: "docs+dns", mx: "docs", dkim: "docs" },
  },
  zoho: {
    id: "zoho",
    name: "Zoho Mail",
    role: "mailbox",
    spfInclude: ["zohomail.com"],
    mx: [{ host: "mx.zoho.com", priority: 10 }, { host: "mx2.zoho.com", priority: 20 }, { host: "mx3.zoho.com", priority: 50 }],
    mxPattern: /(^|\.)zoho(mail)?\.(com|eu|in|com\.au|jp|com\.cn|sa)$/,
    dkimSelectors: ["zoho", "zmail"],
    dkimCname: false,
    docs: "https://www.zoho.com/mail/help/adminconsole/spf-configuration.html",
    notes: "MX hosts differ per data centre (mx.zoho.eu, mx.zoho.in, ...). The DKIM selector is chosen by the admin; 'zoho' is the documented example.",
    verified: { spf: "docs+dns", mx: "docs+dns", dkim: "docs" },
  },
  godaddy: {
    id: "godaddy",
    name: "GoDaddy Email",
    role: "mailbox",
    spfInclude: ["secureserver.net"],
    mx: [{ host: "smtp.secureserver.net", priority: 0 }, { host: "mailstore1.secureserver.net", priority: 10 }],
    mxPattern: /(^|\.)secureserver\.net$/,
    dkimSelectors: [],
    dkimCname: false,
    notes: "GoDaddy's newer email plans run on Microsoft 365 and use the Microsoft records instead.",
    verified: { spf: "dns", mx: "dns", dkim: "unverified" },
  },
  amazonSes: {
    id: "amazonSes",
    name: "Amazon SES",
    role: "sending",
    spfInclude: ["amazonses.com"],
    mx: [{ host: "inbound-smtp.{region}.amazonaws.com", priority: 10 }],
    mxPattern: /(^|\.)amazonaws\.com$|amazonses\.com$/,
    dkimSelectors: [],
    dkimCname: true,
    docs: "https://docs.aws.amazon.com/ses/latest/dg/mail-from.html",
    notes: "SPF include goes on the custom MAIL FROM subdomain (with MX feedback-smtp.<region>.amazonses.com). Easy DKIM uses three random-token CNAMEs (<token>._domainkey → <token>.dkim.amazonses.com), so selectors can't be guessed. The inbound MX is only for SES receiving.",
    verified: { spf: "docs+dns", mx: "docs+dns", dkim: "unverified" },
  },
  sendgrid: {
    id: "sendgrid",
    name: "SendGrid",
    role: "sending",
    spfInclude: ["sendgrid.net"],
    mx: [],
    mxPattern: /(^|\.)sendgrid\.net$/,
    dkimSelectors: ["s1", "s2"],
    dkimCname: true,
    docs: "https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication",
    notes: "With automated security SendGrid manages SPF via a CNAME on a subdomain (em1234.yourdomain) instead of an include on the root.",
    verified: { spf: "docs+dns", mx: "unverified", dkim: "docs" },
  },
  mailgun: {
    id: "mailgun",
    name: "Mailgun",
    role: "sending",
    spfInclude: ["mailgun.org"],
    mx: [{ host: "mxa.mailgun.org", priority: 10 }, { host: "mxb.mailgun.org", priority: 10 }],
    mxPattern: /(^|\.)mailgun\.org$/,
    dkimSelectors: ["smtp", "mx", "pic", "krs", "k1"],
    dkimCname: false,
    docs: "https://documentation.mailgun.com/docs/mailgun/user-manual/domains/domains-verify",
    notes: "EU accounts use mxa.eu.mailgun.org / mxb.eu.mailgun.org. The DKIM selector is shown in the Mailgun dashboard per domain.",
    verified: { spf: "docs+dns", mx: "docs+dns", dkim: "unverified" },
  },
  brevo: {
    id: "brevo",
    name: "Brevo (Sendinblue)",
    role: "sending",
    spfInclude: ["spf.brevo.com"],
    mx: [],
    dkimSelectors: ["brevo1", "brevo2", "mail"],
    dkimCname: true,
    notes: "Older accounts use include:spf.sendinblue.com and a mail._domainkey TXT key.",
    verified: { spf: "dns", mx: "unverified", dkim: "unverified" },
  },
};

/** Every DKIM selector the presets know about. */
export function providerDkimSelectors(): string[] {
  return [...new Set(Object.values(PROVIDERS).flatMap((p) => p.dkimSelectors))];
}

/** Fill `{domainDashed}` / `{region}` placeholders in a preset's MX hosts. Pure. */
export function providerMx(id: string, domain: string, region = "us-east-1"): MxHost[] {
  const pr = PROVIDERS[id];
  if (!pr) return [];
  return pr.mx.map((m) => ({ priority: m.priority, host: m.host.replace("{domainDashed}", domain.replace(/\./g, "-")).replace("{region}", region) }));
}

export interface DetectedProvider {
  id: string;
  name: string;
  evidence: string[];
}

/** Recognise providers from MX hosts, SPF includes and DKIM selectors found. Pure. */
export function detectProviders(input: { mx?: string[]; spfIncludes?: string[]; dkimSelectors?: string[] }): DetectedProvider[] {
  const out: DetectedProvider[] = [];
  const mx = (input.mx ?? []).map((h) => h.toLowerCase().replace(/\.$/, ""));
  const inc = (input.spfIncludes ?? []).map((h) => h.toLowerCase());
  const sel = (input.dkimSelectors ?? []).map((s) => s.toLowerCase());
  for (const pr of Object.values(PROVIDERS)) {
    const ev: string[] = [];
    for (const h of mx) if (pr.mxPattern?.test(h)) ev.push(`MX ${h}`);
    for (const i of inc) {
      if (pr.spfInclude.includes(i) || (pr.id === "brevo" && i === "spf.sendinblue.com") || (pr.id === "zoho" && /(^|\.)zoho(mail)?\.(com|eu|in)$/.test(i))) ev.push(`SPF include:${i}`);
    }
    for (const s of sel) if (pr.dkimSelectors.includes(s) && !["mail", "k1", "mx", "smtp"].includes(s)) ev.push(`DKIM ${s}`);
    if (ev.length) out.push({ id: pr.id, name: pr.name, evidence: [...new Set(ev)] });
  }
  return out;
}

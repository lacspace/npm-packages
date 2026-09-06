/**
 * lacspace-enrich — turn a domain, URL or email into a company + contact
 * profile from open sources (no paid API): name, description, logo, emails,
 * phones, socials, address and tech stack. Built on the lacspace-scraper engine.
 *
 * ```ts
 * import { enrichDomain } from "lacspace-enrich";
 * const profile = await enrichDomain("acme.com");
 * ```
 *
 * Please use it responsibly: only collect public business data you have a lawful
 * basis to use, and respect each site's Terms and data-protection law.
 */
import type { EnrichedProfile } from "./types.js";

export { enrichDomain, enrichMany } from "./enrich.js";
export { normalizeDomain, cleanName, detectTech, factsFromJsonLd, socialKey, extractSocials } from "./detect.js";
// ── v0.2.0 additive exports ──
export { detectTechDetailed, groupTechByCategory, TECH_SIGNATURES } from "./tech.js";
export { discoverPages } from "./pages.js";
export {
  dnsSignals, verifyEmailDomains, parseSpf, parseDmarc,
  mailProviderFromMx, catchAllHint, emailFormatValid, emailDomain,
} from "./dns.js";
export { rdapLookup, parseRdap } from "./rdap.js";
export { guessEmails, detectPatternFromEmail, splitName } from "./emails.js";
export type { GuessOptions } from "./emails.js";
export { downloadAsset } from "./assets.js";
export type {
  EnrichedProfile, Socials, EnrichOptions,
  DnsSignals, MxRecord, DomainRegistration, TechItem,
  DiscoveredPages, EmailGuess, SavedAssets, FieldSource,
} from "./types.js";

const SOCIAL_KEYS = ["facebook", "instagram", "whatsapp", "linkedin", "twitter", "youtube", "tiktok", "telegram"] as const;

/** Flatten a profile into a single row (arrays joined, socials as columns) for CSV/Excel. */
export function flattenProfile(p: EnrichedProfile): Record<string, string | number> {
  const row: Record<string, string | number> = {
    domain: p.domain,
    name: p.name ?? "",
    description: p.description ?? "",
    emails: (p.emails ?? []).join("; "),
    phones: (p.phones ?? []).join("; "),
    address: p.address ?? "",
  };
  for (const k of SOCIAL_KEYS) row[k] = p.socials?.[k] ?? "";
  row.tech = (p.tech ?? []).join(", ");
  row.logo = p.logo ?? "";
  row.url = p.url ?? "";
  if (p.contactPage) row.contactPage = p.contactPage;

  // ── v0.2.0 columns — only added when the data is present, so existing
  // (feature-off) CSV/Excel output is byte-for-byte the same as before. ──
  if (p.pages) {
    for (const k of ["about", "careers", "pricing", "blog", "rss", "status"] as const) {
      if (p.pages[k]) row[`page_${k}`] = p.pages[k]!;
    }
  }
  if (p.dns) {
    const d = p.dns;
    if (d.hasMx !== undefined) row.hasMx = d.hasMx ? "yes" : "no";
    if (d.mailProvider) row.mailProvider = d.mailProvider;
    if (d.spfPolicy) row.spf = d.spfPolicy;
    if (d.dmarcPolicy) row.dmarc = d.dmarcPolicy;
    if (d.dkim !== undefined) row.dkim = d.dkim ? "yes" : "no";
  }
  if (p.emailStatus) {
    const valid = Object.entries(p.emailStatus).filter(([, s]) => s === "valid").map(([e]) => e);
    if (valid.length) row.validEmails = valid.join("; ");
  }
  if (p.registration) {
    const r = p.registration;
    if (r.registrar) row.registrar = r.registrar;
    if (r.createdAt) row.created = r.createdAt;
    if (r.expiresAt) row.expires = r.expiresAt;
    if (r.nameServers?.length) row.nameServers = r.nameServers.join("; ");
  }
  if (p.techDetailed?.length) {
    const cats = [...new Set(p.techDetailed.map((t) => t.category))];
    row.techCategories = cats.join(", ");
  }
  if (p.savedAssets) {
    if (p.savedAssets.logo) row.savedLogo = p.savedAssets.logo;
    if (p.savedAssets.favicon) row.savedFavicon = p.savedAssets.favicon;
  }
  if (p.error) row.error = p.error;
  return row;
}

/** Keep only the requested columns (in the given order) from a flat row. */
export function selectFields(row: Record<string, string | number>, fields: string[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of fields) out[f] = row[f] ?? "";
  return out;
}

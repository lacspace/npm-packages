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
export type { EnrichedProfile, Socials, EnrichOptions } from "./types.js";

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
  if (p.error) row.error = p.error;
  return row;
}

/**
 * Pipe-to-enrich hook.
 *
 * lacspace-leads finds businesses and their websites; its sibling
 * [`lacspace-enrich`](https://www.npmjs.com/package/lacspace-enrich) turns a
 * domain into a company + contact + tech-stack profile. This module bridges the
 * two **without a hard dependency**: it turns collected leads into the domain
 * inputs enrich expects, and exposes an {@link SearchOptions.onLead}-compatible
 * factory so you can stream websites into enrich as they're found.
 *
 * ```ts
 * import { searchLeads } from "lacspace-leads";
 * import { pipeToEnrich } from "lacspace-leads";
 * // import { enrich } from "lacspace-enrich"; // optional, install separately
 *
 * const leads = await searchLeads({
 *   type: "cafes", city: "Kathmandu",
 *   onLead: pipeToEnrich((input) => queue.push(input)), // { name, website, domain }
 * });
 * ```
 *
 * Or from the CLI: `lacspace-leads cafes --city Kathmandu --enrich-out sites.ndjson`
 * writes one `{ name, website, domain }` object per line, ready to feed to
 * `lacspace-enrich`.
 */
import type { Lead } from "./types.js";

/** The minimal input `lacspace-enrich` needs — a website and its bare domain. */
export interface EnrichInput {
  name?: string;
  website: string;
  domain?: string;
}

/** The registrable domain (host, `www.` stripped, lower-cased) of a URL. Pure. */
export function leadDomain(website?: string): string | undefined {
  if (!website) return undefined;
  const raw = website.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).host.replace(/^www\./, "").toLowerCase() || undefined;
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]?.toLowerCase() || undefined;
  }
}

/**
 * Turn a lead into an {@link EnrichInput}, or `undefined` when it has no
 * website to enrich. Pure.
 */
export function leadToEnrichInput(lead: Lead): EnrichInput | undefined {
  if (!lead.website) return undefined;
  const input: EnrichInput = { website: lead.website };
  if (lead.name) input.name = lead.name;
  const domain = leadDomain(lead.website);
  if (domain) input.domain = domain;
  return input;
}

/**
 * The unique enrich inputs across a lead list — one per distinct domain, in
 * first-seen order. Leads without a website are skipped. Pure.
 */
export function leadsToEnrichInput(leads: Lead[]): EnrichInput[] {
  const seen = new Set<string>();
  const out: EnrichInput[] = [];
  for (const lead of leads) {
    const input = leadToEnrichInput(lead);
    if (!input) continue;
    const key = input.domain ?? input.website.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(input);
  }
  return out;
}

/** Just the unique domains across a lead list, in first-seen order. Pure. */
export function leadDomains(leads: Lead[]): string[] {
  return leadsToEnrichInput(leads)
    .map((i) => i.domain)
    .filter((d): d is string => !!d);
}

/**
 * Build an {@link SearchOptions.onLead} handler that forwards each lead's
 * website to `handler` as an {@link EnrichInput} — ready to queue for
 * lacspace-enrich. Leads without a website are ignored, and a throwing
 * `handler` never breaks the scrape (errors are swallowed, matching `onLead`'s
 * crash-safe contract). Pure factory.
 */
export function pipeToEnrich(
  handler: (input: EnrichInput, lead: Lead) => void,
): (lead: Lead) => void {
  return (lead: Lead): void => {
    const input = leadToEnrichInput(lead);
    if (!input) return;
    try {
      handler(input, lead);
    } catch {
      /* a bad enrich handler never breaks the run */
    }
  };
}

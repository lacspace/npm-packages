/**
 * Company + contact enrichment — fetch a domain's public pages and assemble a
 * profile (name, description, logo, emails, phones, socials, address, tech
 * stack) from metadata, JSON-LD and the page itself. Reuses the lacspace-scraper
 * extractors. Never throws — returns a profile with an `error` on failure.
 */
import {
  fetchPage, parseHTML, queryOne, queryAll,
  extractEmails, extractPhones, extractOpenGraph, extractMeta, extractJsonLd,
  type FetchResult,
} from "lacspace-scraper";
import { normalizeDomain, cleanName, detectTech, factsFromJsonLd, socialKey, extractSocials } from "./detect.js";
import type { EnrichOptions, EnrichedProfile, Socials } from "./types.js";

function abs(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined;
  try { return new URL(url, base).href; } catch { return url; }
}

async function tryFetch(domain: string, opts: EnrichOptions): Promise<FetchResult | undefined> {
  const fetchOpts: { headers?: Record<string, string>; timeoutMs?: number; retries: number } = { retries: 1 };
  if (opts.headers) fetchOpts.headers = opts.headers;
  if (opts.timeoutMs !== undefined) fetchOpts.timeoutMs = opts.timeoutMs;
  for (const scheme of ["https", "http"] as const) {
    try {
      const res = await fetchPage(`${scheme}://${domain}`, fetchOpts);
      if (res.ok || res.html) return res;
    } catch {
      /* try next scheme */
    }
  }
  return undefined;
}

/** Enrich a single domain / URL / email into a {@link EnrichedProfile}. */
export async function enrichDomain(input: string, opts: EnrichOptions = {}): Promise<EnrichedProfile> {
  const domain = normalizeDomain(input);
  const profile: EnrichedProfile = { domain };
  opts.onProgress?.(`enriching ${domain}…`);

  const res = await tryFetch(domain, opts);
  if (!res) { profile.error = "Could not fetch the site."; return profile; }

  profile.url = res.url;
  profile.status = res.status;
  const base = res.url || `https://${domain}`;
  const root = parseHTML(res.html);
  const meta = extractMeta(root, base);
  const og = extractOpenGraph(root);
  const facts = factsFromJsonLd(extractJsonLd(root));

  profile.name = facts.name || og["site_name"] || cleanName(meta.title, domain);
  const desc = meta.description || facts.description || og["description"];
  if (desc) profile.description = desc;
  const logo = abs(facts.logo, base) || og["image"] || abs(favicon(root), base);
  if (logo) profile.logo = logo;

  const emails = new Set<string>(extractEmails(root));
  if (facts.email) emails.add(facts.email.toLowerCase());
  const phones = new Set<string>(extractPhones(root));
  if (facts.phone) phones.add(facts.phone);

  const socials: Socials = { ...extractSocials(res.html) };
  for (const url of facts.sameAs ?? []) {
    const key = socialKey(url) as keyof Socials | undefined;
    if (key && !socials[key]) socials[key] = url;
  }

  if (facts.address) profile.address = facts.address;
  profile.tech = detectTech(res.html);

  // A contact-page link, and (if we still lack an email) a light contact/about crawl.
  const contactLink = queryAll(root, "a[href]").find((a) => /contact/i.test((a.attrs.href ?? "") + " " + (a.attrs.title ?? "")));
  if (contactLink?.attrs.href) profile.contactPage = abs(contactLink.attrs.href, base);

  if ((opts.contactPages ?? true) && emails.size === 0) {
    for (const path of ["contact", "contact-us", "about"]) {
      try {
        const page = await fetchPage(new URL(path, base).href, { retries: 0, ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}) });
        if (!page.ok) continue;
        const proot = parseHTML(page.html);
        for (const e of extractEmails(proot)) emails.add(e);
        for (const p of extractPhones(proot)) phones.add(p);
        const s = extractSocials(page.html);
        for (const [k, v] of Object.entries(s) as [keyof Socials, string][]) if (v && !socials[k]) socials[k] = v;
        if (emails.size) break;
      } catch { /* skip */ }
    }
  }

  if (emails.size) profile.emails = [...emails];
  if (phones.size) profile.phones = [...phones];
  const socialVals = Object.fromEntries(Object.entries(socials).filter(([, v]) => v));
  if (Object.keys(socialVals).length) profile.socials = socialVals;
  return profile;
}

function favicon(root: ReturnType<typeof parseHTML>): string | undefined {
  const link = queryOne(root, 'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  return link?.attrs.href ?? "/favicon.ico";
}

/** Enrich many domains in parallel. */
export async function enrichMany(inputs: string[], opts: EnrichOptions = {}): Promise<EnrichedProfile[]> {
  const out: EnrichedProfile[] = new Array(inputs.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, inputs.length || 1)) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= inputs.length) return;
      out[idx] = await enrichDomain(inputs[idx]!, opts);
    }
  });
  await Promise.all(workers);
  return out;
}

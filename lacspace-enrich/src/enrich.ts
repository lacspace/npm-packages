/**
 * Company + contact enrichment — fetch a domain's public pages and assemble a
 * profile (name, description, logo, emails, phones, socials, address, tech
 * stack) from metadata, JSON-LD and the page itself. Reuses the lacspace-scraper
 * extractors. Never throws — returns a profile with an `error` on failure.
 *
 * v0.2.0 additively layers on DNS/deliverability signals, RDAP registration,
 * categorized tech, key-page discovery, asset download, per-host rate limiting
 * and per-field provenance — all opt-in and backward compatible.
 */
import {
  fetchPage, parseHTML, queryOne, queryAll,
  extractEmails, extractPhones, extractOpenGraph, extractMeta, extractJsonLd,
  type FetchResult,
} from "lacspace-scraper";
import { normalizeDomain, cleanName, detectTech, factsFromJsonLd, socialKey, extractSocials } from "./detect.js";
import { detectTechDetailed } from "./tech.js";
import { discoverPages } from "./pages.js";
import { dnsSignals, verifyEmailDomains } from "./dns.js";
import { rdapLookup } from "./rdap.js";
import { downloadAsset } from "./assets.js";
import type { EnrichOptions, EnrichedProfile, Socials, FieldSource } from "./types.js";

function abs(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined;
  try { return new URL(url, base).href; } catch { return url; }
}

// ── Per-host rate limiter (shared across a whole process/batch) ──
const hostNextFree = new Map<string, number>();
async function rateGate(url: string, ms: number | undefined): Promise<void> {
  if (!ms || ms <= 0) return;
  let host: string;
  try { host = new URL(url).host; } catch { return; }
  const now = Date.now();
  const earliest = Math.max(now, hostNextFree.get(host) ?? 0);
  hostNextFree.set(host, earliest + ms);
  const wait = earliest - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function tryFetch(domain: string, opts: EnrichOptions): Promise<FetchResult | undefined> {
  const fetchOpts: { headers?: Record<string, string>; timeoutMs?: number; retries: number } = { retries: 1 };
  if (opts.headers) fetchOpts.headers = opts.headers;
  if (opts.timeoutMs !== undefined) fetchOpts.timeoutMs = opts.timeoutMs;
  for (const scheme of ["https", "http"] as const) {
    try {
      const url = `${scheme}://${domain}`;
      await rateGate(url, opts.perHostRateMs);
      const res = await fetchPage(url, fetchOpts);
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
  const sources: Record<string, FieldSource> = {};
  opts.onProgress?.(`enriching ${domain}…`);

  const res = await tryFetch(domain, opts);

  // DNS + RDAP don't need the HTML, so we can still return them if the site is down.
  if (opts.dns) { try { profile.dns = await dnsSignals(domain, { timeoutMs: opts.dnsTimeoutMs ?? opts.timeoutMs ?? 5000 }); } catch { /* ignore */ } }
  if (opts.rdap) { try { profile.registration = await rdapLookup(domain, {}); } catch { /* ignore */ } }

  if (!res) {
    profile.error = "Could not fetch the site.";
    if (opts.dns && profile.emailStatus === undefined) { /* no emails to verify */ }
    return profile;
  }

  profile.url = res.url;
  profile.status = res.status;
  const base = res.url || `https://${domain}`;
  const root = parseHTML(res.html);
  const meta = extractMeta(root, base);
  const og = extractOpenGraph(root);
  const facts = factsFromJsonLd(extractJsonLd(root));

  profile.name = facts.name || og["site_name"] || cleanName(meta.title, domain);
  sources.name = facts.name ? { confidence: 0.95, source: "json-ld" } : og["site_name"] ? { confidence: 0.85, source: "og:site_name" } : { confidence: 0.5, source: "title (cleaned)" };
  const desc = meta.description || facts.description || og["description"];
  if (desc) { profile.description = desc; sources.description = meta.description ? { confidence: 0.8, source: "meta description" } : facts.description ? { confidence: 0.85, source: "json-ld" } : { confidence: 0.7, source: "og:description" }; }
  const logo = abs(facts.logo, base) || og["image"] || abs(favicon(root), base);
  if (logo) { profile.logo = logo; sources.logo = facts.logo ? { confidence: 0.9, source: "json-ld logo" } : og["image"] ? { confidence: 0.7, source: "og:image" } : { confidence: 0.5, source: "favicon" }; }

  const emails = new Set<string>(extractEmails(root));
  if (facts.email) emails.add(facts.email.toLowerCase());
  const phones = new Set<string>(extractPhones(root));
  if (facts.phone) phones.add(facts.phone);

  const socials: Socials = { ...extractSocials(res.html) };
  for (const url of facts.sameAs ?? []) {
    const key = socialKey(url) as keyof Socials | undefined;
    if (key && !socials[key]) socials[key] = url;
  }

  if (facts.address) { profile.address = facts.address; sources.address = { confidence: 0.9, source: "json-ld PostalAddress" }; }
  profile.tech = detectTech(res.html);
  profile.techDetailed = detectTechDetailed(res.html);

  // Key-page discovery (contact/about/careers/pricing/blog/rss/status) — pure, cheap.
  if (opts.discoverPages ?? true) {
    const pages = discoverPages(res.html, base);
    if (Object.keys(pages).length) profile.pages = pages;
  }

  // A contact-page link, and (if we still lack an email) a light contact/about crawl.
  const contactLink = queryAll(root, "a[href]").find((a) => /contact/i.test((a.attrs.href ?? "") + " " + (a.attrs.title ?? "")));
  if (contactLink?.attrs.href) profile.contactPage = abs(contactLink.attrs.href, base);
  else if (profile.pages?.contact) profile.contactPage = profile.pages.contact;

  if ((opts.contactPages ?? true) && emails.size === 0) {
    for (const path of ["contact", "contact-us", "about"]) {
      try {
        const pageUrl = new URL(path, base).href;
        await rateGate(pageUrl, opts.perHostRateMs);
        const page = await fetchPage(pageUrl, { retries: 0, ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}) });
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

  if (emails.size) { profile.emails = [...emails]; sources.emails = { confidence: 0.8, source: "page scrape / json-ld" }; }
  if (phones.size) profile.phones = [...phones];
  const socialVals = Object.fromEntries(Object.entries(socials).filter(([, v]) => v));
  if (Object.keys(socialVals).length) profile.socials = socialVals;

  // MX-verify discovered emails when DNS is on.
  if (opts.dns && profile.emails?.length) {
    try { profile.emailStatus = await verifyEmailDomains(profile.emails, { timeoutMs: opts.dnsTimeoutMs ?? opts.timeoutMs ?? 5000 }); } catch { /* ignore */ }
  }

  // Download logo + favicon when asked.
  if (opts.assetsDir) {
    const saved: { logo?: string; favicon?: string } = {};
    if (profile.logo) { const p = await downloadAsset(profile.logo, opts.assetsDir, domain, "logo", opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}); if (p) saved.logo = p; }
    const fav = abs(favicon(root), base);
    if (fav) { const p = await downloadAsset(fav, opts.assetsDir, domain, "favicon", opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}); if (p) saved.favicon = p; }
    if (saved.logo || saved.favicon) profile.savedAssets = saved;
  }

  if (Object.keys(sources).length) profile.sources = sources;
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

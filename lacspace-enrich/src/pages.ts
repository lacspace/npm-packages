/**
 * Key-page discovery — from a site's own navigation/links, find its contact,
 * about, careers/jobs, pricing, blog and status pages, plus any RSS/Atom feed.
 * Pure: it parses the given HTML (no network) and resolves links against `base`.
 * Unit-tested on HTML fixtures.
 */
import { parseHTML, extractLinks, extractFeeds } from "lacspace-scraper";
import type { DiscoveredPages } from "./types.js";

type PageKey = Exclude<keyof DiscoveredPages, "rss">;

/** For each page kind: patterns to match against the href AND the link text. */
const RULES: { key: PageKey; href: RegExp; text: RegExp }[] = [
  { key: "contact", href: /\/contact(-us|us)?\/?($|[?#])|\/get-in-touch/i, text: /\bcontact\b|get in touch/i },
  { key: "about", href: /\/about(-us|us)?\/?($|[?#])|\/who-we-are|\/company\/?($|[?#])/i, text: /\babout\b|who we are|our story/i },
  { key: "careers", href: /\/careers?\/?|\/jobs?\/?|\/join(-us)?\/?|\/work-with-us|\/vacancies|greenhouse\.io|lever\.co|workable\.com|ashbyhq/i, text: /\bcareers?\b|\bjobs?\b|join (us|our|the team)|we'?re hiring|work with us|open (roles|positions)/i },
  { key: "pricing", href: /\/pricing\/?|\/plans\/?|\/plans-and-pricing|\/buy\/?($|[?#])/i, text: /\bpricing\b|\bplans\b|our prices/i },
  { key: "blog", href: /\/blog\/?|\/news\/?|\/articles?\/?|\/insights\/?|\/resources\/blog/i, text: /\bblog\b|\bnews\b|articles|insights/i },
  { key: "status", href: /status\.[a-z0-9.-]+|\/status\/?($|[?#])|statuspage\.io|instatus\.com|betteruptime|status\.io/i, text: /\bstatus\b|system status|uptime/i },
];

/**
 * Discover key pages from a home page's HTML. Returns absolute URLs where a
 * `base` is given. The first (topmost, highest-signal) link wins per kind.
 * Pure.
 */
export function discoverPages(html: string, base?: string): DiscoveredPages {
  const root = parseHTML(html);
  const links = extractLinks(root, base);
  const out: DiscoveredPages = {};

  for (const { href, text } of links) {
    if (!href) continue;
    for (const rule of RULES) {
      if (out[rule.key]) continue;
      const hrefHit = rule.href.test(href);
      const textHit = rule.text.test(text ?? "");
      // A careers/status match may be an off-domain ATS/status host (text alone is
      // weak there) — require the href pattern OR a text hit backed by a plausible link.
      if (hrefHit || textHit) out[rule.key] = href;
    }
  }

  const feeds = extractFeeds(root, base);
  if (feeds.length) out.rss = feeds[0];
  return out;
}

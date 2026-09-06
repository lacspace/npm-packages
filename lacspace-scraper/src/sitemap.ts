/**
 * Sitemap ingestion — read a `sitemap.xml` (or a sitemap index) and return the
 * page URLs it lists. Dependency-free XML scraping via regex; handles nested
 * sitemap indexes up to a small depth.
 */
import { fetchPage, type FetchOptions } from "./fetch.js";

function locs(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const url = m[1]!.trim().replace(/&amp;/g, "&");
    if (url) out.push(url);
  }
  return out;
}

/**
 * Fetch a sitemap and return its page URLs. If it's a sitemap index, the child
 * sitemaps are fetched too (bounded by `maxUrls`).
 */
export async function fetchSitemap(
  url: string,
  opts: FetchOptions & { maxUrls?: number } = {},
): Promise<string[]> {
  const maxUrls = opts.maxUrls ?? 5000;
  const res = await fetchPage(url, opts);
  if (!res.ok) return [];
  const isIndex = /<sitemapindex[\s>]/i.test(res.html);
  const found = locs(res.html);
  if (!isIndex) return found.slice(0, maxUrls);

  const out: string[] = [];
  for (const child of found) {
    if (out.length >= maxUrls) break;
    try {
      const childRes = await fetchPage(child, opts);
      if (childRes.ok) out.push(...locs(childRes.html));
    } catch {
      /* skip a bad child sitemap */
    }
  }
  return out.slice(0, maxUrls);
}

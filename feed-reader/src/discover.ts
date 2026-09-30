/**
 * Find the feeds a web page advertises. Reads the `<link rel="alternate">` tags in
 * an HTML head (RSS, Atom, JSON Feed), resolves them against the page URL, and
 * de-dupes. `commonFeedPaths` offers the usual guess URLs for sites that don't
 * advertise one. Pure: give it HTML, get candidate feed URLs. No network.
 */

import { decodeEntities } from "./xml.js";

export type DiscoveredType = "rss" | "atom" | "json" | "unknown";

export interface DiscoveredFeed {
  /** Absolute URL when `baseUrl` was given and resolvable, else the raw href. */
  href: string;
  title?: string;
  type: DiscoveredType;
}

function typeFromMime(mime: string): DiscoveredType {
  const m = mime.toLowerCase();
  if (m.includes("rss")) return "rss";
  if (m.includes("atom")) return "atom";
  if (m.includes("json")) return "json";
  return "unknown";
}

function resolve(href: string, baseUrl?: string): string {
  if (!baseUrl) return href;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = re.exec(tag);
  if (!m) return undefined;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
}

const FEED_MIME_RE = /application\/(rss\+xml|atom\+xml|feed\+json|json)/i;

/**
 * Extract the feeds declared in a page's HTML. Only `<link>` tags whose `rel`
 * includes "alternate" (or "feed") and whose `type` is a known feed MIME are
 * returned. Relative hrefs are resolved against `baseUrl` when supplied.
 */
export function discoverFeeds(html: string, baseUrl?: string): DiscoveredFeed[] {
  const out: DiscoveredFeed[] = [];
  const seen = new Set<string>();
  const linkRe = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    if (!/\balternate\b|\bfeed\b/.test(rel)) continue;
    const type = attr(tag, "type") ?? "";
    if (!FEED_MIME_RE.test(type)) continue;
    const href = attr(tag, "href");
    if (!href) continue;
    const resolved = resolve(href, baseUrl);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    const title = attr(tag, "title");
    out.push({ href: resolved, ...(title ? { title } : {}), type: typeFromMime(type) });
  }
  return out;
}

const COMMON_PATHS = [
  "/feed",
  "/feed/",
  "/rss",
  "/rss.xml",
  "/feed.xml",
  "/atom.xml",
  "/index.xml",
  "/rss/",
  "/feeds/posts/default", // Blogger
  "/?feed=rss2", // WordPress fallback
  "/blog/feed",
  "/news/feed",
];

/**
 * The conventional feed URLs to try when a site advertises none. These are
 * *candidates* to fetch and validate with {@link parseFeed}, not confirmed feeds.
 */
export function commonFeedPaths(baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of COMMON_PATHS) {
    const u = resolve(p, baseUrl);
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

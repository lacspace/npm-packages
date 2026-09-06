/**
 * Site crawler — follow links from a seed (and/or a sitemap), breadth-first,
 * bounded by depth and page count, robots-aware and same-origin by default.
 * Extracts records from every page it visits using the same schema/auto rules
 * as {@link scrape}.
 */
import { parseHTML } from "./html.js";
import { fetchPage } from "./fetch.js";
import { launchSession, type BrowserSession } from "./browser.js";
import { extractLinks } from "./extract.js";
import { recordsFromHtml } from "./scrape.js";
import { fetchRobots, type Robots } from "./robots.js";
import { fetchSitemap } from "./sitemap.js";
import { queryAll } from "./select.js";
import type { CrawlOptions, ScrapeRecord, ScrapeResult } from "./types.js";

function matchesAny(url: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => url.includes(p));
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>, signal?: AbortSignal): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(n, items.length || 1)) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length || signal?.aborted) return;
        await fn(items[i]!);
      }
    }),
  );
}

/** Crawl a site from one or more seed URLs. */
export async function crawl(seed: string | string[], opts: CrawlOptions = {}): Promise<ScrapeResult> {
  const started = Date.now();
  const seeds = (Array.isArray(seed) ? seed : [seed]).map((s) => s.trim()).filter(Boolean);
  const maxDepth = Math.max(0, opts.depth ?? 2);
  const limit = Math.max(1, opts.limit ?? 50);
  const sameOrigin = opts.sameOrigin !== false;
  const linkSelector = opts.linkSelector ?? "a[href]";
  const useRobots = opts.robots !== false;
  const concurrency = opts.concurrency ?? (opts.engine === "browser" ? 1 : 4);
  const seedOrigin = seeds.length ? new URL(seeds[0]!).origin : "";

  const records: ScrapeRecord[] = [];
  const errors: { url: string; error: string }[] = [];
  const visited = new Set<string>();
  const robotsCache = new Map<string, Robots>();
  let pagesFetched = 0;

  const getRobots = async (origin: string): Promise<Robots> => {
    let r = robotsCache.get(origin);
    if (!r) { r = await fetchRobots(origin, opts.userAgent); robotsCache.set(origin, r); }
    return r;
  };

  let session: BrowserSession | undefined;
  if (opts.engine === "browser") session = await launchSession({
    headless: opts.headless ?? true,
    ...(opts.proxy ? { proxy: opts.proxy } : {}),
    ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
  });

  // Seed frontier (optionally augmented by a sitemap).
  let frontier: string[] = [...seeds];
  if (opts.sitemap) {
    try {
      const sm = await fetchSitemap(opts.sitemap, { ...(opts.userAgent ? { userAgent: opts.userAgent } : {}), maxUrls: limit });
      frontier.push(...sm);
    } catch { /* ignore a bad sitemap */ }
  }
  frontier = [...new Set(frontier)];
  for (const u of frontier) visited.add(u);

  const wanted = (url: string): boolean => {
    if (sameOrigin && seedOrigin) { try { if (new URL(url).origin !== seedOrigin) return false; } catch { return false; } }
    if (matchesAny(url, opts.exclude)) return false;
    if (opts.include && opts.include.length && !matchesAny(url, opts.include)) return false;
    return true;
  };

  try {
    for (let depth = 0; depth <= maxDepth; depth++) {
      if (opts.signal?.aborted || pagesFetched >= limit || frontier.length === 0) break;
      const batch = frontier.slice(0, Math.max(0, limit - pagesFetched));
      const discovered: string[] = [];

      await pool(batch, concurrency, async (url) => {
        if (opts.signal?.aborted || pagesFetched >= limit) return;
        try {
          const u = new URL(url);
          if (useRobots) {
            const robots = await getRobots(u.origin);
            if (!robots.isAllowed(u.pathname + u.search, opts.userAgent)) {
              errors.push({ url, error: "blocked by robots.txt" });
              return;
            }
          }
          opts.onProgress?.(`depth ${depth} · ${pagesFetched + 1}/${limit}: ${url}`);

          let html: string;
          let status: number;
          let finalUrl = url;
          if (session) {
            const r = await session.render(url, { ...(opts.waitFor ? { waitFor: opts.waitFor } : {}) });
            html = r.html; status = r.status; finalUrl = r.url;
          } else {
            const r = await fetchPage(url, {
              ...(opts.headers ? { headers: opts.headers } : {}),
              ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
              ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
              ...(opts.retries !== undefined ? { retries: opts.retries } : {}),
            });
            html = r.html; status = r.status; finalUrl = r.url;
          }
          pagesFetched++;

          for (const rec of recordsFromHtml(html, finalUrl, status, opts)) {
            records.push(rec);
            opts.onRecord?.(rec);
          }

          if (depth < maxDepth) {
            const root = parseHTML(html);
            const links = linkSelector === "a[href]"
              ? extractLinks(root, finalUrl).map((l) => l.href)
              : queryAll(root, linkSelector).map((el) => el.attrs.href).filter(Boolean).map((h) => { try { return new URL(h!, finalUrl).href; } catch { return ""; } });
            for (const href of links) {
              const clean = href.split("#")[0]!;
              if (clean && !visited.has(clean) && wanted(clean)) { visited.add(clean); discovered.push(clean); }
            }
          }
        } catch (err) {
          errors.push({ url, error: err instanceof Error ? err.message : String(err) });
        }
      }, opts.signal);

      frontier = discovered;
    }
  } finally {
    if (session) await session.close();
  }

  return { records, errors, pages: pagesFetched, elapsedMs: Date.now() - started };
}

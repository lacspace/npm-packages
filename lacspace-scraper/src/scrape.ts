/**
 * The scraping orchestrator — fetch (static or browser), parse, extract (schema
 * and/or auto), respect robots.txt, and run many URLs with bounded concurrency
 * and politeness. This is the engine behind {@link scrape}.
 */
import { parseHTML } from "./html.js";
import { fetchPage, ScraperError } from "./fetch.js";
import { launchSession, type BrowserSession } from "./browser.js";
import { applySchema, applySchemaItems, autoExtract } from "./extract.js";
import { fetchRobots, type Robots } from "./robots.js";
import type { ScrapeOptions, ScrapeRecord, ScrapeResult } from "./types.js";

export { ScraperError };

async function pool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>, signal?: AbortSignal): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length || 1)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length || signal?.aborted) return;
      await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
}

/** Extract records from an already-fetched page. */
export function recordsFromHtml(html: string, url: string, status: number, opts: ScrapeOptions): ScrapeRecord[] {
  const root = parseHTML(html);
  const auto = opts.auto ? autoExtract(root, url, opts.auto) : undefined;

  if (opts.schema && opts.item) {
    return applySchemaItems(root, opts.item, opts.schema, url).map((r) => ({ url, ...r }));
  }
  if (opts.schema) {
    const rec = applySchema(root, opts.schema, url);
    return [{ url, status, ...(auto ?? {}), ...rec }];
  }
  return [{ url, status, ...(auto ?? {}) }];
}

const pauseMs = (opts: ScrapeOptions): number => {
  const d = Math.max(0, opts.delayMs ?? 0);
  return d && opts.jitter ? Math.round(d * (0.6 + Math.random() * 0.8)) : d;
};

/**
 * Scrape one or many URLs into structured records. Pass a `schema` for targeted
 * CSS extraction, and/or `auto` for automatic detection; `item` yields one
 * record per repeating element.
 *
 * @param input a single URL or an array of URLs.
 */
export async function scrape(input: string | string[], opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  const urls = (Array.isArray(input) ? input : [input]).map((u) => u.trim()).filter(Boolean);
  const started = Date.now();
  const records: ScrapeRecord[] = [];
  const errors: { url: string; error: string }[] = [];
  const useRobots = opts.robots !== false;
  const robotsCache = new Map<string, Robots>();

  let session: BrowserSession | undefined;
  if (opts.engine === "browser") session = await launchSession({
    headless: opts.headless ?? true,
    ...(opts.proxy ? { proxy: opts.proxy } : {}),
    ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
  });

  const getRobots = async (origin: string): Promise<Robots> => {
    let r = robotsCache.get(origin);
    if (!r) { r = await fetchRobots(origin, opts.userAgent); robotsCache.set(origin, r); }
    return r;
  };

  try {
    let done = 0;
    await pool(urls, opts.concurrency ?? (session ? 1 : 4), async (url) => {
      if (opts.signal?.aborted) return;
      const label = `${++done}/${urls.length}`;
      try {
        const u = new URL(url);
        if (useRobots) {
          const robots = await getRobots(u.origin);
          if (!robots.isAllowed(u.pathname + u.search, opts.userAgent)) {
            opts.onProgress?.(`[${label}] skipped (robots.txt disallows) ${url}`);
            errors.push({ url, error: "blocked by robots.txt" });
            return;
          }
        }
        opts.onProgress?.(`[${label}] fetching ${url}`);
        const delay = pauseMs(opts);
        if (delay) await new Promise((r) => setTimeout(r, delay));

        let html: string;
        let status: number;
        let finalUrl = url;
        if (session) {
          const r = await session.render(url, { ...(opts.waitFor ? { waitFor: opts.waitFor } : {}), ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) });
          html = r.html; status = r.status; finalUrl = r.url;
        } else {
          const r = await fetchPage(url, {
            ...(opts.headers ? { headers: opts.headers } : {}),
            ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
            ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
            ...(opts.retries !== undefined ? { retries: opts.retries } : {}),
            ...(opts.signal ? { signal: opts.signal } : {}),
          });
          html = r.html; status = r.status; finalUrl = r.url;
        }

        const recs = recordsFromHtml(html, finalUrl, status, opts);
        for (const rec of recs) { records.push(rec); opts.onRecord?.(rec); }
        opts.onProgress?.(`[${label}] ${recs.length} record${recs.length === 1 ? "" : "s"} from ${url}`);
      } catch (err) {
        errors.push({ url, error: err instanceof Error ? err.message : String(err) });
        opts.onProgress?.(`[${label}] failed ${url}: ${(err as Error).message}`);
      }
    }, opts.signal);
  } finally {
    if (session) await session.close();
  }

  return { records, errors, pages: urls.length, elapsedMs: Date.now() - started };
}

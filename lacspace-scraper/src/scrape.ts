/**
 * The scraping orchestrator — fetch (static or browser), parse, extract (schema
 * and/or auto), respect robots.txt, and run many URLs with bounded concurrency
 * and politeness. This is the engine behind {@link scrape}.
 *
 * v0.2 adds pagination (follow a "next" link), detail-page following (visit each
 * record's link and merge in fields), per-host rate limiting, cookie/proxy
 * session controls, sitemap seeding and browser extras (screenshot/pdf/scroll).
 */
import { parseHTML } from "./html.js";
import { queryOne } from "./select.js";
import { fetchPage, ScraperError } from "./fetch.js";
import { launchSession, type BrowserSession, type RenderOptions } from "./browser.js";
import { applySchema, applySchemaItems, autoExtract } from "./extract.js";
import { parseFieldSpec } from "./transform.js";
import { fetchRobots, type Robots } from "./robots.js";
import { fetchSitemap } from "./sitemap.js";
import type { ScrapeOptions, ScrapeRecord, ScrapeResult } from "./types.js";

export { ScraperError };

const FOLLOW_TMP = "__followUrl";

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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
 * Resolve the next-page URL from a page's HTML: the first element matching
 * `selector` whose `href` (absolutized against `base`, minus any `#fragment`)
 * gives a usable link. Returns `undefined` when there's no next link. Pure.
 */
export function resolveNextLink(html: string, selector: string, base?: string): string | undefined {
  const el = queryOne(parseHTML(html), selector);
  const href = el?.attrs.href;
  if (!href) return undefined;
  try {
    const next = new URL(href, base).href.split("#")[0]!;
    return next || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build the plan for {@link ScrapeOptions.follow}: for each record, read the URL
 * under `field` (arrays use their first entry), resolve it (against the record's
 * own `url`, or `base`), and pair it with the record's index. Records without a
 * usable URL are skipped. Pure.
 */
export function buildFollowPlan(
  records: ScrapeRecord[],
  field: string,
  base?: string,
): { index: number; url: string }[] {
  const plan: { index: number; url: string }[] = [];
  records.forEach((rec, index) => {
    let v: unknown = rec[field];
    if (Array.isArray(v)) v = v[0];
    if (typeof v !== "string" || !v.trim()) return;
    const b = base ?? (typeof rec.url === "string" ? rec.url : undefined);
    let url = v.trim();
    if (b) { try { url = new URL(v.trim(), b).href; } catch { /* keep raw */ } }
    plan.push({ index, url });
  });
  return plan;
}

/**
 * Scrape one or many URLs into structured records. Pass a `schema` for targeted
 * CSS extraction, and/or `auto` for automatic detection; `item` yields one
 * record per repeating element. See {@link ScrapeOptions} for pagination,
 * detail-following, rate limiting and session controls.
 *
 * @param input a single URL or an array of URLs.
 */
export async function scrape(input: string | string[], opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  let urls = (Array.isArray(input) ? input : [input]).map((u) => u.trim()).filter(Boolean);
  const started = Date.now();
  const records: ScrapeRecord[] = [];
  const errors: { url: string; error: string }[] = [];
  const useRobots = opts.robots !== false;
  const robotsCache = new Map<string, Robots>();
  const lastHit = new Map<string, number>();

  // Proxy rotation pool (http engine). Browser uses the first entry at launch.
  const proxies = opts.proxies?.length ? opts.proxies : (opts.proxy ? [opts.proxy] : []);
  let proxyIdx = 0;
  const nextProxy = (): string | undefined => (proxies.length ? proxies[proxyIdx++ % proxies.length] : undefined);

  // Seed extra URLs from a sitemap, if asked.
  if (opts.sitemap) {
    try {
      const sm = await fetchSitemap(opts.sitemap, { ...(opts.userAgent ? { userAgent: opts.userAgent } : {}), maxUrls: 5000 });
      urls = [...new Set([...urls, ...sm])];
    } catch { /* ignore a bad sitemap */ }
  }

  // A schema-selector form of `follow` is resolved by injecting a temp field.
  let followField = opts.follow;
  let ext = opts;
  if (opts.follow && !/^[A-Za-z_][\w-]*$/.test(opts.follow.trim())) {
    const spec = parseFieldSpec(opts.follow);
    if (!spec.attr) spec.attr = "href";
    followField = FOLLOW_TMP;
    ext = { ...opts, schema: { ...(opts.schema ?? {}), [FOLLOW_TMP]: spec } };
  }

  let session: BrowserSession | undefined;
  if (opts.engine === "browser") session = await launchSession({
    headless: opts.headless ?? true,
    ...(proxies[0] ? { proxy: proxies[0] } : {}),
    ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
  });

  const getRobots = async (origin: string): Promise<Robots> => {
    let r = robotsCache.get(origin);
    if (!r) { r = await fetchRobots(origin, opts.userAgent); robotsCache.set(origin, r); }
    return r;
  };
  const robotsOk = async (u: URL): Promise<boolean> => {
    if (!useRobots) return true;
    const robots = await getRobots(u.origin);
    return robots.isAllowed(u.pathname + u.search, opts.userAgent);
  };
  const rateWait = async (host: string): Promise<void> => {
    const min = Math.max(0, opts.rateMs ?? 0);
    if (!min) return;
    const wait = (lastHit.get(host) ?? 0) + min - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
  };

  /** Fetch one URL (http or browser), honouring rate limit + session controls. */
  const fetchOne = async (url: string, render: RenderOptions = {}): Promise<{ html: string; status: number; finalUrl: string }> => {
    const u = new URL(url);
    await rateWait(u.host);
    if (session) {
      const r = await session.render(url, {
        ...(opts.waitFor ? { waitFor: opts.waitFor } : {}),
        ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
        ...(opts.waitMs ? { waitMs: opts.waitMs } : {}),
        ...(opts.scroll ? { scroll: opts.scroll } : {}),
        ...render,
      });
      return { html: r.html, status: r.status, finalUrl: r.url };
    }
    const px = nextProxy();
    const r = await fetchPage(url, {
      ...(opts.headers ? { headers: opts.headers } : {}),
      ...(opts.cookies ? { cookies: opts.cookies } : {}),
      ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.retries !== undefined ? { retries: opts.retries } : {}),
      ...(px ? { proxy: px } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    return { html: r.html, status: r.status, finalUrl: r.url };
  };

  // Screenshot/pdf paths get an index suffix when there's more than one page.
  const suffixed = (path: string | undefined, i: number, total: number): string | undefined => {
    if (!path || total <= 1) return path;
    const dot = path.lastIndexOf(".");
    return dot > 0 ? `${path.slice(0, dot)}-${i + 1}${path.slice(dot)}` : `${path}-${i + 1}`;
  };
  const captureFor = (i: number, total: number): RenderOptions => {
    const r: RenderOptions = {};
    const shot = suffixed(opts.screenshot, i, total);
    const pdf = suffixed(opts.pdf, i, total);
    if (shot) r.screenshot = shot;
    if (pdf) r.pdf = pdf;
    return r;
  };

  let pagesFetched = 0;

  try {
    if (opts.paginate) {
      // Sequential pagination: follow the "next" link, accumulating records.
      const maxPages = opts.maxPages && opts.maxPages > 0 ? opts.maxPages : Infinity;
      for (const seed of urls) {
        let url = seed;
        const seen = new Set<string>();
        for (let p = 0; p < maxPages; p++) {
          if (opts.signal?.aborted || seen.has(url)) break;
          seen.add(url);
          let u: URL;
          try { u = new URL(url); } catch { errors.push({ url, error: "invalid URL" }); break; }
          if (!(await robotsOk(u))) { errors.push({ url, error: "blocked by robots.txt" }); break; }
          opts.onProgress?.(`page ${p + 1}: ${url}`);
          const delay = pauseMs(opts);
          if (delay) await sleep(delay);
          let html: string, status: number, finalUrl: string;
          try { ({ html, status, finalUrl } = await fetchOne(url, captureFor(pagesFetched, Infinity))); }
          catch (err) { errors.push({ url, error: (err as Error).message }); break; }
          pagesFetched++;
          for (const rec of recordsFromHtml(html, finalUrl, status, ext)) { records.push(rec); opts.onRecord?.(rec); }
          const next = resolveNextLink(html, opts.paginate, finalUrl);
          if (!next || next === url) break;
          url = next;
        }
      }
    } else {
      let done = 0;
      await pool(urls, opts.concurrency ?? (session ? 1 : 4), async (url, i) => {
        if (opts.signal?.aborted) return;
        const label = `${++done}/${urls.length}`;
        try {
          const u = new URL(url);
          if (!(await robotsOk(u))) {
            opts.onProgress?.(`[${label}] skipped (robots.txt disallows) ${url}`);
            errors.push({ url, error: "blocked by robots.txt" });
            return;
          }
          opts.onProgress?.(`[${label}] fetching ${url}`);
          const delay = pauseMs(opts);
          if (delay) await sleep(delay);
          const { html, status, finalUrl } = await fetchOne(url, captureFor(i, urls.length));
          pagesFetched++;
          const recs = recordsFromHtml(html, finalUrl, status, ext);
          for (const rec of recs) { records.push(rec); opts.onRecord?.(rec); }
          opts.onProgress?.(`[${label}] ${recs.length} record${recs.length === 1 ? "" : "s"} from ${url}`);
        } catch (err) {
          errors.push({ url, error: err instanceof Error ? err.message : String(err) });
          opts.onProgress?.(`[${label}] failed ${url}: ${(err as Error).message}`);
        }
      }, opts.signal);
    }

    // Follow each record's detail link and merge in detail-page fields.
    if (followField && records.length) {
      const plan = buildFollowPlan(records, followField);
      opts.onProgress?.(`following ${plan.length} detail page(s)`);
      await pool(plan, opts.concurrency ?? 4, async ({ index, url }) => {
        if (opts.signal?.aborted) return;
        let u: URL;
        try { u = new URL(url); } catch { errors.push({ url, error: "invalid detail URL" }); return; }
        if (!(await robotsOk(u))) { errors.push({ url, error: "blocked by robots.txt (detail)" }); return; }
        const delay = pauseMs(opts);
        if (delay) await sleep(delay);
        try {
          const { html, finalUrl } = await fetchOne(url);
          const detail = opts.detailSchema ? applySchema(parseHTML(html), opts.detailSchema, finalUrl) : {};
          const rec = records[index]!;
          for (const [k, val] of Object.entries(detail)) {
            if (val !== undefined && val !== "") rec[k] = val;
          }
        } catch (err) {
          errors.push({ url, error: err instanceof Error ? err.message : String(err) });
        }
      }, opts.signal);
    }
  } finally {
    if (session) await session.close();
  }

  if (followField === FOLLOW_TMP) for (const r of records) delete r[FOLLOW_TMP];

  return { records, errors, pages: opts.paginate ? pagesFetched : urls.length, elapsedMs: Date.now() - started };
}
